import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { IpcResult, Message } from '../../../shared/types'

const api = () => window.api

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ActivityCategory = 'tool' | 'file' | 'command' | 'message' | 'other'

export interface ActivityItem {
  id: string
  timestamp: string
  category: ActivityCategory
  toolName: string | null
  summary: string
  detail: string
  sessionKey: string
}

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

const FILE_TOOLS = new Set(['read', 'write', 'edit'])
const COMMAND_TOOLS = new Set(['exec', 'process'])
const MESSAGE_TOOLS = new Set(['message', 'tts'])

function classifyTool(toolName: string): ActivityCategory {
  const lower = toolName.toLowerCase()
  if (FILE_TOOLS.has(lower)) return 'file'
  if (COMMAND_TOOLS.has(lower)) return 'command'
  if (MESSAGE_TOOLS.has(lower)) return 'message'
  return 'tool'
}

function summariseToolCall(toolName: string, argsText: string): string {
  const lower = toolName.toLowerCase()

  if (lower === 'read' || lower === 'write' || lower === 'edit') {
    const pathMatch =
      argsText.match(/(?:file_path|path|file)\s*[:=]\s*["']?([^\s"',}]+)/i) ??
      argsText.match(/["']([^"'\s]+\.[a-zA-Z]{1,6})["']/i)
    if (pathMatch?.[1]) {
      const shortPath = pathMatch[1].split('/').slice(-2).join('/')
      const verb = lower === 'read' ? 'Read' : lower === 'write' ? 'Wrote' : 'Edited'
      return `${verb} ${shortPath}`
    }
    return lower === 'read' ? 'Read file' : lower === 'write' ? 'Wrote file' : 'Edited file'
  }

  if (lower === 'exec') {
    const cmdMatch =
      argsText.match(/(?:command)\s*[:=]\s*["']?(.+?)["']?\s*(?:[,}\n]|$)/i) ??
      argsText.match(/["']([^"']{3,80})["']/i)
    if (cmdMatch?.[1]) {
      return `Ran \`${cmdMatch[1].trim().slice(0, 60)}\``
    }
    return 'Ran command'
  }

  if (lower === 'message') {
    const targetMatch = argsText.match(/(?:target|channel)\s*[:=]\s*["']?([^\s"',}]+)/i)
    if (targetMatch?.[1]) return `Sent message to ${targetMatch[1]}`
    return 'Sent message'
  }

  if (lower === 'web_search') {
    const queryMatch = argsText.match(/(?:query)\s*[:=]\s*["']?(.+?)["']?\s*(?:[,}\n]|$)/i)
    if (queryMatch?.[1]) return `Searched: "${queryMatch[1].slice(0, 50)}"`
    return 'Web search'
  }

  if (lower === 'web_fetch') {
    const urlMatch = argsText.match(/(?:url)\s*[:=]\s*["']?(https?:\/\/[^\s"',}]+)/i)
    if (urlMatch?.[1]) {
      try {
        return `Fetched ${new URL(urlMatch[1]).hostname}`
      } catch { /* ignore */ }
    }
    return 'Fetched URL'
  }

  if (lower === 'browser') {
    const actionMatch = argsText.match(/(?:action)\s*[:=]\s*["']?([^\s"',}]+)/i)
    return actionMatch?.[1] ? `Browser ${actionMatch[1]}` : 'Browser action'
  }

  if (lower === 'image') return 'Analyzed image'
  if (lower === 'tts') return 'Text to speech'

  if (lower === 'nodes') {
    const actionMatch = argsText.match(/(?:action)\s*[:=]\s*["']?([^\s"',}]+)/i)
    return actionMatch?.[1] ? `Node ${actionMatch[1]}` : 'Node action'
  }

  return toolName
}

interface RawToolCall {
  name: string
  argsText: string
  fullText: string
}

/**
 * Extract tool calls from message content.
 *
 * OpenClaw messages embed tool invocations with XML-like tags:
 *   invoke name="toolName" with parameter blocks inside.
 * We also handle patterns like "Tool: toolName(...)" and markdown-style blocks.
 */
function extractToolCalls(content: string): RawToolCall[] {
  const calls: RawToolCall[] = []
  const seen = new Set<string>()

  // Pattern 1: XML-style invoke blocks  <invoke name="toolName">...</invoke>
  const invokePattern = /invoke\s+name="([^"]+)"[^>]*>([\s\S]*?)(?:<\/\s*invoke\s*>|$)/gi
  let match: RegExpExecArray | null
  match = invokePattern.exec(content)
  while (match !== null) {
    const name = match[1]
    const argsText = match[2] ?? ''
    const key = `${name}:${argsText.slice(0, 40)}`
    if (!seen.has(key)) {
      seen.add(key)
      calls.push({ name, argsText, fullText: match[0] })
    }
    match = invokePattern.exec(content)
  }

  // Pattern 2: function_calls blocks with invoke
  // Already covered by pattern 1

  // Pattern 3: Markdown-style tool references like **Tool:** `read` or 🔧 read(...)
  const mdToolPattern = /(?:\*\*Tool:\*\*\s*`?|🔧\s*)(\w+)\s*(?:\(([^)]*)\)|`)/g
  match = mdToolPattern.exec(content)
  while (match !== null) {
    const name = match[1]
    const argsText = match[2] ?? ''
    const key = `${name}:${argsText.slice(0, 40)}`
    if (!seen.has(key)) {
      seen.add(key)
      calls.push({ name, argsText, fullText: match[0] })
    }
    match = mdToolPattern.exec(content)
  }

  // Pattern 4: toolName field on message (via Message.toolName)
  // Handled at the caller level

  return calls
}

function parseMessageActivities(
  msg: Message,
  sessionKey: string,
  index: number
): ActivityItem[] {
  const items: ActivityItem[] = []
  const ts = msg.timestamp ?? new Date().toISOString()

  // If message has explicit toolName (streaming tool events)
  if (msg.toolName) {
    const toolName = msg.toolName
    const argsText = msg.toolResult ?? msg.content
    items.push({
      id: `${sessionKey}-${index}-tool-${toolName}`,
      timestamp: ts,
      category: classifyTool(toolName),
      toolName,
      summary: summariseToolCall(toolName, argsText),
      detail: argsText.slice(0, 2000),
      sessionKey
    })
    return items
  }

  // Only parse assistant messages for embedded tool calls
  if (msg.role !== 'assistant') return items

  const toolCalls = extractToolCalls(msg.content)

  for (let i = 0; i < toolCalls.length; i++) {
    const call = toolCalls[i]
    items.push({
      id: `${sessionKey}-${index}-${i}-${call.name}`,
      timestamp: ts,
      category: classifyTool(call.name),
      toolName: call.name,
      summary: summariseToolCall(call.name, call.argsText),
      detail: call.fullText.slice(0, 2000),
      sessionKey
    })
  }

  return items
}

// ---------------------------------------------------------------------------
// Hook: fetch recent sessions + their histories, extract activities
// ---------------------------------------------------------------------------

interface SessionListEntry {
  key: string
  label: string
  status: string
  updatedAt?: string
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function readString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function readNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value.trim())
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

function toEpochMs(value: unknown): number {
  const numeric = readNumber(value)
  if (numeric !== undefined) return numeric > 1e12 ? numeric : numeric * 1000

  const text = readString(value)
  if (!text) return 0
  const parsed = Date.parse(text)
  return Number.isFinite(parsed) ? parsed : 0
}

function toIsoTimestamp(value: unknown): string | undefined {
  const epochMs = toEpochMs(value)
  if (epochMs <= 0) return undefined
  return new Date(epochMs).toISOString()
}

function toTitleCase(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ')
}

function resolveSessionLabel(key: string, raw: Record<string, unknown>): string {
  const explicitLabel =
    readString(raw.displayName) ??
    readString(raw.name) ??
    readString(raw.label) ??
    readString(raw.channelLabel)

  if (explicitLabel) return explicitLabel

  const parts = key.split(':').map((part) => part.trim()).filter(Boolean)
  if (parts.length === 0) return 'Session'

  const lowerParts = parts.map((part) => part.toLowerCase())
  const directIndex = lowerParts.indexOf('direct')
  if (directIndex >= 0) {
    const directName = parts[directIndex + 1] ?? parts[parts.length - 1] ?? 'Session'
    return `Direct ${toTitleCase(directName)}`
  }

  const channelIndex = lowerParts.findIndex((part) =>
    ['slack', 'discord', 'whatsapp', 'telegram', 'signal', 'imessage', 'webchat'].includes(part)
  )
  if (channelIndex >= 0) {
    const channel = toTitleCase(parts[channelIndex] ?? 'Channel')
    const target = parts[channelIndex + 1] ? ` ${toTitleCase(parts[channelIndex + 1])}` : ''
    return `${channel}${target}`
  }

  return toTitleCase(parts[parts.length - 1] ?? key)
}

function normalizeSessionList(payload: unknown): SessionListEntry[] {
  const root = asRecord(payload)
  const rawSessions = Array.isArray(root?.sessions) ? root.sessions : Array.isArray(payload) ? payload : []

  return rawSessions
    .map((entry): SessionListEntry | null => {
      const raw = asRecord(entry)
      if (!raw) return null
      const key = readString(raw.key) ?? readString(raw.sessionKey)
      if (!key) return null
      const updatedAt =
        toIsoTimestamp(raw.updatedAt) ??
        toIsoTimestamp(raw.updated_at) ??
        toIsoTimestamp(raw.lastActivity) ??
        toIsoTimestamp(raw.last_activity) ??
        toIsoTimestamp(raw.createdAt) ??
        toIsoTimestamp(raw.created_at)

      return {
        key,
        label: resolveSessionLabel(key, raw),
        status: readString(raw.status) ?? 'active',
        updatedAt
      }
    })
    .filter((s): s is SessionListEntry => !!s)
    .sort((left, right) => toEpochMs(right.updatedAt) - toEpochMs(left.updatedAt))
}

function normalizeMessages(payload: unknown): Message[] {
  const root = asRecord(payload)
  const rawMessages = Array.isArray(root?.messages)
    ? root.messages
    : Array.isArray(payload)
      ? payload
      : []

  return rawMessages
    .map((entry): Message | null => {
      const raw = asRecord(entry)
      if (!raw) return null

      const role = readString(raw.role)
      if (role !== 'user' && role !== 'assistant' && role !== 'system') return null

      const content = typeof raw.content === 'string' ? raw.content : ''
      return {
        role,
        content,
        timestamp: readString(raw.timestamp),
        toolName: readString(raw.toolName),
        toolStatus: readString(raw.toolStatus),
        toolResult: typeof raw.toolResult === 'string' ? raw.toolResult : undefined
      }
    })
    .filter((m): m is Message => !!m)
}

export interface UseActivityLogOptions {
  /** Max number of activity items to return */
  limit?: number
  /** Max sessions to scan */
  sessionLimit?: number
  /** Refresh interval in ms */
  refetchInterval?: number
  /** Filter by category */
  category?: ActivityCategory | 'all'
}

export function useActivityLog(options: UseActivityLogOptions = {}) {
  const {
    limit = 50,
    sessionLimit = 8,
    refetchInterval = 10000,
    category = 'all'
  } = options

  const sessionsQuery = useQuery({
    queryKey: ['activity-log', 'sessions', sessionLimit],
    queryFn: async (): Promise<SessionListEntry[]> => {
      const result: IpcResult<unknown> = await api().gateway.getSessions()
      if (!result.ok) return []
      return normalizeSessionList(result.data).slice(0, sessionLimit)
    },
    refetchInterval
  })

  const sessionKeys = useMemo(
    () => (sessionsQuery.data ?? []).map((s) => s.key),
    [sessionsQuery.data]
  )

  const historiesQuery = useQuery({
    queryKey: ['activity-log', 'histories', sessionKeys],
    queryFn: async (): Promise<Record<string, Message[]>> => {
      if (sessionKeys.length === 0) return {}
      const result: Record<string, Message[]> = {}
      await Promise.all(
        sessionKeys.map(async (key) => {
          const res: IpcResult<unknown> = await api().gateway.getSessionHistory(key, 30)
          result[key] = res.ok ? normalizeMessages(res.data) : []
        })
      )
      return result
    },
    enabled: sessionKeys.length > 0,
    refetchInterval
  })

  const activities = useMemo((): ActivityItem[] => {
    const histories = historiesQuery.data
    if (!histories) return []

    const all: ActivityItem[] = []
    const sessions = sessionsQuery.data ?? []

    for (const session of sessions) {
      const timestamp = session.updatedAt ?? new Date().toISOString()
      all.push({
        id: `${session.key}-session-update`,
        timestamp,
        category: 'other',
        toolName: session.status,
        summary: session.label,
        detail: `Session key: ${session.key}\nStatus: ${session.status}\nLast activity: ${timestamp}`,
        sessionKey: session.key
      })
    }

    for (const sessionKey of Object.keys(histories)) {
      const messages = histories[sessionKey]
      for (let i = 0; i < messages.length; i++) {
        const parsed = parseMessageActivities(messages[i], sessionKey, i)
        all.push(...parsed)
      }
    }

    // Sort by timestamp descending
    all.sort((a, b) => {
      const ta = new Date(a.timestamp).getTime()
      const tb = new Date(b.timestamp).getTime()
      return tb - ta
    })

    // Filter by category
    const filtered = category === 'all' ? all : all.filter((item) => item.category === category)

    return filtered.slice(0, limit)
  }, [historiesQuery.data, sessionsQuery.data, category, limit])

  return {
    activities,
    isLoading: sessionsQuery.isLoading || historiesQuery.isLoading,
    isError: sessionsQuery.isError || historiesQuery.isError,
    error: sessionsQuery.error ?? historiesQuery.error
  }
}
