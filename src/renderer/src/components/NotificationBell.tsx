import { useState } from 'react'
import { Bell, AlertCircle, HelpCircle, FileCheck, AlertTriangle, X, CheckCircle2 } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover'
import { ScrollArea } from './ui/scroll-area'
import { Button } from './ui/button'
import { Textarea } from './ui/textarea'
import { cn } from '@/lib/utils'
import { formatRelativeTime } from '@/lib/utils'
import { useNotifications, type Notification, type NotificationUrgency } from '@/hooks/useNotifications'
import { useTasks } from '@/hooks/useTasks'
import type { Page } from '@/types/navigation'

interface NotificationBellProps {
  onNavigate: (page: Page) => void
}

function getUrgencyStyles(urgency: NotificationUrgency) {
  switch (urgency) {
    case 'critical':
      return 'bg-red-500/20 text-red-400 border-red-500/30 animate-pulse'
    case 'urgent':
      return 'bg-coral-500/20 text-coral-400 border-coral-500/30'
    case 'medium':
      return 'bg-amber-500/20 text-amber-400 border-amber-500/30'
    case 'low':
    default:
      return 'bg-surface-3 text-text-muted border-border'
  }
}

function getUrgencyLabel(urgency: NotificationUrgency) {
  switch (urgency) {
    case 'critical':
      return 'Critical'
    case 'urgent':
      return 'Urgent'
    case 'medium':
      return 'Medium'
    case 'low':
    default:
      return 'Low'
  }
}

function getNotificationIcon(type: Notification['type']) {
  switch (type) {
    case 'blocked-task':
      return AlertCircle
    case 'question':
      return HelpCircle
    case 'review':
      return FileCheck
    case 'alert':
      return AlertTriangle
    default:
      return Bell
  }
}

function NotificationCard({
  notification,
  onNavigate,
  onDismiss,
  onMarkTaskDone
}: {
  notification: Notification
  onNavigate: (page: Page) => void
  onDismiss: (id: string) => void
  onMarkTaskDone?: (taskId: string, note?: string) => void
}) {
  const [showNoteField, setShowNoteField] = useState(false)
  const [note, setNote] = useState('')
  const Icon = getNotificationIcon(notification.type)

  const handleClick = () => {
    onNavigate(notification.page as Page)
  }

  const handleMarkDone = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!notification.taskId || !onMarkTaskDone) return

    onMarkTaskDone(notification.taskId, note.trim() || undefined)
    setNote('')
    setShowNoteField(false)
  }

  const isBlockedTask = notification.type === 'blocked-task' && notification.taskId

  return (
    <div
      className={cn(
        'group relative rounded-lg border p-3 transition-all cursor-pointer hover:bg-surface-3',
        notification.read ? 'border-border bg-surface-2' : 'border-accent/20 bg-surface-2'
      )}
      onClick={handleClick}
    >
      {!notification.read && (
        <div className="absolute left-2 top-2 h-2 w-2 rounded-full bg-accent animate-pulse" />
      )}

      <button
        onClick={(e) => {
          e.stopPropagation()
          onDismiss(notification.id)
        }}
        className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-surface-3 rounded"
        title="Dismiss"
      >
        <X className="h-3 w-3 text-text-muted" />
      </button>

      <div className="flex items-start gap-3">
        <div
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border',
            getUrgencyStyles(notification.urgency)
          )}
        >
          <Icon className="h-4 w-4" />
        </div>

        <div className="flex-1 min-w-0 pr-4">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="text-sm font-medium text-text-primary truncate">{notification.title}</h4>
            <span
              className={cn(
                'text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0',
                getUrgencyStyles(notification.urgency)
              )}
            >
              {getUrgencyLabel(notification.urgency)}
            </span>
          </div>
          <p className="text-xs text-text-muted line-clamp-2 mb-2">{notification.description}</p>
          <p className="text-[10px] text-text-muted">{formatRelativeTime(notification.createdAt)}</p>

          {isBlockedTask && onMarkTaskDone && (
            <div className="mt-2 space-y-1.5" onClick={(e) => e.stopPropagation()}>
              {showNoteField && (
                <Textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Add a note (optional)…"
                  className="h-14 text-xs"
                  onClick={(e) => e.stopPropagation()}
                />
              )}
              <div className="flex gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  className="h-6 bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
                  onClick={handleMarkDone}
                >
                  <CheckCircle2 className="mr-1 h-3 w-3" />
                  {showNoteField ? 'Submit' : 'Done'}
                </Button>
                {!showNoteField && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[10px] text-text-muted hover:text-text-primary"
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
                    className="h-6 text-[10px] text-text-muted hover:text-text-primary"
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
      </div>
    </div>
  )
}

export function NotificationBell({ onNavigate }: NotificationBellProps) {
  const { notifications, unreadCount, markAsRead, markAllAsRead, deleteNotification } =
    useNotifications()
  const { updateTask, addComment } = useTasks()

  // Sort notifications: unread first, then by urgency, then by date
  const sortedNotifications = [...notifications].sort((a, b) => {
    // Unread first
    if (a.read !== b.read) return a.read ? 1 : -1

    // Then by urgency
    const urgencyOrder = { critical: 0, urgent: 1, medium: 2, low: 3 }
    const urgencyDiff = urgencyOrder[a.urgency] - urgencyOrder[b.urgency]
    if (urgencyDiff !== 0) return urgencyDiff

    // Then by date (newest first)
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })

  const handleNotificationClick = (page: Page, notificationId: string) => {
    markAsRead(notificationId)
    onNavigate(page)
  }

  const handleDismiss = (notificationId: string) => {
    deleteNotification(notificationId)
  }

  const handleMarkTaskDone = (taskId: string, note?: string) => {
    updateTask(taskId, { status: 'done', assignee: 'agent' })
    if (note) {
      addComment(taskId, { author: 'human', text: note })
    }
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface-2 text-text-secondary transition-colors hover:bg-surface-3 hover:text-text-primary"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          title="Notifications"
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-coral-500 px-1 text-[10px] font-semibold text-white">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        className="w-96 p-0"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <div className="border-b border-border px-4 py-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-text-primary">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={() => markAllAsRead()}
                className="text-xs text-accent hover:text-accent/80 transition-colors"
              >
                Mark all read
              </button>
            )}
          </div>
        </div>

        {sortedNotifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/10 mb-3">
              <Bell className="h-6 w-6 text-accent" />
            </div>
            <p className="text-sm text-text-muted text-center">
              All clear! Nothing needs your attention.
            </p>
          </div>
        ) : (
          <ScrollArea className="max-h-[500px]">
            <div className="space-y-2 p-3">
              {sortedNotifications.map((notification) => (
                <NotificationCard
                  key={notification.id}
                  notification={notification}
                  onNavigate={(page) => handleNotificationClick(page, notification.id)}
                  onDismiss={handleDismiss}
                  onMarkTaskDone={handleMarkTaskDone}
                />
              ))}
            </div>
          </ScrollArea>
        )}
      </PopoverContent>
    </Popover>
  )
}
