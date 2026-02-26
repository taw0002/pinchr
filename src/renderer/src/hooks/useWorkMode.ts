import { useState, useEffect, useCallback } from 'react'
import { useTasks, type SmartTask } from './useTasks'

export type WorkModeStatus = 'idle' | 'working' | 'blocked' | 'paused'

export interface WorkModeActivityLog {
  id: string
  timestamp: string
  type: 'started' | 'completed' | 'blocked' | 'paused' | 'resumed'
  taskId?: string
  taskTitle?: string
  message: string
}

export interface WorkModeState {
  enabled: boolean
  status: WorkModeStatus
  currentTask: SmartTask | null
  completedTaskIds: string[]
  blockedTaskIds: string[]
  activityLog: WorkModeActivityLog[]
  sessionStartedAt: string | null
}

const WORK_MODE_STORAGE_KEY = 'pinchr_work_mode_enabled'
const WORK_MODE_STATE_KEY = 'pinchr_work_mode_state'

function generateId(): string {
  return `wm-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function getInitialState(): WorkModeState {
  try {
    const stored = localStorage.getItem(WORK_MODE_STATE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored) as WorkModeState
      // Reset status to idle on app restart
      return {
        ...parsed,
        status: 'idle',
        currentTask: null
      }
    }
  } catch (error) {
    console.error('Failed to load work mode state:', error)
  }

  return {
    enabled: false,
    status: 'idle',
    currentTask: null,
    completedTaskIds: [],
    blockedTaskIds: [],
    activityLog: [],
    sessionStartedAt: null
  }
}

function persistState(state: WorkModeState) {
  try {
    localStorage.setItem(WORK_MODE_STATE_KEY, JSON.stringify(state))
  } catch (error) {
    console.error('Failed to persist work mode state:', error)
  }
}

function getNextTask(tasks: SmartTask[], completedIds: string[], blockedIds: string[]): SmartTask | null {
  // Priority order: urgent > high > medium > low
  const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 }

  // Filter available tasks: assignee=agent, status=todo or in-progress, not completed, not blocked
  const availableTasks = tasks.filter(task => {
    if (task.assignee !== 'agent') return false
    if (task.status !== 'todo' && task.status !== 'in-progress') return false
    if (completedIds.includes(task.id)) return false
    if (blockedIds.includes(task.id)) return false
    // Check if task is blocked by other tasks
    if (task.blockedBy.length > 0) {
      const blockers = tasks.filter(t => task.blockedBy.includes(t.id))
      if (blockers.some(b => b.status !== 'done')) return false
    }
    return true
  })

  if (availableTasks.length === 0) return null

  // Sort by priority, then by createdAt
  availableTasks.sort((a, b) => {
    const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority]
    if (priorityDiff !== 0) return priorityDiff
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  })

  return availableTasks[0]
}

export function useWorkMode() {
  const { tasks, updateTask } = useTasks()
  const [state, setState] = useState<WorkModeState>(getInitialState)

  // Persist state changes
  useEffect(() => {
    persistState(state)
  }, [state])

  // Automatically pick next task when enabled and idle
  useEffect(() => {
    if (!state.enabled || state.status !== 'idle') return

    const nextTask = getNextTask(tasks, state.completedTaskIds, state.blockedTaskIds)

    if (nextTask) {
      // Start working on next task
      setState(prev => ({
        ...prev,
        status: 'working',
        currentTask: nextTask,
        activityLog: [
          {
            id: generateId(),
            timestamp: new Date().toISOString(),
            type: 'started',
            taskId: nextTask.id,
            taskTitle: nextTask.title,
            message: `Started working on: ${nextTask.title}`
          },
          ...prev.activityLog
        ]
      }))

      // Update task status to in-progress
      if (nextTask.status === 'todo') {
        updateTask(nextTask.id, { status: 'in-progress' })
      }
    } else {
      // No tasks available - stay idle
      setState(prev => ({
        ...prev,
        status: 'idle',
        currentTask: null
      }))
    }
  }, [state.enabled, state.status, tasks, state.completedTaskIds, state.blockedTaskIds, updateTask])

  const toggleWorkMode = useCallback((enabled: boolean) => {
    setState(prev => {
      const now = new Date().toISOString()
      const newLog: WorkModeActivityLog = {
        id: generateId(),
        timestamp: now,
        type: enabled ? 'resumed' : 'paused',
        message: enabled ? 'Work Mode enabled' : 'Work Mode paused'
      }

      return {
        ...prev,
        enabled,
        status: enabled ? 'idle' : 'paused',
        sessionStartedAt: enabled ? (prev.sessionStartedAt || now) : prev.sessionStartedAt,
        activityLog: [newLog, ...prev.activityLog]
      }
    })
  }, [])

  const markTaskCompleted = useCallback((taskId: string, taskTitle: string) => {
    setState(prev => ({
      ...prev,
      status: 'idle',
      currentTask: null,
      completedTaskIds: [...prev.completedTaskIds, taskId],
      activityLog: [
        {
          id: generateId(),
          timestamp: new Date().toISOString(),
          type: 'completed',
          taskId,
          taskTitle,
          message: `Completed: ${taskTitle}`
        },
        ...prev.activityLog
      ]
    }))

    // Update task status to done
    updateTask(taskId, { status: 'done' })
  }, [updateTask])

  const markTaskBlocked = useCallback((taskId: string, taskTitle: string, reason: string) => {
    setState(prev => ({
      ...prev,
      status: 'idle',
      currentTask: null,
      blockedTaskIds: [...prev.blockedTaskIds, taskId],
      activityLog: [
        {
          id: generateId(),
          timestamp: new Date().toISOString(),
          type: 'blocked',
          taskId,
          taskTitle,
          message: `Blocked: ${taskTitle} — ${reason}`
        },
        ...prev.activityLog
      ]
    }))

    // Update task status to blocked
    updateTask(taskId, { status: 'blocked' })
  }, [updateTask])

  const resetSession = useCallback(() => {
    setState(prev => ({
      ...prev,
      completedTaskIds: [],
      blockedTaskIds: [],
      activityLog: [],
      sessionStartedAt: new Date().toISOString()
    }))
  }, [])

  // Get tasks in queue (next 5)
  const queuedTasks = getNextTask(tasks, state.completedTaskIds, state.blockedTaskIds)
    ? tasks
        .filter(task => {
          if (task.assignee !== 'agent') return false
          if (task.status !== 'todo' && task.status !== 'in-progress') return false
          if (state.completedTaskIds.includes(task.id)) return false
          if (state.blockedTaskIds.includes(task.id)) return false
          if (state.currentTask?.id === task.id) return false
          if (task.blockedBy.length > 0) {
            const blockers = tasks.filter(t => task.blockedBy.includes(t.id))
            if (blockers.some(b => b.status !== 'done')) return false
          }
          return true
        })
        .sort((a, b) => {
          const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 }
          const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority]
          if (priorityDiff !== 0) return priorityDiff
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        })
        .slice(0, 5)
    : []

  // Get completed tasks from this session
  const completedTasks = tasks.filter(task => state.completedTaskIds.includes(task.id))

  // Get blocked tasks from this session
  const blockedTasks = tasks.filter(task => state.blockedTaskIds.includes(task.id))

  return {
    ...state,
    toggleWorkMode,
    markTaskCompleted,
    markTaskBlocked,
    resetSession,
    queuedTasks,
    completedTasks,
    blockedTasks
  }
}
