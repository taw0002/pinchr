import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { stripMessageMetadata } from '../shared/strip-metadata'

type ToolInvoker = (
  tool: string,
  args?: Record<string, unknown>,
  sessionKey?: string
) => Promise<unknown>

interface TopicRouteEntry {
  id: string
  label: string
  sessionKey: string
  mainSessionKey: string
  keywords: string[]
  createdAt: string
  lastActive: string
  messageCount: number
  approxChars: number
  summary?: string
  lastSummaryAt?: string
}

interface TopicRoutingDocument {
  version: 1
  topics: TopicRouteEntry[]
  updatedAt: string
}

export interface RouteMessageResult {
  route: {
    topicId: string
    topicLabel: string
    sessionKey: string
    created: boolean
    confidence: number
  }
  response: {
    text: string
    source: 'tool' | 'main-history' | 'topic-history' | 'fallback'
  }
  envelope: {
    topic_id: string
    topic_label: string
    session_key: string
    confidence: number
    decisions: string[]
    next_actions: string[]
    channel?: string
    request_id?: string
    thread_id?: string
    source_session_key?: string
    source_message_id?: string
    source_fingerprint?: string
  }
}

export interface TopicRouteInboundContext {
  channel?: string
  requestId?: string
  threadId?: string
  sourceSessionKey?: string
  sourceMessageId?: string
  sourceFingerprint?: string
}

const TOPIC_ROUTES_FILENAME = 'topic-sessions.json'
const TOPIC_MEMORY_DIR = 'memory/topics'
const ROUTING_VERSION = 1 as const
const ROUTING_KEYWORD_LIMIT = 12
const ROUTING_MIN_SCORE = 2
const TOPIC_HISTORY_LIMIT = 80
const MAIN_HISTORY_LIMIT = 40
const TOPIC_MAX_MESSAGES = 120
const TOPIC_MAX_APPROX_CHARS = 160_000
const TOPIC_INACTIVE_ARCHIVE_DAYS = 7
const TOPIC_MAX_PER_MAIN_SESSION = 32
const TOPIC_ARCHIVE_DIR = 'memory/topics/archive'
const CHANNEL_HINTS = new Set([
  'slack',
  'whatsapp',
  'telegram',
  'discord',
  'signal',
  'imessage',
  'webchat',
  'pinchr',
  'pinchr-desktop',
  'voice'
])
const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'for', 'from', 'has', 'have', 'how',
  'i', 'if', 'in', 'is', 'it', 'its', 'let', 'me', 'my', 'of', 'on', 'or', 'our', 'please',
  'that', 'the', 'their', 'there', 'these', 'this', 'to', 'we', 'what', 'when', 'where', 'which',
  'who', 'why', 'with', 'you', 'your', 'can', 'could', 'should', 'would', 'will', 'about', 'into',
  'just', 'need', 'needs', 'also', 'than', 'then', 'them', 'they', 'was', 'were', 'been', 'do',
  'does', 'did', 'done'
])

function nowIso(): string {
  return new Date().toISOString()
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
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const unique = new Set<string>()
  for (const item of value) {
    const text = readString(item)
    if (!text) continue
    unique.add(text.toLowerCase())
  }
  return Array.from(unique)
}

function ensureDocShape(value: unknown): TopicRoutingDocument {
  const root = asRecord(value)
  if (!root) {
    return { version: ROUTING_VERSION, topics: [], updatedAt: nowIso() }
  }

  const rawTopics = Array.isArray(root.topics) ? root.topics : []
  const topics: TopicRouteEntry[] = []
  for (const entry of rawTopics) {
    const row = asRecord(entry)
    if (!row) continue

    const id = readString(row.id)
    const label = readString(row.label)
    const sessionKey = readString(row.sessionKey)
    const mainSessionKey = readString(row.mainSessionKey)
    if (!id || !label || !sessionKey || !mainSessionKey) continue

    topics.push({
      id,
      label,
      sessionKey,
      mainSessionKey,
      keywords: toStringArray(row.keywords).slice(0, ROUTING_KEYWORD_LIMIT),
      createdAt: readString(row.createdAt) ?? nowIso(),
      lastActive: readString(row.lastActive) ?? nowIso(),
      messageCount: readNumber(row.messageCount) ?? 0,
      approxChars: readNumber(row.approxChars) ?? 0,
      summary: readString(row.summary),
      lastSummaryAt: readString(row.lastSummaryAt)
    })
  }

  return {
    version: ROUTING_VERSION,
    topics,
    updatedAt: readString(root.updatedAt) ?? nowIso()
  }
}

function readRoutingDoc(workspacePath: string): TopicRoutingDocument {
  const filePath = join(workspacePath, TOPIC_ROUTES_FILENAME)
  try {
    if (!existsSync(filePath)) {
      return { version: ROUTING_VERSION, topics: [], updatedAt: nowIso() }
    }
    const raw = readFileSync(filePath, 'utf-8')
    const parsed = JSON.parse(raw) as unknown
    return ensureDocShape(parsed)
  } catch {
    return { version: ROUTING_VERSION, topics: [], updatedAt: nowIso() }
  }
}

function writeRoutingDoc(workspacePath: string, doc: TopicRoutingDocument): void {
  const filePath = join(workspacePath, TOPIC_ROUTES_FILENAME)
  const next = {
    ...doc,
    version: ROUTING_VERSION,
    updatedAt: nowIso()
  }
  writeFileSync(filePath, JSON.stringify(next, null, 2))
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 48) || 'topic'
}

function toTitleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token))
}

function topKeywords(text: string, limit: number): string[] {
  const counts = new Map<string, number>()
  for (const token of tokenize(text)) {
    counts.set(token, (counts.get(token) ?? 0) + 1)
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([token]) => token)
}

function deriveTopicLabel(message: string): string {
  const keywords = topKeywords(message, 5)
  if (keywords.length === 0) return 'General Topic'
  return toTitleCase(keywords.join(' '))
}

function scoreTopic(messageKeywords: Set<string>, topic: TopicRouteEntry): number {
  const topicTokens = new Set<string>([...topic.keywords, ...tokenize(topic.label)])
  let score = 0
  for (const token of messageKeywords) {
    if (topicTokens.has(token)) score += 1
  }
  return score
}

function pickTopic(
  doc: TopicRoutingDocument,
  mainSessionKey: string,
  message: string
): { topic?: TopicRouteEntry; confidence: number } {
  const messageTokens = new Set<string>(topKeywords(message, ROUTING_KEYWORD_LIMIT))
  const candidates = doc.topics.filter((topic) => topic.mainSessionKey === mainSessionKey)
  if (candidates.length === 0 || messageTokens.size === 0) return { confidence: 0 }

  let best: TopicRouteEntry | undefined
  let bestScore = 0
  for (const topic of candidates) {
    const score = scoreTopic(messageTokens, topic)
    if (score > bestScore) {
      best = topic
      bestScore = score
    }
  }

  if (!best || bestScore < ROUTING_MIN_SCORE) return { confidence: 0 }
  return { topic: best, confidence: bestScore / Math.max(messageTokens.size, 1) }
}

function findSessionKey(value: unknown): string | null {
  if (typeof value === 'string') {
    if (value.startsWith('agent:')) return value
    return null
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = findSessionKey(entry)
      if (found) return found
    }
    return null
  }

  const root = asRecord(value)
  if (!root) return null

  const directCandidates = [
    root.sessionKey,
    root.childSessionKey,
    root.child_session_key,
    root.key,
    root.session_id,
    root.sessionId
  ]
  for (const candidate of directCandidates) {
    if (typeof candidate === 'string' && candidate.startsWith('agent:')) return candidate
  }

  for (const nestedKey of ['data', 'result', 'details', 'session', 'child']) {
    const found = findSessionKey(root[nestedKey])
    if (found) return found
  }

  return null
}

function extractTextFromUnknown(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    return value.map((entry) => extractTextFromUnknown(entry)).join('\n').trim()
  }

  const root = asRecord(value)
  if (!root) return ''

  const direct = [root.text, root.content, root.value, root.summary]
    .map((entry) => (typeof entry === 'string' ? entry : ''))
    .filter(Boolean)
    .join('\n')
    .trim()
  if (direct) return direct

  const nestedKeys = ['message', 'messages', 'data', 'result', 'details', 'response', 'announce']
  for (const key of nestedKeys) {
    const text = extractTextFromUnknown(root[key])
    if (text) return text
  }

  return ''
}

function normalizeHistoryMessages(payload: unknown): Array<{ role: string; content: string }> {
  const root = asRecord(payload)
  const entries = Array.isArray(root?.messages)
    ? root.messages
    : Array.isArray(payload)
      ? payload
      : []

  const messages: Array<{ role: string; content: string }> = []
  for (const entry of entries) {
    const row = asRecord(entry)
    if (!row) continue
    const role = readString(row.role) ?? 'system'
    const content = extractTextFromUnknown(row.content)
    if (!content.trim()) continue
    messages.push({ role, content: content.trim() })
  }

  return messages
}

async function getHistory(
  invokeTool: ToolInvoker,
  sessionKey: string,
  limit: number
): Promise<Array<{ role: string; content: string }>> {
  const history = await invokeTool('sessions_history', { sessionKey, limit }, sessionKey)
  return normalizeHistoryMessages(history)
}

async function spawnTopicSession(
  invokeTool: ToolInvoker,
  mainSessionKey: string,
  label: string,
  topicId: string,
  inboundContext?: TopicRouteInboundContext
): Promise<string> {
  const task = [
    `Create or resume a focused sub-session for topic "${label}".`,
    'Keep this thread scoped tightly to the topic and preserve important decisions.',
    'Do not announce setup details; only report final task output when asked.'
  ].join(' ')

  const spawnResult = await invokeTool(
    'sessions_spawn',
    {
      task,
      mode: 'subagent',
      cleanup: 'keep',
      runTimeoutSeconds: 20,
      noAnnounce: true,
      metadata: {
        topicId,
        topicLabel: label,
        ...(inboundContext?.channel ? { channel: inboundContext.channel } : {}),
        ...(inboundContext?.threadId ? { threadId: inboundContext.threadId } : {}),
        ...(inboundContext?.sourceSessionKey ? { sourceSessionKey: inboundContext.sourceSessionKey } : {})
      }
    },
    mainSessionKey
  )

  const childSessionKey = findSessionKey(spawnResult)
  if (!childSessionKey) {
    throw new Error(`sessions_spawn succeeded without a child session key for topic "${label}"`)
  }

  return childSessionKey
}

function extractLatestAssistantMessage(messages: Array<{ role: string; content: string }>): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const entry = messages[i]
    if (entry.role === 'assistant' && entry.content.trim()) {
      return entry.content.trim()
    }
  }
  return ''
}

function inferChannelFromSessionKey(sessionKey: string | undefined): string | undefined {
  if (!sessionKey) return undefined
  const tokens = sessionKey
    .split(':')
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean)
  for (const token of tokens) {
    if (CHANNEL_HINTS.has(token)) return token === 'pinchr-desktop' ? 'pinchr' : token
  }
  return undefined
}

function extractConversationMetadataPayload(text: string): Record<string, unknown> | null {
  if (!text) return null
  const patterns = [
    /Conversation info \(untrusted metadata\):\s*```json\s*(\{[\s\S]*?\})\s*```/gi,
    /Conversation info \(untrusted metadata\):\s*(\{[\s\S]*?\})/gi
  ]

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const candidate = match[1]
      if (!candidate) continue
      try {
        const parsed = JSON.parse(candidate) as unknown
        const record = asRecord(parsed)
        if (record) return record
      } catch {
        // Ignore malformed metadata blocks.
      }
    }
  }

  return null
}

function getContextString(source: Record<string, unknown> | null, keys: string[]): string | undefined {
  if (!source) return undefined
  for (const key of keys) {
    const value = readString(source[key])
    if (value) return value
  }
  return undefined
}

function resolveInboundContext(
  mainSessionKey: string,
  rawMessage: string,
  providedContext?: TopicRouteInboundContext
): TopicRouteInboundContext {
  const metadataContext = extractConversationMetadataPayload(rawMessage)
  const sourceSessionKey =
    readString(providedContext?.sourceSessionKey) ??
    getContextString(metadataContext, ['source_session_key', 'sourceSessionKey', 'session_key', 'sessionKey']) ??
    mainSessionKey

  const context: TopicRouteInboundContext = {
    sourceSessionKey
  }

  const channel =
    readString(providedContext?.channel)?.toLowerCase() ??
    getContextString(metadataContext, ['channel'])?.toLowerCase() ??
    inferChannelFromSessionKey(sourceSessionKey) ??
    inferChannelFromSessionKey(mainSessionKey)
  if (channel) context.channel = channel

  const requestId =
    readString(providedContext?.requestId) ??
    getContextString(metadataContext, ['request_id', 'requestId'])
  if (requestId) context.requestId = requestId

  const threadId =
    readString(providedContext?.threadId) ??
    getContextString(metadataContext, ['thread_id', 'threadId', 'conversation_id', 'conversationId']) ??
    sourceSessionKey
  if (threadId) context.threadId = threadId

  const sourceMessageId =
    readString(providedContext?.sourceMessageId) ??
    getContextString(metadataContext, ['source_message_id', 'sourceMessageId', 'message_id', 'messageId'])
  if (sourceMessageId) context.sourceMessageId = sourceMessageId

  const sourceFingerprint =
    readString(providedContext?.sourceFingerprint) ??
    getContextString(metadataContext, ['source_fingerprint', 'sourceFingerprint'])
  if (sourceFingerprint) context.sourceFingerprint = sourceFingerprint

  return context
}

function buildTopicMetadataBlock(topic: TopicRouteEntry, inboundContext?: TopicRouteInboundContext): string {
  const payload: Record<string, string> = {
    topic_id: topic.id,
    topic_label: topic.label,
    session_key: topic.sessionKey,
    main_session_key: topic.mainSessionKey
  }
  if (inboundContext?.channel) payload.channel = inboundContext.channel
  if (inboundContext?.requestId) payload.request_id = inboundContext.requestId
  if (inboundContext?.threadId) payload.thread_id = inboundContext.threadId
  if (inboundContext?.sourceSessionKey) payload.source_session_key = inboundContext.sourceSessionKey
  if (inboundContext?.sourceMessageId) payload.source_message_id = inboundContext.sourceMessageId
  if (inboundContext?.sourceFingerprint) payload.source_fingerprint = inboundContext.sourceFingerprint

  return [
    'Conversation info (untrusted metadata):',
    '```json',
    JSON.stringify(payload, null, 2),
    '```',
    ''
  ].join('\n')
}

function appendTopicSummary(
  workspacePath: string,
  topic: TopicRouteEntry,
  summary: string
): void {
  if (!summary.trim()) return

  const dirPath = join(workspacePath, TOPIC_MEMORY_DIR)
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true })
  }

  const memoryPath = join(dirPath, `${topic.id}.md`)
  const heading = `## ${new Date().toISOString()}`
  const body = [heading, `Session: ${topic.sessionKey}`, '', summary.trim(), ''].join('\n')
  const existing = existsSync(memoryPath) ? readFileSync(memoryPath, 'utf-8') : ''
  const next = existing.trim() ? `${existing.trim()}\n\n${body}` : `${body}\n`
  writeFileSync(memoryPath, next)
}

function parseIsoToMs(value: string | undefined): number {
  if (!value) return 0
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function appendTopicArchiveEntry(
  workspacePath: string,
  topic: TopicRouteEntry,
  reason: 'inactive' | 'overflow'
): void {
  const archiveDirPath = join(workspacePath, TOPIC_ARCHIVE_DIR)
  if (!existsSync(archiveDirPath)) {
    mkdirSync(archiveDirPath, { recursive: true })
  }

  const archivePath = join(archiveDirPath, `${topic.id}.md`)
  const heading = `## ${nowIso()}`
  const summary = topic.summary?.trim() ? topic.summary.trim() : '_No summary captured._'
  const body = [
    heading,
    `Reason: ${reason}`,
    `Label: ${topic.label}`,
    `Topic ID: ${topic.id}`,
    `Session: ${topic.sessionKey}`,
    `Main Session: ${topic.mainSessionKey}`,
    `Last Active: ${topic.lastActive}`,
    '',
    summary,
    ''
  ].join('\n')

  const existing = existsSync(archivePath) ? readFileSync(archivePath, 'utf-8').trim() : ''
  const next = existing ? `${existing}\n\n${body}` : `${body}\n`
  writeFileSync(archivePath, next)
}

function cleanupTopicLifecycle(
  workspacePath: string,
  doc: TopicRoutingDocument,
  mainSessionKey: string
): string[] {
  const actions: string[] = []
  const cutoffMs = Date.now() - TOPIC_INACTIVE_ARCHIVE_DAYS * 24 * 60 * 60 * 1000
  const removedTopicIds = new Set<string>()

  for (const topic of doc.topics) {
    if (topic.mainSessionKey !== mainSessionKey) continue
    const lastActiveMs = parseIsoToMs(topic.lastActive)
    if (lastActiveMs > 0 && lastActiveMs < cutoffMs) {
      removedTopicIds.add(topic.id)
      appendTopicArchiveEntry(workspacePath, topic, 'inactive')
      actions.push(`Archived inactive topic "${topic.label}"`)
    }
  }

  if (removedTopicIds.size > 0) {
    doc.topics = doc.topics.filter((topic) => !removedTopicIds.has(topic.id))
  }

  const mainTopics = doc.topics.filter((topic) => topic.mainSessionKey === mainSessionKey)
  if (mainTopics.length > TOPIC_MAX_PER_MAIN_SESSION) {
    const overflow = mainTopics
      .slice()
      .sort((a, b) => parseIsoToMs(a.lastActive) - parseIsoToMs(b.lastActive))
      .slice(0, mainTopics.length - TOPIC_MAX_PER_MAIN_SESSION)

    for (const topic of overflow) {
      removedTopicIds.add(topic.id)
      appendTopicArchiveEntry(workspacePath, topic, 'overflow')
      actions.push(`Archived overflow topic "${topic.label}"`)
    }

    doc.topics = doc.topics.filter((topic) => !removedTopicIds.has(topic.id))
  }

  return actions
}

async function maybeCompactTopic(
  invokeTool: ToolInvoker,
  workspacePath: string,
  mainSessionKey: string,
  topic: TopicRouteEntry
): Promise<void> {
  if (topic.messageCount < TOPIC_MAX_MESSAGES && topic.approxChars < TOPIC_MAX_APPROX_CHARS) return

  const summarizePrompt = [
    'Provide a concise persistent summary for this topic session.',
    'Include:',
    '1) decisions made',
    '2) open issues',
    '3) important constraints',
    '4) next concrete actions',
    'Keep it under 220 words.'
  ].join('\n')

  let summary = ''
  try {
    const summarizeResult = await invokeTool(
      'sessions_send',
      {
        sessionKey: topic.sessionKey,
        message: summarizePrompt,
        timeoutSeconds: 90,
        noAnnounce: true
      },
      mainSessionKey
    )
    summary = extractTextFromUnknown(summarizeResult)
  } catch {
    summary = ''
  }

  if (!summary) {
    const topicHistory = await getHistory(invokeTool, topic.sessionKey, TOPIC_HISTORY_LIMIT)
    summary = extractLatestAssistantMessage(topicHistory)
  }

  if (!summary) return

  topic.summary = summary
  topic.lastSummaryAt = nowIso()
  topic.messageCount = 0
  topic.approxChars = 0
  appendTopicSummary(workspacePath, topic, summary)
}

export async function routeMessageToTopicSession(options: {
  workspacePath: string
  mainSessionKey: string
  message: string
  invokeTool: ToolInvoker
  inboundContext?: TopicRouteInboundContext
  onProgress?: (status: string) => void | Promise<void>
}): Promise<RouteMessageResult> {
  const { workspacePath, mainSessionKey, message, invokeTool, inboundContext, onProgress } = options
  const trimmedMessage = message.trim()
  if (!trimmedMessage) {
    throw new Error('Cannot route an empty message')
  }
  const resolvedInboundContext = resolveInboundContext(mainSessionKey, trimmedMessage, inboundContext)
  const reportProgress = async (status: string): Promise<void> => {
    if (!onProgress) return
    try {
      await onProgress(status)
    } catch {
      // Progress callbacks must never break routing.
    }
  }
  await reportProgress('Classifying your request...')

  // Strip OpenClaw envelope metadata before topic analysis.
  // Raw messages include conversation_info JSON, queued headers, media attachment
  // metadata, etc. that produce garbage topic keywords (#drew, #metadata, #json).
  const cleanMessage = stripMessageMetadata(trimmedMessage)
  if (!cleanMessage) {
    throw new Error('Cannot route an empty message (after metadata stripping)')
  }

  const doc = readRoutingDoc(workspacePath)
  const lifecycleActions = cleanupTopicLifecycle(workspacePath, doc, mainSessionKey)
  if (lifecycleActions.length > 0) {
    await reportProgress('Refreshing topic memory...')
  }
  const beforeMainHistory = await getHistory(invokeTool, mainSessionKey, MAIN_HISTORY_LIMIT)
  const picked = pickTopic(doc, mainSessionKey, cleanMessage)

  let topic = picked.topic
  let created = false
  let confidence = picked.confidence

  if (!topic) {
    await reportProgress('Creating a focused topic thread...')
    const label = deriveTopicLabel(cleanMessage)
    const topicId = `${slugify(label)}-${Math.random().toString(36).slice(2, 7)}`
    const sessionKey = await spawnTopicSession(
      invokeTool,
      mainSessionKey,
      label,
      topicId,
      resolvedInboundContext
    )

    topic = {
      id: topicId,
      label,
      sessionKey,
      mainSessionKey,
      keywords: topKeywords(cleanMessage, ROUTING_KEYWORD_LIMIT),
      createdAt: nowIso(),
      lastActive: nowIso(),
      messageCount: 0,
      approxChars: 0
    }
    created = true
    confidence = 1
    doc.topics.push(topic)
  } else {
    await reportProgress(`Continuing in topic: ${topic.label}`)
  }

  // Build message with context for new topics
  let messageToSend = trimmedMessage
  if (created && beforeMainHistory.length > 0) {
    // Include recent context from main session when creating new topic
    const recentContext = beforeMainHistory
      .slice(-5) // Last 5 messages
      .map((msg) => `${msg.role}: ${msg.content}`)
      .join('\n\n')

    messageToSend = [
      '## Recent Context',
      recentContext,
      '',
      '## Current Request',
      trimmedMessage
    ].join('\n')
  }

  // Persist topic routing metadata in-session so the renderer can filter by topic turns.
  messageToSend = `${buildTopicMetadataBlock(topic, resolvedInboundContext)}${messageToSend}`
  await reportProgress('Working through the request...')

  const sendResult = await invokeTool(
    'sessions_send',
    {
      sessionKey: topic.sessionKey,
      message: messageToSend,
      timeoutSeconds: 120
    },
    mainSessionKey
  )

  let responseText = extractTextFromUnknown(sendResult)
  let responseSource: RouteMessageResult['response']['source'] = responseText ? 'tool' : 'fallback'

  if (!responseText) {
    await reportProgress('Collecting response from session history...')
    const afterMainHistory = await getHistory(invokeTool, mainSessionKey, MAIN_HISTORY_LIMIT)
    const newMessages = afterMainHistory.slice(beforeMainHistory.length)
    responseText = extractLatestAssistantMessage(newMessages)
    if (responseText) responseSource = 'main-history'
  }

  if (!responseText) {
    await reportProgress('Checking topic thread for latest response...')
    const topicHistory = await getHistory(invokeTool, topic.sessionKey, TOPIC_HISTORY_LIMIT)
    responseText = extractLatestAssistantMessage(topicHistory)
    if (responseText) responseSource = 'topic-history'
  }

  if (!responseText) {
    responseText = 'Routed to topic session. No assistant text was returned yet.'
    responseSource = 'fallback'
  }

  topic.lastActive = nowIso()
  topic.messageCount += 1
  topic.approxChars += trimmedMessage.length + responseText.length
  topic.keywords = Array.from(
    new Set<string>([...topic.keywords, ...topKeywords(cleanMessage, 6)])
  ).slice(0, ROUTING_KEYWORD_LIMIT)

  await maybeCompactTopic(invokeTool, workspacePath, mainSessionKey, topic)
  writeRoutingDoc(workspacePath, doc)
  await reportProgress('Preparing final answer...')

  const decisions = [
    created
      ? `Created new topic thread "${topic.label}" and routed message there.`
      : `Routed message to existing topic "${topic.label}".`,
    `Primary execution session: ${topic.sessionKey}`
  ]
  const nextActions = lifecycleActions

  return {
    route: {
      topicId: topic.id,
      topicLabel: topic.label,
      sessionKey: topic.sessionKey,
      created,
      confidence
    },
    response: {
      text: responseText,
      source: responseSource
    },
    envelope: {
      topic_id: topic.id,
      topic_label: topic.label,
      session_key: topic.sessionKey,
      confidence,
      decisions,
      next_actions: nextActions,
      ...(resolvedInboundContext.channel ? { channel: resolvedInboundContext.channel } : {}),
      ...(resolvedInboundContext.requestId ? { request_id: resolvedInboundContext.requestId } : {}),
      ...(resolvedInboundContext.threadId ? { thread_id: resolvedInboundContext.threadId } : {}),
      ...(resolvedInboundContext.sourceSessionKey
        ? { source_session_key: resolvedInboundContext.sourceSessionKey }
        : {}),
      ...(resolvedInboundContext.sourceMessageId
        ? { source_message_id: resolvedInboundContext.sourceMessageId }
        : {}),
      ...(resolvedInboundContext.sourceFingerprint
        ? { source_fingerprint: resolvedInboundContext.sourceFingerprint }
        : {})
    }
  }
}
