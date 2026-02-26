import { readFileSync, existsSync, statSync, openSync, readSync, closeSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import type { MessageContentPart, StreamChunkPayload } from '../shared/types'

const CONFIG_PATH = join(homedir(), '.openclaw', 'openclaw.json')
const OPENCLAW_SESSIONS_DIR = join(homedir(), '.openclaw', 'agents', 'main', 'sessions')
const OPENCLAW_SESSIONS_INDEX_PATH = join(OPENCLAW_SESSIONS_DIR, 'sessions.json')
const SESSION_DISK_TAIL_BYTES = 8 * 1024
const SESSION_DISK_CACHE_TTL_MS = 30_000
const SESSION_HEADER_READ_LIMIT_BYTES = 32 * 1024

let diskSessionsCache: Array<Record<string, unknown>> = []
let diskSessionsCachedAt = 0

function getConfig(): { url: string; token: string | null } {
  try {
    if (existsSync(CONFIG_PATH)) {
      const data = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'))
      const port = data?.gateway?.port || 18789
      const token = data?.gateway?.auth?.token || null
      return { url: `http://127.0.0.1:${port}`, token }
    }
  } catch {
    // Config file doesn't exist or is invalid
  }
  return { url: 'http://127.0.0.1:18789', token: null }
}

export function getGatewayUrl(): string {
  return getConfig().url
}

function getToken(): string | null {
  return getConfig().token
}

export function getGatewayToken(): string | null {
  return getToken()
}

export function getHeaders(): Record<string, string> {
  return headers()
}

function extractTextFromUnknown(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map((item) => extractTextFromUnknown(item)).join('')
  if (!value || typeof value !== 'object') return ''

  const record = value as Record<string, unknown>
  const directText = [record.text, record.content, record.reasoning, record.reasoning_content, record.value]
    .filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
    .join('')
  if (directText) return directText

  if (Array.isArray(record.parts)) {
    const partsText = record.parts.map((part) => extractTextFromUnknown(part)).join('')
    if (partsText) return partsText
  }

  if (Array.isArray(record.content)) {
    const contentText = record.content.map((part) => extractTextFromUnknown(part)).join('')
    if (contentText) return contentText
  }

  return ''
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function readString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function readNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value.trim())
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function toEpochMs(value: unknown): number {
  const numeric = readNumber(value)
  if (numeric !== null) {
    return numeric > 1e12 ? numeric : numeric * 1000
  }

  const text = readString(value)
  if (!text) return 0
  const parsed = Date.parse(text)
  return Number.isFinite(parsed) ? parsed : 0
}

function toIsoIfValid(timestampMs: number): string | null {
  if (!Number.isFinite(timestampMs) || timestampMs <= 0) return null
  try {
    return new Date(timestampMs).toISOString()
  } catch {
    return null
  }
}

function parseJsonLine(line: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(line) as unknown
    return asRecord(parsed)
  } catch {
    return null
  }
}

function readFirstLine(path: string): string | null {
  const fd = openSync(path, 'r')
  try {
    let offset = 0
    const chunks: string[] = []
    const chunkSize = 1024

    while (offset < SESSION_HEADER_READ_LIMIT_BYTES) {
      const bytesToRead = Math.min(chunkSize, SESSION_HEADER_READ_LIMIT_BYTES - offset)
      const buffer = Buffer.alloc(bytesToRead)
      const bytesRead = readSync(fd, buffer, 0, bytesToRead, offset)
      if (bytesRead <= 0) break

      const text = buffer.toString('utf-8', 0, bytesRead)
      const newlineIndex = text.indexOf('\n')
      if (newlineIndex >= 0) {
        chunks.push(text.slice(0, newlineIndex))
        break
      }

      chunks.push(text)
      offset += bytesRead

      if (bytesRead < bytesToRead) break
    }

    const firstLine = chunks.join('').trim()
    return firstLine.length > 0 ? firstLine : null
  } finally {
    closeSync(fd)
  }
}

function readTailLines(path: string, bytes = SESSION_DISK_TAIL_BYTES): string[] {
  const stats = statSync(path)
  if (stats.size <= 0) return []

  const bytesToRead = Math.min(bytes, stats.size)
  const start = Math.max(0, stats.size - bytesToRead)
  const fd = openSync(path, 'r')

  try {
    const buffer = Buffer.alloc(bytesToRead)
    const bytesRead = readSync(fd, buffer, 0, bytesToRead, start)
    if (bytesRead <= 0) return []

    let tail = buffer.toString('utf-8', 0, bytesRead)
    if (start > 0) {
      // Ignore a likely partial first line when reading from the middle.
      const firstNewline = tail.indexOf('\n')
      if (firstNewline < 0) return []
      tail = tail.slice(firstNewline + 1)
    }

    return tail
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
  } finally {
    closeSync(fd)
  }
}

function getLastPreviewMessage(transcriptPath: string): { role: 'user' | 'assistant'; text: string } | null {
  const lines = readTailLines(transcriptPath)
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const parsed = parseJsonLine(lines[index])
    if (!parsed) continue

    const type = readString(parsed.type)
    if (type && type !== 'message') continue

    // Support both flat format (role at top level) and nested format (role inside .message)
    const messageObj = (parsed.message && typeof parsed.message === 'object' && !Array.isArray(parsed.message))
      ? parsed.message as Record<string, unknown>
      : null
    const role = readString(messageObj?.role ?? parsed.role)
    if (role !== 'user' && role !== 'assistant') continue

    const text = extractTextFromUnknown(messageObj?.content ?? parsed.content ?? parsed.text ?? parsed.message).trim()
    if (!text) continue

    return { role, text }
  }

  return null
}

function normalizeSessionForRenderer(session: Record<string, unknown>): Record<string, unknown> {
  const updatedAtMs = toEpochMs(session.updatedAt ?? session.lastActivity ?? session.createdAt)
  const lastActivity = toIsoIfValid(updatedAtMs)

  return {
    ...session,
    lastActivity: lastActivity ?? session.lastActivity ?? session.updatedAt
  }
}

function getSessionSortTimestamp(session: Record<string, unknown>): number {
  return toEpochMs(session.updatedAt ?? session.lastActivity ?? session.createdAt)
}

export async function getSessionsFromDisk(): Promise<Array<Record<string, unknown>>> {
  const now = Date.now()
  if (now - diskSessionsCachedAt < SESSION_DISK_CACHE_TTL_MS) {
    return diskSessionsCache
  }

  if (!existsSync(OPENCLAW_SESSIONS_INDEX_PATH)) {
    diskSessionsCache = []
    diskSessionsCachedAt = now
    return []
  }

  try {
    const rawIndex = readFileSync(OPENCLAW_SESSIONS_INDEX_PATH, 'utf-8')
    const parsedIndex = asRecord(JSON.parse(rawIndex))
    if (!parsedIndex) {
      diskSessionsCache = []
      diskSessionsCachedAt = now
      return []
    }

    const sessions: Array<Record<string, unknown>> = []

    for (const [sessionKey, rawEntry] of Object.entries(parsedIndex)) {
      const entry = asRecord(rawEntry)
      if (!entry) continue

      const transcriptId = readString(entry.sessionId)
      if (!transcriptId) continue
      if (transcriptId.includes('.jsonl.deleted.')) continue

      const transcriptPath = join(OPENCLAW_SESSIONS_DIR, `${transcriptId}.jsonl`)
      if (!existsSync(transcriptPath)) continue
      if (transcriptPath.includes('.jsonl.deleted.')) continue

      let stats
      try {
        stats = statSync(transcriptPath)
      } catch {
        continue
      }

      const createdAt = (() => {
        try {
          const firstLine = readFirstLine(transcriptPath)
          if (!firstLine) return null
          const sessionHeader = parseJsonLine(firstLine)
          const headerTimestamp = readString(sessionHeader?.timestamp)
          if (!headerTimestamp) return null
          const parsed = Date.parse(headerTimestamp)
          return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null
        } catch {
          return null
        }
      })()

      const preview = (() => {
        try {
          return getLastPreviewMessage(transcriptPath)
        } catch {
          return null
        }
      })()

      const updatedAtMs = toEpochMs(entry.updatedAt) || Math.floor(stats.mtimeMs)
      const normalizedUpdatedAt = updatedAtMs > 0 ? updatedAtMs : Math.floor(stats.mtimeMs)
      const session: Record<string, unknown> = {
        ...entry,
        key: sessionKey,
        sessionKey,
        status: readString(entry.status) ?? 'idle',
        updatedAt: normalizedUpdatedAt,
        lastActivity: toIsoIfValid(normalizedUpdatedAt) ?? new Date(stats.mtimeMs).toISOString()
      }

      if (createdAt) {
        session.createdAt = createdAt
      }

      if (preview) {
        session.lastMessagePreview = preview.text
        session.messages = [{ role: preview.role, content: preview.text }]
      }

      sessions.push(session)
    }

    sessions.sort((left, right) => getSessionSortTimestamp(right) - getSessionSortTimestamp(left))
    diskSessionsCache = sessions
    diskSessionsCachedAt = now
    return sessions
  } catch (error) {
    console.warn('[gateway] Failed to read sessions from disk:', error)
    diskSessionsCache = []
    diskSessionsCachedAt = now
    return []
  }
}

function headers(): Record<string, string> {
  const token = getToken()
  const h: Record<string, string> = {
    'Content-Type': 'application/json'
  }
  if (token) {
    h['Authorization'] = `Bearer ${token}`
  }
  return h
}

async function toolsInvoke(tool: string, args: Record<string, unknown> = {}): Promise<unknown> {
  const res = await fetch(`${getGatewayUrl()}/tools/invoke`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ tool, args, sessionKey: 'main' })
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`tools/invoke ${tool} failed (${res.status}): ${text.slice(0, 200)}`)
  }
  const json = await res.json() as {
    ok?: boolean;
    result?: {
      content?: Array<{ type: string; text: string }>;
      details?: Record<string, unknown>;
    }
  }
  // Extract the text content from the tool result
  const textContent = json?.result?.content?.find((c) => c.type === 'text')?.text
  if (textContent) {
    // Try to parse as JSON (sessions_list, sessions_history return JSON strings)
    try {
      return JSON.parse(textContent)
    } catch {
      // Not JSON — return details if available, otherwise the text
      return json?.result?.details ?? textContent
    }
  }
  return json?.result?.details ?? json
}

export async function gatewayHealth(): Promise<unknown> {
  // Use session_status as a health check — it returns human-readable text or parsed JSON
  const result = await toolsInvoke('session_status', {})
  if (typeof result === 'string') {
    return { status: 'ok', version: 'connected', info: result }
  }
  return { status: 'ok', ...(result as Record<string, unknown>) }
}

export async function getAgentsList(): Promise<unknown> {
  const result = await toolsInvoke('agents_list', {}) as {
    agents?: Array<{ id: string; name?: string; configured?: boolean }>
  }
  return result?.agents ?? []
}

export async function getSessions(): Promise<unknown> {
  let inMemorySessions: Array<Record<string, unknown>> = []

  try {
    const result = await toolsInvoke('sessions_list', { limit: 100, messageLimit: 1 }) as { sessions?: Array<Record<string, unknown>> }
    inMemorySessions = Array.isArray(result?.sessions) ? result.sessions : []
  } catch (error) {
    console.warn('[gateway] Failed to fetch in-memory sessions:', error)
  }

  const diskSessions = await getSessionsFromDisk()

  const mergedByKey = new Map<string, Record<string, unknown>>()
  for (const diskSession of diskSessions) {
    const key = readString(diskSession.key) ?? readString(diskSession.sessionKey)
    if (!key) continue
    mergedByKey.set(key, normalizeSessionForRenderer({ ...diskSession, key }))
  }

  // In-memory sessions should win on key conflicts.
  for (const memorySession of inMemorySessions) {
    const key = readString(memorySession.key) ?? readString(memorySession.sessionKey)
    if (!key) continue
    mergedByKey.set(key, normalizeSessionForRenderer({ ...memorySession, key }))
  }

  return Array.from(mergedByKey.values())
    .sort((left, right) => getSessionSortTimestamp(right) - getSessionSortTimestamp(left))
}

function getSessionHistoryFromDisk(sessionKey: string, limit = 50): Array<{ role: string; content: string; parts: MessageContentPart[] }> {
  try {
    if (!existsSync(OPENCLAW_SESSIONS_INDEX_PATH)) return []

    const rawIndex = readFileSync(OPENCLAW_SESSIONS_INDEX_PATH, 'utf-8')
    const parsedIndex = asRecord(JSON.parse(rawIndex))
    if (!parsedIndex) return []

    const entry = asRecord(parsedIndex[sessionKey])
    if (!entry) return []

    const transcriptId = readString(entry.sessionId)
    if (!transcriptId) return []

    const transcriptPath = join(OPENCLAW_SESSIONS_DIR, `${transcriptId}.jsonl`)
    if (!existsSync(transcriptPath)) return []

    const raw = readFileSync(transcriptPath, 'utf-8')
    const lines = raw.split('\n').filter((line) => line.trim().length > 0)

    const messages: Array<{ role: string; content: string; parts: MessageContentPart[] }> = []

    for (const line of lines) {
      try {
        const entry = JSON.parse(line) as Record<string, unknown>
        if (entry.type !== 'message') continue

        const msg = asRecord(entry.message)
        if (!msg) continue

        const role = readString(msg.role)
        if (!role || (role !== 'user' && role !== 'assistant')) continue

        const parts = normalizeMessageParts(msg.content)
        const content = parts
          .filter((part) => part.type === 'text')
          .map((part) => part.text)
          .join('\n')

        if (content.trim() === '' && !parts.some((part) => part.type === 'image_url')) continue

        messages.push({ role, content, parts })
      } catch {
        // Skip malformed lines
      }
    }

    // Return last N messages
    return messages.slice(-limit)
  } catch {
    return []
  }
}

export async function getSessionHistory(sessionKey: string, limit = 50): Promise<unknown> {
  // Try in-memory sessions first via gateway API
  let messages: Array<{ role: string; content: unknown }>  = []
  try {
    const result = await toolsInvoke('sessions_history', { sessionKey, limit }) as { messages?: Array<{ role: string; content: unknown }> }
    messages = result?.messages ?? []
  } catch {
    // Gateway might not have this session in memory
  }

  // If no messages from gateway, try reading from disk transcript
  if (messages.length === 0) {
    return getSessionHistoryFromDisk(sessionKey, limit)
  }

  // Preserve multimodal content for the renderer while also exposing flattened text.
  return messages
    .map((msg) => {
      const parts = normalizeMessageParts(msg.content)
      const content = parts
        .filter((part) => part.type === 'text')
        .map((part) => part.text)
        .join('\n')

      return { ...msg, content, parts }
    })
    .filter((msg) => msg.content.trim() !== '' || msg.parts.some((part: MessageContentPart) => part.type === 'image_url'))
}

export async function sendMessage(sessionKey: string, message: string): Promise<unknown> {
  return toolsInvoke('sessions_send', { sessionKey, message })
}

export async function streamMessage(
  sessionKey: string,
  message: string | MessageContentPart[],
  onChunk: (payload: StreamChunkPayload) => void,
  workspaceContext?: { name: string; systemPromptAddition: string },
  sessionUser?: string,
  options?: {
    tools?: Array<{
      type: 'function'
      function: {
        name: string
        description?: string
        parameters: Record<string, unknown>
      }
    }>
    /** When set, routes the message to the main agent session instead of the Pinchr-specific session */
    mainSessionKey?: string
  }
): Promise<void> {
  const { url } = getConfig()
  const token = getToken()

  // Determine the effective session key — prefer main session if provided
  const effectiveSessionKey = options?.mainSessionKey || sessionKey
  const effectiveUser = options?.mainSessionKey
    ? deriveUserFromSessionKey(options.mainSessionKey)
    : (sessionUser || deriveUserFromSessionKey(sessionKey))

  // Just send the new user message — OpenClaw maintains conversation state
  // via the stable session derived from the `user` field
  const conversationMessages: Array<{ role: string; content: string | MessageContentPart[] }> = []

  // Add workspace context as system message if provided
  if (workspaceContext) {
    conversationMessages.push({
      role: 'system',
      content: `[Active Workspace: ${workspaceContext.name}] ${workspaceContext.systemPromptAddition}`
    })
  }

  // Add channel context so the agent knows this came from Pinchr
  conversationMessages.push({
    role: 'system',
    content: '[Channel: pinchr-desktop]'
  })

  conversationMessages.push({ role: 'user', content: message })

  const requestBody: Record<string, unknown> = {
    model: 'openclaw:main',
    messages: conversationMessages,
    stream: true,
    user: effectiveUser
  }
  if (Array.isArray(options?.tools) && options.tools.length > 0) {
    requestBody.tools = options.tools
  }

  const response = await fetch(`${url}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` }),
      'x-openclaw-session-key': effectiveSessionKey
    },
    body: JSON.stringify(requestBody)
  })

  if (!response.ok) {
    throw new Error(`Stream request failed: ${response.status} ${response.statusText}`)
  }

  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error('Response body is not readable')
  }

  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('data: ')) continue
        
        const data = trimmed.slice(6) // Remove 'data: ' prefix
        if (data === '[DONE]') {
          onChunk({ content: '', done: true })
          return
        }

        try {
          const parsed = JSON.parse(data)
          const choice = parsed?.choices?.[0]
          const delta = choice?.delta
          const emittedReasoning = new Set<string>()
          const emitReasoning = (source: unknown) => {
            const reasoningText = extractTextFromUnknown(source)
            if (!reasoningText || emittedReasoning.has(reasoningText)) return
            emittedReasoning.add(reasoningText)
            onChunk({
              content: '',
              done: false,
              isThinking: true,
              reasoning: reasoningText,
              reasoningContent: reasoningText
            })
          }

          const toolCalls = Array.isArray(delta?.tool_calls) ? delta.tool_calls : []
          for (const toolCall of toolCalls) {
            const toolName = toolCall?.function?.name
            if (typeof toolName === 'string' && toolName.trim()) {
              onChunk({
                content: '',
                done: false,
                toolEvent: 'start',
                toolName: toolName.trim()
              })
            }

            const toolArgs = toolCall?.function?.arguments
            if (typeof toolArgs === 'string' && toolArgs.trim()) {
              onChunk({
                content: '',
                done: false,
                toolEvent: 'result',
                toolName: typeof toolName === 'string' && toolName.trim() ? toolName.trim() : 'tool',
                toolResult: toolArgs
              })
            }
          }

          emitReasoning(delta?.reasoning)
          emitReasoning(delta?.reasoning_content)

          const content = delta?.content
          if (typeof content === 'string' && content) {
            onChunk({ content, done: false })
          } else if (Array.isArray(content)) {
            for (const part of content) {
              const partRecord = part as Record<string, unknown>
              const partType = typeof partRecord?.type === 'string' ? partRecord.type : ''

              if (partType === 'text' || partType === 'output_text') {
                const text = extractTextFromUnknown(partRecord.text ?? partRecord.content ?? partRecord)
                if (text) {
                  onChunk({ content: text, done: false })
                }
                continue
              }

              if (partType === 'thinking' || partType === 'reasoning' || partType === 'reasoning_content') {
                emitReasoning(partRecord.reasoning ?? partRecord.reasoning_content ?? partRecord.text ?? partRecord.content ?? partRecord)
              }
            }
          } else if (content && typeof content === 'object') {
            const contentRecord = content as Record<string, unknown>
            const contentType = typeof contentRecord.type === 'string' ? contentRecord.type : ''

            if (contentType === 'thinking' || contentType === 'reasoning' || contentType === 'reasoning_content') {
              emitReasoning(contentRecord.reasoning ?? contentRecord.reasoning_content ?? contentRecord.text ?? contentRecord.content ?? contentRecord)
            } else {
              const text = extractTextFromUnknown(contentRecord.text ?? contentRecord.content ?? contentRecord)
              if (text) {
                onChunk({ content: text, done: false })
              }
            }
          }
        } catch (parseError) {
          console.warn('Failed to parse SSE chunk:', parseError, data)
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
  
  // Mark as done if we exit the loop
  onChunk({ content: '', done: true })
}

function deriveUserFromSessionKey(sessionKey: string): string {
  const parts = sessionKey.split(':')
  const suffix = parts[parts.length - 1]
  return suffix || 'pinchr'
}

// ---------------------------------------------------------------------------
// Main Session Discovery
// ---------------------------------------------------------------------------

let cachedMainSessionKey: string | null = null
let mainSessionFetchedAt = 0
const MAIN_SESSION_CACHE_TTL = 60_000 // 1 minute

/**
 * Discover the main agent session key (e.g. `agent:main:direct:drew`).
 * This is the session where Slack/WhatsApp messages land.
 * Returns null if no main session is found.
 */
export async function getMainSession(): Promise<string | null> {
  // Return cached value if fresh
  if (cachedMainSessionKey && Date.now() - mainSessionFetchedAt < MAIN_SESSION_CACHE_TTL) {
    return cachedMainSessionKey
  }

  try {
    const result = await toolsInvoke('sessions_list', { limit: 50, messageLimit: 0 }) as {
      sessions?: Array<{ key?: string; sessionKey?: string; status?: string }>
    }
    const sessions = result?.sessions ?? []

    // Priority 1: agent:main:direct:* (the DM session where Slack/WhatsApp land)
    const directSession = sessions.find((s) => {
      const key = s.key || s.sessionKey || ''
      return /^agent:main:direct:[^:]+$/.test(key)
    })

    if (directSession) {
      cachedMainSessionKey = directSession.key || directSession.sessionKey || null
      mainSessionFetchedAt = Date.now()
      return cachedMainSessionKey
    }

    // Priority 2: agent:main:main
    const mainMain = sessions.find((s) => {
      const key = s.key || s.sessionKey || ''
      return key === 'agent:main:main'
    })

    if (mainMain) {
      cachedMainSessionKey = mainMain.key || mainMain.sessionKey || null
      mainSessionFetchedAt = Date.now()
      return cachedMainSessionKey
    }

    return null
  } catch (error) {
    console.error('[gateway] Failed to discover main session:', error)
    return null
  }
}

/**
 * Invalidate the cached main session key (e.g. on reconnect).
 */
export function clearMainSessionCache(): void {
  cachedMainSessionKey = null
  mainSessionFetchedAt = 0
}

function normalizeMessageParts(content: unknown): MessageContentPart[] {
  if (typeof content === 'string') {
    return content.trim() ? [{ type: 'text', text: content }] : []
  }

  if (!Array.isArray(content)) return []

  const parts: MessageContentPart[] = []
  for (const rawPart of content) {
    const part = rawPart as {
      type?: unknown
      text?: unknown
      image_url?: unknown
    }

    if (part.type === 'text' && typeof part.text === 'string') {
      parts.push({ type: 'text', text: part.text })
      continue
    }

    if (part.type === 'image_url') {
      const maybeImageUrl = part.image_url as { url?: unknown } | string | undefined
      const url =
        typeof maybeImageUrl === 'string'
          ? maybeImageUrl
          : typeof maybeImageUrl?.url === 'string'
            ? maybeImageUrl.url
            : ''

      if (url) {
        parts.push({
          type: 'image_url',
          image_url: { url }
        })
      }
    }
  }

  return parts
}

export async function getGatewayConfig(): Promise<unknown> {
  // Use tools/invoke to get config via the gateway API
  try {
    const raw = await toolsInvoke('gateway', { action: 'config.get' }) as Record<string, unknown>
    const result = (raw?.result ?? raw?.data ?? raw) as Record<string, unknown>
    const config = result?.parsed ?? result?.config ?? result
    return config
  } catch (error) {
    console.error('Failed to get gateway config:', error)
    return null
  }
}

export async function updateConfig(patch: Record<string, unknown>): Promise<unknown> {
  // Use tools/invoke to update config via gateway API
  try {
    const snapshot = await toolsInvoke('gateway', { action: 'config.get' }) as Record<string, unknown>
    const snapshotResult = (snapshot?.result ?? snapshot?.data ?? snapshot) as Record<string, unknown>
    const baseHash = [
      snapshotResult?.hash,
      (snapshotResult?.snapshot as Record<string, unknown> | undefined)?.hash,
      (snapshot as Record<string, unknown>)?.hash
    ].find((value) => typeof value === 'string' && value.trim().length > 0) as string | undefined

    const args: Record<string, unknown> = {
      action: 'config.patch',
      raw: JSON.stringify(patch)
    }
    if (baseHash) {
      args.baseHash = baseHash
    }

    const result = await toolsInvoke('gateway', {
      ...args
    })
    return result
  } catch (error) {
    console.error('Failed to update config:', error)
    throw error
  }
}

export async function getSessionStatus(model?: string): Promise<unknown> {
  const args: Record<string, unknown> = {}
  if (model) args.model = model
  const result = await toolsInvoke('session_status', args)
  return result
}

export async function restartGateway(): Promise<unknown> {
  return toolsInvoke('gateway', { action: 'restart' })
}

// Parse session_status text output
export interface SessionStatusParsed {
  openclawVersion?: string
  model?: string
  thinking?: string
  contextUsage?: string
  sessionKey?: string
  timestamp?: string
  raw: string
}

export function parseSessionStatus(text: string): SessionStatusParsed {
  const parsed: SessionStatusParsed = { raw: text }
  
  // Extract version: 🦞 OpenClaw 2026.2.6-3 (85ed6c7)
  const versionMatch = text.match(/OpenClaw\s+([\d.]+(?:-\d+)?)/i)
  if (versionMatch) parsed.openclawVersion = versionMatch[1]
  
  // Extract model: 🧠 Model: anthropic/claude-opus-4-6
  const modelMatch = text.match(/Model:\s+([^\s·]+)/i)
  if (modelMatch) parsed.model = modelMatch[1]
  
  // Extract thinking: Think: off
  const thinkingMatch = text.match(/Think:\s+(\w+)/i)
  if (thinkingMatch) parsed.thinking = thinkingMatch[1]
  
  // Extract context usage: 📚 Context: 91k/200k (45%)
  const contextMatch = text.match(/Context:\s+([^\s·]+)/i)
  if (contextMatch) parsed.contextUsage = contextMatch[1]
  
  // Extract session key: 🧵 Session: agent:main:slack:dm:ucbs5lv7e
  const sessionMatch = text.match(/Session:\s+([^\s•]+)/i)
  if (sessionMatch) parsed.sessionKey = sessionMatch[1]
  
  // Extract timestamp: 🕒 Time: Monday, February 9th, 2026 — 9:32 AM
  const timeMatch = text.match(/Time:\s+(.+?)(?:\n|$)/i)
  if (timeMatch) parsed.timestamp = timeMatch[1].trim()
  
  return parsed
}
