import { useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import type { Project, SmartTask, TaskPriority, TaskStatus, UpdateTaskInput } from '@/hooks/useTasks'
import { PRIORITY_BADGE_CLASS, STATUS_BADGE_CLASS, STATUS_LABEL, TASK_PRIORITY_ORDER, TASK_STATUS_ORDER, formatDueDate } from './taskMeta'

interface TaskListProps {
  tasks: SmartTask[]
  projects: Project[]
  projectFilter: string | 'all'
  onSelectTask: (taskId: string) => void
  onUpdateTask: (taskId: string, patch: UpdateTaskInput) => void
  onBulkUpdateTasks: (taskIds: string[], patch: UpdateTaskInput) => void
}

type SortColumn = 'title' | 'priority' | 'status' | 'project' | 'assignee' | 'due'
type SortDirection = 'asc' | 'desc'

function compareString(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: 'base' })
}

export function TaskList({ tasks, projects, projectFilter, onSelectTask, onUpdateTask, onBulkUpdateTasks }: TaskListProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [sortColumn, setSortColumn] = useState<SortColumn>('due')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [bulkStatus, setBulkStatus] = useState<string>('__none__')
  const [bulkPriority, setBulkPriority] = useState<string>('__none__')
  const [bulkProject, setBulkProject] = useState<string>('__none__')

  const projectById = useMemo(() => {
    return new Map(projects.map((project) => [project.id, project]))
  }, [projects])

  const filteredTasks = useMemo(() => {
    if (projectFilter === 'all') return tasks
    return tasks.filter((task) => task.projectId === projectFilter)
  }, [projectFilter, tasks])

  const sortedTasks = useMemo(() => {
    const sorted = [...filteredTasks]

    sorted.sort((a, b) => {
      let result = 0

      if (sortColumn === 'title') {
        result = compareString(a.title, b.title)
      } else if (sortColumn === 'priority') {
        result = TASK_PRIORITY_ORDER.indexOf(a.priority) - TASK_PRIORITY_ORDER.indexOf(b.priority)
      } else if (sortColumn === 'status') {
        result = TASK_STATUS_ORDER.indexOf(a.status) - TASK_STATUS_ORDER.indexOf(b.status)
        // Within same status, sort done tasks by completedAt descending
        if (result === 0 && a.status === 'done' && b.status === 'done') {
          const aTime = a.completedAt ? new Date(a.completedAt).getTime() : 0
          const bTime = b.completedAt ? new Date(b.completedAt).getTime() : 0
          result = bTime - aTime
        }
      } else if (sortColumn === 'project') {
        const aProject = a.projectId ? projectById.get(a.projectId)?.name ?? '' : ''
        const bProject = b.projectId ? projectById.get(b.projectId)?.name ?? '' : ''
        result = compareString(aProject, bProject)
      } else if (sortColumn === 'assignee') {
        result = compareString(a.assignee, b.assignee)
      } else {
        const aTs = a.dueDate ? new Date(a.dueDate).getTime() : Number.POSITIVE_INFINITY
        const bTs = b.dueDate ? new Date(b.dueDate).getTime() : Number.POSITIVE_INFINITY
        result = aTs - bTs
      }

      return sortDirection === 'asc' ? result : -result
    })

    return sorted
  }, [filteredTasks, projectById, sortColumn, sortDirection])

  useEffect(() => {
    const visibleIds = new Set(filteredTasks.map((task) => task.id))
    setSelectedIds((current) => {
      const next = new Set<string>()
      current.forEach((id) => {
        if (visibleIds.has(id)) next.add(id)
      })
      return next
    })
  }, [filteredTasks])

  const allSelected = sortedTasks.length > 0 && sortedTasks.every((task) => selectedIds.has(task.id))

  const toggleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection((direction) => (direction === 'asc' ? 'desc' : 'asc'))
      return
    }

    setSortColumn(column)
    setSortDirection('asc')
  }

  const toggleTaskSelection = (taskId: string, checked: boolean) => {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (checked) next.add(taskId)
      else next.delete(taskId)
      return next
    })
  }

  const applyBulkUpdates = () => {
    if (selectedIds.size === 0) return

    const patch: UpdateTaskInput = {}
    if (bulkStatus !== '__none__') patch.status = bulkStatus as TaskStatus
    if (bulkPriority !== '__none__') patch.priority = bulkPriority as TaskPriority
    if (bulkProject !== '__none__') patch.projectId = bulkProject === '__unassigned__' ? undefined : bulkProject
    if (Object.keys(patch).length === 0) return

    onBulkUpdateTasks(Array.from(selectedIds), patch)
    setBulkStatus('__none__')
    setBulkPriority('__none__')
    setBulkProject('__none__')
    setSelectedIds(new Set())
  }

  const renderSortIcon = (column: SortColumn) => {
    if (sortColumn !== column) return <ArrowUpDown className="h-3.5 w-3.5" />
    if (sortDirection === 'asc') return <ArrowUp className="h-3.5 w-3.5" />
    return <ArrowDown className="h-3.5 w-3.5" />
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface p-3">
        <span className="text-xs text-text-muted">{selectedIds.size} selected</span>
        <Select value={bulkStatus} onValueChange={setBulkStatus}>
          <SelectTrigger className="w-[170px]">
            <SelectValue placeholder="Bulk status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">No status change</SelectItem>
            {TASK_STATUS_ORDER.map((status) => (
              <SelectItem key={status} value={status}>
                {STATUS_LABEL[status]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={bulkPriority} onValueChange={setBulkPriority}>
          <SelectTrigger className="w-[170px]">
            <SelectValue placeholder="Bulk priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">No priority change</SelectItem>
            {TASK_PRIORITY_ORDER.map((priority) => (
              <SelectItem key={priority} value={priority}>
                {priority}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={bulkProject} onValueChange={setBulkProject}>
          <SelectTrigger className="w-[190px]">
            <SelectValue placeholder="Bulk project" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">No project change</SelectItem>
            <SelectItem value="__unassigned__">Unassigned</SelectItem>
            {projects.map((project) => (
              <SelectItem key={project.id} value={project.id}>
                {project.emoji} {project.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button type="button" onClick={applyBulkUpdates} disabled={selectedIds.size === 0}>
          Apply
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="border-b border-border bg-surface-2">
              <tr>
                <th className="w-10 px-3 py-2 text-left">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={(event) => {
                      if (event.target.checked) {
                        setSelectedIds(new Set(sortedTasks.map((task) => task.id)))
                      } else {
                        setSelectedIds(new Set())
                      }
                    }}
                    className="h-4 w-4 rounded border-border bg-surface"
                  />
                </th>
                {[
                  { key: 'title', label: 'Title' },
                  { key: 'priority', label: 'Priority' },
                  { key: 'status', label: 'Status' },
                  { key: 'project', label: 'Project' },
                  { key: 'assignee', label: 'Assignee' },
                  { key: 'due', label: 'Due' }
                ].map((column) => (
                  <th key={column.key} className="px-3 py-2 text-left text-xs font-semibold text-text-muted">
                    <button
                      type="button"
                      onClick={() => toggleSort(column.key as SortColumn)}
                      className="inline-flex items-center gap-1"
                    >
                      {column.label}
                      {renderSortIcon(column.key as SortColumn)}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedTasks.map((task) => {
                const project = task.projectId ? projectById.get(task.projectId) : undefined
                const due = formatDueDate(task.dueDate)

                return (
                  <tr
                    key={task.id}
                    className="border-b border-border/70 hover:bg-surface-2"
                    onClick={() => onSelectTask(task.id)}
                  >
                    <td className="px-3 py-3" onClick={(event) => event.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(task.id)}
                        onChange={(event) => toggleTaskSelection(task.id, event.target.checked)}
                        className="h-4 w-4 rounded border-border bg-surface"
                      />
                    </td>
                    <td className="px-3 py-3 text-text-primary">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={task.status === 'done'}
                          onChange={(event) => onUpdateTask(task.id, { status: event.target.checked ? 'done' : 'todo' })}
                          onClick={(event) => event.stopPropagation()}
                          className="h-4 w-4 rounded border-border bg-surface"
                        />
                        <span className={cn(task.status === 'done' && 'line-through text-text-muted')}>{task.title}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <Badge className={cn('border px-2 py-0.5 capitalize', PRIORITY_BADGE_CLASS[task.priority])}>
                        {task.priority}
                      </Badge>
                    </td>
                    <td className="px-3 py-3">
                      <Badge className={cn('border px-2 py-0.5', STATUS_BADGE_CLASS[task.status])}>{STATUS_LABEL[task.status]}</Badge>
                    </td>
                    <td className="px-3 py-3 text-text-secondary">
                      {project ? (
                        <span className="inline-flex items-center gap-1">
                          <span>{project.emoji}</span>
                          <span>{project.name}</span>
                        </span>
                      ) : (
                        'Unassigned'
                      )}
                    </td>
                    <td className="px-3 py-3 text-text-secondary">
                      {task.assignee === 'human' ? 'Me' : task.assignee === 'agent' ? 'Agent' : 'Unassigned'}
                    </td>
                    <td className="px-3 py-3 text-text-secondary">{due ?? 'No due date'}</td>
                  </tr>
                )
              })}
              {sortedTasks.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-sm text-text-muted">
                    No tasks to display.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
