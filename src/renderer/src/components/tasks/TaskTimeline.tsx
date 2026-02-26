import { useMemo } from 'react'
import { CalendarClock, ClockAlert, MinusCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { Project, SmartTask } from '@/hooks/useTasks'
import { PRIORITY_BADGE_CLASS, STATUS_BADGE_CLASS, STATUS_LABEL, formatDueDate } from './taskMeta'

interface TaskTimelineProps {
  tasks: SmartTask[]
  projects: Project[]
  projectFilter: string | 'all'
  onSelectTask: (taskId: string) => void
  onToggleDone: (taskId: string, done: boolean) => void
}

function startOfWeek(date: Date): Date {
  const copy = new Date(date)
  const day = copy.getDay()
  const diff = day === 0 ? -6 : 1 - day
  copy.setDate(copy.getDate() + diff)
  copy.setHours(0, 0, 0, 0)
  return copy
}

function formatWeekLabel(date: Date): string {
  return `Week of ${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
}

export function TaskTimeline({ tasks, projects, projectFilter, onSelectTask, onToggleDone }: TaskTimelineProps) {
  const projectById = useMemo(() => {
    return new Map(projects.map((project) => [project.id, project]))
  }, [projects])

  const filteredTasks = useMemo(() => {
    if (projectFilter === 'all') return tasks
    return tasks.filter((task) => task.projectId === projectFilter)
  }, [projectFilter, tasks])

  const grouped = useMemo(() => {
    const now = Date.now()

    const overdue: SmartTask[] = []
    const upcomingByWeek = new Map<string, { week: Date; tasks: SmartTask[] }>()
    const noDueDate: SmartTask[] = []

    filteredTasks.forEach((task) => {
      if (!task.dueDate) {
        noDueDate.push(task)
        return
      }

      const due = new Date(task.dueDate)
      if (Number.isNaN(due.getTime())) {
        noDueDate.push(task)
        return
      }

      if (due.getTime() < now && task.status !== 'done' && task.status !== 'cancelled') {
        overdue.push(task)
        return
      }

      const week = startOfWeek(due)
      const key = week.toISOString()
      const bucket = upcomingByWeek.get(key)
      if (bucket) {
        bucket.tasks.push(task)
      } else {
        upcomingByWeek.set(key, { week, tasks: [task] })
      }
    })

    overdue.sort((a, b) => (new Date(a.dueDate ?? '').getTime() || 0) - (new Date(b.dueDate ?? '').getTime() || 0))
    noDueDate.sort((a, b) => a.title.localeCompare(b.title))

    const weeks = Array.from(upcomingByWeek.values())
      .sort((a, b) => a.week.getTime() - b.week.getTime())
      .map((group) => ({
        ...group,
        tasks: group.tasks.sort(
          (a, b) => (new Date(a.dueDate ?? '').getTime() || 0) - (new Date(b.dueDate ?? '').getTime() || 0)
        )
      }))

    return { overdue, weeks, noDueDate }
  }, [filteredTasks])

  const renderTaskRow = (task: SmartTask) => {
    const project = task.projectId ? projectById.get(task.projectId) : undefined

    return (
      <button
        key={task.id}
        type="button"
        onClick={() => onSelectTask(task.id)}
        className="w-full rounded-lg border border-border bg-surface-2 p-3 text-left hover:bg-surface"
      >
        <div className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={task.status === 'done'}
            onChange={(event) => {
              event.stopPropagation()
              onToggleDone(task.id, event.target.checked)
            }}
            onClick={(event) => event.stopPropagation()}
            className="mt-1 h-4 w-4 rounded border-border bg-surface"
          />
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <span className={cn('font-medium text-text-primary', task.status === 'done' && 'line-through text-text-muted')}>
                {task.title}
              </span>
              <Badge className={cn('border px-2 py-0.5 text-[11px] capitalize', PRIORITY_BADGE_CLASS[task.priority])}>
                {task.priority}
              </Badge>
              <Badge className={cn('border px-2 py-0.5 text-[11px]', STATUS_BADGE_CLASS[task.status])}>{STATUS_LABEL[task.status]}</Badge>
              {project && (
                <Badge variant="secondary" className="text-[11px]">
                  {project.emoji} {project.name}
                </Badge>
              )}
            </div>
            <div className="text-xs text-text-muted">{formatDueDate(task.dueDate) ?? 'No due date'}</div>
          </div>
        </div>
      </button>
    )
  }

  return (
    <div className="space-y-4">
      {grouped.overdue.length > 0 && (
        <section className="rounded-xl border border-red-500/40 bg-red-500/10 p-4">
          <h3 className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-red-200">
            <ClockAlert className="h-4 w-4" />
            Overdue
          </h3>
          <div className="space-y-2">{grouped.overdue.map(renderTaskRow)}</div>
        </section>
      )}

      {grouped.weeks.map((group) => (
        <section key={group.week.toISOString()} className="rounded-xl border border-border bg-surface p-4">
          <h3 className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-text-primary">
            <CalendarClock className="h-4 w-4" />
            {formatWeekLabel(group.week)}
          </h3>
          <div className="space-y-2">{group.tasks.map(renderTaskRow)}</div>
        </section>
      ))}

      <section className="rounded-xl border border-border bg-surface p-4">
        <h3 className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-text-primary">
          <MinusCircle className="h-4 w-4" />
          No Due Date
        </h3>
        <div className="space-y-2">
          {grouped.noDueDate.length === 0 ? (
            <p className="text-sm text-text-muted">No tasks without a due date.</p>
          ) : (
            grouped.noDueDate.map(renderTaskRow)
          )}
        </div>
      </section>
    </div>
  )
}
