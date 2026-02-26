import { useState, type DragEvent } from 'react'
import { CheckCircle2, GripVertical } from 'lucide-react'
import { cn, formatRelativeTime } from '@/lib/utils'
import type { Project, SmartTask } from '@/hooks/useTasks'
import { PRIORITY_DOT_CLASS } from './taskMeta'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

interface TaskCardProps {
  task: SmartTask
  project?: Project
  highlight?: boolean
  draggable?: boolean
  isDragging?: boolean
  onClick: () => void
  onToggleDone: (checked: boolean) => void
  onCycleStatus: () => void
  onDelete: () => void
  onWorkOnThis?: () => void
  isSendingToAgent?: boolean
  wasSentToAgent?: boolean
  onDragStart?: (event: DragEvent<HTMLDivElement>) => void
  onDragEnd?: () => void
  onMarkDone?: (note?: string) => void
}

export function TaskCard({
  task,
  project,
  highlight = false,
  draggable = false,
  isDragging = false,
  onClick,
  onToggleDone,
  onDragStart,
  onDragEnd,
  onMarkDone
}: TaskCardProps) {
  const [showNoteField, setShowNoteField] = useState(false)
  const [note, setNote] = useState('')
  const completedSubtasks = task.subtasks.filter((subtask) => subtask.done).length
  const subtitle = task.description
    ? task.description.length > 60
      ? task.description.slice(0, 60).trimEnd() + '…'
      : task.description
    : null

  const handleMarkDone = (event: React.MouseEvent) => {
    event.stopPropagation()
    if (!onMarkDone) return

    if (showNoteField) {
      onMarkDone(note.trim() || undefined)
      setNote('')
      setShowNoteField(false)
    } else {
      onMarkDone()
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      draggable={draggable}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onClick()
        }
      }}
      onDragStart={(event) => {
        if (!draggable || !onDragStart) return
        onDragStart(event)
      }}
      onDragEnd={onDragEnd}
      className={cn(
        'group cursor-pointer rounded-lg border border-border bg-surface-2 px-3 py-2.5 transition-all hover:border-accent/50 hover:shadow-md',
        isDragging && 'opacity-50',
        highlight && 'border-accent/80 bg-accent/10'
      )}
    >
      <div className="flex items-start gap-2.5">
        <input
          aria-label={`Mark ${task.title} complete`}
          type="checkbox"
          checked={task.status === 'done'}
          onChange={(event) => {
            event.stopPropagation()
            onToggleDone(event.target.checked)
          }}
          className="mt-0.5 h-3.5 w-3.5 rounded border-border bg-surface text-accent"
        />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className={cn('h-2 w-2 shrink-0 rounded-full', PRIORITY_DOT_CLASS[task.priority])} aria-hidden="true" />
            <p className={cn('text-sm font-medium leading-snug text-text-primary line-clamp-2', task.status === 'done' && 'line-through text-text-muted')}>
              {task.title}
            </p>
          </div>

          {subtitle && (
            <p className="mt-0.5 text-xs text-text-muted line-clamp-1">{subtitle}</p>
          )}

          <div className="mt-1.5 flex items-center gap-2 text-[11px] text-text-muted">
            {project && (
              <span className="inline-flex items-center gap-1 truncate">
                <span>{project.emoji}</span>
                <span className="truncate">{project.name}</span>
              </span>
            )}
            {task.subtasks.length > 0 && (
              <span className="shrink-0">{completedSubtasks}/{task.subtasks.length}</span>
            )}
            {task.assignee === 'agent' && (
              <span className="shrink-0 rounded bg-accent/15 px-1 py-0.5 text-[10px] text-accent">Agent</span>
            )}
            {task.assignee === 'human' && (
              <span className="shrink-0 rounded bg-blue-500/15 px-1 py-0.5 text-[10px] text-blue-400">You</span>
            )}
            {task.status === 'done' && task.completedAt && (
              <span className="shrink-0 text-text-muted">Completed {formatRelativeTime(task.completedAt)}</span>
            )}
          </div>

          {task.assignee === 'human' && task.status !== 'done' && onMarkDone && (
            <div className="mt-2 space-y-1.5" onClick={(e) => e.stopPropagation()}>
              {showNoteField && (
                <Textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Add a note (optional)…"
                  className="h-16 text-xs"
                  onClick={(e) => e.stopPropagation()}
                />
              )}
              <div className="flex gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  className="h-7 bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={handleMarkDone}
                >
                  <CheckCircle2 className="mr-1 h-3 w-3" />
                  {showNoteField ? 'Submit' : 'Mark Done'}
                </Button>
                {!showNoteField && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-text-muted hover:text-text-primary"
                    onClick={(e) => {
                      e.stopPropagation()
                      setShowNoteField(true)
                    }}
                  >
                    Add note
                  </Button>
                )}
                {showNoteField && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-text-muted hover:text-text-primary"
                    onClick={(e) => {
                      e.stopPropagation()
                      setNote('')
                      setShowNoteField(false)
                    }}
                  >
                    Cancel
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>

        {draggable && (
          <span className="shrink-0 rounded-md p-0.5 text-text-muted opacity-0 group-hover:opacity-100 transition-opacity" title="Drag to move">
            <GripVertical className="h-3.5 w-3.5" />
          </span>
        )}
      </div>
    </div>
  )
}
