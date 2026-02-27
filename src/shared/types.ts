export interface IpcResult<T = unknown> {
  ok: boolean
  data?: T
  error?: string
}

export interface GatewayHealth {
  status: string
  uptime?: number
  version?: string
}

export interface Session {
  key: string
  status: string
  model?: string
  tokenUsage?: {
    input?: number
    output?: number
    total?: number
  }
  createdAt?: string
  lastActivity?: string
  type?: string
  channel?: string
}

export interface PinchrSession {
  id: string
  name: string
  sessionKey: string
  createdAt: number
  updatedAt: number
  archived: boolean
}

export interface Message {
  role: 'user' | 'assistant' | 'system'
  content: string
  parts?: MessageContentPart[]
  timestamp?: string
  channel?: string
  isStreaming?: boolean
  isThinking?: boolean
  streamId?: string
  toolName?: string
  toolStatus?: string
  toolResult?: string
}

export interface StreamChunk {
  streamId: string
  content: string
  done: boolean
  error?: string
  isThinking?: boolean
  reasoning?: string
  reasoningContent?: string
  toolName?: string
  toolEvent?: 'start' | 'result'
  toolResult?: string
  route?: {
    topicId: string
    topicLabel: string
    sessionKey: string
    created: boolean
    confidence: number
  }
}

export type MessageContentPart =
  | {
      type: 'text'
      text: string
    }
  | {
      type: 'image_url'
      image_url: {
        url: string
      }
    }

export interface StreamChunkPayload {
  content: string
  done: boolean
  error?: string
  isThinking?: boolean
  reasoning?: string
  reasoningContent?: string
  toolName?: string
  toolEvent?: 'start' | 'result'
  toolResult?: string
  route?: {
    topicId: string
    topicLabel: string
    sessionKey: string
    created: boolean
    confidence: number
  }
}

export interface TopicRouteContext {
  channel?: string
  requestId?: string
  threadId?: string
  sourceSessionKey?: string
  sourceMessageId?: string
  sourceFingerprint?: string
}

// Computer Use types
export interface ComputerPermissions {
  screenRecording: boolean
  accessibility: boolean
  peekabooInstalled: boolean
}

export interface ScreenshotResult {
  image: string // base64 PNG
  width?: number
  height?: number
}

export interface ComputerElement {
  id: string
  role: string
  label?: string
  value?: string
  bounds?: { x: number; y: number; width: number; height: number }
  description?: string
}

export interface SeeResult {
  image: string // base64 PNG with annotations
  elements: ComputerElement[]
}

export interface ComputerSelfTestResult {
  ok: boolean
  screenshotOk: boolean
  seeOk: boolean
  elementCount: number
  details: string
}

export interface AppInfo {
  name: string
  bundleId?: string
  pid?: number
  active?: boolean
}

export interface WindowInfo {
  id: string
  title: string
  app: string
  bounds?: { x: number; y: number; width: number; height: number }
  focused?: boolean
}

export interface CompanionRelayStatus {
  running: boolean
  configured: boolean
  enabled: boolean
  apiBaseUrl: string
  pollIntervalMs: number
  allowHighRiskRemoteActions: boolean
  desktopId?: string
  desktopName?: string
  lastSyncAt?: string
  lastError?: string
  relayKeyFingerprint?: string | null
}

export interface CompanionRelaySettings {
  enabled?: boolean
  apiBaseUrl?: string
  pollIntervalMs?: number
  allowHighRiskRemoteActions?: boolean
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

export interface LocalModel {
  id: string
  name: string
  provider: 'lmstudio' | 'ollama'
  size?: number
  quantization?: string
  paramCount?: string
}

export interface LocalModelStatus {
  providers: Array<'lmstudio' | 'ollama'>
  models: LocalModel[]
  lastScan: number
}

export type ProviderId = 'anthropic' | 'openai' | 'google' | 'groq'

export interface ProviderConnection {
  id: ProviderId
  configured: boolean
  profileName: string | null
}

export interface GatewayConfig {
  model?: string
  thinking?: string
  channels?: {
    [channelName: string]: {
      enabled?: boolean
      dmPolicy?: string
      groupPolicy?: string
      selfChatMode?: boolean
      allowFrom?: string[]
      mode?: string
      webhookPath?: string
      botToken?: string
      appToken?: string
      userTokenReadOnly?: string
      signingSecret?: string
      cliPath?: string
      mediaMaxMb?: number
      debounceMs?: number
      dm?: {
        enabled?: boolean
        policy?: string
        allowFrom?: string[]
      }
      [key: string]: unknown
    }
  }
  gateway?: {
    port?: number
    mode?: string
    bind?: string
    auth?: {
      mode?: string
      token?: string
    }
    http?: {
      endpoints?: {
        chatCompletions?: {
          enabled?: boolean
        }
        responses?: {
          enabled?: boolean
        }
      }
    }
  }
  plugins?: {
    entries?: {
      [pluginName: string]: {
        enabled?: boolean
        [key: string]: unknown
      }
    }
  }
  [key: string]: unknown
}

export type MCPTransportType = 'stdio' | 'sse'
export type MCPConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'error'

export interface MCPServerConfig {
  id: string
  name: string
  description?: string
  transport: MCPTransportType
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
  enabled: boolean
  allowedSessions?: string[]
}

export interface MCPToolDefinition {
  name: string
  description?: string
  inputSchema?: Record<string, unknown>
}

export interface MCPServerInfo extends MCPServerConfig {
  status: MCPConnectionStatus
  error?: string
  tools: MCPToolDefinition[]
  lastConnectedAt?: string
}

export interface MCPConnectionTestResult {
  ok: boolean
  error?: string
  tools: MCPToolDefinition[]
}

export interface MCPToolCallRecord {
  toolName: string
  timestamp: string
  durationMs: number
  status: 'success' | 'error'
  error?: string
}

// Security & Activity types
export type ActionType =
  | 'file_read'
  | 'file_write'
  | 'command_run'
  | 'clipboard_access'
  | 'browser_action'
  | 'api_call'
  | 'permission_change'
  | 'gateway_action'
  | 'mcp_tool_call'

export type ActionStatus = 'allowed' | 'blocked' | 'pending'

export interface ActivityEntry {
  id: string
  timestamp: string
  actionType: ActionType
  description: string
  status: ActionStatus
  metadata?: Record<string, unknown>
}

export interface PermissionScopes {
  file_read: boolean
  file_write: boolean
  command_run: 'ask' | boolean
  clipboard_access: boolean
  browser_action: boolean
  send_messages: boolean
}

export interface ResourceStats {
  cpu: number
  memory: { rss: number; heapUsed: number; heapTotal: number }
  networkRequests: number
  uptime: number
}

// Workspace types
export type UserRole = 'developer' | 'product_manager' | 'marketer' | 'finance' | 'ceo' | 'sales' | 'custom'

export interface ConnectionConfig {
  id: string
  name: string
  icon: string
  status: 'connected' | 'disconnected' | 'error'
  authType: 'oauth' | 'api_key' | 'webhook'
  category: 'communication' | 'development' | 'analytics' | 'finance' | 'crm' | 'productivity'
}

export interface Task {
  id: string
  title: string
  description: string
  spec?: string // Markdown content for the task spec
}

export interface ParseTaskResult {
  title: string
  subtitle: string
  description: string
  priority: 'urgent' | 'high' | 'medium' | 'low'
  projectId: string | null
  subtasks: string[]
  tags: string[]
}

export interface QuickAction {
  id: string
  emoji: string
  label: string
  prompt: string
}

export interface Workspace {
  id: string
  name: string
  icon: string
  color: string
  quickActions: QuickAction[]
  connections: string[]
  systemPromptAddition: string
  dashboardWidgets: string[]
}

export interface AgentTab {
  id: string
  role: UserRole
  name: string
  emoji: string
  workspaces: Workspace[]
  activeWorkspaceId: string
  connections: ConnectionConfig[]
  systemPrompt: string
}

export interface WorkspaceFileChangedEvent {
  file: string
  timestamp: number
}

export interface SessionStatusParsed {
  openclawVersion?: string
  model?: string
  thinking?: string
  contextUsage?: string
  sessionKey?: string
  timestamp?: string
  raw: string
}

export interface OpenClawLogFileSnapshot {
  name: string
  path: string
  exists: boolean
  updatedAt: string | null
  lineCount: number
  truncated: boolean
  lines: string[]
}

export interface OpenClawLogsSnapshot {
  generatedAt: string
  files: OpenClawLogFileSnapshot[]
  combined: string[]
}

export interface AgentSessionSummary {
  key: string
  sessionKey: string
  agent: string
  status: string
  model?: string
  createdAt?: string
  lastActivity?: string
  metadata?: Record<string, unknown>
}

export interface ToolsSessionStatus {
  raw: string
  statusText?: string
  model?: string
  thinking?: string
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  costUsd?: number
  activeSessions?: number
  timestamp?: string
  details?: Record<string, unknown>
}

export interface CronScheduleCron {
  kind: 'cron'
  expr: string
  tz?: string
}

export interface CronScheduleEvery {
  kind: 'every'
  everyMs: number
}

export interface CronScheduleAt {
  kind: 'at'
  at: string
}

export type CronSchedule = CronScheduleCron | CronScheduleEvery | CronScheduleAt | string

export interface CronJobSummary {
  id: string
  name: string
  schedule: CronSchedule
  enabled: boolean
  nextRun?: string
  lastRun?: string
  agent?: string
  workflow?: string
  metadata?: Record<string, unknown>
}

export interface CronRunSummary {
  id: string
  jobId: string
  status: string
  startedAt?: string
  completedAt?: string
  durationMs?: number
  tokens?: number
  costUsd?: number
  summary?: string
  metadata?: Record<string, unknown>
}

export interface User {
  id: string
  email: string
  name: string
  avatarUrl?: string | null
  tier: string
  trialEndsAt?: string | null
  stripeCustomerId?: string | null
}

export interface ElectronAPI {
  getAppVersion: () => Promise<IpcResult<string>>
  checkForUpdates: () => Promise<IpcResult<{ available: boolean; version?: string; downloaded?: boolean; canDownload?: boolean }>>
  downloadUpdate: () => Promise<IpcResult<{ started: boolean; downloaded?: boolean; version?: string; source?: 'electron-updater' | 'manual' }>>
  restartToUpdate: () => Promise<IpcResult<void>>
  gateway: {
    health: () => Promise<IpcResult<GatewayHealth>>
    getSessions: () => Promise<IpcResult<Session[]>>
    getAgentsList: () => Promise<IpcResult<Array<{ id: string; name?: string; configured?: boolean }>>>
    getSessionHistory: (key: string, limit?: number) => Promise<IpcResult<Message[]>>
    sendMessage: (key: string, message: string) => Promise<IpcResult<unknown>>
    parseTask: (
      input: string,
      projects: Array<{ id: string; name: string }>
    ) => Promise<IpcResult<ParseTaskResult>>
    streamMessage: (
      key: string,
      message: string | MessageContentPart[],
      workspaceContext?: { name: string; systemPromptAddition: string },
      sessionUser?: string,
      mainSessionKey?: string
    ) => Promise<IpcResult<string>> // Returns stream ID
    routeMessage: (mainSessionKey: string, message: string, routeContext?: TopicRouteContext) => Promise<IpcResult<string>>
    getMainSession: () => Promise<IpcResult<string | null>>
    onStreamChunk: (streamId: string, callback: (data: StreamChunk) => void) => () => void // Returns cleanup function
    onStreamError: (streamId: string, callback: (data: any) => void) => () => void // Returns cleanup function
    getConfig: () => Promise<IpcResult<GatewayConfig>>
    getLegacyHomes: () => Promise<IpcResult<{ managedHome: string; homes: string[] }>>
    cleanupLegacyHomes: (homes?: string[]) => Promise<IpcResult<{
      managedHome: string
      archived: Array<{ source: string; archive: string }>
      removed: string[]
      skipped: Array<{ home: string; reason: string }>
      repairOk: boolean
      repairOutput: string
    }>>
    updateConfig: (config: Record<string, unknown>) => Promise<IpcResult<GatewayConfig>>
    restart: () => Promise<IpcResult<string>>
    repairShell: () => Promise<IpcResult<string>>
    startShell: () => Promise<IpcResult<string>>
    getSessionStatus: () => Promise<IpcResult<SessionStatusParsed>>
    toolsInvoke: (tool: string, args?: Record<string, unknown>, sessionKey?: string) => Promise<IpcResult<unknown>>
    toolsSessionsList: (parameters?: Record<string, unknown>) => Promise<IpcResult<unknown>>
    toolsSessionStatus: (parameters?: Record<string, unknown>) => Promise<IpcResult<unknown>>
    toolsCronList: () => Promise<IpcResult<unknown>>
    toolsCronRuns: (jobId: string, limit?: number) => Promise<IpcResult<unknown>>
    toolsCronSetEnabled: (jobId: string, enabled: boolean) => Promise<IpcResult<unknown>>
    toolsCronAdd: (job: Record<string, unknown>) => Promise<IpcResult<unknown>>
    toolsCronRemove: (jobId: string) => Promise<IpcResult<unknown>>
    toolsCronRun: (jobId: string) => Promise<IpcResult<unknown>>
  }
  mcp: {
    listServers: () => Promise<IpcResult<MCPServerInfo[]>>
    addServer: (config: MCPServerConfig) => Promise<IpcResult<MCPServerInfo>>
    updateServer: (id: string, patch: Partial<MCPServerConfig>) => Promise<IpcResult<MCPServerInfo>>
    removeServer: (id: string) => Promise<IpcResult<void>>
    toggleServer: (id: string, enabled: boolean) => Promise<IpcResult<MCPServerInfo>>
    listTools: (id: string) => Promise<IpcResult<MCPToolDefinition[]>>
    callHistory: (id: string) => Promise<IpcResult<MCPToolCallRecord[]>>
    callTool: (serverId: string, tool: string, args?: Record<string, unknown>) => Promise<IpcResult<unknown>>
    testConnection: (config: MCPServerConfig) => Promise<IpcResult<MCPConnectionTestResult>>
  }
  app: {
    version: () => Promise<IpcResult<string>>
  }
  files: {
    list: () => Promise<IpcResult<string[]>>
    read: (filename: string) => Promise<IpcResult<string>>
    readBinary: (filename: string) => Promise<IpcResult<{ base64: string; mime: string; size: number }>>
    write: (filename: string, content: string) => Promise<IpcResult<void>>
    delete: (filename: string) => Promise<IpcResult<void>>
    importFromPath: (
      sourcePath: string,
      targetRelativePath: string
    ) => Promise<IpcResult<{ path: string; name: string; size: number; type: string; createdAt: string }>>
  }
  workspace: {
    onFileChanged: (callback: (data: WorkspaceFileChangedEvent) => void) => () => void
  }
  voice: {
    transcribe: (audioBase64: string) => Promise<IpcResult<string>>
    speak: (text: string) => Promise<IpcResult<string> & { path?: string }>
  }
  media: {
    pickFile: () => Promise<IpcResult<string>>
    sendFile: (sessionKey: string, filePath: string, message: string) => Promise<IpcResult<unknown>>
  }
  dialog: {
    saveFile: (
      content: string,
      options?: { defaultPath?: string; filters?: Array<{ name: string; extensions: string[] }> }
    ) => Promise<IpcResult<string>>
  }
  onboarding: {
    check: () => Promise<IpcResult<{ completed: boolean }>>
    complete: () => Promise<IpcResult<void>>
    saveApiKey: (provider: string, apiKey: string) => Promise<IpcResult<void>>
    saveChannelConfig: (channel: string, config: Record<string, unknown>) => Promise<IpcResult<void>>
    saveToolConfig: (toolPath: string, value: unknown) => Promise<IpcResult<void>>
    checkTool: (toolName: string) => Promise<IpcResult<{ ok: boolean; version: string | null }>>
    installSkill: (skillName: string) => Promise<IpcResult<{ output: string }>>
    systemCheck: () => Promise<IpcResult<{
      cliInstalled: boolean
      cliVersion: string | null
      gatewayReachable: boolean
      gatewayStatus: string | null
    }>>
    writeInitialConfig: () => Promise<IpcResult<{ created: boolean; output: string }>>
    prepareGateway: () => Promise<IpcResult<{ output: string }>>
  }
  terminal: {
    create: () => Promise<IpcResult<void>>
    write: (data: string) => Promise<IpcResult<void>>
    resize: (cols: number, rows: number) => Promise<IpcResult<void>>
    close: () => Promise<IpcResult<void>>
    onData: (callback: (data: string) => void) => () => void
    onExit: (callback: (data: { exitCode: number | null; signal: number | null }) => void) => () => void
  }
  permissions: {
    check: () => Promise<IpcResult<{ screenRecording: boolean; accessibility: boolean }>>
    openSettings: (pane?: string) => Promise<IpcResult<void>>
    relaunch: () => Promise<void>
  }
  openclaw: {
    logsSnapshot: (lineLimit?: number) => Promise<IpcResult<OpenClawLogsSnapshot>>
  }
  quickActions: {
    load: () => Promise<IpcResult<Array<{ id: string; emoji: string; label: string; prompt: string }>>>
    save: (actions: Array<{ id: string; emoji: string; label: string; prompt: string }>) => Promise<IpcResult<void>>
  }
  notifications: {
    send: (options: { title: string; body: string; silent?: boolean }) => Promise<IpcResult<void>>
  }
  shell: {
    openExternal: (url: string) => Promise<IpcResult<void>>
    openPath: (path: string) => Promise<IpcResult<void>>
  }
  events: {
    onNotificationClick: (callback: (data: any) => void) => () => void
    onNavigate: (callback: (route: string) => void) => () => void
  }
  license: {
    status: () => Promise<IpcResult<{ valid: boolean; plan: 'free' }>>
    activate: (key: string) => Promise<IpcResult<{ valid: boolean; plan: 'free' }>>
    deactivate: () => Promise<IpcResult<void>>
  }
  security: {
    getActivity: (limit?: number, filterType?: ActionType) => Promise<IpcResult<ActivityEntry[]>>
    getResources: () => Promise<IpcResult<ResourceStats>>
    getPermissions: () => Promise<IpcResult<PermissionScopes>>
    setPermission: (key: keyof PermissionScopes, value: boolean | 'ask') => Promise<IpcResult<void>>
    killSwitch: () => Promise<IpcResult<void>>
    exportLog: () => Promise<IpcResult<string>>
    workspaceChanges: () => Promise<IpcResult<Array<{
      path: string
      modified: string
      size: number
      action: 'created' | 'modified' | 'deleted'
      summary?: string
    }>>>
    fileDiff: (filePath: string) => Promise<IpcResult<{
      diff?: string
      history?: Array<{ hash: string; date: string; message: string }>
    }>>
  }
  telemetry: {
    track: (eventType: string, eventData?: Record<string, unknown>) => Promise<IpcResult<void>>
    getOptOut: () => Promise<IpcResult<boolean>>
    setOptOut: (optOut: boolean) => Promise<IpcResult<void>>
  }
  updater: {
    check: () => Promise<IpcResult<{ available: boolean; version?: string; downloaded?: boolean; canDownload?: boolean }>>
    download: () => Promise<IpcResult<{ started: boolean; downloaded?: boolean; version?: string; source?: 'electron-updater' | 'manual' }>>
    restart: () => Promise<IpcResult<void>>
    dismiss: (version: string) => Promise<IpcResult<void>>
  }
  computer: {
    checkPermissions: () => Promise<IpcResult<ComputerPermissions>>
    installHelper: (helper?: 'peekaboo') => Promise<IpcResult<{ installed: boolean; output: string }>>
    selfTest: () => Promise<IpcResult<ComputerSelfTestResult>>
    openAccessibilityPrefs: () => Promise<IpcResult<void>>
    openScreenRecordingPrefs: () => Promise<IpcResult<void>>
    screenshot: (options?: {
      mode?: 'screen' | 'window' | 'region'
      window?: string
      x?: number
      y?: number
      width?: number
      height?: number
    }) => Promise<IpcResult<ScreenshotResult>>
    see: (options?: {
      window?: string
      annotate?: boolean
    }) => Promise<IpcResult<SeeResult>>
    click: (target: {
      elementId?: string
      x?: number
      y?: number
      query?: string
    }) => Promise<IpcResult<void>>
    type: (text: string, options?: {
      pressReturn?: boolean
      clearFirst?: boolean
      slowly?: boolean
    }) => Promise<IpcResult<void>>
    press: (key: string, options?: {
      modifiers?: string[]
    }) => Promise<IpcResult<void>>
    hotkey: (keys: string) => Promise<IpcResult<void>>
    scroll: (direction: 'up' | 'down' | 'left' | 'right', amount?: number) => Promise<IpcResult<void>>
    listApps: () => Promise<IpcResult<AppInfo[]>>
    listWindows: (app?: string) => Promise<IpcResult<WindowInfo[]>>
    appLaunch: (name: string) => Promise<IpcResult<void>>
    appFocus: (name: string) => Promise<IpcResult<void>>
    server: {
      start: () => Promise<IpcResult<{ port: number; url: string; authToken: string }>>
      stop: () => Promise<IpcResult<void>>
      status: () => Promise<IpcResult<{ running: boolean; port?: number; url?: string }>>
    }
  }
  companion: {
    status: () => Promise<IpcResult<CompanionRelayStatus>>
    start: () => Promise<IpcResult<CompanionRelayStatus>>
    stop: () => Promise<IpcResult<CompanionRelayStatus>>
    updateSettings: (settings: CompanionRelaySettings) => Promise<IpcResult<CompanionRelayStatus>>
    claimPairing: (pairingCode: string, desktopName?: string) => Promise<IpcResult<CompanionRelayStatus>>
    disconnect: () => Promise<IpcResult<CompanionRelayStatus>>
    pollNow: () => Promise<IpcResult<CompanionRelayStatus>>
  }
  channelRouting: {
    getSettings: () => Promise<IpcResult<{ enabled: boolean }>>
    getMetrics: () => Promise<IpcResult<ChannelRoutingMetricsSnapshot>>
    updateSettings: (settings: { enabled?: boolean }) => Promise<IpcResult<{ enabled: boolean }>>
  }
  localModels: {
    discover: () => Promise<IpcResult<LocalModelStatus>>
    status: () => Promise<IpcResult<LocalModelStatus>>
    select: (modelId: string, provider: string) => Promise<IpcResult<LocalModelStatus>>
  }
  providers: {
    list: () => Promise<IpcResult<{ providers: ProviderConnection[] }>>
    setKey: (payload: { provider: ProviderId; apiKey: string }) => Promise<IpcResult<{ ok: boolean }>>
    removeKey: (payload: { provider: ProviderId }) => Promise<IpcResult<{ ok: boolean }>>
  }
  auth: {
    signIn: () => Promise<IpcResult<void>>
    signOut: () => Promise<IpcResult<void>>
    getSession: () => Promise<IpcResult<{ user: User } | null>>
    onSignedIn: (callback: (user: User) => void) => () => void
    onSignedOut: (callback: () => void) => () => void
  }
}
