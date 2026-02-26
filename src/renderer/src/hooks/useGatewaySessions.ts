import { useEffect, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { IpcResult } from '../../../shared/types'

const api = () => window.api
const CHANNEL_TYPES = new Set(['slack', 'discord', 'whatsapp'])
const TOPIC_ROUTES_FILE_PATH = 'topic-sessions.json'
const TOPIC_ROUTES_QUERY_KEY = ['gateway', 'topics', TOPIC_ROUTES_FILE_PATH] as const

export type GatewaySessionGroup = 'direct' | 'channels' | 'topics' | 'subagents'
export type GatewayMessageRole = 'user' | 'assistant' | 'system'

export interface ParsedSessionKey {
  label: string
  group: GatewaySessionGroup
  agentId: string
}

export interface GatewaySessionSummary {
  key: string
  kind?: string
  channel?: string
  displayName?: string
  model?: string
  totalTokens: number
  updatedAt?: string
  updatedAtMs: number
  lastMessagePreview: string
  label: string
  group: GatewaySessionGroup
  agentId: string
  isActive: boolean
}

export interface GatewaySessionMessage {
  id: string
  role: GatewayMessageRole
  content: string
  timestamp?: string
}

interface TopicRouteMeta {
  id: string
  label: string
  sessionKey: string
  mainSessionKey: string
  lastActive?: string
  messageCount?: number
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

function toTitleCase(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ')
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return undefined
  }
}

function extractTextContent(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (Array.isArray(value)) {
    return value
      .map((entry) => extractTextContent(entry))
      .filter(Boolean)
      .join('\n')
      .trim()
  }

  const record = asRecord(value)
  if (!record) return ''

  const direct = readString(record.text) ?? readString(record.content) ?? readString(record.value)
  if (direct) return direct

  if (Array.isArray(record.parts)) {
    const partsText = record.parts
      .map((entry) => extractTextContent(entry))
      .filter(Boolean)
      .join('\n')
      .trim()
    if (partsText) return partsText
  }

  if (Array.isArray(record.content)) {
    return record.content
      .map((entry) => extractTextContent(entry))
      .filter(Boolean)
      .join('\n')
      .trim()
  }

  return ''
}

function extractContentPayload(payload: unknown): unknown {
  const root = asRecord(payload)
  if (!root) return undefined

  const resultRecord = asRecord(root.result)
  const content = Array.isArray(resultRecord?.content)
    ? resultRecord.content
    : Array.isArray(root.content)
      ? root.content
      : []

  const firstText = content.find((entry) => {
    const row = asRecord(entry)
    return row?.type === 'text' && typeof row.text === 'string'
  }) as { text?: string } | undefined

  if (typeof firstText?.text !== 'string' || firstText.text.trim().length === 0) {
    return undefined
  }

  return parseJson(firstText.text) ?? firstText.text
}

function normalizeToolPayload(payload: unknown): unknown {
  const fromContent = extractContentPayload(payload)
  if (fromContent !== undefined) return fromContent

  if (typeof payload === 'string') {
    return parseJson(payload) ?? payload
  }

  const root = asRecord(payload)
  if (!root) return payload

  if (root.sessions !== undefined || root.messages !== undefined) return root
  if (root.data !== undefined) return normalizeToolPayload(root.data)
  if (root.result !== undefined) return normalizeToolPayload(root.result)

  return root
}

function toTimestamp(value: unknown): number {
  const numeric = readNumber(value)
  if (numeric !== undefined) {
    return numeric > 1e12 ? numeric : numeric * 1000
  }

  const text = readString(value)
  if (!text) return 0
  const parsed = Date.parse(text)
  return Number.isFinite(parsed) ? parsed : 0
}

function normalizeRole(value: unknown): GatewayMessageRole {
  const role = (readString(value) ?? '').toLowerCase()
  if (role === 'assistant' || role === 'user' || role === 'system') return role
  return 'system'
}

function resolveDisplayLabel(candidate: string | undefined, fallback: string): string {
  if (!candidate) return fallback
  return candidate.trim().length > 0 ? candidate.trim() : fallback
}

function resolveSessionPreview(raw: Record<string, unknown>): string {
  const directPreview =
    readString(raw.lastMessagePreview) ??
    readString(raw.preview) ??
    readString(raw.lastMessage) ??
    readString(raw.message)
  if (directPreview) return directPreview

  const messageRecord = asRecord(raw.lastMessage) ?? asRecord(raw.message)
  if (messageRecord) {
    const messageText = extractTextContent(messageRecord.content ?? messageRecord.text ?? messageRecord)
    if (messageText) return messageText
  }

  const messageList = Array.isArray(raw.messages) ? raw.messages : []
  for (const entry of messageList) {
    const messageText = extractTextContent(entry)
    if (messageText) return messageText
  }

  return 'No messages yet'
}

function resolveSessionGroup(
  raw: Record<string, unknown>,
  key: string,
  agentId: string,
  parsedFallback: GatewaySessionGroup
): GatewaySessionGroup {
  const keyLower = key.toLowerCase()
  const kindLower = (readString(raw.kind) ?? '').toLowerCase()
  const channelLower = (readString(raw.channel) ?? '').toLowerCase()

  if (kindLower.includes('direct')) return 'direct'
  if (keyLower.includes(':direct:') || parsedFallback === 'direct') return 'direct'
  if (keyLower.includes('subagent') || keyLower.includes('isolated') || agentId !== 'main') return 'subagents'
  if (CHANNEL_TYPES.has(channelLower)) return 'channels'
  return parsedFallback
}

function normalizeTopicRoutes(payload: unknown): TopicRouteMeta[] {
  const root = asRecord(payload)
  const entries = Array.isArray(root?.topics) ? root.topics : []

  return entries
    .map((entry): TopicRouteMeta | null => {
      const row = asRecord(entry)
      if (!row) return null

      const id = readString(row.id)
      const label = readString(row.label)
      const sessionKey = readString(row.sessionKey)
      const mainSessionKey = readString(row.mainSessionKey)
      if (!id || !label || !sessionKey || !mainSessionKey) return null

      return {
        id,
        label,
        sessionKey,
        mainSessionKey,
        lastActive: readString(row.lastActive),
        messageCount: readNumber(row.messageCount)
      }
    })
    .filter((entry): entry is TopicRouteMeta => !!entry)
}

async function readTopicRoutes(): Promise<TopicRouteMeta[]> {
  const result = await api().files.read(TOPIC_ROUTES_FILE_PATH)
  if (!result.ok || !result.data) return []

  try {
    const parsed = JSON.parse(result.data) as unknown
    return normalizeTopicRoutes(parsed)
  } catch {
    return []
  }
}

export function parseSessionKey(key: string): ParsedSessionKey {
  const normalized = key.trim()
  if (!normalized) {
    return { label: 'Session', group: 'channels', agentId: 'main' }
  }

  const parts = normalized.split(':').map((part) => part.trim()).filter(Boolean)
  const lowerParts = parts.map((part) => part.toLowerCase())
  const agentId = (parts[1] ?? 'main').toLowerCase()

  const directIndex = lowerParts.indexOf('direct')
  if (directIndex >= 0) {
    const directName = parts[directIndex + 1] ?? parts[parts.length - 1] ?? 'Session'
    return {
      label: `Direct ${toTitleCase(directName)}`,
      group: 'direct',
      agentId
    }
  }

  if (lowerParts.includes('isolated')) {
    return {
      label: 'Isolated Session',
      group: 'subagents',
      agentId
    }
  }

  if (lowerParts.includes('subagent')) {
    return {
      label: toTitleCase(agentId),
      group: 'subagents',
      agentId
    }
  }

  const channelType = ['slack', 'discord', 'whatsapp'].find((candidate) =>
    lowerParts.includes(candidate)
  )
  if (channelType) {
    return {
      label: `${toTitleCase(channelType)} Channel`,
      group: 'channels',
      agentId
    }
  }

  return {
    label: toTitleCase(agentId || parts[parts.length - 1] || 'Session'),
    group: agentId !== 'main' ? 'subagents' : 'channels',
    agentId
  }
}

function normalizeSessions(payload: unknown): GatewaySessionSummary[] {
  const parsed = normalizeToolPayload(payload)
  const root = asRecord(parsed)
  const entries = Array.isArray(root?.sessions)
    ? root.sessions
    : Array.isArray(parsed)
      ? parsed
      : []
  const now = Date.now()

  return entries
    .map((entry): GatewaySessionSummary | null => {
      const raw = asRecord(entry)
      if (!raw) return null

      const key = readString(raw.key)
      if (!key) return null

      const parsedKey = parseSessionKey(key)
      const updatedAtMs = toTimestamp(raw.updatedAt ?? raw.updated_at ?? raw.lastActivity)
      const updatedAt = updatedAtMs > 0 ? new Date(updatedAtMs).toISOString() : undefined

      const displayName = readString(raw.displayName) ?? readString(raw.name) ?? readString(raw.label)
      const label = resolveDisplayLabel(displayName, parsedKey.label)
      const group = resolveSessionGroup(raw, key, parsedKey.agentId, parsedKey.group)

      return {
        key,
        kind: readString(raw.kind),
        channel: readString(raw.channel),
        displayName,
        model: readString(raw.model),
        totalTokens: readNumber(raw.totalTokens) ?? 0,
        updatedAt,
        updatedAtMs,
        lastMessagePreview: resolveSessionPreview(raw),
        label,
        group,
        agentId: parsedKey.agentId,
        isActive: updatedAtMs > 0 && now - updatedAtMs < 2 * 60 * 1000
      }
    })
    .filter((session): session is GatewaySessionSummary => !!session)
    .sort((a, b) => b.updatedAtMs - a.updatedAtMs)
}

function normalizeHistoryMessages(payload: unknown): GatewaySessionMessage[] {
  const parsed = normalizeToolPayload(payload)
  const root = asRecord(parsed)
  const entries = Array.isArray(root?.messages)
    ? root.messages
    : Array.isArray(parsed)
      ? parsed
      : []

  return entries
    .map((entry, index): GatewaySessionMessage | null => {
      const raw = asRecord(entry)
      if (!raw) return null

      const content = extractTextContent(raw.content)
      const timestampMs = toTimestamp(raw.timestamp ?? raw.updatedAt ?? raw.createdAt)
      const timestamp = timestampMs > 0 ? new Date(timestampMs).toISOString() : undefined

      return {
        id: readString(raw.id) ?? `${index}-${timestamp ?? 'no-ts'}`,
        role: normalizeRole(raw.role),
        content: content || '(empty)',
        timestamp
      }
    })
    .filter((message): message is GatewaySessionMessage => !!message)
}

export function useGatewaySessions() {
  const queryClient = useQueryClient()

  const topicRoutesQuery = useQuery({
    queryKey: TOPIC_ROUTES_QUERY_KEY,
    queryFn: readTopicRoutes
  })

  useEffect(() => {
    const removeListener = window.api.workspace.onFileChanged(({ file }) => {
      if (file !== TOPIC_ROUTES_FILE_PATH) return
      queryClient.invalidateQueries({ queryKey: TOPIC_ROUTES_QUERY_KEY })
    })

    return () => {
      removeListener()
    }
  }, [queryClient])

  const topicRouteBySessionKey = useMemo(() => {
    const map = new Map<string, TopicRouteMeta>()
    for (const route of topicRoutesQuery.data ?? []) {
      map.set(route.sessionKey, route)
    }
    return map
  }, [topicRoutesQuery.data])

  const sessionsQuery = useQuery({
    queryKey: ['gateway', 'tools', 'sessions_list', 'pinchr'],
    queryFn: async (): Promise<GatewaySessionSummary[]> => {
      const result: IpcResult<unknown> = await api().gateway.toolsInvoke('sessions_list', {
        limit: 100,
        messageLimit: 1
      })
      if (!result.ok) return []
      return normalizeSessions(result.data)
    },
    refetchInterval: 10000
  })

  const sessionsWithTopics = useMemo(() => {
    const sessions = sessionsQuery.data ?? []
    return sessions.map((session) => {
      const topicRoute = topicRouteBySessionKey.get(session.key)
      if (!topicRoute) return session

      return {
        ...session,
        label: topicRoute.label,
        group: 'topics' as GatewaySessionGroup
      }
    })
  }, [sessionsQuery.data, topicRouteBySessionKey])

  return {
    ...sessionsQuery,
    data: sessionsWithTopics
  }
}

export function useSessionHistory(sessionKey: string | null) {
  return useQuery({
    queryKey: ['gateway', 'tools', 'sessions_history', sessionKey],
    queryFn: async (): Promise<GatewaySessionMessage[]> => {
      if (!sessionKey) return []
      const result: IpcResult<unknown> = await api().gateway.toolsInvoke('sessions_history', {
        sessionKey,
        limit: 30
      })
      if (!result.ok) return []
      return normalizeHistoryMessages(result.data)
    },
    enabled: !!sessionKey,
    refetchInterval: sessionKey ? 5000 : false
  })
}
