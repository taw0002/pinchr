import type { Message, MessageContentPart, PinchrSession } from '../../../../shared/types'
import { stripMessageMetadata, extractChannelFromMetadata } from '../../../../shared/strip-metadata'
import type { DisplayMessage } from './chatTypes'

export const PINCHR_SESSION_KEY = 'agent:main:openai-user:pinchr'
export const PINCHR_SESSIONS_STORAGE_KEY = 'pinchr-sessions'
export const CHAT_PREFILL_STORAGE_KEY = 'pinchr:chat-prefill'
export const CHAT_PREFILL_EVENT = 'pinchr:prefill-chat-input'
export const NEW_CHAT_NAME = 'New Chat'
export const PRIMARY_CHANNELS = ['slack', 'whatsapp', 'telegram', 'discord', 'signal', 'imessage', 'webchat', 'main']

export const ACCEPTED_FILE_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp',
  '.pdf', '.md', '.txt',
  '.ts', '.tsx', '.js', '.py', '.json'
])

export const ACCEPTED_MIME_PREFIXES = ['image/']

export interface ToolArtifact {
  hideText: boolean
  toolName?: string
  toolResult?: string
  subAgentEvent?: {
    description: string
    status: 'running' | 'completed'
    summary?: string
  }
}

// ---------------------------------------------------------------------------
// Tool Call Visibility & Smart Display
// ---------------------------------------------------------------------------

export type ToolVisibility = 'show' | 'collapse' | 'hide'

const HIDDEN_TOOLS = new Set([
  'memory_search', 'memory_get',
  'session_status', 'sessions_list', 'sessions_history',
  'streamText', 'stream_text', 'generate_text',
  'heartbeat', 'compaction',
  'process',
])

const COLLAPSED_TOOLS = new Set([
  'sessions_spawn', 'sessions_send',
  'gateway', 'cron',
])

const TOOL_DISPLAY_CONFIG: Record<string, { icon: string; labelFn: (args: Record<string, unknown>) => string }> = {
  web_search: {
    icon: '🔍',
    labelFn: (args) => `Searching: ${String(args.query || 'the web').slice(0, 80)}`
  },
  web_fetch: {
    icon: '🌐',
    labelFn: (args) => {
      try { return `Reading: ${new URL(String(args.url || '')).hostname}` }
      catch { return `Fetching URL` }
    }
  },
  browser: {
    icon: '🌐',
    labelFn: (args) => `Browser: ${String(args.action || 'navigating')}${args.targetUrl ? ` → ${String(args.targetUrl).slice(0, 60)}` : ''}`
  },
  read: {
    icon: '📄',
    labelFn: (args) => {
      const path = String(args.path || args.file_path || '')
      const filename = path.split('/').pop() || path
      return `Reading ${filename}`
    }
  },
  write: {
    icon: '✏️',
    labelFn: (args) => {
      const path = String(args.path || args.file_path || '')
      const filename = path.split('/').pop() || path
      return `Wrote ${filename}`
    }
  },
  edit: {
    icon: '✏️',
    labelFn: (args) => {
      const path = String(args.path || args.file_path || '')
      const filename = path.split('/').pop() || path
      return `Edited ${filename}`
    }
  },
  exec: {
    icon: '⚡',
    labelFn: (args) => {
      const cmd = String(args.command || '').slice(0, 60)
      return `Running: ${cmd}${String(args.command || '').length > 60 ? '…' : ''}`
    }
  },
  message: {
    icon: '💬',
    labelFn: (args) => `Sent message${args.target ? ` to ${String(args.target)}` : ''}`
  },
  tts: { icon: '🔊', labelFn: () => 'Converting to audio...' },
  image: { icon: '🖼️', labelFn: () => 'Analyzing image...' },
  nodes: {
    icon: '🖥️',
    labelFn: (args) => `Running on ${String(args.node || 'node')}...`
  },
  sessions_spawn: {
    icon: '🚀',
    labelFn: (args) => `Started task: ${String(args.task || args.label || 'background work').slice(0, 60)}`
  },
  topic_router: {
    icon: '🧭',
    labelFn: (args) => {
      const label = String(args.topic_label || args.topicLabel || args.route || '').trim()
      return label ? `Routing to topic: ${label.slice(0, 60)}` : 'Routing to the best topic'
    }
  },
  sessions_send: {
    icon: '💼',
    labelFn: (args) => {
      const sessionKey = String(args.sessionKey || args.session_key || '')
      if (sessionKey) return `Working in ${sessionKey.split(':').slice(-1)[0] || 'topic session'}`
      return 'Working in focused topic thread'
    }
  },
  sessions_history: {
    icon: '🗂️',
    labelFn: () => 'Reading recent message history'
  },
}

export function getToolVisibility(toolName: string): ToolVisibility {
  const normalized = toolName.toLowerCase().replace(/[^a-z_]/g, '')
  if (HIDDEN_TOOLS.has(normalized) || HIDDEN_TOOLS.has(toolName)) return 'hide'
  if (COLLAPSED_TOOLS.has(normalized) || COLLAPSED_TOOLS.has(toolName)) return 'collapse'
  return 'show'
}

export function formatToolDisplay(toolName: string, argsJson?: string): { icon: string; label: string } | null {
  const config = TOOL_DISPLAY_CONFIG[toolName]
  if (!config) return { icon: '🔧', label: toolName }

  let args: Record<string, unknown> = {}
  if (argsJson) {
    try { args = JSON.parse(argsJson) as Record<string, unknown> } catch { /* ignore */ }
  }

  return { icon: config.icon, label: config.labelFn(args) }
}

// ---------------------------------------------------------------------------
// System Message Filtering
// ---------------------------------------------------------------------------

export type SystemMessageDisplay = 'hide' | 'pill' | 'normal'

const COMPACTION_MARKERS = [
  'the conversation history before this point was compacted',
  'pre-compaction memory flush',
  'context window compaction',
  '<summary>',
]

const HIDDEN_SYSTEM_MARKERS = [
  'heartbeat_ok',
  'no_reply',
  'read heartbeat.md if it exists',
]

/** Patterns that should be hidden regardless of message role (heartbeats, cron noise, etc.) */
const HIDDEN_ANY_ROLE_MARKERS = [
  'heartbeat_ok',
  'no_reply',
  'read heartbeat.md if it exists',
  'work_mode:',
  'a scheduled reminder has been triggered',
  'please relay this reminder to the user',
  'current time:',
]

export function getSystemMessageDisplay(message: { role?: string; content?: string }): SystemMessageDisplay {
  const content = (message.content || '').toLowerCase().trim()
  if (!content) return 'hide'

  // Hide heartbeat/cron noise regardless of role (these show as user messages too)
  for (const marker of HIDDEN_ANY_ROLE_MARKERS) {
    if (content === marker || content.startsWith(marker)) return 'hide'
  }

  // For user-role messages that look like heartbeat prompts with timestamps
  if (message.role === 'user') {
    if (content.includes('read heartbeat.md') || content.includes('heartbeat_ok') || content.includes('work_mode:')) {
      return 'hide'
    }
    // Cron-injected user messages with "Current time:" appended
    if (content.includes('current time:') && content.includes('america/')) {
      // Check if it's just a heartbeat prompt + timestamp
      if (content.includes('heartbeat') || content.includes('work_mode') || content.includes('scheduled reminder')) {
        return 'hide'
      }
    }
    return 'normal'
  }

  if (message.role !== 'system' && message.role !== 'assistant') return 'normal'

  // Hide heartbeats and no-reply
  for (const marker of HIDDEN_SYSTEM_MARKERS) {
    if (content === marker || content.startsWith(marker)) return 'hide'
  }

  // Compaction → pill
  for (const marker of COMPACTION_MARKERS) {
    if (content.includes(marker)) return 'pill'
  }

  // System messages that are just metadata
  if (message.role === 'system') {
    // If the entire content is JSON metadata, hide it
    if (content.startsWith('{') || content.startsWith('[')) {
      try {
        JSON.parse(content)
        return 'hide'
      } catch { /* not JSON, show normally */ }
    }
  }

  return 'normal'
}

export function normalizeComparableText(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase()
}

export function parseIsoTimestamp(timestamp?: string): number {
  if (!timestamp) return 0
  const parsed = new Date(timestamp).getTime()
  return Number.isFinite(parsed) ? parsed : 0
}

export function normalizeMessageRole(role: unknown): Message['role'] {
  const normalized = typeof role === 'string' ? role.trim().toLowerCase() : ''
  if (normalized === 'user' || normalized === 'human') return 'user'
  if (normalized === 'assistant' || normalized === 'ai' || normalized === 'model' || normalized === 'bot') return 'assistant'
  return 'system'
}

export function stripThinkingMarkers(text: string): string {
  return text.replace(/<\/?think>/gi, '').replace(/^thinking:\s*/i, '').replace(/^reasoning:\s*/i, '')
}

export function looksLikeThinkingPrefix(text: string): boolean {
  const normalized = text.trimStart().toLowerCase()
  return (
    normalized.startsWith('<think>') ||
    normalized.startsWith('thinking:') ||
    normalized.startsWith('reasoning:') ||
    normalized.startsWith('let me think') ||
    normalized.startsWith('hmm')
  )
}

export function shouldSuppressAssistantMessage(message: DisplayMessage, streamingContent: string, streamingTimestamp: string): boolean {
  if (normalizeMessageRole(message.role) !== 'assistant') return false

  const assistantContent = normalizeComparableText(message.content || '')
  const normalizedStreaming = normalizeComparableText(streamingContent || '')
  const assistantTimestamp = parseIsoTimestamp(message.timestamp)
  const streamTimestamp = parseIsoTimestamp(streamingTimestamp)
  const now = Date.now()
  const isRecent =
    (assistantTimestamp > 0 && now - assistantTimestamp <= 30_000) ||
    (assistantTimestamp > 0 && streamTimestamp > 0 && Math.abs(streamTimestamp - assistantTimestamp) <= 30_000)

  if (!assistantContent || !normalizedStreaming) {
    return isRecent
  }

  if (assistantContent.includes(normalizedStreaming) || normalizedStreaming.includes(assistantContent)) {
    return true
  }

  const leadingWindow = normalizedStreaming.slice(0, Math.min(200, normalizedStreaming.length))
  if (leadingWindow && assistantContent.includes(leadingWindow)) {
    return true
  }

  return false
}

export function sortPinchrSessions(sessions: PinchrSession[]): PinchrSession[] {
  return [...sessions].sort((a, b) => b.updatedAt - a.updatedAt)
}

export function createDefaultPinchrSession(): PinchrSession {
  const now = Date.now()
  return {
    id: crypto.randomUUID(),
    name: NEW_CHAT_NAME,
    sessionKey: PINCHR_SESSION_KEY,
    createdAt: now,
    updatedAt: now,
    archived: false
  }
}

export function createPinchrSession(name = NEW_CHAT_NAME): PinchrSession {
  const id = crypto.randomUUID()
  const now = Date.now()
  return {
    id,
    name,
    sessionKey: `agent:main:openai-user:pinchr-${id}`,
    createdAt: now,
    updatedAt: now,
    archived: false
  }
}

export function isPinchrSessionKey(sessionKey: string): boolean {
  return sessionKey === PINCHR_SESSION_KEY || /^agent:main:openai-user:pinchr-[0-9a-f-]+$/i.test(sessionKey)
}

export function toSessionUser(session: PinchrSession): string {
  const suffix = session.sessionKey.split(':').pop() || ''
  if (suffix) return suffix
  return `pinchr-${session.id}`
}

export function parsePinchrSession(raw: unknown): PinchrSession | null {
  const session = raw as Partial<PinchrSession> | null
  if (!session || typeof session !== 'object') return null

  if (
    typeof session.id !== 'string' ||
    typeof session.name !== 'string' ||
    typeof session.sessionKey !== 'string' ||
    typeof session.createdAt !== 'number' ||
    typeof session.updatedAt !== 'number' ||
    typeof session.archived !== 'boolean'
  ) {
    return null
  }

  return {
    id: session.id,
    name: session.name,
    sessionKey: session.sessionKey,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    archived: session.archived
  }
}

export function loadPinchrSessions(): PinchrSession[] {
  try {
    const raw = window.localStorage.getItem(PINCHR_SESSIONS_STORAGE_KEY)
    if (!raw) return [createDefaultPinchrSession()]

    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return [createDefaultPinchrSession()]

    const sessions = parsed
      .map(parsePinchrSession)
      .filter((session): session is PinchrSession => Boolean(session))

    if (sessions.length === 0) return [createDefaultPinchrSession()]
    return sortPinchrSessions(sessions)
  } catch {
    return [createDefaultPinchrSession()]
  }
}

export function loadAllPinchrSessions(): PinchrSession[] {
  try {
    const raw = window.localStorage.getItem(PINCHR_SESSIONS_STORAGE_KEY)
    if (!raw) return []

    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []

    return parsed
      .map(parsePinchrSession)
      .filter((session): session is PinchrSession => Boolean(session))
  } catch {
    return []
  }
}

export function persistPinchrSessions(sessions: PinchrSession[]): void {
  try {
    window.localStorage.setItem(PINCHR_SESSIONS_STORAGE_KEY, JSON.stringify(sessions))
  } catch (error) {
    console.error('Failed to persist Pinchr sessions:', error)
  }
}

export function consumeStoredChatPrefill(): string {
  try {
    const prefill = window.sessionStorage.getItem(CHAT_PREFILL_STORAGE_KEY)?.trim() || ''
    window.sessionStorage.removeItem(CHAT_PREFILL_STORAGE_KEY)
    return prefill
  } catch {
    return ''
  }
}

export function formatSessionTimestamp(timestamp: number): string {
  const date = new Date(timestamp)
  const now = new Date()

  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

export function normalizeGeneratedTitle(raw: string): string {
  const title = raw
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)[0] ?? ''

  return title
    .replace(/^['"`]+/, '')
    .replace(/['"`]+$/, '')
    .slice(0, 80)
    .trim()
}

export function extractTextFromJsonContent(content: string): string | null {
  const trimmed = content.trim()
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null

  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null

    const textField =
      (typeof parsed.text === 'string' && parsed.text) ||
      (typeof parsed.message === 'string' && parsed.message) ||
      (typeof parsed.content === 'string' && parsed.content) ||
      (typeof parsed.body === 'string' && parsed.body)

    if (textField) return textField

    const keys = Object.keys(parsed)
    const metadataKeys = ['conversation_label', 'session_key', 'channel', 'metadata', 'type', 'id', 'timestamp']
    const isMetadataOnly = keys.every((key) => metadataKeys.includes(key) || typeof parsed[key] !== 'string')
    if (isMetadataOnly) return ''

    return null
  } catch {
    return null
  }
}

export function getRenderableParts(message: Message): MessageContentPart[] {
  if (Array.isArray(message.parts) && message.parts.length > 0) {
    // Strip metadata from each text part
    return message.parts
      .map((part) => {
        if (part.type === 'text') {
          const cleaned = stripMessageMetadata(part.text)
          if (!cleaned) return null
          return { ...part, text: cleaned }
        }
        return part
      })
      .filter((part): part is MessageContentPart => part !== null)
  }

  if (message.content.trim()) {
    const extracted = extractTextFromJsonContent(message.content)
    if (extracted !== null) {
      if (!extracted.trim()) return []
      const cleaned = stripMessageMetadata(extracted)
      if (!cleaned) return []
      return [{ type: 'text', text: cleaned }]
    }

    // Strip envelope metadata (conversation_info, queued headers, etc.)
    const cleaned = stripMessageMetadata(message.content)
    if (!cleaned) return []
    return [{ type: 'text', text: cleaned }]
  }

  return []
}

export function parseToolArtifact(content: string): ToolArtifact {
  const trimmed = content.trim()
  if (!trimmed) return { hideText: false }

  const startsLikeStructuredData = trimmed.startsWith('{') || trimmed.startsWith('[') || trimmed.startsWith('```')
  const hardToolMarker = /tool_calls?|tool_result|function_call/i.test(trimmed)
  const likelyToolPayload =
    startsLikeStructuredData &&
    (hardToolMarker || /"tool(Name|_name)?"\s*:|"tool_call"\s*:/i.test(trimmed))

  const subAgentSpawn = trimmed.match(/spawn(?:ed)?\s+(?:sub-?agent|agent)[:\-]?\s*(.+)/i)
  if (subAgentSpawn) {
    return {
      hideText: true,
      subAgentEvent: {
        description: subAgentSpawn[1].trim(),
        status: 'running'
      }
    }
  }

  const subAgentDone = trimmed.match(/(?:sub-?agent|agent)\s+(?:done|completed)[:\-]?\s*(.+)/i)
  if (subAgentDone) {
    return {
      hideText: true,
      subAgentEvent: {
        description: 'Sub-agent',
        status: 'completed',
        summary: subAgentDone[1].trim()
      }
    }
  }

  if (!likelyToolPayload) {
    return { hideText: false }
  }

  const cleanJson = trimmed
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim()

  try {
    const parsed = JSON.parse(cleanJson) as {
      tool_calls?: Array<{ function?: { name?: string; arguments?: string } }>
      tool_call?: { function?: { name?: string; arguments?: string }; name?: string; arguments?: string }
      function_call?: { name?: string; arguments?: string }
      tool_result?: unknown
      result?: unknown
      name?: string
    }

    const firstToolCall = parsed.tool_calls?.[0]
    if (firstToolCall?.function?.name) {
      return {
        hideText: true,
        toolName: firstToolCall.function.name,
        toolResult: firstToolCall.function.arguments
      }
    }

    if (parsed.tool_call?.function?.name || parsed.tool_call?.name) {
      const name = parsed.tool_call.function?.name ?? parsed.tool_call.name
      const result = parsed.tool_call.function?.arguments ?? parsed.tool_call.arguments
      return {
        hideText: true,
        toolName: name,
        toolResult: typeof result === 'string' ? result : JSON.stringify(result ?? '')
      }
    }

    if (parsed.function_call?.name) {
      return {
        hideText: true,
        toolName: parsed.function_call.name,
        toolResult: parsed.function_call.arguments
      }
    }

    if (parsed.tool_result !== undefined || parsed.result !== undefined) {
      const payload = parsed.tool_result ?? parsed.result
      return {
        hideText: true,
        toolName: typeof parsed.name === 'string' ? parsed.name : 'tool',
        toolResult: typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2)
      }
    }
  } catch {
    if (!hardToolMarker) {
      return { hideText: false }
    }

    const nameMatch = trimmed.match(/"name"\s*:\s*"([^\"]+)"/)
    return {
      hideText: true,
      toolName: nameMatch?.[1] || 'tool',
      toolResult: trimmed
    }
  }

  if (!hardToolMarker) {
    return { hideText: false }
  }

  return {
    hideText: true,
    toolName: 'tool',
    toolResult: trimmed
  }
}

// ---------------------------------------------------------------------------
// Channel Badge Helpers
// ---------------------------------------------------------------------------

export interface ChannelBadge {
  label: string
  emoji: string
  channel: string
}

const CHANNEL_BADGES: Record<string, ChannelBadge> = {
  slack: { label: 'Slack', emoji: '💬', channel: 'slack' },
  whatsapp: { label: 'WhatsApp', emoji: '📱', channel: 'whatsapp' },
  telegram: { label: 'Telegram', emoji: '✈️', channel: 'telegram' },
  discord: { label: 'Discord', emoji: '🎮', channel: 'discord' },
  signal: { label: 'Signal', emoji: '🔒', channel: 'signal' },
  imessage: { label: 'iMessage', emoji: '💬', channel: 'imessage' },
  webchat: { label: 'Web', emoji: '🌐', channel: 'webchat' },
  pinchr: { label: 'Pinchr', emoji: '🖥️', channel: 'pinchr' },
  'pinchr-desktop': { label: 'Pinchr', emoji: '🖥️', channel: 'pinchr' },
  voice: { label: 'Voice', emoji: '🎤', channel: 'voice' },
}

/**
 * Detect channel from message metadata.
 * Messages from the unified session may include channel info in various places:
 * - message.channel field
 * - system message with [Channel: xxx] prefix
 * - inbound_context metadata
 */
export function detectChannelBadge(message: DisplayMessage): ChannelBadge | null {
  // Direct channel field
  if (message.channel) {
    const badge = CHANNEL_BADGES[message.channel.toLowerCase()]
    if (badge) return badge
  }

  // Check content for channel markers (system messages)
  const content = message.content || ''
  const channelMatch = content.match(/\[Channel:\s*([^\]]+)\]/i)
  if (channelMatch) {
    const channel = channelMatch[1].trim().toLowerCase()
    const badge = CHANNEL_BADGES[channel]
    if (badge) return badge
  }

  // Extract channel from OpenClaw envelope metadata (before it gets stripped from display)
  const metadataChannel = extractChannelFromMetadata(content)
  if (metadataChannel) {
    const badge = CHANNEL_BADGES[metadataChannel.toLowerCase()]
    if (badge) return badge
  }

  // Parse channel from OpenClaw system message patterns
  // e.g., "Slack DM from John Smith: ...", "WhatsApp message from ...", "Signal DM from ..."
  const systemChannelMatch = content.match(/\b(Slack|WhatsApp|Telegram|Discord|Signal|iMessage)\b/i)
  if (systemChannelMatch) {
    const channel = systemChannelMatch[1].toLowerCase()
    const badge = CHANNEL_BADGES[channel]
    if (badge) return badge
  }

  // Check for session key patterns in metadata
  const metadata = (message as Record<string, unknown>).metadata as Record<string, unknown> | undefined
  if (metadata) {
    const inboundContext = metadata.inbound_context as Record<string, unknown> | undefined
    if (inboundContext?.channel) {
      const channel = String(inboundContext.channel).toLowerCase()
      const badge = CHANNEL_BADGES[channel]
      if (badge) return badge
    }
  }

  return null
}
