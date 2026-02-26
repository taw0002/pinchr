import { useCallback, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useStreamMessage } from '@/hooks/useGateway'
import {
  useSessionHistory as useToolSessionHistory,
  type GatewaySessionMessage
} from '@/hooks/useGatewaySessions'

function stripThinkingMarkers(text: string): string {
  return text.replace(/<\/?think>/gi, '').replace(/^thinking:\s*/i, '').replace(/^reasoning:\s*/i, '')
}

function buildTaskSystemPrompt(task: {
  id: string
  title: string
  description: string
  status: string
}): string {
  const description = task.description.trim() || 'No description provided.'
  return [
    'You are helping the user complete this specific task.',
    `Task ID: ${task.id}`,
    `Title: ${task.title}`,
    `Description: ${description}`,
    `Status: ${task.status}`,
    'Keep responses focused, concrete, and directly useful for finishing this task.'
  ].join('\n')
}

export interface TaskChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp?: string
  isStreaming?: boolean
}

interface UseTaskSessionChatOptions {
  task: {
    id: string
    title: string
    description: string
    status: string
  }
  enabled?: boolean
}

export function useTaskSessionChat({ task, enabled = true }: UseTaskSessionChatOptions) {
  const queryClient = useQueryClient()
  const { mutate: streamMessage } = useStreamMessage()
  const [streamingContent, setStreamingContent] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const streamTokenRef = useRef(0)

  const sessionKey = useMemo(() => `task-${task.id}`, [task.id])
  const sessionUser = useMemo(() => `task-${task.id}`, [task.id])
  const taskSystemPrompt = useMemo(() => buildTaskSystemPrompt(task), [task])

  const { data: history = [], isLoading } = useToolSessionHistory(enabled ? sessionKey : null)

  const historyMessages = useMemo<TaskChatMessage[]>(
    () =>
      history.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        timestamp: message.timestamp
      })),
    [history]
  )

  const messages = useMemo<TaskChatMessage[]>(() => {
    if (!isStreaming) return historyMessages
    return [
      ...historyMessages,
      {
        id: 'streaming-assistant',
        role: 'assistant',
        content: streamingContent,
        timestamp: new Date().toISOString(),
        isStreaming: true
      }
    ]
  }, [historyMessages, isStreaming, streamingContent])

  const completeStream = useCallback(
    (token: number) => {
      if (streamTokenRef.current !== token) return
      streamTokenRef.current = token + 1
      setIsStreaming(false)
      setStreamingContent('')
      queryClient.invalidateQueries({ queryKey: ['gateway', 'tools', 'sessions_history', sessionKey] })
    },
    [queryClient, sessionKey]
  )

  const sendMessage = useCallback(
    (rawMessage: string): boolean => {
      const message = rawMessage.trim()
      if (!enabled || !message || isStreaming) return false

      setError(null)

      const optimisticUserMessage: GatewaySessionMessage = {
        id: `local-user-${Date.now()}`,
        role: 'user',
        content: message,
        timestamp: new Date().toISOString()
      }
      queryClient.setQueryData<GatewaySessionMessage[]>(
        ['gateway', 'tools', 'sessions_history', sessionKey],
        (existing = []) => [...existing, optimisticUserMessage]
      )

      const token = streamTokenRef.current + 1
      streamTokenRef.current = token
      setStreamingContent('')
      setIsStreaming(true)

      streamMessage(
        {
          sessionKey,
          sessionUser,
          message,
          workspaceContext: {
            name: `Task ${task.id}`,
            systemPromptAddition: taskSystemPrompt
          },
          onChunk: (chunk) => {
            if (streamTokenRef.current !== token) return

            if (chunk.content) {
              const cleanContent = stripThinkingMarkers(chunk.content)
              if (cleanContent.length > 0) {
                setStreamingContent((prev) => prev + cleanContent)
              }
            }

            if (chunk.done) {
              completeStream(token)
            }
          }
        },
        {
          onError: (streamError) => {
            if (streamTokenRef.current !== token) return
            setError(streamError instanceof Error ? streamError.message : 'Failed to send message')
            completeStream(token)
          }
        }
      )

      return true
    },
    [completeStream, enabled, isStreaming, queryClient, sessionKey, sessionUser, streamMessage, task.id, taskSystemPrompt]
  )

  return {
    sessionKey,
    messages,
    isLoading,
    isStreaming,
    error,
    sendMessage,
    clearError: () => setError(null)
  }
}
