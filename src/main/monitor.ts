import { BrowserWindow, Notification } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync, watch, type FSWatcher } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { resolveWorkspacePathFromGatewayConfig } from './fileWatcher'
import { activityLogger } from './activity-log'
import { getGatewayUrl, getHeaders, getSessionHistory, getSessions } from './gateway'
import { routeMessageToTopicSession } from './topic-router'

interface SessionState {
  lastMessageTime: string | null
  lastMessageCount: number
  lastUserFingerprint: string | null
}

interface HistoryMessage {
  role: string
  content: string
  timestamp?: string
}

interface MonitoredSession {
  key: string
  channel?: string
  lastActivity?: string
  transcriptPath?: string
}

interface ChannelRoutingSessionState {
  lastUserFingerprint: string | null
  lastRoutedFingerprint: string | null
  lastAttemptFingerprint: string | null
  lastAttemptAt: string | null
  lastAttemptStatus: 'success' | 'failed' | null
}

export interface ChannelRoutingEvent {
  id: string
  at: string
  sessionKey: string
  status: 'routed' | 'failed' | 'skipped'
  reason: string
  topicId?: string
  topicLabel?: string
  messagePreview?: string
}

export interface ChannelRoutingMetrics {
  startedAt: string
  lastPollAt: string | null
  pollCount: number
  sessionsScanned: number
  sessionsRoutable: number
  pendingInbound: number
  routedCount: number
  failedCount: number
  dedupedCount: number
  skippedDisabledCount: number
  skippedNoPendingCount: number
  skippedCommandCount: number
  skippedCooldownCount: number
  lastRoutedAt: string | null
  lastRoutedSessionKey: string | null
  lastTopicLabel: string | null
  lastError: string | null
}

export interface ChannelRoutingMetricsSnapshot {
  enabled: boolean
  metrics: ChannelRoutingMetrics
  events: ChannelRoutingEvent[]
}

interface ChannelRoutingStateDocument {
  version: 1
  updatedAt: string
  sessions: Record<string, Partial<ChannelRoutingSessionState>>
  metrics: Partial<ChannelRoutingMetrics>
  events: ChannelRoutingEvent[]
}

// Store last seen state for each session (notifications)
const sessionStates = new Map<string, SessionState>()
const routeSessionStates = new Map<string, ChannelRoutingSessionState>()

const PINCHR_CONFIG_PATH = join(homedir(), '.pinchr', 'config.json')
const CHANNEL_ROUTING_STATE_PATH = join(homedir(), '.pinchr', 'channel-routing-state.json')
const CHANNEL_ROUTABLE_TYPES = new Set([
  'slack',
  'whatsapp',
  'discord',
  'telegram',
  'signal',
  'imessage',
  'webchat'
])
const CHANNEL_MONITOR_INTERVAL_MS = 5000
const CHANNEL_MONITOR_INITIAL_DELAY_MS = 2500
const ROUTE_FAILURE_COOLDOWN_MS = 30000
const ROUTING_EVENT_LIMIT = 60
const ROUTING_STATE_VERSION = 1 as const

let channelRoutingEnabled = true
let channelRoutingMetrics: ChannelRoutingMetrics = createEmptyRoutingMetrics()
let channelRoutingEvents: ChannelRoutingEvent[] = []
let routeStateDirty = false
let routeStateFlushTimer: NodeJS.Timeout | null = null
let checkInFlight = false
const transcriptWatchers = new Map<string, FSWatcher>()
const sessionCheckInFlight = new Set<string>()

function nowIso(): string {
  return new Date().toISOString()
}

function createEmptyRoutingMetrics(): ChannelRoutingMetrics {
  return {
    startedAt: nowIso(),
    lastPollAt: null,
    pollCount: 0,
    sessionsScanned: 0,
    sessionsRoutable: 0,
    pendingInbound: 0,
    routedCount: 0,
    failedCount: 0,
    dedupedCount: 0,
    skippedDisabledCount: 0,
    skippedNoPendingCount: 0,
    skippedCommandCount: 0,
    skippedCooldownCount: 0,
    lastRoutedAt: null,
    lastRoutedSessionKey: null,
    lastTopicLabel: null,
    lastError: null
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normalizeSessionRoutingState(value: unknown): ChannelRoutingSessionState {
  const row = isPlainRecord(value) ? value : {}
  const read = (entry: unknown): string | null => {
    if (typeof entry !== 'string') return null
    const trimmed = entry.trim()
    return trimmed.length > 0 ? trimmed : null
  }

  const status = row.lastAttemptStatus
  const attemptStatus = status === 'success' || status === 'failed' ? status : null

  return {
    lastUserFingerprint: read(row.lastUserFingerprint),
    lastRoutedFingerprint: read(row.lastRoutedFingerprint),
    lastAttemptFingerprint: read(row.lastAttemptFingerprint),
    lastAttemptAt: read(row.lastAttemptAt),
    lastAttemptStatus: attemptStatus
  }
}

function normalizeRoutingMetrics(value: unknown): ChannelRoutingMetrics {
  const input = isPlainRecord(value) ? value : {}
  const base = createEmptyRoutingMetrics()
  const readString = (entry: unknown): string | null => {
    if (typeof entry !== 'string') return null
    const trimmed = entry.trim()
    return trimmed.length > 0 ? trimmed : null
  }
  const readNumber = (entry: unknown, fallback = 0): number =>
    typeof entry === 'number' && Number.isFinite(entry) ? entry : fallback

  return {
    startedAt: readString(input.startedAt) ?? base.startedAt,
    lastPollAt: readString(input.lastPollAt),
    pollCount: readNumber(input.pollCount),
    sessionsScanned: readNumber(input.sessionsScanned),
    sessionsRoutable: readNumber(input.sessionsRoutable),
    pendingInbound: readNumber(input.pendingInbound),
    routedCount: readNumber(input.routedCount),
    failedCount: readNumber(input.failedCount),
    dedupedCount: readNumber(input.dedupedCount),
    skippedDisabledCount: readNumber(input.skippedDisabledCount),
    skippedNoPendingCount: readNumber(input.skippedNoPendingCount),
    skippedCommandCount: readNumber(input.skippedCommandCount),
    skippedCooldownCount: readNumber(input.skippedCooldownCount),
    lastRoutedAt: readString(input.lastRoutedAt),
    lastRoutedSessionKey: readString(input.lastRoutedSessionKey),
    lastTopicLabel: readString(input.lastTopicLabel),
    lastError: readString(input.lastError)
  }
}

function normalizeRoutingEvents(value: unknown): ChannelRoutingEvent[] {
  if (!Array.isArray(value)) return []

  const events: ChannelRoutingEvent[] = []
  for (const entry of value) {
    const row = isPlainRecord(entry) ? entry : null
    if (!row) continue

    const id = typeof row.id === 'string' ? row.id.trim() : ''
    const at = typeof row.at === 'string' ? row.at.trim() : ''
    const sessionKey = typeof row.sessionKey === 'string' ? row.sessionKey.trim() : ''
    const status = row.status === 'routed' || row.status === 'failed' || row.status === 'skipped'
      ? row.status
      : null
    const reason = typeof row.reason === 'string' ? row.reason.trim() : ''

    if (!id || !at || !sessionKey || !status || !reason) continue

    events.push({
      id,
      at,
      sessionKey,
      status,
      reason,
      topicId: typeof row.topicId === 'string' ? row.topicId : undefined,
      topicLabel: typeof row.topicLabel === 'string' ? row.topicLabel : undefined,
      messagePreview: typeof row.messagePreview === 'string' ? row.messagePreview : undefined
    })
  }

  return events.slice(0, ROUTING_EVENT_LIMIT)
}

function buildRoutingStateDocument(): ChannelRoutingStateDocument {
  const sessions = Object.fromEntries(routeSessionStates.entries())
  return {
    version: ROUTING_STATE_VERSION,
    updatedAt: nowIso(),
    sessions,
    metrics: { ...channelRoutingMetrics },
    events: [...channelRoutingEvents]
  }
}

function flushRouteStateToDisk(): void {
  routeStateFlushTimer = null
  if (!routeStateDirty) return

  try {
    const configDir = join(homedir(), '.pinchr')
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true })
    }
    writeFileSync(CHANNEL_ROUTING_STATE_PATH, JSON.stringify(buildRoutingStateDocument(), null, 2))
    routeStateDirty = false
  } catch (error) {
    console.error('Failed to persist channel routing state:', error)
  }
}

function markRouteStateDirty(): void {
  routeStateDirty = true
  if (routeStateFlushTimer) return
  routeStateFlushTimer = setTimeout(flushRouteStateToDisk, 350)
}

function loadChannelRoutingSettingsFromConfig(): void {
  try {
    if (!existsSync(PINCHR_CONFIG_PATH)) {
      channelRoutingEnabled = true
      return
    }

    const parsed = JSON.parse(readFileSync(PINCHR_CONFIG_PATH, 'utf-8')) as unknown
    const config = isPlainRecord(parsed) ? parsed : {}
    const routing = isPlainRecord(config.routing) ? config.routing : {}
    const channels = isPlainRecord(routing.channels) ? routing.channels : {}
    const raw = channels.topicRoutingEnabled
    channelRoutingEnabled = typeof raw === 'boolean' ? raw : true
  } catch {
    channelRoutingEnabled = true
  }
}

function loadChannelRoutingStateFromDisk(): void {
  channelRoutingMetrics = createEmptyRoutingMetrics()
  channelRoutingEvents = []
  routeSessionStates.clear()

  try {
    if (!existsSync(CHANNEL_ROUTING_STATE_PATH)) return

    const parsed = JSON.parse(readFileSync(CHANNEL_ROUTING_STATE_PATH, 'utf-8')) as unknown
    const root = isPlainRecord(parsed) ? parsed : {}

    const sessions = isPlainRecord(root.sessions) ? root.sessions : {}
    for (const [sessionKey, state] of Object.entries(sessions)) {
      if (!sessionKey.trim()) continue
      routeSessionStates.set(sessionKey, normalizeSessionRoutingState(state))
    }

    channelRoutingMetrics = normalizeRoutingMetrics(root.metrics)
    channelRoutingEvents = normalizeRoutingEvents(root.events)
  } catch (error) {
    console.error('Failed to load channel routing state:', error)
    channelRoutingMetrics = createEmptyRoutingMetrics()
    channelRoutingEvents = []
  }
}

function getOrCreateRouteState(sessionKey: string): ChannelRoutingSessionState {
  const existing = routeSessionStates.get(sessionKey)
  if (existing) return existing

  const next: ChannelRoutingSessionState = {
    lastUserFingerprint: null,
    lastRoutedFingerprint: null,
    lastAttemptFingerprint: null,
    lastAttemptAt: null,
    lastAttemptStatus: null
  }
  routeSessionStates.set(sessionKey, next)
  return next
}

function addRoutingEvent(event: Omit<ChannelRoutingEvent, 'id' | 'at'>): void {
  channelRoutingEvents = [
    {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      at: nowIso(),
      ...event
    },
    ...channelRoutingEvents
  ].slice(0, ROUTING_EVENT_LIMIT)
  markRouteStateDirty()
}

export function getChannelRoutingSettings(): { enabled: boolean } {
  return { enabled: channelRoutingEnabled }
}

export function setChannelRoutingSettings(settings: { enabled?: boolean }): { enabled: boolean } {
  if (typeof settings.enabled === 'boolean') {
    if (channelRoutingEnabled !== settings.enabled) {
      channelRoutingEnabled = settings.enabled
      addRoutingEvent({
        sessionKey: 'system',
        status: 'skipped',
        reason: settings.enabled ? 'routing-enabled' : 'routing-disabled'
      })
      markRouteStateDirty()
    }
  }
  return { enabled: channelRoutingEnabled }
}

export function getChannelRoutingMetrics(): ChannelRoutingMetricsSnapshot {
  return {
    enabled: channelRoutingEnabled,
    metrics: { ...channelRoutingMetrics },
    events: [...channelRoutingEvents]
  }
}

export function startNotificationMonitoring(): void {
  loadChannelRoutingSettingsFromConfig()
  loadChannelRoutingStateFromDisk()

  setInterval(checkForNewMessages, CHANNEL_MONITOR_INTERVAL_MS)
  setTimeout(checkForNewMessages, CHANNEL_MONITOR_INITIAL_DELAY_MS)
}

function closeTranscriptWatcher(sessionKey: string): void {
  const watcher = transcriptWatchers.get(sessionKey)
  if (!watcher) return
  transcriptWatchers.delete(sessionKey)
  try {
    watcher.close()
  } catch {
    // Ignore watcher close errors.
  }
}

function syncTranscriptWatchers(sessions: MonitoredSession[]): void {
  const nextWatchedKeys = new Set<string>()

  for (const session of sessions) {
    if (!isChannelSession(session)) continue
    if (!session.transcriptPath || !existsSync(session.transcriptPath)) continue

    nextWatchedKeys.add(session.key)
    if (transcriptWatchers.has(session.key)) continue

    try {
      const watcher = watch(session.transcriptPath, { persistent: false }, () => {
        const maybeSession = sessions.find((item) => item.key === session.key)
        if (!maybeSession) return
        void checkSessionForNewMessages(maybeSession)
      })
      transcriptWatchers.set(session.key, watcher)
    } catch (error) {
      console.warn(`[ChannelRouter] Failed to watch transcript for ${session.key}:`, error)
    }
  }

  for (const key of transcriptWatchers.keys()) {
    if (!nextWatchedKeys.has(key)) {
      closeTranscriptWatcher(key)
    }
  }
}

async function checkForNewMessages(): Promise<void> {
  if (checkInFlight) return
  checkInFlight = true

  channelRoutingMetrics.pollCount += 1
  channelRoutingMetrics.lastPollAt = nowIso()
  markRouteStateDirty()

  try {
    const sessions = await getSessions() as MonitoredSession[]
    syncTranscriptWatchers(sessions)

    for (const session of sessions) {
      await checkSessionForNewMessages(session)
    }
  } catch (error) {
    const message = String(error)
    channelRoutingMetrics.lastError = message
    markRouteStateDirty()
    console.error('Error checking for new messages:', error)
  } finally {
    checkInFlight = false
  }
}

async function checkSessionForNewMessages(session: MonitoredSession): Promise<void> {
  if (sessionCheckInFlight.has(session.key)) return
  sessionCheckInFlight.add(session.key)
  channelRoutingMetrics.sessionsScanned += 1

  try {
    const messages = await getSessionHistory(session.key) as HistoryMessage[]
    if (!messages || messages.length === 0) return

    const currentState = sessionStates.get(session.key) || {
      lastMessageTime: null,
      lastMessageCount: 0,
      lastUserFingerprint: null
    }

    const latestAssistantMessage = messages
      .filter((msg) => msg.role !== 'user')
      .sort((a, b) => {
        const timeA = new Date(a.timestamp || '').getTime()
        const timeB = new Date(b.timestamp || '').getTime()
        return timeB - timeA
      })[0]

    const latestTimestamp = latestAssistantMessage?.timestamp || ''
    const messageCount = messages.length
    const isNewMessage = latestTimestamp !== currentState.lastMessageTime || messageCount > currentState.lastMessageCount

    if (latestAssistantMessage && isNewMessage && currentState.lastMessageTime !== null) {
      showNotification(session, latestAssistantMessage)
    }

    const latestUserMessage = getLatestUserMessage(messages)
    const latestUserFingerprint = latestUserMessage ? toUserFingerprint(latestUserMessage) : null

    if (isChannelSession(session)) {
      channelRoutingMetrics.sessionsRoutable += 1
      if (latestUserMessage && latestUserFingerprint) {
        await maybeRouteInboundMessage(session, messages, latestUserMessage, latestUserFingerprint)
      }
    }

    sessionStates.set(session.key, {
      lastMessageTime: latestTimestamp,
      lastMessageCount: messageCount,
      lastUserFingerprint: latestUserFingerprint
    })
  } catch (error) {
    const message = String(error)
    channelRoutingMetrics.lastError = message
    markRouteStateDirty()
    console.error(`Error checking session ${session.key}:`, error)
  } finally {
    sessionCheckInFlight.delete(session.key)
  }
}

async function maybeRouteInboundMessage(
  session: MonitoredSession,
  messages: HistoryMessage[],
  latestUserMessage: HistoryMessage,
  latestUserFingerprint: string
): Promise<void> {
  const mainSessionKey = session.key
  const routeState = getOrCreateRouteState(mainSessionKey)
  routeState.lastUserFingerprint = latestUserFingerprint

  const latestUserIndex = findLatestUserMessageIndex(messages)
  const hasAssistantAfterLatestUser = latestUserIndex >= 0 && hasAssistantAfterIndex(messages, latestUserIndex)

  if (!channelRoutingEnabled) {
    channelRoutingMetrics.skippedDisabledCount += 1
    markRouteStateDirty()
    return
  }

  if (latestUserIndex < 0 || hasAssistantAfterLatestUser) {
    channelRoutingMetrics.skippedNoPendingCount += 1
    markRouteStateDirty()
    return
  }

  channelRoutingMetrics.pendingInbound += 1

  if (routeState.lastRoutedFingerprint === latestUserFingerprint) {
    channelRoutingMetrics.dedupedCount += 1
    addRoutingEvent({
      sessionKey: mainSessionKey,
      status: 'skipped',
      reason: 'deduped-already-routed',
      messagePreview: toMessagePreview(latestUserMessage.content)
    })
    return
  }

  const nowMs = Date.now()
  if (
    routeState.lastAttemptFingerprint === latestUserFingerprint &&
    routeState.lastAttemptStatus === 'failed' &&
    routeState.lastAttemptAt
  ) {
    const lastAttemptMs = Date.parse(routeState.lastAttemptAt)
    if (Number.isFinite(lastAttemptMs) && nowMs - lastAttemptMs < ROUTE_FAILURE_COOLDOWN_MS) {
      channelRoutingMetrics.skippedCooldownCount += 1
      addRoutingEvent({
        sessionKey: mainSessionKey,
        status: 'skipped',
        reason: 'failed-cooldown-active',
        messagePreview: toMessagePreview(latestUserMessage.content)
      })
      markRouteStateDirty()
      return
    }
  }

  const sanitizedMessage = normalizeInboundMessageForRouting(latestUserMessage.content)
  if (isCommandMessage(sanitizedMessage)) {
    channelRoutingMetrics.skippedCommandCount += 1
    addRoutingEvent({
      sessionKey: mainSessionKey,
      status: 'skipped',
      reason: 'command-message',
      messagePreview: toMessagePreview(sanitizedMessage)
    })
    markRouteStateDirty()
    return
  }

  routeState.lastAttemptFingerprint = latestUserFingerprint
  routeState.lastAttemptAt = nowIso()
  routeState.lastAttemptStatus = null
  markRouteStateDirty()

  await routeChannelMessage(session, sanitizedMessage, latestUserFingerprint, latestUserMessage)
}

function findLatestUserMessageIndex(messages: HistoryMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role === 'user') {
      return i
    }
  }
  return -1
}

function hasAssistantAfterIndex(messages: HistoryMessage[], index: number): boolean {
  for (let i = index + 1; i < messages.length; i += 1) {
    if (messages[i].role !== 'user') return true
  }
  return false
}

function getLatestUserMessage(messages: HistoryMessage[]): HistoryMessage | null {
  const userMessages = messages.filter((message) => message.role === 'user')
  if (userMessages.length === 0) return null

  return userMessages
    .slice()
    .sort((a, b) => {
      const timeA = new Date(a.timestamp || '').getTime()
      const timeB = new Date(b.timestamp || '').getTime()
      return timeB - timeA
    })[0] ?? null
}

function toUserFingerprint(message: { content: string; timestamp?: string }): string {
  const timestamp = String(message.timestamp || '').trim()
  const content = normalizeInboundMessageForRouting(message.content)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500)
  return `${timestamp}::${content}`
}

function toMessagePreview(message: string): string {
  return message.replace(/\s+/g, ' ').trim().slice(0, 140)
}

function normalizeInboundMessageForRouting(message: string): string {
  const trimmed = message.trim()
  if (!trimmed) return ''

  const looksWrapped =
    /^system:/i.test(trimmed) ||
    /conversation info \(untrusted metadata\)/i.test(trimmed)

  if (!looksWrapped) {
    return trimmed
  }

  // Channel adapters often wrap user text in system metadata blocks; keep only the tail payload when present.
  const blocks = trimmed.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean)
  if (blocks.length >= 2) {
    const tail = blocks[blocks.length - 1]
    const looksLikeMetadata = /conversation info|untrusted metadata|^system:/i.test(tail)
    if (!looksLikeMetadata && tail.length > 0 && tail.length < trimmed.length) {
      return tail
    }
  }

  return trimmed
}

function isCommandMessage(message: string): boolean {
  const normalized = message.trim()
  return normalized.startsWith('/')
}

function isChannelSession(session: { key: string; channel?: string }): boolean {
  const channel = (session.channel || '').trim().toLowerCase()
  if (CHANNEL_ROUTABLE_TYPES.has(channel)) return true

  const key = session.key.toLowerCase()
  return (
    key.includes(':slack:') ||
    key.includes(':whatsapp:') ||
    key.includes(':discord:') ||
    key.includes(':telegram:') ||
    key.includes(':signal:') ||
    key.includes(':imessage:') ||
    key.includes(':webchat:')
  )
}

function extractToolInvokeData(payload: unknown): unknown {
  if (!payload || typeof payload !== 'object') return payload

  const root = payload as Record<string, unknown>
  const result = root.result && typeof root.result === 'object'
    ? root.result as Record<string, unknown>
    : null

  const details = result?.details
  const content = Array.isArray(result?.content) ? result.content : []
  const textChunk = content.find((item) => {
    if (!item || typeof item !== 'object') return false
    const row = item as Record<string, unknown>
    return row.type === 'text' && typeof row.text === 'string'
  }) as { text?: string } | undefined

  if (typeof textChunk?.text === 'string' && textChunk.text.trim()) {
    try {
      return JSON.parse(textChunk.text)
    } catch {
      return details ?? textChunk.text
    }
  }

  if (details !== undefined) return details
  if (result) return result
  if (root.data !== undefined) return root.data
  return root
}

async function invokeGatewayTool(
  tool: string,
  parameters: Record<string, unknown> = {},
  sessionKey?: string
): Promise<unknown> {
  const response = await fetch(`${getGatewayUrl()}/tools/invoke`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      tool,
      args: parameters,
      ...(sessionKey ? { sessionKey } : {})
    })
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`tools/invoke ${tool} failed (${response.status}): ${errorText.slice(0, 300)}`)
  }

  const payload = await response.json() as unknown
  return extractToolInvokeData(payload)
}

async function routeChannelMessage(
  session: MonitoredSession,
  message: string,
  fingerprint: string,
  latestUserMessage: HistoryMessage
): Promise<void> {
  const mainSessionKey = session.key
  const routeState = getOrCreateRouteState(mainSessionKey)
  const messageTimestamp = (latestUserMessage.timestamp || '').trim()
  const sourceMessageId = messageTimestamp ? `${mainSessionKey}:${messageTimestamp}` : undefined

  try {
    const result = await routeMessageToTopicSession({
      workspacePath: resolveWorkspacePathFromGatewayConfig(),
      mainSessionKey,
      message,
      invokeTool: invokeGatewayTool,
      inboundContext: {
        channel: session.channel,
        requestId: fingerprint,
        threadId: mainSessionKey,
        sourceSessionKey: mainSessionKey,
        sourceMessageId,
        sourceFingerprint: fingerprint
      }
    })

    routeState.lastRoutedFingerprint = fingerprint
    routeState.lastAttemptStatus = 'success'

    channelRoutingMetrics.routedCount += 1
    channelRoutingMetrics.lastRoutedAt = nowIso()
    channelRoutingMetrics.lastRoutedSessionKey = mainSessionKey
    channelRoutingMetrics.lastTopicLabel = result.route.topicLabel
    channelRoutingMetrics.lastError = null

    addRoutingEvent({
      sessionKey: mainSessionKey,
      status: 'routed',
      reason: result.route.created ? 'created-topic' : 'matched-topic',
      topicId: result.route.topicId,
      topicLabel: result.route.topicLabel,
      messagePreview: toMessagePreview(message)
    })

    activityLogger.log('api_call', `Channel routed to topic "${result.route.topicLabel}"`, 'allowed', {
      sessionKey: mainSessionKey,
      topicId: result.route.topicId,
      topicSessionKey: result.route.sessionKey,
      created: result.route.created,
      confidence: result.route.confidence
    })
    markRouteStateDirty()
  } catch (error) {
    routeState.lastAttemptStatus = 'failed'

    const errorText = String(error)
    channelRoutingMetrics.failedCount += 1
    channelRoutingMetrics.lastError = errorText

    addRoutingEvent({
      sessionKey: mainSessionKey,
      status: 'failed',
      reason: 'route-error',
      messagePreview: toMessagePreview(message)
    })

    activityLogger.log('api_call', `Channel topic routing failed: ${errorText}`, 'blocked', {
      sessionKey: mainSessionKey
    })
    console.error(`[ChannelRouter] Failed to route message for ${mainSessionKey}:`, error)
    markRouteStateDirty()
  }
}

/** Debounce: only one notification per 10 seconds to prevent spam */
let lastNotificationAt = 0
const NOTIFICATION_DEBOUNCE_MS = 10_000

function showNotification(
  session: { key: string; channel?: string },
  message: { role: string; content: string; timestamp?: string }
): void {
  try {
    // Don't notify when Pinchr is focused and visible
    const focusedWindow = BrowserWindow.getFocusedWindow()
    if (focusedWindow && focusedWindow.isVisible()) return

    // Don't notify for the main/direct session — that's the unified conversation
    // the user sees in Pinchr. Only notify for separate channel sessions.
    const key = session.key.toLowerCase()
    if (key.includes(':direct:') || key.includes(':main:direct:')) return

    // Debounce: prevent rapid-fire duplicate notifications
    const now = Date.now()
    if (now - lastNotificationAt < NOTIFICATION_DEBOUNCE_MS) return
    lastNotificationAt = now

    const channelName = getChannelDisplayName(session.key, session.channel)
    const senderName = message.role === 'assistant' ? 'Assistant' : 'System'

    const preview = message.content.length > 100
      ? `${message.content.substring(0, 97)}...`
      : message.content

    const notification = new Notification({
      title: `${senderName} • ${channelName}`,
      body: preview,
      silent: false,
      icon: undefined
    })

    notification.on('click', () => {
      const mainWindow = BrowserWindow.getAllWindows()
        .find((window) => window.webContents.getURL().includes('index.html'))

      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore()
        mainWindow.show()
        mainWindow.focus()

        mainWindow.webContents.send('notification-clicked', {
          sessionKey: session.key,
          timestamp: message.timestamp
        })
      }
    })

    notification.show()
  } catch (error) {
    console.error('Failed to show notification:', error)
  }
}

function getChannelDisplayName(sessionKey: string, channel?: string): string {
  if (channel) return channel

  if (sessionKey.includes('whatsapp')) return 'WhatsApp'
  if (sessionKey.includes('discord')) return 'Discord'
  if (sessionKey.includes('telegram')) return 'Telegram'
  if (sessionKey.includes('slack')) return 'Slack'
  if (sessionKey.includes('email')) return 'Email'
  if (sessionKey.includes('main')) return 'Main Session'

  const parts = sessionKey.split(':')
  return parts[parts.length - 1] || 'Session'
}
