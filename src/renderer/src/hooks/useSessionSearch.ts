import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { IpcResult } from '../../../shared/types'
import type { GatewaySessionSummary, GatewayMessageRole } from './useGatewaySessions'

const api = () => window.api

export interface SessionSearchResult {
  session: GatewaySessionSummary
  matchType: 'label' | 'content'
  snippet?: string
  matchedMessageId?: string
  matchedMessageTimestamp?: string
}

interface HistoryMessage {
  id?: string
  role?: string
  content?: unknown
  timestamp?: string
  updatedAt?: string
  createdAt?: string
}

interface HistoryResponse {
  messages?: HistoryMessage[]
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function buildSearchFields(session: GatewaySessionSummary): string[] {
  const raw = session as GatewaySessionSummary & Record<string, unknown>
  return [
    session.label,
    session.key,
    session.displayName ?? '',
    session.lastMessagePreview,
    session.model ?? '',
    session.channel ?? '',
    session.kind ?? '',
    session.group ?? '',
    session.agentId ?? '',
    session.updatedAt ?? '',
    Number.isFinite(session.totalTokens) ? String(session.totalTokens) : '',
    readString(raw.status),
    readString(raw.type),
    readString(raw.sessionId),
    readString(raw.channelLabel)
  ]
}

function matchesSessionQuery(session: GatewaySessionSummary, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return false
  return buildSearchFields(session).some((field) => field.toLowerCase().includes(q))
}

function extractText(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    return value
      .map((entry) => extractText(entry))
      .filter(Boolean)
      .join(' ')
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    const text =
      typeof record.text === 'string'
        ? record.text
        : typeof record.content === 'string'
          ? record.content
          : typeof record.value === 'string'
            ? record.value
            : ''
    if (text) return text
    if (Array.isArray(record.parts)) return extractText(record.parts)
    if (Array.isArray(record.content)) return extractText(record.content)
  }
  return ''
}

function buildSnippet(content: string, query: string, maxLength = 120): string {
  const lower = content.toLowerCase()
  const queryLower = query.toLowerCase()
  const index = lower.indexOf(queryLower)

  if (index < 0) return content.slice(0, maxLength)

  const start = Math.max(0, index - 40)
  const end = Math.min(content.length, index + query.length + 80)
  let snippet = content.slice(start, end).replace(/\s+/g, ' ').trim()

  if (start > 0) snippet = `…${snippet}`
  if (end < content.length) snippet = `${snippet}…`

  return snippet
}

export function useSessionSearch(
  sessions: GatewaySessionSummary[],
  query: string
): {
  results: SessionSearchResult[]
  isSearching: boolean
  isActive: boolean
} {
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [contentResults, setContentResults] = useState<SessionSearchResult[]>([])
  const [isSearchingContent, setIsSearchingContent] = useState(false)
  const abortRef = useRef(0)

  // Debounce the query
  useEffect(() => {
    if (!query.trim()) {
      setDebouncedQuery('')
      setContentResults([])
      setIsSearchingContent(false)
      return
    }

    const timer = setTimeout(() => {
      setDebouncedQuery(query.trim())
    }, 300)

    return () => clearTimeout(timer)
  }, [query])

  // Local label matches (instant)
  const labelResults = useMemo((): SessionSearchResult[] => {
    if (!query.trim()) return []

    return sessions
      .filter((session) => matchesSessionQuery(session, query))
      .map((session) => ({
        session,
        matchType: 'label' as const
      }))
  }, [sessions, query])

  // Content search via gateway API (debounced)
  useEffect(() => {
    const q = debouncedQuery.toLowerCase()
    if (!q || q.length <= 2) {
      setContentResults([])
      setIsSearchingContent(false)
      return
    }

    const searchToken = ++abortRef.current
    setIsSearchingContent(true)

    const searchSessions = async () => {
      const labelMatchKeys = new Set(
        sessions.filter((session) => matchesSessionQuery(session, debouncedQuery)).map((s) => s.key)
      )

      const candidateSessions = sessions.filter((s) => !labelMatchKeys.has(s.key))
      const results: SessionSearchResult[] = []

      // Search message history for each session
      const searchBatch = async (batch: GatewaySessionSummary[]) => {
        const promises = batch.map(async (session) => {
          if (abortRef.current !== searchToken) return null

          try {
            const result: IpcResult<unknown> = await api().gateway.toolsInvoke(
              'sessions_history',
              { sessionKey: session.key, limit: 50 }
            )

            if (!result.ok || abortRef.current !== searchToken) return null

            const data = result.data as HistoryResponse | undefined
            const messages = Array.isArray(data?.messages) ? data.messages : []

            for (const msg of messages) {
              const content = extractText(msg.content)
              if (!content) continue

              if (content.toLowerCase().includes(q)) {
                return {
                  session,
                  matchType: 'content' as const,
                  snippet: buildSnippet(content, debouncedQuery),
                  matchedMessageId: typeof msg.id === 'string' ? msg.id : undefined,
                  matchedMessageTimestamp:
                    typeof msg.timestamp === 'string'
                      ? msg.timestamp
                      : typeof msg.updatedAt === 'string'
                        ? msg.updatedAt
                        : typeof msg.createdAt === 'string'
                          ? msg.createdAt
                          : undefined
                } satisfies SessionSearchResult
              }
            }
          } catch {
            // Skip sessions that fail to fetch
          }
          return null
        })

        const settled = await Promise.all(promises)
        return settled.filter((r): r is NonNullable<typeof r> => r !== null)
      }

      // Process in batches of 5 to avoid overwhelming the gateway
      const batchSize = 5
      for (let i = 0; i < candidateSessions.length; i += batchSize) {
        if (abortRef.current !== searchToken) return
        const batch = candidateSessions.slice(i, i + batchSize)
        const batchResults = await searchBatch(batch)
        results.push(...batchResults)
      }

      if (abortRef.current === searchToken) {
        setContentResults(results)
        setIsSearchingContent(false)
      }
    }

    searchSessions()

    return () => {
      abortRef.current++
    }
  }, [debouncedQuery, sessions])

  // Merge label + content results, deduplicate
  const results = useMemo((): SessionSearchResult[] => {
    if (!query.trim()) return []

    const seen = new Set<string>()
    const merged: SessionSearchResult[] = []

    for (const result of labelResults) {
      if (!seen.has(result.session.key)) {
        seen.add(result.session.key)
        merged.push(result)
      }
    }

    for (const result of contentResults) {
      if (!seen.has(result.session.key)) {
        seen.add(result.session.key)
        merged.push(result)
      }
    }

    return merged
  }, [query, labelResults, contentResults])

  return {
    results,
    isSearching: isSearchingContent,
    isActive: query.trim().length > 0
  }
}
