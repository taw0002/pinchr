import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTasks } from './useTasks'

export type NotificationType = 'blocked-task' | 'question' | 'review' | 'alert'
export type NotificationUrgency = 'low' | 'medium' | 'urgent' | 'critical'

export interface Notification {
  id: string
  type: NotificationType
  title: string
  description: string
  urgency: NotificationUrgency
  taskId?: string
  page: string
  read: boolean
  createdAt: string
}

interface NotificationDocument {
  notifications: Notification[]
}

const NOTIFICATIONS_FILE_PATH = 'notifications.json'
const NOTIFICATIONS_QUERY_KEY = ['gateway', 'notifications', NOTIFICATIONS_FILE_PATH] as const
const NOTIFICATIONS_RELOAD_DEBOUNCE_MS = 200

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `notif-${Math.random().toString(36).slice(2, 11)}`
}

function emptyNotificationDocument(): NotificationDocument {
  return { notifications: [] }
}

function isFileMissingError(error: unknown): boolean {
  const message = String(error).toLowerCase()
  return message.includes('enoent') || message.includes('not found') || message.includes('no such file')
}

async function readNotificationsFile(): Promise<NotificationDocument> {
  try {
    const result = await window.api.files.read(NOTIFICATIONS_FILE_PATH)
    if (!result.ok || !result.data) return emptyNotificationDocument()

    const content = (typeof result.data === 'string' ? result.data : '').trim()
    if (!content) return emptyNotificationDocument()

    const parsed = JSON.parse(content) as NotificationDocument
    return parsed
  } catch (error) {
    if (isFileMissingError(error)) {
      return emptyNotificationDocument()
    }
    throw error
  }
}

async function writeNotificationsFile(document: NotificationDocument): Promise<void> {
  const content = JSON.stringify(document, null, 2)
  const result = await window.api.files.write(NOTIFICATIONS_FILE_PATH, content)
  if (!result.ok) {
    throw new Error(result.error || 'Failed to save notifications')
  }
}

function isSameNotificationDocument(
  current: NotificationDocument | undefined,
  next: NotificationDocument
): boolean {
  if (!current) return false
  return JSON.stringify(current) === JSON.stringify(next)
}

export function useNotifications() {
  const queryClient = useQueryClient()
  const { tasks } = useTasks()

  const query = useQuery({
    queryKey: NOTIFICATIONS_QUERY_KEY,
    queryFn: readNotificationsFile
  })

  // Watch for file changes
  useEffect(() => {
    let disposed = false
    let reloadTimer: ReturnType<typeof setTimeout> | null = null

    const reloadNotificationsFromDisk = async () => {
      try {
        const nextDocument = await readNotificationsFile()
        if (disposed) return

        const currentDocument = queryClient.getQueryData<NotificationDocument>(NOTIFICATIONS_QUERY_KEY)
        if (isSameNotificationDocument(currentDocument, nextDocument)) return

        queryClient.setQueryData<NotificationDocument>(NOTIFICATIONS_QUERY_KEY, nextDocument)
      } catch (error) {
        console.error('Failed to reload notifications after workspace file change:', error)
      }
    }

    const removeFileChangedListener = window.api.workspace.onFileChanged(({ file }) => {
      if (file !== NOTIFICATIONS_FILE_PATH) return

      if (reloadTimer) clearTimeout(reloadTimer)
      reloadTimer = setTimeout(() => {
        void reloadNotificationsFromDisk()
      }, NOTIFICATIONS_RELOAD_DEBOUNCE_MS)
    })

    return () => {
      disposed = true
      if (reloadTimer) clearTimeout(reloadTimer)
      removeFileChangedListener()
    }
  }, [queryClient])

  // Auto-sync with tasks.json (blocked tasks with human assignee)
  useEffect(() => {
    const syncNotificationsWithTasks = async () => {
      try {
        const currentDoc = await readNotificationsFile()
        const existingNotifications = currentDoc.notifications

        // Find blocked tasks with human assignee
        const blockedTasks = tasks.filter(
          (task) => task.status === 'blocked' && task.assignee === 'human'
        )

        // Create notifications for blocked tasks that don't have one
        const newNotifications: Notification[] = []
        blockedTasks.forEach((task) => {
          const exists = existingNotifications.some(
            (notif) => notif.taskId === task.id && notif.type === 'blocked-task'
          )
          if (!exists) {
            newNotifications.push({
              id: generateId(),
              type: 'blocked-task',
              title: task.title,
              description: task.description || 'This task is blocked and needs your attention.',
              urgency: task.priority === 'urgent' ? 'urgent' : task.priority === 'high' ? 'medium' : 'low',
              taskId: task.id,
              page: 'tasks',
              read: false,
              createdAt: new Date().toISOString()
            })
          }
        })

        // Remove notifications for tasks that are no longer blocked or completed
        const activeTaskIds = new Set(blockedTasks.map((t) => t.id))
        const filteredNotifications = existingNotifications.filter((notif) => {
          if (notif.type !== 'blocked-task') return true
          if (!notif.taskId) return true
          return activeTaskIds.has(notif.taskId)
        })

        // Only update if there are changes
        if (newNotifications.length > 0 || filteredNotifications.length !== existingNotifications.length) {
          const updatedDoc: NotificationDocument = {
            notifications: [...filteredNotifications, ...newNotifications]
          }
          await writeNotificationsFile(updatedDoc)
          queryClient.setQueryData<NotificationDocument>(NOTIFICATIONS_QUERY_KEY, updatedDoc)
        }
      } catch (error) {
        console.error('Failed to sync notifications with tasks:', error)
      }
    }

    void syncNotificationsWithTasks()
  }, [tasks, queryClient])

  const saveMutation = useMutation({
    mutationFn: async (nextDocument: NotificationDocument) => {
      await writeNotificationsFile(nextDocument)
      return nextDocument
    },
    onMutate: async (nextDocument) => {
      await queryClient.cancelQueries({ queryKey: NOTIFICATIONS_QUERY_KEY })
      const previous =
        queryClient.getQueryData<NotificationDocument>(NOTIFICATIONS_QUERY_KEY) ??
        emptyNotificationDocument()
      queryClient.setQueryData<NotificationDocument>(NOTIFICATIONS_QUERY_KEY, nextDocument)
      return { previous }
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData<NotificationDocument>(NOTIFICATIONS_QUERY_KEY, context.previous)
      }
    }
  })

  const getCurrentDocument = (): NotificationDocument => {
    return (
      queryClient.getQueryData<NotificationDocument>(NOTIFICATIONS_QUERY_KEY) ??
      query.data ??
      emptyNotificationDocument()
    )
  }

  const persistDocument = (nextDocument: NotificationDocument) => {
    saveMutation.mutate(nextDocument)
  }

  const markAsRead = (notificationId: string) => {
    const current = getCurrentDocument()
    const nextNotifications = current.notifications.map((notif) =>
      notif.id === notificationId ? { ...notif, read: true } : notif
    )
    persistDocument({ notifications: nextNotifications })
  }

  const markAllAsRead = () => {
    const current = getCurrentDocument()
    const nextNotifications = current.notifications.map((notif) => ({ ...notif, read: true }))
    persistDocument({ notifications: nextNotifications })
  }

  const deleteNotification = (notificationId: string) => {
    const current = getCurrentDocument()
    const nextNotifications = current.notifications.filter((notif) => notif.id !== notificationId)
    persistDocument({ notifications: nextNotifications })
  }

  const addNotification = (input: Omit<Notification, 'id' | 'read' | 'createdAt'>) => {
    const current = getCurrentDocument()
    const newNotification: Notification = {
      id: generateId(),
      ...input,
      read: false,
      createdAt: new Date().toISOString()
    }
    persistDocument({
      notifications: [...current.notifications, newNotification]
    })
  }

  const notifications = query.data?.notifications ?? []
  const unreadCount = notifications.filter((n) => !n.read).length

  return {
    notifications,
    unreadCount,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    isSaving: saveMutation.isPending,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    addNotification,
    refetch: query.refetch
  }
}
