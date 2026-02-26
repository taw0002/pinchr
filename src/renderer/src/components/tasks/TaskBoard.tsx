import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, PlusCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { Project, SmartTask, TaskStatus } from '@/hooks/useTasks'
import { TaskCard } from './TaskCard'
import { STATUS_BADGE_CLASS, STATUS_LABEL, TASK_STATUS_ORDER } from './taskMeta'

interface TaskBoardProps {
  tasks: SmartTask[]
  projects: Project[]
  projectFilter: string | 'all'
  highlightedTaskId?: string | null
  onSelectTask: (taskId: string) => void
  onMoveTask: (taskId: string, status: TaskStatus) => void
  onToggleDone: (taskId: string, done: boolean) => void
  onCycleStatus: (taskId: string) => void
  onDeleteTask: (taskId: string) => void
  onWorkOnTask: (task: SmartTask) => Promise<boolean>
  onMarkDone: (taskId: string, note?: string) => void
  onAddComment: (taskId: string, comment: { author: 'human' | 'agent'; text: string }) => void
}

export function TaskBoard({
  tasks,
  projects,
  projectFilter,
  highlightedTaskId,
  onSelectTask,
  onMoveTask,
  onToggleDone,
  onCycleStatus,
  onDeleteTask,
  onWorkOnTask,
  onMarkDone,
  onAddComment
}: TaskBoardProps) {
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null)
  const [hoverStatus, setHoverStatus] = useState<TaskStatus | null>(null)
  const [sendingTaskId, setSendingTaskId] = useState<string | null>(null)
  const [sentTaskId, setSentTaskId] = useState<string | null>(null)
  const [sendNotice, setSendNotice] = useState<{ text: string; isError: boolean } | null>(null)
  const noticeTimeoutRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (noticeTimeoutRef.current) {
        window.clearTimeout(noticeTimeoutRef.current)
      }
    }
  }, [])

  const showNotice = (text: string, isError: boolean) => {
    setSendNotice({ text, isError })
    if (noticeTimeoutRef.current) {
      window.clearTimeout(noticeTimeoutRef.current)
    }
    noticeTimeoutRef.current = window.setTimeout(() => {
      setSendNotice(null)
      noticeTimeoutRef.current = null
    }, 2400)
  }

  const handleWorkOnThis = async (task: SmartTask) => {
    setSendingTaskId(task.id)
    try {
      const wasSent = await onWorkOnTask(task)
      if (!wasSent) {
        showNotice('Failed to send task to agent', true)
        return
      }
      setSentTaskId(task.id)
      window.setTimeout(() => {
        setSentTaskId((current) => (current === task.id ? null : current))
      }, 2400)
      showNotice('Sent to agent', false)
    } catch (error) {
      showNotice(String(error), true)
    } finally {
      setSendingTaskId((current) => (current === task.id ? null : current))
    }
  }

  const projectById = useMemo(() => {
    return new Map(projects.map((project) => [project.id, project]))
  }, [projects])

  const filteredTasks = useMemo(() => {
    if (projectFilter === 'all') return tasks
    return tasks.filter((task) => task.projectId === projectFilter)
  }, [projectFilter, tasks])

  const groupedTasks = useMemo(() => {
    const groups: Record<TaskStatus, SmartTask[]> = {
      backlog: [],
      todo: [],
      'in-progress': [],
      blocked: [],
      done: [],
      cancelled: [],
      archived: []
    }

    filteredTasks.forEach((task) => {
      groups[task.status].push(task)
    })

    // Sort done tasks by completedAt descending (most recent first)
    groups.done.sort((a, b) => {
      const aTime = a.completedAt ? new Date(a.completedAt).getTime() : 0
      const bTime = b.completedAt ? new Date(b.completedAt).getTime() : 0
      return bTime - aTime
    })

    return groups
  }, [filteredTasks])

  const draggingTask = draggingTaskId ? tasks.find((task) => task.id === draggingTaskId) : null

  if (filteredTasks.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface p-10 text-center">
        <PlusCircle className="mx-auto mb-3 h-8 w-8 text-text-muted" />
        <p className="text-sm text-text-secondary">No tasks in this project yet.</p>
      </div>
    )
  }

  return (
    <div className="w-full overflow-x-auto pb-2">
      {sendNotice && (
        <div
          className={cn(
            'mb-3 rounded-lg border px-3 py-2 text-xs',
            sendNotice.isError ? 'border-red-500/40 bg-red-500/10 text-red-200' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
          )}
        >
          {sendNotice.text}
        </div>
      )}
      <div className="flex min-w-max gap-3">
        {TASK_STATUS_ORDER.map((status) => {
          const items = groupedTasks[status]
          const canDrop = !!draggingTask && draggingTask.status !== status

          return (
            <section
              key={status}
              onDragOver={(event) => {
                if (!canDrop) return
                event.preventDefault()
                setHoverStatus(status)
              }}
              onDragLeave={() => {
                if (hoverStatus === status) setHoverStatus(null)
              }}
              onDrop={(event) => {
                event.preventDefault()
                if (!draggingTaskId) return
                onMoveTask(draggingTaskId, status)
                setDraggingTaskId(null)
                setHoverStatus(null)
              }}
              className={cn(
                'flex min-h-[440px] w-[280px] min-w-[280px] flex-col rounded-xl border border-border bg-surface p-3',
                hoverStatus === status && 'border-accent'
              )}
            >
              <div className="mb-3 flex items-center justify-between">
                <Badge className={cn('border px-2 py-0.5', STATUS_BADGE_CLASS[status])}>{STATUS_LABEL[status]}</Badge>
                <span className="text-xs text-text-muted">{items.length}</span>
              </div>

              <div className="flex-1 space-y-2 overflow-y-auto pr-1">
                {items.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    project={task.projectId ? projectById.get(task.projectId) : undefined}
                    highlight={highlightedTaskId === task.id}
                    draggable
                    isDragging={draggingTaskId === task.id}
                    onClick={() => onSelectTask(task.id)}
                    onToggleDone={(done) => onToggleDone(task.id, done)}
                    onCycleStatus={() => onCycleStatus(task.id)}
                    onDelete={() => onDeleteTask(task.id)}
                    onWorkOnThis={() => {
                      void handleWorkOnThis(task)
                    }}
                    isSendingToAgent={sendingTaskId === task.id}
                    wasSentToAgent={sentTaskId === task.id}
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = 'move'
                      event.dataTransfer.setData('text/plain', task.id)
                      setDraggingTaskId(task.id)
                    }}
                    onDragEnd={() => {
                      setDraggingTaskId(null)
                      setHoverStatus(null)
                    }}
                    onMarkDone={(note) => {
                      onMarkDone(task.id, note)
                      if (note) {
                        onAddComment(task.id, { author: 'human', text: note })
                      }
                    }}
                  />
                ))}
              </div>

              {items.length === 0 && (
                <div className="mt-2 rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-text-muted">
                  <AlertTriangle className="mx-auto mb-1 h-4 w-4" />
                  Drop task here
                </div>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}
