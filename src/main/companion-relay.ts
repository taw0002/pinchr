import { createHash } from 'crypto'
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs'
import { homedir, hostname, platform, arch, userInfo } from 'os'
import { join } from 'path'
import { safeStorage } from 'electron'
import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js'
import { activityLogger } from './activity-log'
import { gatewayHealth, getGatewayConfig, getGatewayUrl, getGatewayToken, getHeaders, getSessionHistory, getSessions, restartGateway, sendMessage, updateConfig } from './gateway'
import { routeMessageToTopicSession, type TopicRouteInboundContext } from './topic-router'

const PINCHR_CONFIG_PATH = join(homedir(), '.pinchr', 'config.json')
const RELAY_SECRETS_PATH = join(homedir(), '.pinchr', 'companion-relay.enc')
const DEFAULT_API_BASE_URL = 'https://pinchr.app'
const DEFAULT_SUPABASE_URL = 'https://oawvyhggbmqekrtivvli.supabase.co'
const DEFAULT_SUPABASE_ANON_KEY = process.env.PINCHR_SUPABASE_ANON_KEY
  ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hd3Z5aGdnYm1xZWtydGl2dmxpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1ODUxNjksImV4cCI6MjA4NjE2MTE2OX0.KzBtd5NI5CXCmOgvjgOPXY_pKJ-kcAPoDnS6LbzjymM'
const DEFAULT_POLL_INTERVAL_MS = 5000
const MIN_POLL_INTERVAL_MS = 1000
const MAX_POLL_INTERVAL_MS = 60000
const HEARTBEAT_INTERVAL_MS = 30_000
const HEARTBEAT_CHECK_INTERVAL_MS = 5_000

interface CompanionRelayConfig {
  enabled: boolean
  apiBaseUrl: string
  supabaseUrl: string
  supabaseAnonKey: string
  pollIntervalMs: number
  allowHighRiskRemoteActions: boolean
  desktopId?: string
  relayKey?: string
  desktopName?: string
  authToken?: string
}

interface PinchrConfig {
  companionRelay?: Partial<CompanionRelayConfig>
  permissions?: {
    send_messages?: boolean
  }
  [key: string]: unknown
}

interface CompanionCommand {
  id: string
  command_type: string
  risk_level?: 'low' | 'medium' | 'high'
  payload: Record<string, unknown>
  created_at: string
}

interface CompanionClaimResponse {
  paired: boolean
  desktop: {
    id: string
    name: string
    platform?: string | null
    scopes?: string[]
    created_at: string
  }
  relay_key: string
}

export interface CompanionRelaySettings {
  enabled?: boolean
  apiBaseUrl?: string
  pollIntervalMs?: number
  allowHighRiskRemoteActions?: boolean
}

export interface CompanionRelayStatus {
  running: boolean
  configured: boolean
  enabled: boolean
  apiBaseUrl: string
  realtimeConnected: boolean
  pollIntervalMs: number
  allowHighRiskRemoteActions: boolean
  desktopId?: string
  desktopName?: string
  lastSyncAt?: string
  lastError?: string
}

let pollingTimer: NodeJS.Timeout | null = null
let heartbeatTimer: NodeJS.Timeout | null = null
let running = false
let inFlight = false
let lastSyncAt: string | undefined
let lastError: string | undefined
let consecutiveFailures = 0
let lastHeartbeatAtMs = 0
let supabaseClient: SupabaseClient | null = null
let realtimeChannel: RealtimeChannel | null = null
let realtimeChannelName: string | null = null
let realtimeConnected = false

function readConfigFile(): PinchrConfig {
  try {
    if (!existsSync(PINCHR_CONFIG_PATH)) return {}
    return JSON.parse(readFileSync(PINCHR_CONFIG_PATH, 'utf-8')) as PinchrConfig
  } catch {
    return {}
  }
}

function writeConfigFile(config: PinchrConfig): void {
  const configDir = join(homedir(), '.pinchr')
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true })
  }
  writeFileSync(PINCHR_CONFIG_PATH, JSON.stringify(config, null, 2))
}

function readRelaySecrets(): { relayKey?: string; authToken?: string } {
  try {
    if (!existsSync(RELAY_SECRETS_PATH) || !safeStorage.isEncryptionAvailable()) {
      return {}
    }

    const encrypted = readFileSync(RELAY_SECRETS_PATH)
    const decrypted = safeStorage.decryptString(encrypted)
    const parsed = JSON.parse(decrypted) as Record<string, unknown>
    return {
      relayKey: typeof parsed.relayKey === 'string' ? parsed.relayKey : undefined,
      authToken: typeof parsed.authToken === 'string' ? parsed.authToken : undefined
    }
  } catch {
    return {}
  }
}

function writeRelaySecrets(secrets: { relayKey?: string; authToken?: string }): boolean {
  const relayKey = typeof secrets.relayKey === 'string' && secrets.relayKey.trim()
    ? secrets.relayKey
    : undefined
  const authToken = typeof secrets.authToken === 'string' && secrets.authToken.trim()
    ? secrets.authToken
    : undefined

  if (!relayKey && !authToken) {
    try {
      if (existsSync(RELAY_SECRETS_PATH)) {
        unlinkSync(RELAY_SECRETS_PATH)
      }
    } catch {
      // Best-effort cleanup only.
    }
    return true
  }

  if (!safeStorage.isEncryptionAvailable()) return false

  try {
    const encrypted = safeStorage.encryptString(JSON.stringify({ relayKey, authToken }))
    const configDir = join(homedir(), '.pinchr')
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true })
    }
    writeFileSync(RELAY_SECRETS_PATH, encrypted)
    return true
  } catch {
    return false
  }
}

function sanitizeApiBaseUrl(input: unknown): string {
  if (typeof input !== 'string') return DEFAULT_API_BASE_URL
  const trimmed = input.trim()
  if (!trimmed) return DEFAULT_API_BASE_URL
  return trimmed.replace(/\/+$/, '')
}

function sanitizePollIntervalMs(input: unknown): number {
  if (typeof input !== 'number' || !Number.isFinite(input)) {
    return DEFAULT_POLL_INTERVAL_MS
  }
  const rounded = Math.round(input)
  return Math.min(MAX_POLL_INTERVAL_MS, Math.max(MIN_POLL_INTERVAL_MS, rounded))
}

function loadRelayConfig(): CompanionRelayConfig {
  const root = readConfigFile()
  const relay = root.companionRelay || {}
  const plaintextRelayKey = typeof relay.relayKey === 'string' ? relay.relayKey : undefined
  const plaintextAuthToken = typeof relay.authToken === 'string' ? relay.authToken : undefined
  const encryptedSecrets = readRelaySecrets()

  // One-time migration from plaintext config secrets to encrypted storage.
  if ((plaintextRelayKey || plaintextAuthToken) && !encryptedSecrets.relayKey && !encryptedSecrets.authToken) {
    const migrated = writeRelaySecrets({
      relayKey: plaintextRelayKey,
      authToken: plaintextAuthToken
    })
    if (migrated) {
      const updatedRoot = readConfigFile()
      const updatedRelay = (updatedRoot.companionRelay || {}) as Partial<CompanionRelayConfig>
      delete updatedRelay.relayKey
      delete updatedRelay.authToken
      updatedRoot.companionRelay = updatedRelay
      writeConfigFile(updatedRoot)
    }
  }

  return {
    enabled: relay.enabled !== false,
    apiBaseUrl: sanitizeApiBaseUrl(relay.apiBaseUrl),
    supabaseUrl: sanitizeApiBaseUrl(relay.supabaseUrl ?? DEFAULT_SUPABASE_URL),
    supabaseAnonKey: typeof relay.supabaseAnonKey === 'string'
      ? relay.supabaseAnonKey.trim()
      : DEFAULT_SUPABASE_ANON_KEY,
    pollIntervalMs: sanitizePollIntervalMs(relay.pollIntervalMs),
    allowHighRiskRemoteActions: relay.allowHighRiskRemoteActions === true,
    desktopId: typeof relay.desktopId === 'string' ? relay.desktopId : undefined,
    relayKey: encryptedSecrets.relayKey ?? plaintextRelayKey,
    desktopName: typeof relay.desktopName === 'string' ? relay.desktopName : undefined,
    authToken: encryptedSecrets.authToken ?? plaintextAuthToken
  }
}

function saveRelayConfig(config: CompanionRelayConfig): void {
  const root = readConfigFile()
  const wroteSecrets = writeRelaySecrets({
    relayKey: config.relayKey,
    authToken: config.authToken
  })

  root.companionRelay = {
    enabled: config.enabled,
    apiBaseUrl: config.apiBaseUrl,
    supabaseUrl: config.supabaseUrl,
    supabaseAnonKey: config.supabaseAnonKey,
    pollIntervalMs: config.pollIntervalMs,
    allowHighRiskRemoteActions: config.allowHighRiskRemoteActions,
    desktopId: config.desktopId,
    desktopName: config.desktopName,
    ...(wroteSecrets
      ? {}
      : {
          relayKey: config.relayKey,
          authToken: config.authToken
        })
  }
  writeConfigFile(root)
}

function hasRelayCredentials(config: CompanionRelayConfig): boolean {
  return Boolean(config.desktopId && config.relayKey)
}

function canSendMessages(): boolean {
  const root = readConfigFile()
  return root.permissions?.send_messages !== false
}

function relayHeaders(config: CompanionRelayConfig): Record<string, string> {
  if (!config.relayKey) {
    throw new Error('Missing companion relay key')
  }
  return {
    'Content-Type': 'application/json',
    'x-pinchr-desktop-key': config.relayKey
  }
}

async function parseJsonResponse<T>(res: Response): Promise<T> {
  const text = await res.text()
  if (!text.trim()) return {} as T
  return JSON.parse(text) as T
}

async function fetchRelayJson<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, init)
  const payload = await parseJsonResponse<Record<string, unknown>>(response)

  if (!response.ok) {
    const message = typeof payload.error === 'string'
      ? payload.error
      : `${response.status} ${response.statusText}`
    throw new Error(message)
  }

  return payload as T
}

async function fetchPendingCommands(config: CompanionRelayConfig): Promise<CompanionCommand[]> {
  const url = `${config.apiBaseUrl}/api/companion/desktop/commands?limit=20`
  const payload = await fetchRelayJson<{ commands?: CompanionCommand[] }>(url, {
    method: 'GET',
    headers: relayHeaders(config)
  })
  return Array.isArray(payload.commands) ? payload.commands : []
}

async function postCommandResult(
  config: CompanionRelayConfig,
  commandId: string,
  status: 'completed' | 'failed',
  result?: unknown,
  error?: string
): Promise<void> {
  const url = `${config.apiBaseUrl}/api/companion/desktop/commands/${commandId}/result`
  await fetchRelayJson(url, {
    method: 'POST',
    headers: relayHeaders(config),
    body: JSON.stringify({
      status,
      result,
      error
    })
  })
}

async function sendHeartbeat(config: CompanionRelayConfig): Promise<void> {
  const url = `${config.apiBaseUrl}/api/companion/desktop/commands`
  await fetchRelayJson(url, {
    method: 'POST',
    headers: relayHeaders(config),
    body: JSON.stringify({
      platform: `${platform()}-${arch()}`,
      allow_high_risk_remote_actions: config.allowHighRiskRemoteActions
    })
  })
}

async function executeMessageCommand(command: CompanionCommand): Promise<unknown> {
  const payload = command.payload || {}
  const sessionKey = typeof payload.session_key === 'string' ? payload.session_key.trim() : ''
  const message = typeof payload.message === 'string' ? payload.message : ''

  if (!sessionKey || !message.trim()) {
    throw new Error('Invalid message_send payload: session_key and message are required')
  }

  if (!canSendMessages()) {
    throw new Error('Pinchr send_messages permission is disabled')
  }

  return sendMessage(sessionKey, message)
}

// ---------------------------------------------------------------------------
// Unified Topic Routing: route messages through topic router before streaming
// ---------------------------------------------------------------------------

const WORKSPACE_PATH = join(homedir(), '.openclaw', 'workspace')

async function invokeGatewayToolFromRelay(
  tool: string,
  parameters: Record<string, unknown> = {},
  sessionKey?: string
): Promise<unknown> {
  const token = getGatewayToken()
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  const response = await fetch(`${getGatewayUrl()}/tools/invoke`, {
    method: 'POST',
    headers,
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

  const json = await response.json() as Record<string, unknown>
  const result = json.result as Record<string, unknown> | undefined
  if (result && Array.isArray(result.content)) {
    const textBlock = (result.content as Array<Record<string, unknown>>).find(
      (b) => b.type === 'text'
    )
    if (textBlock && typeof textBlock.text === 'string') {
      try {
        return JSON.parse(textBlock.text) as unknown
      } catch {
        return textBlock.text
      }
    }
  }
  return json
}

interface RouteInfo {
  topicId: string
  topicLabel: string
  sessionKey: string
  created: boolean
  confidence: number
}

function inferChannelFromSessionKey(sessionKey: string): string | undefined {
  const tokens = sessionKey
    .split(':')
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean)
  if (tokens.includes('pinchr-desktop') || tokens.includes('pinchr')) return 'pinchr'
  if (tokens.includes('slack')) return 'slack'
  if (tokens.includes('whatsapp')) return 'whatsapp'
  if (tokens.includes('telegram')) return 'telegram'
  if (tokens.includes('discord')) return 'discord'
  if (tokens.includes('signal')) return 'signal'
  if (tokens.includes('imessage')) return 'imessage'
  if (tokens.includes('webchat') || tokens.includes('web')) return 'webchat'
  if (tokens.includes('voice')) return 'voice'
  return undefined
}

async function routeMessage(
  mainSessionKey: string,
  message: string,
  inboundContext?: TopicRouteInboundContext
): Promise<RouteInfo | null> {
  try {
    const result = await routeMessageToTopicSession({
      workspacePath: WORKSPACE_PATH,
      mainSessionKey,
      message,
      invokeTool: invokeGatewayToolFromRelay,
      inboundContext
    })
    return {
      topicId: result.route.topicId,
      topicLabel: result.route.topicLabel,
      sessionKey: result.route.sessionKey,
      created: result.route.created,
      confidence: result.route.confidence
    }
  } catch (error) {
    activityLogger.log('api_call', `Topic routing failed, falling back to main: ${String(error)}`)
    return null
  }
}

interface RealtimeChatMessagePayload {
  message: string
  commandId: string
  sessionKey: string
}

interface RealtimeHistoryRequestPayload {
  limit: number
  sessionKey: string
}

interface ChatStreamExecutionRequest {
  commandId: string
  sessionKey: string
  message: string
  requireHttpStreamPost: boolean
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  return value as Record<string, unknown>
}

function readStringValue(record: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string') return value
  }
  return ''
}

function parseHistoryLimit(rawLimit: unknown, fallback = 50): number {
  let parsed = fallback
  if (typeof rawLimit === 'number' && Number.isFinite(rawLimit)) {
    parsed = Math.round(rawLimit)
  } else if (typeof rawLimit === 'string' && rawLimit.trim()) {
    const asNumber = Number.parseInt(rawLimit.trim(), 10)
    if (Number.isFinite(asNumber)) {
      parsed = Math.round(asNumber)
    }
  }
  return Math.min(200, Math.max(1, parsed))
}

function stringifyUnknown(value: unknown): string {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function parseRealtimeChatMessagePayload(payload: unknown): RealtimeChatMessagePayload | null {
  const record = asRecord(payload)
  if (!record) return null

  const message = readStringValue(record, 'message').trim()
  const commandId = readStringValue(record, 'commandId', 'command_id').trim()
  const sessionKey = readStringValue(record, 'sessionKey', 'session_key').trim()

  if (!message || !commandId || !sessionKey) return null
  return { message, commandId, sessionKey }
}

function parseRealtimeHistoryRequestPayload(payload: unknown): RealtimeHistoryRequestPayload | null {
  const record = asRecord(payload)
  if (!record) return null

  const sessionKey = readStringValue(record, 'sessionKey', 'session_key').trim()
  if (!sessionKey) return null

  return {
    limit: parseHistoryLimit(record.limit, 50),
    sessionKey
  }
}

async function broadcastRelayEvent(
  channel: RealtimeChannel | null,
  event: string,
  payload: Record<string, unknown>
): Promise<void> {
  if (!channel) return
  await channel.send({
    type: 'broadcast',
    event,
    payload
  })
}

async function publishStreamChunk(
  config: CompanionRelayConfig,
  commandId: string,
  chunkPayload: Record<string, unknown>,
  requireHttpStreamPost: boolean,
  channel: RealtimeChannel | null
): Promise<void> {
  const settled = await Promise.allSettled([
    fetchRelayJson(`${config.apiBaseUrl}/api/companion/stream`, {
      method: 'POST',
      headers: relayHeaders(config),
      body: JSON.stringify({
        command_id: commandId,
        chunk: chunkPayload
      })
    }),
    broadcastRelayEvent(channel, 'chunk', {
      commandId,
      ...chunkPayload
    })
  ])

  const httpResult = settled[0]
  const realtimeResult = settled[1]

  if (httpResult.status === 'rejected' && requireHttpStreamPost) {
    throw httpResult.reason
  }
  if (httpResult.status === 'rejected') {
    activityLogger.log('api_call', `Companion stream HTTP publish failed: ${String(httpResult.reason)}`)
  }
  if (realtimeResult.status === 'rejected') {
    activityLogger.log('api_call', `Companion realtime chunk publish failed: ${String(realtimeResult.reason)}`)
  }
}

async function executeChatStream(
  request: ChatStreamExecutionRequest,
  channel: RealtimeChannel | null
): Promise<unknown> {
  const { commandId, sessionKey, message, requireHttpStreamPost } = request
  const config = loadRelayConfig()
  const gatewayUrl = getGatewayUrl()
  const gatewayHeaders = getHeaders()

  // Route through topic router (fast, keyword-based, no LLM)
  const routeInfo = await routeMessage(sessionKey, message, {
    channel: inferChannelFromSessionKey(sessionKey),
    requestId: commandId,
    threadId: sessionKey,
    sourceSessionKey: sessionKey
  })
  const targetSessionKey = routeInfo?.sessionKey || sessionKey

  // Stream from local gateway using routed session.
  // x-openclaw-session-key preserves unified routing from client session key.
  const response = await fetch(`${gatewayUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      ...gatewayHeaders,
      'Content-Type': 'application/json',
      'x-openclaw-session-key': sessionKey
    },
    body: JSON.stringify({
      messages: [{ role: 'user', content: message }],
      session_key: targetSessionKey,
      stream: true
    })
  })

  if (!response.ok) {
    throw new Error(`Gateway returned ${response.status}: ${response.statusText}`)
  }

  if (!response.body) {
    throw new Error('Gateway response has no body')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let fullContent = ''
  let fullReasoning = ''
  let firstChunkSent = false

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('data: ')) continue

        const data = trimmed.slice(6).trim()
        if (data === '[DONE]') continue

        try {
          const parsed = asRecord(JSON.parse(data))
          if (!parsed) continue
          const choices = Array.isArray(parsed.choices) ? parsed.choices : []
          const firstChoice = asRecord(choices[0])
          const delta = asRecord(firstChoice?.delta)
          if (!delta) continue

          const chunkPayload: Record<string, unknown> = {
            type: 'chunk',
            done: false
          }

          if (!firstChunkSent && routeInfo) {
            chunkPayload.route = routeInfo
            firstChunkSent = true
          } else if (!firstChunkSent) {
            firstChunkSent = true
          }

          if (typeof delta.content === 'string') {
            fullContent += delta.content
            chunkPayload.content = delta.content
          }

          if (typeof delta.reasoning === 'string') {
            fullReasoning = delta.reasoning
            chunkPayload.reasoning = delta.reasoning
          }

          if (Array.isArray(delta.tool_calls)) {
            for (const toolCallEntry of delta.tool_calls) {
              const toolCall = asRecord(toolCallEntry)
              if (!toolCall) continue
              const fn = asRecord(toolCall.function)
              if (typeof fn?.name === 'string') {
                chunkPayload.toolEvent = 'start'
                chunkPayload.toolName = fn.name
              }
              if (toolCall.result !== undefined) {
                chunkPayload.toolEvent = 'result'
                chunkPayload.toolName = typeof fn?.name === 'string' ? fn.name : 'unknown'
                chunkPayload.toolResult = stringifyUnknown(toolCall.result)
              }
            }
          }

          await publishStreamChunk(
            config,
            commandId,
            chunkPayload,
            requireHttpStreamPost,
            channel
          )
        } catch {
          // Skip malformed stream chunks.
          continue
        }
      }
    }

    await publishStreamChunk(
      config,
      commandId,
      {
        type: 'chunk',
        done: true
      },
      requireHttpStreamPost,
      channel
    )
  } finally {
    reader.releaseLock()
  }

  return { content: fullContent, reasoning: fullReasoning }
}

async function executeChatStreamCommand(command: CompanionCommand): Promise<unknown> {
  const payload = command.payload || {}
  const sessionKey = typeof payload.session_key === 'string' ? payload.session_key.trim() : ''
  const message = typeof payload.message === 'string' ? payload.message : ''

  if (!sessionKey || !message.trim()) {
    throw new Error('Invalid chat_stream payload: session_key and message are required')
  }

  if (!canSendMessages()) {
    throw new Error('Pinchr send_messages permission is disabled')
  }

  return executeChatStream(
    {
      commandId: command.id,
      sessionKey,
      message,
      requireHttpStreamPost: true
    },
    realtimeChannel
  )
}

async function executeSessionHistoryCommand(command: CompanionCommand): Promise<unknown> {
  const payload = command.payload || {}
  const sessionKey = typeof payload.session_key === 'string' ? payload.session_key.trim() : ''
  const limit = parseHistoryLimit(payload.limit, 50)
  if (!sessionKey) {
    throw new Error('Invalid session_history payload: session_key is required')
  }
  return getSessionHistory(sessionKey, limit)
}

async function executeConfigUpdateCommand(command: CompanionCommand): Promise<unknown> {
  const payload = command.payload || {}
  const patch = payload.patch
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    throw new Error('Invalid config_update payload: patch object is required')
  }
  return updateConfig(patch as Record<string, unknown>)
}

function requiresHighRiskConfirmation(command: CompanionCommand): boolean {
  const risk = command.risk_level || 'low'
  if (risk === 'high') return true
  return command.command_type === 'gateway_restart' || command.command_type === 'config_update'
}

async function executeCommand(command: CompanionCommand): Promise<unknown> {
  if (requiresHighRiskConfirmation(command)) {
    const config = loadRelayConfig()
    if (!config.allowHighRiskRemoteActions) {
      throw new Error('High-risk remote actions are disabled in desktop companion settings')
    }
  }

  switch (command.command_type) {
    case 'message_send':
      return executeMessageCommand(command)
    case 'chat_stream':
      return executeChatStreamCommand(command)
    case 'sessions_list':
      return getSessions()
    case 'session_history':
      return executeSessionHistoryCommand(command)
    case 'gateway_restart':
      return restartGateway()
    case 'config_get':
      return getGatewayConfig()
    case 'config_update':
      return executeConfigUpdateCommand(command)
    default:
      throw new Error(`Unsupported command_type: ${command.command_type}`)
  }
}

async function handleCommand(config: CompanionRelayConfig, command: CompanionCommand): Promise<void> {
  try {
    const result = await executeCommand(command)
    await postCommandResult(config, command.id, 'completed', result)
    activityLogger.log('api_call', `Companion command completed: ${command.command_type} (${command.id})`)
  } catch (error) {
    const errorMessage = String(error)
    await postCommandResult(config, command.id, 'failed', undefined, errorMessage)
    activityLogger.log('api_call', `Companion command failed: ${command.command_type} (${command.id})`)
  }
}

function clearPollingTimer(): void {
  if (pollingTimer) {
    clearTimeout(pollingTimer)
    pollingTimer = null
  }
}

function clearHeartbeatTimer(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer)
    heartbeatTimer = null
  }
}

function nextPollDelay(config: CompanionRelayConfig): number {
  if (consecutiveFailures <= 0) return config.pollIntervalMs
  const backoff = Math.min(30000, config.pollIntervalMs * Math.pow(2, consecutiveFailures))
  return Math.round(backoff)
}

function scheduleNextPoll(delayMs: number): void {
  if (!running) return
  clearPollingTimer()
  pollingTimer = setTimeout(() => {
    pollCycle().catch((error) => {
      lastError = String(error)
      activityLogger.log('gateway_action', `Companion relay cycle error: ${String(error)}`)
    })
  }, delayMs)
}

function scheduleHeartbeatLoop(): void {
  if (!running) return
  clearHeartbeatTimer()
  heartbeatTimer = setInterval(() => {
    void heartbeatCycle()
  }, HEARTBEAT_CHECK_INTERVAL_MS)
}

function shouldSendHeartbeat(): boolean {
  if (lastHeartbeatAtMs <= 0) return true
  return Date.now() - lastHeartbeatAtMs >= HEARTBEAT_INTERVAL_MS
}

async function sendHeartbeatIfDue(config: CompanionRelayConfig, force = false): Promise<void> {
  if (!force && !shouldSendHeartbeat()) return
  await sendHeartbeat(config)
  lastHeartbeatAtMs = Date.now()
}

async function teardownRealtimeSubscription(): Promise<void> {
  const channel = realtimeChannel
  const client = supabaseClient
  realtimeChannel = null
  realtimeChannelName = null
  realtimeConnected = false

  if (channel && client) {
    try {
      await client.removeChannel(channel)
    } catch (error) {
      activityLogger.log('gateway_action', `Companion realtime cleanup channel error: ${String(error)}`)
    }
  }

  if (client) {
    try {
      await client.realtime.disconnect()
    } catch (error) {
      activityLogger.log('gateway_action', `Companion realtime disconnect error: ${String(error)}`)
    }
  }

  supabaseClient = null
}

async function handleRealtimeHistoryRequest(channel: RealtimeChannel, payload: unknown): Promise<void> {
  const parsed = parseRealtimeHistoryRequestPayload(payload)
  if (!parsed) {
    activityLogger.log('api_call', 'Companion realtime history_request ignored: invalid payload')
    return
  }

  const { limit, sessionKey } = parsed
  const history = await getSessionHistory(sessionKey, limit)
  await broadcastRelayEvent(channel, 'history_response', {
    messages: history,
    sessionKey
  })
}

async function handleRealtimePing(channel: RealtimeChannel): Promise<void> {
  let status: 'online' | 'offline' = 'online'
  let gatewayStatus: unknown

  try {
    gatewayStatus = await gatewayHealth()
  } catch (error) {
    status = 'offline'
    gatewayStatus = { error: String(error) }
  }

  await broadcastRelayEvent(channel, 'pong', {
    status,
    gateway: gatewayStatus,
    timestamp: new Date().toISOString()
  })
}

async function handleRealtimeChatMessage(channel: RealtimeChannel, payload: unknown): Promise<void> {
  const parsed = parseRealtimeChatMessagePayload(payload)
  if (!parsed) {
    activityLogger.log('api_call', 'Companion realtime chat_message ignored: invalid payload')
    return
  }

  if (!canSendMessages()) {
    await broadcastRelayEvent(channel, 'chunk', {
      commandId: parsed.commandId,
      type: 'chunk',
      done: true,
      error: 'Pinchr send_messages permission is disabled'
    })
    return
  }

  try {
    await executeChatStream(
      {
        commandId: parsed.commandId,
        sessionKey: parsed.sessionKey,
        message: parsed.message,
        requireHttpStreamPost: false
      },
      channel
    )
  } catch (error) {
    await broadcastRelayEvent(channel, 'chunk', {
      commandId: parsed.commandId,
      type: 'chunk',
      done: true,
      error: String(error)
    })
  }
}

async function ensureRealtimeSubscription(config: CompanionRelayConfig): Promise<void> {
  if (!config.desktopId) return
  const channelName = `relay:${config.desktopId}`

  if (!config.supabaseAnonKey) {
    if (realtimeChannel || supabaseClient) {
      await teardownRealtimeSubscription()
    }
    return
  }

  if (realtimeChannel && realtimeChannelName === channelName && supabaseClient) {
    return
  }

  await teardownRealtimeSubscription()

  try {
    const client = createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    })
    if (config.authToken) {
      try {
        await client.realtime.setAuth(config.authToken)
      } catch (error) {
        activityLogger.log('gateway_action', `Companion realtime auth token setup failed: ${String(error)}`)
      }
    }

    const channel = client.channel(channelName)
    channel
      .on('broadcast', { event: 'chat_message' }, (event) => {
        void handleRealtimeChatMessage(channel, event.payload)
      })
      .on('broadcast', { event: 'history_request' }, (event) => {
        void handleRealtimeHistoryRequest(channel, event.payload)
      })
      .on('broadcast', { event: 'ping' }, () => {
        void handleRealtimePing(channel)
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          realtimeConnected = true
          lastError = undefined
          activityLogger.log('gateway_action', `Companion realtime connected: ${channelName}`)
          return
        }

        if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          realtimeConnected = false
          // Force heartbeat on next poll cycle when realtime drops.
          lastHeartbeatAtMs = 0
          activityLogger.log('gateway_action', `Companion realtime status: ${status}`)
        }
      })

    supabaseClient = client
    realtimeChannel = channel
    realtimeChannelName = channelName
  } catch (error) {
    activityLogger.log('gateway_action', `Companion realtime setup failed: ${String(error)}`)
    await teardownRealtimeSubscription()
  }
}

async function heartbeatCycle(): Promise<void> {
  if (!running) return

  const config = loadRelayConfig()
  if (!config.enabled || !hasRelayCredentials(config)) return

  try {
    await sendHeartbeatIfDue(config)
  } catch (error) {
    lastError = String(error)
    activityLogger.log('gateway_action', `Companion heartbeat error: ${String(error)}`)
  }
}

async function pollCycle(): Promise<void> {
  if (!running || inFlight) return

  const config = loadRelayConfig()
  if (!config.enabled || !hasRelayCredentials(config)) {
    running = false
    clearPollingTimer()
    clearHeartbeatTimer()
    void teardownRealtimeSubscription()
    return
  }

  inFlight = true
  try {
    await ensureRealtimeSubscription(config)
    await sendHeartbeatIfDue(config)
    const commands = await fetchPendingCommands(config)

    for (const command of commands) {
      await handleCommand(config, command)
    }

    consecutiveFailures = 0
    lastError = undefined
    lastSyncAt = new Date().toISOString()
  } catch (error) {
    consecutiveFailures += 1
    lastError = String(error)
    activityLogger.log('gateway_action', `Companion relay error: ${String(error)}`)
  } finally {
    inFlight = false
    scheduleNextPoll(nextPollDelay(config))
  }
}

export function getCompanionRelayStatus(): CompanionRelayStatus {
  const config = loadRelayConfig()
  return {
    running,
    configured: hasRelayCredentials(config),
    enabled: config.enabled,
    apiBaseUrl: config.apiBaseUrl,
    realtimeConnected,
    pollIntervalMs: config.pollIntervalMs,
    allowHighRiskRemoteActions: config.allowHighRiskRemoteActions,
    desktopId: config.desktopId,
    desktopName: config.desktopName,
    lastSyncAt,
    lastError
  }
}

export function updateCompanionRelaySettings(settings: CompanionRelaySettings): CompanionRelayStatus {
  const config = loadRelayConfig()

  if (typeof settings.enabled === 'boolean') {
    config.enabled = settings.enabled
  }

  if (typeof settings.apiBaseUrl === 'string') {
    config.apiBaseUrl = sanitizeApiBaseUrl(settings.apiBaseUrl)
  }

  if (typeof settings.pollIntervalMs === 'number') {
    config.pollIntervalMs = sanitizePollIntervalMs(settings.pollIntervalMs)
  }

  if (typeof settings.allowHighRiskRemoteActions === 'boolean') {
    config.allowHighRiskRemoteActions = settings.allowHighRiskRemoteActions
  }

  saveRelayConfig(config)

  if (!config.enabled && running) {
    stopCompanionRelay()
  } else if (config.enabled && hasRelayCredentials(config) && running) {
    // Restart polling loop to apply settings immediately.
    stopCompanionRelay()
    startCompanionRelay()
  }

  return getCompanionRelayStatus()
}

export function startCompanionRelay(): CompanionRelayStatus {
  const config = loadRelayConfig()

  if (running) return getCompanionRelayStatus()
  if (!config.enabled || !hasRelayCredentials(config)) {
    return getCompanionRelayStatus()
  }

  running = true
  consecutiveFailures = 0
  lastError = undefined
  lastHeartbeatAtMs = 0
  activityLogger.log('gateway_action', 'Companion relay started')
  scheduleHeartbeatLoop()
  scheduleNextPoll(250)
  return getCompanionRelayStatus()
}

export function stopCompanionRelay(): CompanionRelayStatus {
  if (!running) return getCompanionRelayStatus()
  running = false
  inFlight = false
  clearPollingTimer()
  clearHeartbeatTimer()
  void teardownRealtimeSubscription()
  activityLogger.log('gateway_action', 'Companion relay stopped')
  return getCompanionRelayStatus()
}

// ---------------------------------------------------------------------------
// Seamless Connection: Auto-register desktop via Supabase auth token
// ---------------------------------------------------------------------------

function computeDeviceFingerprint(): string {
  const raw = `${hostname()}:${userInfo().username}:${platform()}`
  return createHash('sha256').update(raw).digest('hex')
}

interface RegisterDesktopResponse {
  desktop_id: string
  relay_key: string
  name: string
  scopes: string[]
  created: boolean
}

export async function registerDesktop(authToken: string, desktopName?: string): Promise<CompanionRelayStatus> {
  const config = loadRelayConfig()
  const url = `${config.apiBaseUrl}/api/companion/desktop/register`

  const payload = await fetchRelayJson<RegisterDesktopResponse>(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`
    },
    body: JSON.stringify({
      desktop_name: desktopName || hostname(),
      platform: `${platform()}-${arch()}`,
      fingerprint: computeDeviceFingerprint()
    })
  })

  if (!payload?.desktop_id || !payload?.relay_key) {
    throw new Error('Invalid registration response from server')
  }

  const updated: CompanionRelayConfig = {
    ...config,
    enabled: true,
    desktopId: payload.desktop_id,
    desktopName: payload.name || desktopName || hostname(),
    relayKey: payload.relay_key,
    authToken
  }

  saveRelayConfig(updated)
  activityLogger.log('gateway_action', `Companion relay registered: ${updated.desktopId} (created: ${payload.created})`)

  if (running) {
    stopCompanionRelay()
  }
  startCompanionRelay()

  return getCompanionRelayStatus()
}

export async function claimCompanionPairingCode(pairingCode: string, desktopName?: string): Promise<CompanionRelayStatus> {
  const normalized = pairingCode.trim().toUpperCase()
  if (!normalized) {
    throw new Error('Pairing code is required')
  }

  const config = loadRelayConfig()
  const url = `${config.apiBaseUrl}/api/companion/pairing/claim`

  const payload = await fetchRelayJson<CompanionClaimResponse>(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      pairing_code: normalized,
      desktop_name: desktopName || config.desktopName || 'Pinchr Desktop',
      desktop_platform: `${platform()}-${arch()}`
    })
  })

  if (!payload?.paired || !payload?.desktop?.id || !payload?.relay_key) {
    throw new Error('Invalid pairing response from server')
  }

  const updated: CompanionRelayConfig = {
    ...config,
    enabled: true,
    desktopId: payload.desktop.id,
    desktopName: payload.desktop.name || desktopName || 'Pinchr Desktop',
    relayKey: payload.relay_key
  }

  saveRelayConfig(updated)
  activityLogger.log('gateway_action', `Companion relay paired: ${updated.desktopId}`)

  if (running) {
    stopCompanionRelay()
  }
  startCompanionRelay()

  return getCompanionRelayStatus()
}

export function disconnectCompanionRelay(): CompanionRelayStatus {
  const config = loadRelayConfig()
  config.desktopId = undefined
  config.relayKey = undefined
  saveRelayConfig(config)
  stopCompanionRelay()
  activityLogger.log('gateway_action', 'Companion relay disconnected')
  return getCompanionRelayStatus()
}

export async function pollCompanionRelayNow(): Promise<CompanionRelayStatus> {
  const config = loadRelayConfig()
  if (!config.enabled || !hasRelayCredentials(config)) {
    return getCompanionRelayStatus()
  }

  await pollCycle()
  return getCompanionRelayStatus()
}

export function companionRelayFingerprint(): string | null {
  const config = loadRelayConfig()
  if (!config.relayKey) return null
  return createHash('sha256').update(config.relayKey).digest('hex').slice(0, 12)
}
