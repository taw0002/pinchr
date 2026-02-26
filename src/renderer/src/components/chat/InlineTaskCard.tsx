import { CheckSquare, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import type { SmartTask, TaskStatus } from '@/hooks/useTasks'

interface InlineTaskCardProps {
  task: SmartTask
  onNavigate?: () => void
}

const STATUS_LABELS: Record<TaskStatus, string> = {
  'backlog': 'Backlog',
  'todo': 'To Do',
  'in-progress': 'In Progress',
  'blocked': 'Blocked',
  'done': 'Done',
  'cancelled': 'Cancelled',
  archived: 'Archived'
}

const STATUS_COLORS: Record<TaskStatus, string> = {
  'backlog': 'bg-gray-500/15 text-gray-400',
  'todo': 'bg-blue-500/15 text-blue-400',
  'in-progress': 'bg-amber-500/15 text-amber-400',
  'blocked': 'bg-red-500/15 text-red-400',
  'done': 'bg-emerald-500/15 text-emerald-400',
  'cancelled': 'bg-gray-500/15 text-gray-400',
  archived: 'bg-stone-500/15 text-stone-300'
}

export function InlineTaskCard({ task, onNavigate }: InlineTaskCardProps) {
  const statusLabel = STATUS_LABELS[task.status] || task.status
  const statusColor = STATUS_COLORS[task.status] || STATUS_COLORS.todo

  return (
    <button
      onClick={onNavigate}
      className="group w-full rounded-lg border border-border bg-surface-2/50 backdrop-blur-sm px-3 py-2.5 text-left transition-all hover:border-accent/50 hover:bg-surface-2 hover:shadow-glow-sm"
    >
      <div className="flex items-start gap-2.5">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-accent/15 text-accent">
          <CheckSquare className="h-3.5 w-3.5" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-sm font-medium text-text-primary truncate">
              {task.title}
            </p>
            <ExternalLink className="h-3 w-3 text-text-muted opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn('inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-medium', statusColor)}>
              {statusLabel}
            </span>

            {task.projectId && (
              <Badge variant="secondary" className="text-[10px]">
                Project
              </Badge>
            )}

            {task.priority === 'urgent' && (
              <Badge variant="error" className="text-[10px]">
                Urgent
              </Badge>
            )}

            {task.priority === 'high' && (
              <Badge variant="warning" className="text-[10px]">
                High Priority
              </Badge>
            )}
          </div>
        </div>
      </div>
    </button>
  )
}
