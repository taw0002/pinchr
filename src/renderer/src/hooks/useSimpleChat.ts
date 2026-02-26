import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { IpcResult, Message, MessageContentPart, StreamChunkPayload } from '../../../shared/types'
import { stripMessageMetadata } from '../../../shared/strip-metadata'

const HISTORY_PAGE_SIZE = 50

const INJECTION_PATTERNS: RegExp[] = [
  /^(?:\[System Message\]\s*)?A (?:subagent task|completed subagent|cron job) ".+" just (?:completed|timed out|failed|finished)/i,
  /^(?:\[System Message\]\s*)?\[sessionId:/i,
  /summarize this naturally for the user/i,
  /do not mention technical details like tokens/i,
  /convert the result above into your normal assistant voice/i,
  /you can respond with NO_REPLY if no announcement is needed/i,
  /^Stats:\s*runtime\s/m,
  /\bsessionKey\s+agent:\S+:subagent:/,
  /async command you ran earlier has completed/i,
  /a background (?:process|command|exec) .* (?:completed|finished)/i,
  /^Read HEARTBEAT\.md/i,
  /follow it strictly.*?(?:reply |respond with )HEARTBEAT_OK/is,
  /^A scheduled reminder has been triggered/i,
  /scheduled (?:cron |system )?event/i,
  /^pre-compaction memory flush/i,
  /^work_mode:/i,
  /^\[System Message\]/i
]

const NOISE_RESPONSE_PATTERNS: RegExp[] = [
  /^heartbeat_ok$/i,
  /^no_reply$/i,
  /^\s*heartbeat_ok\s*$/im,
  /^\s*no_reply\s*$/im
]

const COMPACTION_PATTERNS = [
  /conversation history before this point was compacted/i,
  /context window compaction/i,
  /pre-compaction memory flush/i,
  /\bcontext compacted\b/i,
  /^<summary>/i
]

type ChatRole = 'user' | 'assistant'
type MessageClass = 'user' | 'assistant' | 'compaction' | 'system-hidden'

export interface SimpleAttachment {
  id: string
  name: string
  size: number
  type: string
  dataUrl?: string
  path?: string
}

export interface SimpleToolCall {
  id: string
  toolName: string
  status: 'running' | 'completed'
  result?: string
  timestamp: string
}

export interface SimpleMessage {
  id: string
  role: ChatRole
  content: string
  timestamp: string
  toolCalls: SimpleToolCall[]
  attachmentNames?: string[]
  isStreaming?: boolean
  isThinking?: boolean
}

export type SimpleChatEntry =
  | {
      id: string
      type: 'message'
      message: SimpleMessage
    }
  | {
      id: string
      type: 'compaction'
      timestamp: string
    }

interface BridgeApi {
  getSessionHistory?: (sessionKey: string, limit?: number) => Promise<unknown>
  streamMessage?: (...args: unknown[]) => Promise<unknown>
  onStreamChunk?: (streamId: string, callback: (chunk: unknown) => void) => () => void
  onStreamError?: (streamId: string, callback: (error: unknown) => void) => () => void
  getGatewayHealth?: () => Promise<unknown>
}

interface UseSimpleChatOptions {
  sessionKey?: string | null
}

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function toIpcResult<T>(value: unknown): IpcResult<T> {
  if (value && typeof value === 'object' && 'ok' in value) {
    return value as IpcResult<T>
  }

  return {
    ok: true,
    data: value as T
  }
}

function toRole(role: unknown): ChatRole {
  const normalized = typeof role === 'string' ? role.trim().toLowerCase() : ''
  if (normalized === 'user' || normalized === 'human') return 'user'
  return 'assistant'
}

function parseTimestamp(timestamp?: string, fallback?: string): string {
  if (timestamp) {
    const parsed = Date.parse(timestamp)
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString()
  }

  return fallback ?? new Date().toISOString()
}

function extractMessageText(message: Message): string {
  const textFromParts = Array.isArray(message.parts)
    ? message.parts
        .filter((part): part is Extract<MessageContentPart, { type: 'text' }> => part.type === 'text')
        .map((part) => part.text)
        .join('\n')
    : ''

  const raw = (textFromParts || message.content || '').trim()
  return stripMessageMetadata(raw).trim()
}

function isCompactionMessage(content: string): boolean {
  return COMPACTION_PATTERNS.some((pattern) => pattern.test(content))
}

function isPureJsonSystemMetadata(message: Message, content: string): boolean {
  const isSystem = typeof message.role === 'string' && message.role.trim().toLowerCase() === 'system'
  if (!isSystem) return false

  const trimmed = content.trim()
  if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) return false

  try {
    JSON.parse(trimmed)
    return true
  } catch {
    return false
  }
}

function classifyMessage(message: Message, content: string): MessageClass {
  const normalizedRole = typeof message.role === 'string' ? message.role.trim().toLowerCase() : ''

  if (normalizedRole === 'system') {
    if (isCompactionMessage(content)) return 'compaction'
    return 'system-hidden'
  }

  if (toRole(message.role) === 'assistant') {
    if (NOISE_RESPONSE_PATTERNS.some((pattern) => pattern.test(content))) return 'system-hidden'
    return 'assistant'
  }

  if (INJECTION_PATTERNS.some((pattern) => pattern.test(content))) return 'system-hidden'
  if (isCompactionMessage(content)) return 'compaction'
  if (isPureJsonSystemMetadata(message, content)) return 'system-hidden'

  return 'user'
}

function normalizeChunk(payload: unknown): StreamChunkPayload {
  const chunk = (payload ?? {}) as Partial<StreamChunkPayload>
  return {
    content: typeof chunk.content === 'string' ? chunk.content : '',
    done: Boolean(chunk.done),
    error: typeof chunk.error === 'string' ? chunk.error : undefined,
    isThinking: Boolean(chunk.isThinking),
    reasoning: typeof chunk.reasoning === 'string' ? chunk.reasoning : undefined,
    reasoningContent: typeof chunk.reasoningContent === 'string' ? chunk.reasoningContent : undefined,
    toolName: typeof chunk.toolName === 'string' ? chunk.toolName : undefined,
    toolEvent:
      chunk.toolEvent === 'start' || chunk.toolEvent === 'result' ? chunk.toolEvent : undefined,
    toolResult: typeof chunk.toolResult === 'string' ? chunk.toolResult : undefined,
    route: chunk.route
  }
}

function sortEntriesChronologically(entries: SimpleChatEntry[]): SimpleChatEntry[] {
  return [...entries].sort((a, b) => {
    const aTs = Date.parse(a.type === 'message' ? a.message.timestamp : a.timestamp)
    const bTs = Date.parse(b.type === 'message' ? b.message.timestamp : b.timestamp)

    const left = Number.isFinite(aTs) ? aTs : 0
    const right = Number.isFinite(bTs) ? bTs : 0

    if (left !== right) return left - right
    return a.id.localeCompare(b.id)
  })
}

function getBridgeApi(): BridgeApi {
  const api = window.api as unknown as {
    gateway?: {
      getSessionHistory?: (sessionKey: string, limit?: number) => Promise<unknown>
      streamMessage?: (...args: unknown[]) => Promise<unknown>
      onStreamChunk?: (streamId: string, callback: (chunk: unknown) => void) => () => void
      onStreamError?: (streamId: string, callback: (error: unknown) => void) => () => void
      health?: () => Promise<unknown>
    }
    getSessionHistory?: (sessionKey: string, limit?: number) => Promise<unknown>
    streamMessage?: (...args: unknown[]) => Promise<unknown>
    getGatewayHealth?: () => Promise<unknown>
  }

  return {
    getSessionHistory: api.getSessionHistory ?? api.gateway?.getSessionHistory,
    streamMessage: api.streamMessage ?? api.gateway?.streamMessage,
    onStreamChunk: api.gateway?.onStreamChunk,
    onStreamError: api.gateway?.onStreamError,
    getGatewayHealth: api.getGatewayHealth ?? api.gateway?.health
  }
}

function buildHistoryEntries(messages: Message[]): SimpleChatEntry[] {
  const entries: SimpleChatEntry[] = []

  for (const message of messages) {
    const timestamp = parseTimestamp(message.timestamp)
    const content = extractMessageText(message)
    const classification = classifyMessage(message, content)

    if (classification === 'system-hidden') continue

    if (classification === 'compaction') {
      const previous = entries[entries.length - 1]
      if (previous?.type !== 'compaction') {
        entries.push({
          id: createId('compaction'),
          type: 'compaction',
          timestamp
        })
      }
      continue
    }

    const hasToolCall = Boolean(message.toolName || message.toolResult)
    if (!content && !hasToolCall) continue

    const toolCalls: SimpleToolCall[] = message.toolName
      ? [
          {
            id: createId('tool'),
            toolName: message.toolName,
            status: message.toolResult ? 'completed' : 'running',
            result: message.toolResult,
            timestamp
          }
        ]
      : []

    entries.push({
      id: createId('history'),
      type: 'message',
      message: {
        id: createId('msg'),
        role: classification as ChatRole,
        content,
        timestamp,
        toolCalls
      }
    })
  }

  return sortEntriesChronologically(entries)
}

export function useSimpleChat(options: UseSimpleChatOptions = {}) {
  const activeSessionKey = options.sessionKey?.trim() || null
  const [historyLimit, setHistoryLimit] = useState(HISTORY_PAGE_SIZE)
  const [entries, setEntries] = useState<SimpleChatEntry[]>([])
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const [isLoadingMoreHistory, setIsLoadingMoreHistory] = useState(false)
  const [hasMoreHistory, setHasMoreHistory] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)
  const [isGatewayOnline, setIsGatewayOnline] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const streamCleanupRef = useRef<(() => void) | null>(null)
  const assistantMessageIdRef = useRef<string | null>(null)
  const previousSessionKeyRef = useRef<string | null>(null)
  const activeSessionKeyRef = useRef<string | null>(activeSessionKey)

  useEffect(() => {
    activeSessionKeyRef.current = activeSessionKey
  }, [activeSessionKey])

  const teardownStream = useCallback(() => {
    if (streamCleanupRef.current) {
      streamCleanupRef.current()
      streamCleanupRef.current = null
    }
    assistantMessageIdRef.current = null
    setIsStreaming(false)
  }, [])

  const loadHistory = useCallback(
    async (targetSessionKey: string, limit: number) => {
      const isStaleSession = () => activeSessionKeyRef.current !== targetSessionKey
      const bridge = getBridgeApi()
      if (!bridge.getSessionHistory) {
        if (isStaleSession()) return
        setError('Session history API is unavailable')
        setEntries([])
        setIsLoadingHistory(false)
        setIsLoadingMoreHistory(false)
        return
      }

      try {
        const response = toIpcResult<Message[]>(await bridge.getSessionHistory(targetSessionKey, limit))
        if (isStaleSession()) return

        if (!response.ok) {
          setError(response.error || 'Failed to load history')
          setEntries([])
          setHasMoreHistory(false)
          return
        }

        const rawMessages = Array.isArray(response.data) ? response.data : []
        const mapped = buildHistoryEntries(rawMessages)
        setEntries(mapped)
        setHasMoreHistory(rawMessages.length >= limit)
        setError(null)
      } catch (loadError) {
        if (isStaleSession()) return
        setError(loadError instanceof Error ? loadError.message : 'Failed to load history')
        setEntries([])
        setHasMoreHistory(false)
      } finally {
        if (isStaleSession()) return
        setIsLoadingHistory(false)
        setIsLoadingMoreHistory(false)
      }
    },
    []
  )

  const refreshGatewayHealth = useCallback(async () => {
    const bridge = getBridgeApi()
    if (!bridge.getGatewayHealth) {
      setIsGatewayOnline(true)
      return
    }

    try {
      const response = toIpcResult<unknown>(await bridge.getGatewayHealth())
      setIsGatewayOnline(Boolean(response.ok && response.data))
    } catch {
      setIsGatewayOnline(false)
    }
  }, [])

  useEffect(() => {
    if (previousSessionKeyRef.current !== activeSessionKey) {
      previousSessionKeyRef.current = activeSessionKey
      teardownStream()
      setEntries([])
      setError(null)
      setHasMoreHistory(false)
      setIsLoadingMoreHistory(false)
      setHistoryLimit(HISTORY_PAGE_SIZE)

      if (!activeSessionKey) {
        setIsLoadingHistory(false)
        return
      }

      setIsLoadingHistory(true)
      void loadHistory(activeSessionKey, HISTORY_PAGE_SIZE)
      return
    }

    if (!activeSessionKey) {
      setIsLoadingHistory(false)
      return
    }

    if (historyLimit <= HISTORY_PAGE_SIZE) return
    void loadHistory(activeSessionKey, historyLimit)
  }, [activeSessionKey, historyLimit, loadHistory, teardownStream])

  useEffect(() => {
    void refreshGatewayHealth()
    const timer = window.setInterval(() => {
      void refreshGatewayHealth()
    }, 10000)

    return () => window.clearInterval(timer)
  }, [refreshGatewayHealth])

  useEffect(() => {
    return () => teardownStream()
  }, [teardownStream])

  const loadMoreHistory = useCallback(() => {
    if (!activeSessionKey || isLoadingHistory || isLoadingMoreHistory || !hasMoreHistory) return
    setIsLoadingMoreHistory(true)
    setHistoryLimit((prev) => prev + HISTORY_PAGE_SIZE)
  }, [activeSessionKey, hasMoreHistory, isLoadingHistory, isLoadingMoreHistory])

  const updateAssistantMessage = useCallback((updater: (message: SimpleMessage) => SimpleMessage) => {
    const targetId = assistantMessageIdRef.current
    if (!targetId) return

    setEntries((prev) =>
      prev.map((entry) => {
        if (entry.type !== 'message') return entry
        if (entry.message.id !== targetId) return entry
        return {
          ...entry,
          message: updater(entry.message)
        }
      })
    )
  }, [])

  const sendMessage = useCallback(
    async (rawInput: string, attachments: SimpleAttachment[] = []): Promise<boolean> => {
      if (isStreaming) return false

      const input = rawInput.trim()
      if (!input && attachments.length === 0) return false

      const bridge = getBridgeApi()
      if (!bridge.streamMessage) {
        setError('Streaming API is unavailable')
        return false
      }

      setError(null)

      const resolvedSession = activeSessionKeyRef.current
      if (!resolvedSession) {
        setError('Select a conversation before sending a message')
        return false
      }

      const timestamp = new Date().toISOString()
      const attachmentNames = attachments.map((file) => file.name)
      const attachmentSummary =
        attachmentNames.length > 0
          ? `Attached files:\n${attachmentNames.map((name) => `- ${name}`).join('\n')}`
          : ''

      const userDisplayContent = input || (attachmentNames.length > 0 ? `Attached ${attachmentNames.length} file(s)` : '')
      const userMessage: SimpleMessage = {
        id: createId('user'),
        role: 'user',
        content: userDisplayContent,
        timestamp,
        toolCalls: [],
        attachmentNames
      }

      const assistantMessage: SimpleMessage = {
        id: createId('assistant'),
        role: 'assistant',
        content: '',
        timestamp,
        toolCalls: [],
        isStreaming: true,
        isThinking: true
      }

      assistantMessageIdRef.current = assistantMessage.id

      setEntries((prev) => [
        ...prev,
        { id: createId('entry-user'), type: 'message', message: userMessage },
        { id: createId('entry-assistant'), type: 'message', message: assistantMessage }
      ])

      const imageParts = attachments
        .filter((file) => file.type.startsWith('image/') && typeof file.dataUrl === 'string')
        .map((file) => ({
          type: 'image_url' as const,
          image_url: { url: file.dataUrl as string }
        }))

      const textForAgent = [input, attachmentSummary].filter(Boolean).join('\n\n').trim()
      const payload: string | MessageContentPart[] =
        imageParts.length > 0
          ? [
              ...(textForAgent ? [{ type: 'text' as const, text: textForAgent }] : []),
              ...imageParts
            ]
          : textForAgent

      if (!payload || (Array.isArray(payload) && payload.length === 0)) {
        updateAssistantMessage((message) => ({
          ...message,
          isStreaming: false,
          isThinking: false,
          content: 'No message content to send.'
        }))
        setIsStreaming(false)
        return false
      }

      setIsStreaming(true)

      const finishStreaming = (streamError?: string) => {
        updateAssistantMessage((message) => {
          const nextContent = streamError
            ? [message.content.trim(), `Error: ${streamError}`].filter(Boolean).join('\n\n')
            : message.content

          return {
            ...message,
            content: nextContent,
            isStreaming: false,
            isThinking: false
          }
        })

        teardownStream()
      }

      const onChunk = (rawChunk: unknown) => {
        const chunk = normalizeChunk(rawChunk)

        if (chunk.toolEvent && chunk.toolName) {
          updateAssistantMessage((message) => {
            const nextToolCalls = [...message.toolCalls]
            if (chunk.toolEvent === 'start') {
              nextToolCalls.push({
                id: createId('tool'),
                toolName: chunk.toolName || 'tool',
                status: 'running',
                timestamp: new Date().toISOString()
              })
            }

            if (chunk.toolEvent === 'result') {
              const runningIndex = [...nextToolCalls]
                .reverse()
                .findIndex((call) => call.toolName === chunk.toolName && call.status === 'running')

              if (runningIndex >= 0) {
                const targetIndex = nextToolCalls.length - 1 - runningIndex
                nextToolCalls[targetIndex] = {
                  ...nextToolCalls[targetIndex],
                  status: 'completed',
                  result: chunk.toolResult
                }
              } else {
                nextToolCalls.push({
                  id: createId('tool'),
                  toolName: chunk.toolName,
                  status: 'completed',
                  result: chunk.toolResult,
                  timestamp: new Date().toISOString()
                })
              }
            }

            return {
              ...message,
              toolCalls: nextToolCalls
            }
          })
        }

        const reasoning = (chunk.reasoning || chunk.reasoningContent || '').trim()
        if (reasoning) {
          updateAssistantMessage((message) => ({
            ...message,
            isThinking: true
          }))
        }

        if (chunk.content) {
          updateAssistantMessage((message) => ({
            ...message,
            content: message.content + chunk.content,
            isThinking: chunk.isThinking ? true : false
          }))
        }

        if (chunk.done) {
          if (chunk.error) {
            setError(chunk.error)
            finishStreaming(chunk.error)
            return
          }

          finishStreaming()
        }
      }

      try {
        if (bridge.onStreamChunk && bridge.onStreamError) {
          const streamResult = toIpcResult<string>(
            await bridge.streamMessage(
              resolvedSession,
              payload,
              undefined,
              'pinchr',
              resolvedSession
            )
          )

          if (!streamResult.ok || typeof streamResult.data !== 'string') {
            throw new Error(streamResult.error || 'Failed to start stream')
          }

          const streamId = streamResult.data
          const offChunk = bridge.onStreamChunk(streamId, onChunk)
          const offError = bridge.onStreamError(streamId, (streamError) => {
            const asError =
              typeof streamError === 'object' && streamError && 'error' in streamError
                ? String((streamError as { error?: unknown }).error || 'Stream error')
                : 'Stream error'

            setError(asError)
            finishStreaming(asError)
          })

          streamCleanupRef.current = () => {
            offChunk()
            offError()
          }
        } else {
          await bridge.streamMessage(
            resolvedSession,
            payload,
            onChunk,
            undefined,
            'pinchr',
            { mainSessionKey: resolvedSession }
          )
        }

        return true
      } catch (streamError) {
        const message = streamError instanceof Error ? streamError.message : 'Failed to stream message'
        setError(message)
        finishStreaming(message)
        return false
      }
    },
    [isStreaming, teardownStream, updateAssistantMessage]
  )

  const messageCount = useMemo(
    () => entries.filter((entry): entry is Extract<SimpleChatEntry, { type: 'message' }> => entry.type === 'message').length,
    [entries]
  )

  return {
    entries,
    messageCount,
    sessionKey: activeSessionKey,
    isLoadingHistory,
    isLoadingMoreHistory,
    hasMoreHistory,
    isStreaming,
    isGatewayOnline,
    error,
    sendMessage,
    loadMoreHistory,
    reloadHistory: async () => {
      if (!activeSessionKey) return
      setIsLoadingHistory(true)
      await loadHistory(activeSessionKey, historyLimit)
    }
  }
}
