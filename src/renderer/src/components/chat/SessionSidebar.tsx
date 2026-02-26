import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, MessageSquarePlus, Pin } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn, formatRelativeTime, formatTokens } from '@/lib/utils'
import type { IpcResult, Session } from '../../../../shared/types'

const DEFAULT_MAIN_SESSION_KEY = 'agent:main:main'
const SESSION_REFRESH_INTERVAL_MS = 12000

interface SessionSidebarProps {
  selectedSessionKey: string | null
  onSelectSession: (sessionKey: string) => void
  className?: string
}

type SessionRecord = Session & Record<string, unknown> & { key: string; __localOnly?: boolean }

interface SessionListItem {
  key: string
  label: string
  preview: string
  timestampIso?: string
  timestampMs: number
  tokenCount: number
  isMain: boolean
}

interface BridgeApi {
  getSessions?: () => Promise<unknown>
  getMainSession?: () => Promise<unknown>
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
  if (numeric !== undefined) {
    return numeric > 1e12 ? numeric : numeric * 1000
  }

  const text = readString(value)
  if (!text) return 0
  const parsed = Date.parse(text)
  return Number.isFinite(parsed) ? parsed : 0
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

function resolveSessionLabel(key: string, session: SessionRecord): string {
  const explicitLabel =
    readString(session.displayName) ??
    readString(session.name) ??
    readString(session.label) ??
    readString(session.channelLabel)
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

function extractMessageText(value: unknown): string {
  if (typeof value === 'string') return value.trim()

  if (Array.isArray(value)) {
    return value
      .map((entry) => extractMessageText(entry))
      .filter(Boolean)
      .join('\n')
      .trim()
  }

  const record = asRecord(value)
  if (!record) return ''

  const direct = readString(record.text) ?? readString(record.content) ?? readString(record.value)
  if (direct) return direct

  if (Array.isArray(record.parts)) {
    return record.parts
      .map((entry) => extractMessageText(entry))
      .filter(Boolean)
      .join('\n')
      .trim()
  }

  if (Array.isArray(record.messages)) {
    return record.messages
      .map((entry) => extractMessageText(entry))
      .filter(Boolean)
      .join('\n')
      .trim()
  }

  return ''
}

function resolvePreview(session: SessionRecord): string {
  const directPreview =
    readString(session.lastMessagePreview) ??
    readString(session.preview) ??
    readString(session.lastMessage) ??
    readString(session.message)
  if (directPreview) return directPreview

  const messages = Array.isArray(session.messages) ? session.messages : []
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const text = extractMessageText(messages[index])
    if (text) return text
  }

  return 'No messages yet'
}

function resolveTimestamp(session: SessionRecord): number {
  return (
    toEpochMs(session.lastActivity) ||
    toEpochMs(session.updatedAt) ||
    toEpochMs(session.createdAt) ||
    0
  )
}

function resolveTokenCount(session: SessionRecord): number {
  return (
    readNumber(session.tokenUsage?.total) ??
    readNumber(session.totalTokens) ??
    readNumber(session.tokens) ??
    0
  )
}

function normalizeSessionRecord(value: unknown): SessionRecord | null {
  const record = asRecord(value)
  if (!record) return null

  const key = readString(record.key) ?? readString(record.sessionKey)
  if (!key) return null

  const status = readString(record.status) ?? 'active'
  return {
    ...record,
    key,
    status
  } as SessionRecord
}

function extractSessionsPayload(value: unknown): unknown[] {
  if (Array.isArray(value)) return value

  const record = asRecord(value)
  if (!record) return []

  if (Array.isArray(record.sessions)) return record.sessions
  if (Array.isArray(record.data)) return record.data
  if (Array.isArray(record.items)) return record.items
  return []
}

function createSessionKey(): string {
  const suffix =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`

  return `agent:main:openai-user:pinchr-${suffix}`
}

function isAutomationSession(sessionKey: string): boolean {
  return sessionKey.toLowerCase().includes(':cron:')
}

function getBridgeApi(): BridgeApi {
  const api = window.api as unknown as {
    gateway?: {
      getSessions?: () => Promise<unknown>
      getMainSession?: () => Promise<unknown>
    }
    getSessions?: () => Promise<unknown>
    getMainSession?: () => Promise<unknown>
  }

  return {
    getSessions: api.getSessions ?? api.gateway?.getSessions,
    getMainSession: api.getMainSession ?? api.gateway?.getMainSession
  }
}

export function SessionSidebar({ selectedSessionKey, onSelectSession, className }: SessionSidebarProps) {
  const [sessions, setSessions] = useState<SessionRecord[]>([])
  const [mainSessionKey, setMainSessionKey] = useState(DEFAULT_MAIN_SESSION_KEY)
  const [showAutomationSessions, setShowAutomationSessions] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchSessions = useCallback(async () => {
    const bridge = getBridgeApi()
    if (!bridge.getSessions) {
      setError('Session list API is unavailable')
      setSessions([])
      setIsLoading(false)
      return
    }

    try {
      const response = toIpcResult<unknown>(await bridge.getSessions())
      if (!response.ok) {
        setError(response.error || 'Failed to load sessions')
        setIsLoading(false)
        return
      }

      const fetched = extractSessionsPayload(response.data)
        .map((entry) => normalizeSessionRecord(entry))
        .filter((entry): entry is SessionRecord => !!entry)

      setSessions((previous) => {
        const localOnly = previous.filter(
          (entry) => entry.__localOnly === true && !fetched.some((fetchedEntry) => fetchedEntry.key === entry.key)
        )
        return [...fetched, ...localOnly]
      })
      setError(null)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load sessions')
    } finally {
      setIsLoading(false)
    }
  }, [])

  const fetchMainSession = useCallback(async () => {
    const bridge = getBridgeApi()
    if (!bridge.getMainSession) {
      setMainSessionKey(DEFAULT_MAIN_SESSION_KEY)
      return
    }

    try {
      const response = toIpcResult<string | null>(await bridge.getMainSession())
      const discovered = typeof response.data === 'string' ? response.data.trim() : ''
      setMainSessionKey(discovered || DEFAULT_MAIN_SESSION_KEY)
    } catch {
      setMainSessionKey(DEFAULT_MAIN_SESSION_KEY)
    }
  }, [])

  useEffect(() => {
    void fetchMainSession()
    void fetchSessions()

    const timer = window.setInterval(() => {
      void fetchSessions()
    }, SESSION_REFRESH_INTERVAL_MS)

    return () => {
      window.clearInterval(timer)
    }
  }, [fetchMainSession, fetchSessions])

  const items = useMemo<SessionListItem[]>(() => {
    const hasMain = mainSessionKey.trim().length > 0

    return sessions
      .map((session) => {
        const timestampMs = resolveTimestamp(session)
        return {
          key: session.key,
          label: resolveSessionLabel(session.key, session),
          preview: resolvePreview(session),
          timestampIso: timestampMs > 0 ? new Date(timestampMs).toISOString() : undefined,
          timestampMs,
          tokenCount: resolveTokenCount(session),
          isMain: hasMain ? session.key === mainSessionKey : /^agent:main:direct:[^:]+$/i.test(session.key)
        }
      })
      .sort((left, right) => {
        if (left.isMain !== right.isMain) return left.isMain ? -1 : 1
        if (left.timestampMs !== right.timestampMs) return right.timestampMs - left.timestampMs
        return left.key.localeCompare(right.key)
      })
      .filter((session) =>
        showAutomationSessions ||
        !isAutomationSession(session.key) ||
        session.key === selectedSessionKey
      )
  }, [mainSessionKey, selectedSessionKey, sessions, showAutomationSessions])

  const handleCreateConversation = () => {
    const sessionKey = createSessionKey()
    const nowIso = new Date().toISOString()
    setSessions((previous) => [
      {
        key: sessionKey,
        status: 'active',
        lastActivity: nowIso,
        updatedAt: nowIso,
        __localOnly: true
      },
      ...previous.filter((entry) => entry.key !== sessionKey)
    ])
    onSelectSession(sessionKey)
  }

  return (
    <div className={cn('flex h-full w-[280px] flex-col border-r border-border bg-surface-1', className)}>
      <div className="border-b border-border p-3">
        <Button
          type="button"
          size="sm"
          className="w-full justify-start gap-2 bg-[#ff7f50] text-white hover:bg-[#ff6b3d]"
          onClick={handleCreateConversation}
        >
          <MessageSquarePlus className="h-4 w-4" />
          New Conversation
        </Button>
        <div className="mt-2">
          <Button
            type="button"
            variant={showAutomationSessions ? 'secondary' : 'outline'}
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => setShowAutomationSessions((previous) => !previous)}
          >
            {showAutomationSessions ? 'Hide automations' : 'Show automations'}
          </Button>
        </div>
      </div>

      {error && (
        <div className="border-b border-border px-3 py-2 text-xs text-red-400">
          {error}
        </div>
      )}

      <ScrollArea className="flex-1">
        <div className="space-y-1 p-2">
          {isLoading && items.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-xs text-text-muted">
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              Loading sessions...
            </div>
          ) : items.length === 0 ? (
            <p className="py-6 text-center text-xs text-text-muted">No sessions found.</p>
          ) : (
            items.map((session) => {
              const isActive = selectedSessionKey === session.key

              return (
                <button
                  key={session.key}
                  type="button"
                  onClick={() => onSelectSession(session.key)}
                  className={cn(
                    'w-full rounded-md border border-transparent px-3 py-2 text-left transition-colors hover:bg-surface-2',
                    isActive && 'border-border border-l-2 border-l-[#ff7f50] bg-surface-2'
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium text-text-primary">{session.label}</p>
                    {session.isMain && <Pin className="h-3.5 w-3.5 shrink-0 text-[#ff7f50]" aria-label="Main session" />}
                  </div>

                  <p className="mt-0.5 truncate font-mono text-[11px] text-text-muted">{session.key}</p>
                  <p className="mt-1 truncate text-xs text-text-muted">{session.preview}</p>

                  <div className="mt-1.5 flex items-center justify-between text-[11px] text-text-muted">
                    <span>{session.timestampIso ? formatRelativeTime(session.timestampIso) : '—'}</span>
                    <span className="font-mono">{formatTokens(session.tokenCount)} tok</span>
                  </div>
                </button>
              )
            })
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

export default SessionSidebar
