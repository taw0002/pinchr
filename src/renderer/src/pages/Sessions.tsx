import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import {
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  Loader2,
  MessageSquare,
  MonitorSmartphone,
  FolderOpen,
  Pin,
  Play,
  Search,
  Square,
  Terminal,
  Trash2,
  X,
  XCircle
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { cn, formatRelativeTime, formatTokens } from '@/lib/utils'
import {
  useClearCompletedProcesses,
  useKillProcess,
  useProcessList,
  useProcessLog,
  type ProcessEntry
} from '@/hooks/useSessions'
import { useSessions as useGatewaySessionsData } from '@/hooks/useGateway'
import {
  useSessionHistory,
  type GatewaySessionMessage,
  type GatewaySessionSummary
} from '@/hooks/useGatewaySessions'
import { useSessionSearch, type SessionSearchResult } from '@/hooks/useSessionSearch'

type GroupKey = 'direct' | 'channels' | 'topics' | 'subagents' | 'processes'
type SessionSelection =
  | { type: 'gateway'; key: string }
  | { type: 'process'; sessionId: string }

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.03 } }
}

const item = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0 }
}

const CHANNEL_BADGE_TYPES = [
  'slack',
  'discord',
  'whatsapp',
  'telegram',
  'signal',
  'imessage',
  'webchat',
  'email',
  'sms'
] as const

type SessionChannel = (typeof CHANNEL_BADGE_TYPES)[number]
type SessionTypeBadge = 'main' | 'direct' | 'sub-agent' | 'cron'
type NormalizedGatewaySession = GatewaySessionSummary & {
  status: string
  typeBadges: SessionTypeBadge[]
  channelBadges: SessionChannel[]
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength) + '…'
}

function formatRuntime(startedAt?: string, completedAt?: string): string {
  if (!startedAt) return '—'
  const start = new Date(startedAt).getTime()
  if (Number.isNaN(start)) return '—'
  const end = completedAt ? new Date(completedAt).getTime() : Date.now()
  const diffMs = Math.max(0, end - start)
  const seconds = Math.floor(diffMs / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  if (hours > 0) return `${hours}h ${minutes % 60}m`
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`
  return `${seconds}s`
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

function toTitleCase(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ')
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

function resolveSessionLabel(key: string, session: Record<string, unknown>): string {
  const explicit =
    readString(session.displayName) ??
    readString(session.name) ??
    readString(session.label) ??
    readString(session.channelLabel)
  if (explicit) return explicit

  const parts = key.split(':').map((part) => part.trim()).filter(Boolean)
  if (parts.length === 0) return 'Session'

  const lowerParts = parts.map((part) => part.toLowerCase())
  const directIndex = lowerParts.indexOf('direct')
  if (directIndex >= 0) {
    const directName = parts[directIndex + 1] ?? parts[parts.length - 1] ?? 'Session'
    return `Direct ${toTitleCase(directName)}`
  }

  const channelIndex = lowerParts.findIndex((part) => CHANNEL_BADGE_TYPES.includes(part as SessionChannel))
  if (channelIndex >= 0) {
    const channel = toTitleCase(parts[channelIndex] ?? 'Channel')
    const target = parts[channelIndex + 1] ? ` ${toTitleCase(parts[channelIndex + 1])}` : ''
    return `${channel}${target}`
  }

  if (key.toLowerCase().endsWith(':main')) return 'Main Session'
  return toTitleCase(parts[parts.length - 1] ?? key)
}

function resolveSessionPreview(session: Record<string, unknown>): string {
  const preview =
    readString(session.lastMessagePreview) ??
    readString(session.preview) ??
    readString(session.lastMessage) ??
    readString(session.message)
  if (preview) return preview

  const messages = Array.isArray(session.messages) ? session.messages : []
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const text = extractMessageText(messages[index])
    if (text) return text
  }

  return 'No messages yet'
}

function resolveSessionBadges(
  key: string,
  session: Record<string, unknown>
): {
  typeBadges: SessionTypeBadge[]
  channelBadges: SessionChannel[]
  group: GatewaySessionSummary['group']
  agentId: string
} {
  const keyLower = key.toLowerCase()
  const parts = keyLower.split(':').filter(Boolean)
  const agentId = (parts[1] ?? 'main').toLowerCase()
  const typeBadges: SessionTypeBadge[] = []

  if (keyLower.includes(':main:')) typeBadges.push('main')
  if (keyLower.includes(':direct:')) typeBadges.push('direct')

  const kindLower = (readString(session.kind) ?? readString(session.type) ?? '').toLowerCase()
  if (kindLower.includes('direct') && !typeBadges.includes('direct')) {
    typeBadges.push('direct')
  }

  const isSubAgent =
    agentId === 'sub' ||
    keyLower.includes(':sub:') ||
    keyLower.includes(':subagent:') ||
    keyLower.includes('subagent') ||
    keyLower.includes('isolated')
  if (isSubAgent) typeBadges.push('sub-agent')

  const cronSignals = [
    keyLower,
    kindLower,
    (readString(session.status) ?? '').toLowerCase(),
    (readString(session.channel) ?? '').toLowerCase()
  ]
  if (cronSignals.some((value) => value.includes('cron'))) {
    typeBadges.push('cron')
  }

  const channelSet = new Set<SessionChannel>()
  for (const token of parts) {
    if (CHANNEL_BADGE_TYPES.includes(token as SessionChannel)) {
      channelSet.add(token as SessionChannel)
    }
  }
  const explicitChannel = (readString(session.channel) ?? '').toLowerCase()
  if (CHANNEL_BADGE_TYPES.includes(explicitChannel as SessionChannel)) {
    channelSet.add(explicitChannel as SessionChannel)
  }
  const channelBadges = Array.from(channelSet)

  if (isSubAgent) {
    return { typeBadges, channelBadges, group: keyLower.includes('topic') ? 'topics' : 'subagents', agentId }
  }
  if (typeBadges.includes('direct')) {
    return { typeBadges, channelBadges, group: 'direct', agentId }
  }
  if (keyLower.includes('topic') || kindLower.includes('topic')) {
    return { typeBadges, channelBadges, group: 'topics', agentId }
  }
  return { typeBadges, channelBadges, group: 'channels', agentId }
}

function normalizeGatewaySession(rawValue: unknown): NormalizedGatewaySession | null {
  const raw = asRecord(rawValue)
  if (!raw) return null

  const key = readString(raw.key) ?? readString(raw.sessionKey)
  if (!key) return null

  const updatedAtMs =
    toEpochMs(raw.lastActivity) ||
    toEpochMs(raw.updatedAt) ||
    toEpochMs(raw.updated_at) ||
    toEpochMs(raw.createdAt)

  const { typeBadges, channelBadges, group, agentId } = resolveSessionBadges(key, raw)

  return {
    key,
    kind: readString(raw.kind) ?? readString(raw.type),
    channel: readString(raw.channel) ?? channelBadges[0],
    displayName: readString(raw.displayName) ?? readString(raw.name) ?? readString(raw.label),
    model: readString(raw.model),
    totalTokens:
      readNumber(asRecord(raw.tokenUsage)?.total) ??
      readNumber(raw.totalTokens) ??
      readNumber(raw.tokens) ??
      0,
    updatedAt: updatedAtMs > 0 ? new Date(updatedAtMs).toISOString() : undefined,
    updatedAtMs,
    lastMessagePreview: resolveSessionPreview(raw),
    label: resolveSessionLabel(key, raw),
    group,
    agentId,
    isActive: updatedAtMs > 0 && Date.now() - updatedAtMs < 2 * 60 * 1000,
    status: readString(raw.status) ?? 'idle',
    typeBadges,
    channelBadges
  }
}

function SessionBadges({ session }: { session: NormalizedGatewaySession }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {session.typeBadges.map((badge) => (
        <Badge
          key={`${session.key}-${badge}`}
          variant="secondary"
          className={cn(
            'text-[10px]',
            badge === 'main' && 'border-blue-500/30 bg-blue-500/15 text-blue-300',
            badge === 'direct' && 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300',
            badge === 'sub-agent' && 'border-amber-500/30 bg-amber-500/15 text-amber-300',
            badge === 'cron' && 'border-cyan-500/30 bg-cyan-500/15 text-cyan-300'
          )}
        >
          {badge}
        </Badge>
      ))}
      {session.channelBadges.map((channel) => (
        <Badge
          key={`${session.key}-${channel}`}
          variant="secondary"
          className="border-border/80 bg-surface-2 text-[10px] text-text-muted"
        >
          {channel}
        </Badge>
      ))}
    </div>
  )
}

function openSessionInChat(sessionKey: string): void {
  window.location.hash = `#/chat?session=${encodeURIComponent(sessionKey)}`
}

function StatusBadge({ status }: { status: ProcessEntry['status'] }) {
  if (status === 'running') {
    return (
      <Badge className="gap-1.5 border-emerald-500/30 bg-emerald-500/15 text-emerald-400">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
        Running
      </Badge>
    )
  }

  if (status === 'failed') {
    return (
      <Badge className="gap-1.5 border-red-500/30 bg-red-500/15 text-red-400">
        <XCircle className="h-3 w-3" />
        Failed
      </Badge>
    )
  }

  return (
    <Badge className="gap-1.5 border-blue-500/30 bg-blue-500/15 text-blue-400">
      <CheckCircle2 className="h-3 w-3" />
      Completed
    </Badge>
  )
}

function RoleBadge({ role }: { role: GatewaySessionMessage['role'] }) {
  if (role === 'user') {
    return <Badge className="border-blue-500/30 bg-blue-500/15 text-blue-300">User</Badge>
  }
  if (role === 'assistant') {
    return <Badge className="border-emerald-500/30 bg-emerald-500/15 text-emerald-300">Assistant</Badge>
  }
  return <Badge className="border-amber-500/30 bg-amber-500/15 text-amber-300">System</Badge>
}

function SessionGroup({
  title,
  icon: Icon,
  count,
  open,
  onToggle,
  children
}: {
  title: string
  icon: LucideIcon
  count: number
  open: boolean
  onToggle: () => void
  children: ReactNode
}) {
  return (
    <Card className="overflow-hidden border-border bg-surface p-0">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-surface-2"
      >
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-text-muted" />
          <span className="text-xs font-semibold tracking-[0.08em] text-text-primary">{title}</span>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="bg-surface-2 text-xs text-text-muted">
            {count}
          </Badge>
          {open ? (
            <ChevronDown className="h-3.5 w-3.5 text-text-muted" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-text-muted" />
          )}
        </div>
      </button>
      {open && <div className="border-t border-border/80 p-2">{children}</div>}
    </Card>
  )
}

function GatewaySessionCard({
  session,
  selected,
  onSelect,
  onOpenInChat
}: {
  session: NormalizedGatewaySession
  selected: boolean
  onSelect: () => void
  onOpenInChat: () => void
}) {
  return (
    <motion.div variants={item}>
      <div
        className={cn(
          'w-full rounded-lg border transition-colors',
          selected
            ? 'border-accent/50 bg-accent/10'
            : 'border-border bg-surface hover:bg-surface-2'
        )}
      >
        <button type="button" onClick={onSelect} className="w-full p-3 text-left">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-medium text-text-primary">{session.label}</span>
                <span className="relative flex h-2 w-2">
                  {session.isActive && (
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/70" />
                  )}
                  <span
                    className={cn(
                      'relative inline-flex h-2 w-2 rounded-full',
                      session.isActive ? 'bg-emerald-400' : 'bg-text-muted/40'
                    )}
                  />
                </span>
              </div>
              <p className="mt-1 truncate text-xs text-text-muted">
                {truncate(session.lastMessagePreview || 'No messages yet', 90)}
              </p>
              <div className="mt-2">
                <SessionBadges session={session} />
              </div>
            </div>
            <Badge variant="secondary" className="bg-surface-2 text-[10px] text-text-muted">
              {session.model || 'unknown'}
            </Badge>
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-text-muted">
            <span className="flex items-center gap-1">
              <Clock3 className="h-3 w-3" />
              {session.updatedAt ? formatRelativeTime(session.updatedAt) : '—'}
            </span>
            <span className="font-mono">{formatTokens(session.totalTokens)} tokens</span>
          </div>
        </button>
        <div className="flex items-center justify-end px-3 pb-3">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onOpenInChat}
            className="h-7 px-2.5 text-[11px]"
          >
            Open in Chat
          </Button>
        </div>
      </div>
    </motion.div>
  )
}

function HighlightedText({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>

  const lower = text.toLowerCase()
  const queryLower = query.toLowerCase().trim()
  const index = lower.indexOf(queryLower)

  if (index < 0) return <>{text}</>

  return (
    <>
      {text.slice(0, index)}
      <mark className="rounded bg-accent/30 px-0.5 text-text-primary">{text.slice(index, index + query.trim().length)}</mark>
      {text.slice(index + query.trim().length)}
    </>
  )
}

function SearchResultCard({
  result,
  searchQuery,
  selected,
  onSelect,
  onOpenInChat
}: {
  result: SessionSearchResult
  searchQuery: string
  selected: boolean
  onSelect: () => void
  onOpenInChat: () => void
}) {
  const { session, matchType, snippet, matchedMessageTimestamp } = result
  const normalizedSession = session as NormalizedGatewaySession

  return (
    <motion.div variants={item}>
      <div
        className={cn(
          'w-full rounded-lg border transition-colors',
          selected
            ? 'border-accent/50 bg-accent/10'
            : 'border-border bg-surface hover:bg-surface-2'
        )}
      >
        <button type="button" onClick={onSelect} className="w-full p-3 text-left">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-medium text-text-primary">
                  <HighlightedText text={session.label} query={searchQuery} />
                </span>
                <Badge
                  variant="secondary"
                  className={cn(
                    'text-[10px]',
                    matchType === 'content'
                      ? 'border-amber-500/30 bg-amber-500/15 text-amber-400'
                      : 'bg-surface-2 text-text-muted'
                  )}
                >
                  {matchType === 'content' ? 'Message' : 'Field'}
                </Badge>
              </div>
              {snippet && (
                <p className="mt-1.5 text-xs leading-relaxed text-text-muted">
                  <HighlightedText text={truncate(snippet, 140)} query={searchQuery} />
                </p>
              )}
              {!snippet && (
                <p className="mt-1 truncate text-xs text-text-muted">
                  {truncate(session.lastMessagePreview || 'No messages yet', 90)}
                </p>
              )}
              <div className="mt-2">
                <SessionBadges session={normalizedSession} />
              </div>
            </div>
            <Badge variant="secondary" className="bg-surface-2 text-[10px] text-text-muted">
              {session.model || 'unknown'}
            </Badge>
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-text-muted">
            <span className="flex items-center gap-1">
              <Clock3 className="h-3 w-3" />
              {matchedMessageTimestamp
                ? formatRelativeTime(matchedMessageTimestamp)
                : session.updatedAt
                  ? formatRelativeTime(session.updatedAt)
                  : '—'}
            </span>
            <span className="font-mono">{formatTokens(session.totalTokens)} tokens</span>
          </div>
        </button>
        <div className="flex items-center justify-end px-3 pb-3">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onOpenInChat}
            className="h-7 px-2.5 text-[11px]"
          >
            Open in Chat
          </Button>
        </div>
      </div>
    </motion.div>
  )
}

function ProcessCard({
  process,
  selected,
  onSelect
}: {
  process: ProcessEntry
  selected: boolean
  onSelect: () => void
}) {
  return (
    <motion.div variants={item}>
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          'w-full rounded-lg border p-3 text-left transition-colors',
          selected
            ? 'border-accent/50 bg-accent/10'
            : 'border-border bg-surface hover:bg-surface-2'
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-text-primary">{process.name}</p>
            <p className="mt-1 truncate font-mono text-xs text-text-muted">
              {truncate(process.command || 'No command recorded', 76)}
            </p>
          </div>
          <StatusBadge status={process.status} />
        </div>
        <div className="mt-2 flex items-center justify-between text-[11px] text-text-muted">
          <span className="flex items-center gap-1">
            <Clock3 className="h-3 w-3" />
            {formatRuntime(process.startedAt, process.completedAt)}
          </span>
          <span className="truncate font-mono">{process.sessionId}</span>
        </div>
      </button>
    </motion.div>
  )
}

function TerminalViewer({ lines, isLoading }: { lines: string[]; isLoading: boolean }) {
  const scrollRef = useRef<HTMLPreElement>(null)
  const autoScrollRef = useRef(true)

  useEffect(() => {
    const element = scrollRef.current
    if (!element || !autoScrollRef.current) return
    element.scrollTop = element.scrollHeight
  }, [lines])

  const handleScroll = () => {
    const element = scrollRef.current
    if (!element) return
    autoScrollRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 40
  }

  if (isLoading && lines.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-text-muted" />
      </div>
    )
  }

  return (
    <pre
      ref={scrollRef}
      onScroll={handleScroll}
      className="h-full overflow-auto rounded-lg bg-black/60 p-4 font-mono text-sm leading-relaxed text-green-400"
    >
      {lines.length > 0 ? (
        lines.map((line, index) => (
          <div key={index} className="whitespace-pre-wrap break-all">
            {line}
          </div>
        ))
      ) : (
        <span className="text-text-muted">No output yet.</span>
      )}
    </pre>
  )
}

function GatewayHistoryViewer({
  messages,
  isLoading
}: {
  messages: GatewaySessionMessage[]
  isLoading: boolean
}) {
  if (isLoading && messages.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-text-muted" />
      </div>
    )
  }

  const visibleMessages = messages.filter((message) => {
    const content = (message.content ?? '').trim()
    return content.length > 0
  })

  if (visibleMessages.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <Card className="border-border bg-surface-2 p-5 text-center">
          <p className="text-sm text-text-primary">No conversation history</p>
          <p className="mt-1 text-xs text-text-muted">New messages will appear here.</p>
        </Card>
      </div>
    )
  }

  return (
    <ScrollArea className="h-full">
      <motion.div variants={container} initial="hidden" animate="show" className="space-y-3 p-1 pr-4">
        {visibleMessages.map((message) => (
          <motion.div key={message.id} variants={item}>
            <Card className="border-border bg-surface-2 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <RoleBadge role={message.role} />
                <span className="text-[11px] text-text-muted">
                  {message.timestamp ? formatRelativeTime(message.timestamp) : '—'}
                </span>
              </div>
              <p className="whitespace-pre-wrap break-words text-sm text-text-primary">
                {message.content}
              </p>
            </Card>
          </motion.div>
        ))}
      </motion.div>
    </ScrollArea>
  )
}

export default function Sessions() {
  const { data: sessionRecords = [], isLoading: gatewayLoading } = useGatewaySessionsData()
  const { data: processes = [], isLoading: processLoading } = useProcessList()

  const [selected, setSelected] = useState<SessionSelection | null>(null)
  const [killConfirmId, setKillConfirmId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [openGroups, setOpenGroups] = useState<Record<GroupKey, boolean>>({
    direct: true,
    channels: true,
    topics: true,
    subagents: true,
    processes: true
  })

  const killProcess = useKillProcess()
  const clearCompleted = useClearCompletedProcesses()

  const gatewaySessions = useMemo(
    () =>
      sessionRecords
        .map((session) => normalizeGatewaySession(session))
        .filter((session): session is NormalizedGatewaySession => !!session),
    [sessionRecords]
  )

  const { results: searchResults, isSearching, isActive: isSearchActive } = useSessionSearch(
    gatewaySessions,
    searchQuery
  )

  const directSessions = useMemo(
    () => gatewaySessions.filter((session) => session.group === 'direct'),
    [gatewaySessions]
  )
  const channelSessions = useMemo(
    () => gatewaySessions.filter((session) => session.group === 'channels'),
    [gatewaySessions]
  )
  const topicSessions = useMemo(
    () => gatewaySessions.filter((session) => session.group === 'topics'),
    [gatewaySessions]
  )
  const subagentSessions = useMemo(
    () => gatewaySessions.filter((session) => session.group === 'subagents'),
    [gatewaySessions]
  )

  const orderedSelections = useMemo<SessionSelection[]>(() => {
    const items: SessionSelection[] = []
    for (const session of directSessions) items.push({ type: 'gateway', key: session.key })
    for (const session of channelSessions) items.push({ type: 'gateway', key: session.key })
    for (const session of topicSessions) items.push({ type: 'gateway', key: session.key })
    for (const session of subagentSessions) items.push({ type: 'gateway', key: session.key })
    for (const process of processes) items.push({ type: 'process', sessionId: process.sessionId })
    return items
  }, [directSessions, channelSessions, topicSessions, subagentSessions, processes])

  useEffect(() => {
    if (orderedSelections.length === 0) {
      if (selected) setSelected(null)
      return
    }

    if (!selected) {
      setSelected(orderedSelections[0])
      return
    }

    const stillExists =
      selected.type === 'gateway'
        ? gatewaySessions.some((session) => session.key === selected.key)
        : processes.some((process) => process.sessionId === selected.sessionId)

    if (!stillExists) {
      setSelected(orderedSelections[0])
    }
  }, [orderedSelections, selected, gatewaySessions, processes])

  const selectedGateway =
    selected?.type === 'gateway'
      ? gatewaySessions.find((session) => session.key === selected.key) ?? null
      : null
  const selectedProcess =
    selected?.type === 'process'
      ? processes.find((process) => process.sessionId === selected.sessionId) ?? null
      : null

  const { data: historyMessages = [], isLoading: historyLoading } = useSessionHistory(
    selectedGateway?.key ?? null
  )
  const { data: logLines = [], isLoading: logLoading } = useProcessLog(
    selectedProcess?.sessionId ?? null,
    selectedProcess?.status === 'running'
  )

  const runningCount = processes.filter((process) => process.status === 'running').length
  const completedCount = processes.filter((process) => process.status !== 'running').length
  const gatewayInitialLoading = gatewayLoading && gatewaySessions.length === 0
  const processInitialLoading = processLoading && processes.length === 0

  const toggleGroup = (group: GroupKey) => {
    setOpenGroups((previous) => ({ ...previous, [group]: !previous[group] }))
  }

  const handleKill = async () => {
    if (!killConfirmId) return
    try {
      await killProcess.mutateAsync(killConfirmId)
    } catch (error) {
      console.error('Failed to kill process:', error)
    } finally {
      setKillConfirmId(null)
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/15">
            <MonitorSmartphone className="h-5 w-5 text-accent" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-text-primary">Sessions</h1>
            <p className="text-xs text-text-muted">
              Direct {directSessions.length} · Channels {channelSessions.length} · Topics {topicSessions.length} · Sub-agents{' '}
              {subagentSessions.length} · Processes {processes.length}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="bg-surface-2 text-text-muted">
            DIRECT {directSessions.length}
          </Badge>
          <Badge variant="secondary" className="bg-surface-2 text-text-muted">
            CHANNELS {channelSessions.length}
          </Badge>
          <Badge variant="secondary" className="bg-surface-2 text-text-muted">
            TOPICS {topicSessions.length}
          </Badge>
          <Badge variant="secondary" className="bg-surface-2 text-text-muted">
            SUB-AGENTS {subagentSessions.length}
          </Badge>
          <Badge variant="secondary" className="bg-surface-2 text-text-muted">
            PROCESSES {runningCount} running
          </Badge>
          {completedCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => clearCompleted.mutate()}
              disabled={clearCompleted.isPending}
              className="gap-1.5 text-xs"
            >
              {clearCompleted.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
              Clear Completed
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="w-96 flex-shrink-0 border-r border-border">
          <div className="border-b border-border p-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search sessions and messages…"
                className="h-9 w-full rounded-lg border border-border bg-surface-2 pl-9 pr-9 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
          <ScrollArea className="h-full">
            {isSearchActive ? (
              <div className="space-y-2 p-3">
                {isSearching && (
                  <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-text-muted">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Searching message content…
                  </div>
                )}
                {searchResults.length > 0 ? (
                  <motion.div variants={container} initial="hidden" animate="show" className="space-y-2">
                    {searchResults.map((result) => (
                      <SearchResultCard
                        key={result.session.key}
                        result={result}
                        searchQuery={searchQuery}
                        selected={selected?.type === 'gateway' && selected.key === result.session.key}
                        onSelect={() => setSelected({ type: 'gateway', key: result.session.key })}
                        onOpenInChat={() => openSessionInChat(result.session.key)}
                      />
                    ))}
                  </motion.div>
                ) : !isSearching ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Search className="h-8 w-8 text-text-muted/40" />
                    <p className="mt-3 text-sm text-text-muted">
                      No results for &lsquo;{searchQuery}&rsquo;
                    </p>
                    <p className="mt-1 text-xs text-text-muted/60">
                      Search keys, labels, channels, status, tokens, and message content.
                    </p>
                  </div>
                ) : null}
              </div>
            ) : (
            <div className="space-y-3 p-3">
              <SessionGroup
                title="DIRECT"
                icon={Pin}
                count={directSessions.length}
                open={openGroups.direct}
                onToggle={() => toggleGroup('direct')}
              >
                {gatewayInitialLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-4 w-4 animate-spin text-text-muted" />
                  </div>
                ) : directSessions.length === 0 ? (
                  <p className="py-3 text-xs text-text-muted">No direct sessions found yet.</p>
                ) : (
                  <motion.div variants={container} initial="hidden" animate="show" className="space-y-2">
                    {directSessions.map((session) => (
                      <GatewaySessionCard
                        key={session.key}
                        session={session}
                        selected={selected?.type === 'gateway' && selected.key === session.key}
                        onSelect={() => setSelected({ type: 'gateway', key: session.key })}
                        onOpenInChat={() => openSessionInChat(session.key)}
                      />
                    ))}
                  </motion.div>
                )}
              </SessionGroup>

              <SessionGroup
                title="CHANNELS"
                icon={MessageSquare}
                count={channelSessions.length}
                open={openGroups.channels}
                onToggle={() => toggleGroup('channels')}
              >
                {gatewayInitialLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-4 w-4 animate-spin text-text-muted" />
                  </div>
                ) : channelSessions.length === 0 ? (
                  <p className="py-3 text-xs text-text-muted">No channel sessions available.</p>
                ) : (
                  <motion.div variants={container} initial="hidden" animate="show" className="space-y-2">
                    {channelSessions.map((session) => (
                      <GatewaySessionCard
                        key={session.key}
                        session={session}
                        selected={selected?.type === 'gateway' && selected.key === session.key}
                        onSelect={() => setSelected({ type: 'gateway', key: session.key })}
                        onOpenInChat={() => openSessionInChat(session.key)}
                      />
                    ))}
                  </motion.div>
                )}
              </SessionGroup>

              <SessionGroup
                title="TOPICS"
                icon={FolderOpen}
                count={topicSessions.length}
                open={openGroups.topics}
                onToggle={() => toggleGroup('topics')}
              >
                {gatewayInitialLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-4 w-4 animate-spin text-text-muted" />
                  </div>
                ) : topicSessions.length === 0 ? (
                  <p className="py-3 text-xs text-text-muted">No topic sessions have been routed yet.</p>
                ) : (
                  <motion.div variants={container} initial="hidden" animate="show" className="space-y-2">
                    {topicSessions.map((session) => (
                      <GatewaySessionCard
                        key={session.key}
                        session={session}
                        selected={selected?.type === 'gateway' && selected.key === session.key}
                        onSelect={() => setSelected({ type: 'gateway', key: session.key })}
                        onOpenInChat={() => openSessionInChat(session.key)}
                      />
                    ))}
                  </motion.div>
                )}
              </SessionGroup>

              <SessionGroup
                title="SUB-AGENTS"
                icon={Bot}
                count={subagentSessions.length}
                open={openGroups.subagents}
                onToggle={() => toggleGroup('subagents')}
              >
                {gatewayInitialLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-4 w-4 animate-spin text-text-muted" />
                  </div>
                ) : subagentSessions.length === 0 ? (
                  <p className="py-3 text-xs text-text-muted">No sub-agent sessions found.</p>
                ) : (
                  <motion.div variants={container} initial="hidden" animate="show" className="space-y-2">
                    {subagentSessions.map((session) => (
                      <GatewaySessionCard
                        key={session.key}
                        session={session}
                        selected={selected?.type === 'gateway' && selected.key === session.key}
                        onSelect={() => setSelected({ type: 'gateway', key: session.key })}
                        onOpenInChat={() => openSessionInChat(session.key)}
                      />
                    ))}
                  </motion.div>
                )}
              </SessionGroup>

              <SessionGroup
                title="PROCESSES"
                icon={Terminal}
                count={processes.length}
                open={openGroups.processes}
                onToggle={() => toggleGroup('processes')}
              >
                {processInitialLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-4 w-4 animate-spin text-text-muted" />
                  </div>
                ) : processes.length === 0 ? (
                  <p className="py-3 text-xs text-text-muted">No process sessions.</p>
                ) : (
                  <motion.div variants={container} initial="hidden" animate="show" className="space-y-2">
                    {processes.map((process) => (
                      <ProcessCard
                        key={process.sessionId}
                        process={process}
                        selected={selected?.type === 'process' && selected.sessionId === process.sessionId}
                        onSelect={() => setSelected({ type: 'process', sessionId: process.sessionId })}
                      />
                    ))}
                  </motion.div>
                )}
              </SessionGroup>
            </div>
            )}
          </ScrollArea>
        </div>

        <div className="flex flex-1 flex-col overflow-hidden">
          {selectedGateway ? (
            <>
              <div className="flex items-center justify-between border-b border-border px-5 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-2 w-2">
                      {selectedGateway.isActive && (
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/70" />
                      )}
                      <span
                        className={cn(
                          'relative inline-flex h-2 w-2 rounded-full',
                          selectedGateway.isActive ? 'bg-emerald-400' : 'bg-text-muted/40'
                        )}
                      />
                    </span>
                    <p className="truncate text-sm font-semibold text-text-primary">
                      {selectedGateway.label}
                    </p>
                    <Badge variant="secondary" className="bg-surface-2 text-text-muted">
                      {selectedGateway.model || 'unknown'}
                    </Badge>
                    <Badge variant="secondary" className="bg-surface-2 text-text-muted">
                      {formatTokens(selectedGateway.totalTokens)} tokens
                    </Badge>
                  </div>
                  <div className="mt-2">
                    <SessionBadges session={selectedGateway} />
                  </div>
                  <p className="mt-1 truncate text-xs font-mono text-text-muted">
                    {selectedGateway.key}
                  </p>
                </div>
                <div className="ml-4 flex flex-col items-end gap-2">
                  <p className="text-xs text-text-muted">
                    {selectedGateway.updatedAt
                      ? `Updated ${formatRelativeTime(selectedGateway.updatedAt)}`
                      : 'No activity timestamp'}
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => openSessionInChat(selectedGateway.key)}
                    className="h-7 px-2.5 text-[11px]"
                  >
                    Open in Chat
                  </Button>
                </div>
              </div>
              <div className="flex-1 overflow-hidden p-4">
                <GatewayHistoryViewer messages={historyMessages} isLoading={historyLoading} />
              </div>
            </>
          ) : selectedProcess ? (
            <>
              <div className="flex items-center justify-between border-b border-border px-5 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Terminal className="h-4 w-4 text-text-muted" />
                    <p className="truncate text-sm font-semibold text-text-primary">
                      {selectedProcess.name}
                    </p>
                    <StatusBadge status={selectedProcess.status} />
                  </div>
                  <p className="mt-1 truncate pl-6 text-xs font-mono text-text-muted">
                    {selectedProcess.command || 'No command recorded'}
                  </p>
                </div>
                {selectedProcess.status === 'running' && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setKillConfirmId(selectedProcess.sessionId)}
                    className="gap-1.5 border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300"
                  >
                    <Square className="h-3.5 w-3.5" />
                    Kill
                  </Button>
                )}
              </div>
              <div className="flex-1 overflow-hidden p-4">
                <TerminalViewer lines={logLines} isLoading={logLoading} />
              </div>
            </>
          ) : (
            <div className="flex h-full items-center justify-center">
              <Card className="border-border bg-surface-2 p-6 text-center">
                <Play className="mx-auto h-7 w-7 text-text-muted/60" />
                <p className="mt-3 text-sm text-text-primary">Select a session to inspect</p>
                <p className="mt-1 text-xs text-text-muted">
                  Gateway conversations and process output appear here.
                </p>
              </Card>
            </div>
          )}
        </div>
      </div>

      <Dialog open={!!killConfirmId} onOpenChange={(open) => !open && setKillConfirmId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Kill Process</DialogTitle>
            <DialogDescription>
              Are you sure you want to kill this process? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setKillConfirmId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleKill}
              disabled={killProcess.isPending}
              className="gap-1.5"
            >
              {killProcess.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Square className="h-3.5 w-3.5" />
              )}
              Kill Process
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
