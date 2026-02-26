import type { TaskPriority, TaskStatus } from '@/hooks/useTasks'

export const TASK_PRIORITY_ORDER: TaskPriority[] = ['urgent', 'high', 'medium', 'low']
export const TASK_STATUS_ORDER: TaskStatus[] = [
  'backlog',
  'todo',
  'in-progress',
  'blocked',
  'done',
  'cancelled',
  'archived'
]

export const PRIORITY_BADGE_CLASS: Record<TaskPriority, string> = {
  urgent: 'border-red-500/40 bg-red-500/15 text-red-300',
  high: 'border-orange-500/40 bg-orange-500/15 text-orange-300',
  medium: 'border-amber-500/40 bg-amber-500/15 text-amber-300',
  low: 'border-zinc-500/40 bg-zinc-500/15 text-zinc-300'
}

export const PRIORITY_DOT_CLASS: Record<TaskPriority, string> = {
  urgent: 'bg-red-400',
  high: 'bg-orange-400',
  medium: 'bg-amber-400',
  low: 'bg-zinc-400'
}

export const STATUS_BADGE_CLASS: Record<TaskStatus, string> = {
  backlog: 'border-slate-500/40 bg-slate-500/15 text-slate-300',
  todo: 'border-blue-500/40 bg-blue-500/15 text-blue-300',
  'in-progress': 'border-yellow-500/40 bg-yellow-500/15 text-yellow-300',
  blocked: 'border-red-500/40 bg-red-500/15 text-red-300',
  done: 'border-green-500/40 bg-green-500/15 text-green-300',
  cancelled: 'border-zinc-500/40 bg-zinc-500/15 text-zinc-300',
  archived: 'border-stone-500/40 bg-stone-500/15 text-stone-300'
}

export const STATUS_LABEL: Record<TaskStatus, string> = {
  backlog: 'Backlog',
  todo: 'Todo',
  'in-progress': 'In Progress',
  blocked: 'Blocked',
  done: 'Done',
  cancelled: 'Cancelled',
  archived: 'Archived'
}

export function formatDueDate(value?: string): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null

  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

export function comparePriority(a: TaskPriority, b: TaskPriority): number {
  return TASK_PRIORITY_ORDER.indexOf(a) - TASK_PRIORITY_ORDER.indexOf(b)
}

export function compareStatus(a: TaskStatus, b: TaskStatus): number {
  return TASK_STATUS_ORDER.indexOf(a) - TASK_STATUS_ORDER.indexOf(b)
}
