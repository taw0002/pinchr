import { contextBridge, ipcRenderer } from 'electron'
import type {
  MCPServerConfig,
  MessageContentPart,
  OnboardingInstallExitEvent,
  OnboardingInstallOutputEvent,
  OnboardingInstallCommand,
  ProviderId,
  StreamChunk,
  WorkspaceFileChangedEvent
} from '../shared/types'

// Streaming event handlers
const streamHandlers = new Map<string, (data: any) => void>()

ipcRenderer.on('gateway:stream-chunk', (_, data) => {
  const handler = streamHandlers.get(`chunk-${data.streamId}`)
  if (handler) handler(data)
})

ipcRenderer.on('gateway:stream-error', (_, data) => {
  const handler = streamHandlers.get(`error-${data.streamId}`)
  if (handler) handler(data)
})

// Embedded terminal event handlers
const terminalDataHandlers = new Set<(data: string) => void>()
const terminalExitHandlers = new Set<(data: { exitCode: number | null; signal: number | null }) => void>()
const onboardingInstallOutputHandlers = new Set<(event: OnboardingInstallOutputEvent) => void>()
const onboardingInstallExitHandlers = new Set<(event: OnboardingInstallExitEvent) => void>()

ipcRenderer.on('terminal:data', (_, data) => {
  for (const handler of terminalDataHandlers) {
    handler(String(data ?? ''))
  }
})

ipcRenderer.on('terminal:exit', (_, data) => {
  const payload = {
    exitCode: typeof data?.exitCode === 'number' ? data.exitCode : null,
    signal: typeof data?.signal === 'number' ? data.signal : null
  }
  for (const handler of terminalExitHandlers) {
    handler(payload)
  }
})

ipcRenderer.on('onboarding:install-output', (_, data) => {
  const payload: OnboardingInstallOutputEvent = {
    runId: String(data?.runId ?? ''),
    command: data?.command as OnboardingInstallCommand,
    stream: data?.stream === 'stderr' ? 'stderr' : 'stdout',
    chunk: String(data?.chunk ?? '')
  }
  for (const handler of onboardingInstallOutputHandlers) {
    handler(payload)
  }
})

ipcRenderer.on('onboarding:install-exit', (_, data) => {
  const payload: OnboardingInstallExitEvent = {
    runId: String(data?.runId ?? ''),
    command: data?.command as OnboardingInstallCommand,
    code: typeof data?.code === 'number' ? data.code : null,
    signal: typeof data?.signal === 'string' ? data.signal : null,
    ok: data?.ok === true
  }
  for (const handler of onboardingInstallExitHandlers) {
    handler(payload)
  }
})

// Navigation and notification event handlers
let notificationClickHandler: ((data: any) => void) | null = null
let navigateHandler: ((route: string) => void) | null = null

ipcRenderer.on('notification-clicked', (_, data) => {
  if (notificationClickHandler) notificationClickHandler(data)
})

ipcRenderer.on('navigate-to', (_, route) => {
  if (navigateHandler) navigateHandler(route)
})

// Auth event handlers
let authSignedInHandler: ((user: any) => void) | null = null
let authSignedOutHandler: (() => void) | null = null

ipcRenderer.on('auth:signed-in', (_, user) => {
  if (authSignedInHandler) authSignedInHandler(user)
})

ipcRenderer.on('auth:signed-out', () => {
  if (authSignedOutHandler) authSignedOutHandler()
})

const api = {
  getAppVersion: () => ipcRenderer.invoke('app:version'),
  checkForUpdates: () => ipcRenderer.invoke('updater:check'),
  downloadUpdate: () => ipcRenderer.invoke('updater:download'),
  restartToUpdate: () => ipcRenderer.invoke('updater:restart'),
  gateway: {
    detect: () => ipcRenderer.invoke('gateway:detect'),
    health: () => ipcRenderer.invoke('gateway:health'),
    getSessions: () => ipcRenderer.invoke('gateway:sessions'),
    getAgentsList: () => ipcRenderer.invoke('gateway:agents-list'),
    getSessionHistory: (key: string, limit?: number) => ipcRenderer.invoke('gateway:session-history', key, limit),
    sendMessage: (key: string, message: string) =>
      ipcRenderer.invoke('gateway:send-message', key, message),
    parseTask: (input: string, projects: Array<{ id: string; name: string }>) =>
      ipcRenderer.invoke('gateway:parse-task', input, projects),
    streamMessage: (
      key: string,
      message: string | MessageContentPart[],
      workspaceContext?: { name: string; systemPromptAddition: string },
      sessionUser?: string,
      mainSessionKey?: string
    ) =>
      ipcRenderer.invoke('gateway:stream-message', key, message, workspaceContext, sessionUser, mainSessionKey),
    routeMessage: (mainSessionKey: string, message: string, routeContext?: Record<string, unknown>) =>
      ipcRenderer.invoke('gateway:route-message', mainSessionKey, message, routeContext),
    getMainSession: () => ipcRenderer.invoke('gateway:get-main-session'),
    onStreamChunk: (streamId: string, callback: (data: StreamChunk) => void) => {
      streamHandlers.set(`chunk-${streamId}`, callback)
      return () => streamHandlers.delete(`chunk-${streamId}`)
    },
    onStreamError: (streamId: string, callback: (data: any) => void) => {
      streamHandlers.set(`error-${streamId}`, callback)
      return () => streamHandlers.delete(`error-${streamId}`)
    },
    getConfig: () => ipcRenderer.invoke('gateway:config'),
    updateConfig: (config: Record<string, unknown>) =>
      ipcRenderer.invoke('gateway:update-config', config),
    restart: () => ipcRenderer.invoke('gateway:restart'),
    startShell: () => ipcRenderer.invoke('gateway:start-shell'),
    getSessionStatus: () => ipcRenderer.invoke('gateway:session-status'),
    toolsInvoke: (tool: string, args?: Record<string, unknown>, sessionKey?: string) =>
      ipcRenderer.invoke('gateway:tools-invoke', tool, args, sessionKey),
    toolsSessionsList: (parameters?: Record<string, unknown>) =>
      ipcRenderer.invoke('gateway:tools-sessions-list', parameters),
    toolsSessionStatus: (parameters?: Record<string, unknown>) =>
      ipcRenderer.invoke('gateway:tools-session-status', parameters),
    toolsCronList: () => ipcRenderer.invoke('gateway:tools-cron-list'),
    toolsCronRuns: (jobId: string, limit?: number) =>
      ipcRenderer.invoke('gateway:tools-cron-runs', jobId, limit),
    toolsCronSetEnabled: (jobId: string, enabled: boolean) =>
      ipcRenderer.invoke('gateway:tools-cron-set-enabled', jobId, enabled),
    toolsCronAdd: (job: Record<string, unknown>) =>
      ipcRenderer.invoke('gateway:tools-cron-add', job),
    toolsCronRemove: (jobId: string) =>
      ipcRenderer.invoke('gateway:tools-cron-remove', jobId),
    toolsCronRun: (jobId: string) =>
      ipcRenderer.invoke('gateway:tools-cron-run', jobId)
  },
  mcp: {
    listServers: () => ipcRenderer.invoke('mcp:list-servers'),
    addServer: (config: MCPServerConfig) => ipcRenderer.invoke('mcp:add-server', config),
    updateServer: (id: string, patch: Partial<MCPServerConfig>) =>
      ipcRenderer.invoke('mcp:update-server', id, patch),
    removeServer: (id: string) => ipcRenderer.invoke('mcp:remove-server', id),
    toggleServer: (id: string, enabled: boolean) =>
      ipcRenderer.invoke('mcp:toggle-server', id, enabled),
    listTools: (id: string) => ipcRenderer.invoke('mcp:list-tools', id),
    callHistory: (id: string) => ipcRenderer.invoke('mcp:call-history', id),
    callTool: (serverId: string, tool: string, args?: Record<string, unknown>) =>
      ipcRenderer.invoke('mcp:call-tool', serverId, tool, args),
    testConnection: (config: MCPServerConfig) => ipcRenderer.invoke('mcp:test-connection', config)
  },
  app: {
    version: () => ipcRenderer.invoke('app:version')
  },
  files: {
    list: () => ipcRenderer.invoke('files:list'),
    read: (filename: string) => ipcRenderer.invoke('files:read', filename),
    readBinary: (filename: string) => ipcRenderer.invoke('files:read-binary', filename),
    write: (filename: string, content: string) =>
      ipcRenderer.invoke('files:write', filename, content),
    delete: (filename: string) => ipcRenderer.invoke('files:delete', filename),
    importFromPath: (sourcePath: string, targetRelativePath: string) =>
      ipcRenderer.invoke('files:import-from-path', sourcePath, targetRelativePath)
  },
  workspace: {
    onFileChanged: (callback: (data: WorkspaceFileChangedEvent) => void) => {
      const listener = (_event: unknown, data: WorkspaceFileChangedEvent) => {
        callback(data)
      }
      ipcRenderer.on('workspace:file-changed', listener)
      return () => ipcRenderer.removeListener('workspace:file-changed', listener)
    }
  },
  voice: {
    transcribe: (audioBase64: string) => ipcRenderer.invoke('voice:transcribe', audioBase64),
    speak: (text: string) => ipcRenderer.invoke('voice:speak', text)
  },
  connections: {
    getTwilio: () => ipcRenderer.invoke('connections:get-twilio'),
    saveTwilio: (config: { accountSid: string; authToken: string; phoneNumber: string; enableSms: boolean; enableVoice: boolean }) =>
      ipcRenderer.invoke('connections:save-twilio', config),
    testTwilio: (config: { accountSid: string; authToken: string }) =>
      ipcRenderer.invoke('connections:test-twilio', config),
    removeTwilio: () => ipcRenderer.invoke('connections:remove-twilio'),
  },
  media: {
    pickFile: () => ipcRenderer.invoke('media:pick-file'),
    sendFile: (sessionKey: string, filePath: string, message: string) =>
      ipcRenderer.invoke('media:send-file', sessionKey, filePath, message)
  },
  dialog: {
    saveFile: (
      content: string,
      options?: { defaultPath?: string; filters?: Array<{ name: string; extensions: string[] }> }
    ) => ipcRenderer.invoke('dialog:save-file', content, options)
  },
  onboarding: {
    check: () => ipcRenderer.invoke('onboarding:check'),
    complete: () => ipcRenderer.invoke('onboarding:complete'),
    saveApiKey: (provider: string, apiKey: string) =>
      ipcRenderer.invoke('onboarding:save-api-key', provider, apiKey),
    saveChannelConfig: (channel: string, config: Record<string, unknown>) =>
      ipcRenderer.invoke('onboarding:save-channel-config', channel, config),
    saveToolConfig: (toolPath: string, value: unknown) =>
      ipcRenderer.invoke('onboarding:save-tool-config', toolPath, value),
    checkTool: (toolName: string) =>
      ipcRenderer.invoke('onboarding:check-tool', toolName),
    installSkill: (skillName: string) =>
      ipcRenderer.invoke('onboarding:install-skill', skillName),
    systemCheck: () => ipcRenderer.invoke('onboarding:system-check'),
    runInstall: (command: OnboardingInstallCommand) =>
      ipcRenderer.invoke('onboarding:run-install', command),
    onInstallOutput: (callback: (event: OnboardingInstallOutputEvent) => void) => {
      onboardingInstallOutputHandlers.add(callback)
      return () => onboardingInstallOutputHandlers.delete(callback)
    },
    onInstallExit: (callback: (event: OnboardingInstallExitEvent) => void) => {
      onboardingInstallExitHandlers.add(callback)
      return () => onboardingInstallExitHandlers.delete(callback)
    }
  },
  terminal: {
    checkOpenclaw: () => ipcRenderer.invoke('terminal:check-openclaw'),
    create: () => ipcRenderer.invoke('terminal:create'),
    write: (data: string) => ipcRenderer.invoke('terminal:write', data),
    resize: (cols: number, rows: number) => ipcRenderer.invoke('terminal:resize', cols, rows),
    close: () => ipcRenderer.invoke('terminal:close'),
    onData: (callback: (data: string) => void) => {
      terminalDataHandlers.add(callback)
      return () => terminalDataHandlers.delete(callback)
    },
    onExit: (callback: (data: { exitCode: number | null; signal: number | null }) => void) => {
      terminalExitHandlers.add(callback)
      return () => terminalExitHandlers.delete(callback)
    }
  },
  permissions: {
    check: () => ipcRenderer.invoke('permissions:check'),
    openSettings: (pane?: string) => ipcRenderer.invoke('permissions:open-settings', pane),
    relaunch: () => ipcRenderer.invoke('permissions:relaunch')
  },
  openclaw: {
    logsSnapshot: (lineLimit?: number) => ipcRenderer.invoke('openclaw:logs-snapshot', lineLimit)
  },
  quickActions: {
    load: () => ipcRenderer.invoke('quick-actions:load'),
    save: (actions: any[]) => ipcRenderer.invoke('quick-actions:save', actions)
  },
  notifications: {
    send: (options: { title: string; body: string; silent?: boolean }) =>
      ipcRenderer.invoke('notifications:send', options)
  },
  shell: {
    openExternal: (url: string) => ipcRenderer.invoke('shell:open-external', url),
    openPath: (path: string) => ipcRenderer.invoke('shell:open-path', path)
  },
  license: {
    status: () => ipcRenderer.invoke('license:status'),
    activate: (key: string) => ipcRenderer.invoke('license:activate', key),
    deactivate: () => ipcRenderer.invoke('license:deactivate')
  },
  security: {
    getActivity: (limit?: number, filterType?: string) =>
      ipcRenderer.invoke('security:get-activity', limit, filterType),
    getResources: () => ipcRenderer.invoke('security:get-resources'),
    getPermissions: () => ipcRenderer.invoke('security:get-permissions'),
    setPermission: (key: string, value: boolean | 'ask') =>
      ipcRenderer.invoke('security:set-permission', key, value),
    killSwitch: () => ipcRenderer.invoke('security:kill-switch'),
    exportLog: () => ipcRenderer.invoke('security:export-log'),
    workspaceChanges: () => ipcRenderer.invoke('security:workspace-changes'),
    fileDiff: (filePath: string) => ipcRenderer.invoke('security:file-diff', filePath)
  },
  telemetry: {
    track: (eventType: string, eventData?: Record<string, unknown>) =>
      ipcRenderer.invoke('telemetry:track', eventType, eventData),
    getOptOut: () => ipcRenderer.invoke('telemetry:get-opt-out'),
    setOptOut: (optOut: boolean) => ipcRenderer.invoke('telemetry:set-opt-out', optOut)
  },
  updater: {
    check: () => ipcRenderer.invoke('updater:check'),
    download: () => ipcRenderer.invoke('updater:download'),
    restart: () => ipcRenderer.invoke('updater:restart'),
    dismiss: (version: string) => ipcRenderer.invoke('updater:dismiss', version)
  },
  computer: {
    checkPermissions: () => ipcRenderer.invoke('computer:check-permissions'),
    installHelper: (helper: 'peekaboo' = 'peekaboo') =>
      ipcRenderer.invoke('computer:install-helper', helper),
    selfTest: () => ipcRenderer.invoke('computer:self-test'),
    openAccessibilityPrefs: () => ipcRenderer.invoke('computer:open-accessibility-prefs'),
    openScreenRecordingPrefs: () => ipcRenderer.invoke('computer:open-screen-recording-prefs'),
    screenshot: (options?: {
      mode?: 'screen' | 'window' | 'region'
      window?: string
      x?: number
      y?: number
      width?: number
      height?: number
    }) => ipcRenderer.invoke('computer:screenshot', options),
    see: (options?: {
      window?: string
      annotate?: boolean
    }) => ipcRenderer.invoke('computer:see', options),
    click: (target: {
      elementId?: string
      x?: number
      y?: number
      query?: string
    }) => ipcRenderer.invoke('computer:click', target),
    type: (text: string, options?: {
      pressReturn?: boolean
      clearFirst?: boolean
      slowly?: boolean
    }) => ipcRenderer.invoke('computer:type', text, options),
    press: (key: string, options?: {
      modifiers?: string[]
    }) => ipcRenderer.invoke('computer:press', key, options),
    hotkey: (keys: string) => ipcRenderer.invoke('computer:hotkey', keys),
    scroll: (direction: 'up' | 'down' | 'left' | 'right', amount?: number) =>
      ipcRenderer.invoke('computer:scroll', direction, amount),
    listApps: () => ipcRenderer.invoke('computer:list-apps'),
    listWindows: (app?: string) => ipcRenderer.invoke('computer:list-windows', app),
    appLaunch: (name: string) => ipcRenderer.invoke('computer:app-launch', name),
    appFocus: (name: string) => ipcRenderer.invoke('computer:app-focus', name),
    server: {
      start: () => ipcRenderer.invoke('computer:server-start'),
      stop: () => ipcRenderer.invoke('computer:server-stop'),
      status: () => ipcRenderer.invoke('computer:server-status')
    }
  },
  documents: {
    runningApps: () => ipcRenderer.invoke('documents:running-apps'),
    frontmostApp: () => ipcRenderer.invoke('documents:frontmost-app'),
    openDocuments: (appName?: string) => ipcRenderer.invoke('documents:open-documents', appName),
    read: (filePath: string) => ipcRenderer.invoke('documents:read', filePath),
    metadata: (filePath: string) => ipcRenderer.invoke('documents:metadata', filePath)
  },
  localModels: {
    discover: () => ipcRenderer.invoke('local-models:discover'),
    status: () => ipcRenderer.invoke('local-models:status'),
    select: (modelId: string, provider: string) =>
      ipcRenderer.invoke('local-models:select', modelId, provider)
  },
  providers: {
    list: () => ipcRenderer.invoke('providers:list'),
    setKey: (payload: { provider: ProviderId; apiKey: string }) =>
      ipcRenderer.invoke('providers:setKey', payload),
    removeKey: (payload: { provider: ProviderId }) =>
      ipcRenderer.invoke('providers:removeKey', payload)
  },
  companion: {
    status: () => ipcRenderer.invoke('companion:status'),
    start: () => ipcRenderer.invoke('companion:start'),
    stop: () => ipcRenderer.invoke('companion:stop'),
    updateSettings: (settings: {
      enabled?: boolean
      apiBaseUrl?: string
      pollIntervalMs?: number
      allowHighRiskRemoteActions?: boolean
    }) => ipcRenderer.invoke('companion:update-settings', settings),
    claimPairing: (pairingCode: string, desktopName?: string) =>
      ipcRenderer.invoke('companion:claim-pairing', pairingCode, desktopName),
    disconnect: () => ipcRenderer.invoke('companion:disconnect'),
    pollNow: () => ipcRenderer.invoke('companion:poll-now')
  },
  channelRouting: {
    getSettings: () => ipcRenderer.invoke('channels:get-routing-settings'),
    getMetrics: () => ipcRenderer.invoke('channels:get-routing-metrics'),
    updateSettings: (settings: { enabled?: boolean }) =>
      ipcRenderer.invoke('channels:set-routing-settings', settings)
  },
  auth: {
    signIn: () => ipcRenderer.invoke('auth:sign-in'),
    signOut: () => ipcRenderer.invoke('auth:sign-out'),
    getSession: () => ipcRenderer.invoke('auth:get-session'),
    onSignedIn: (callback: (user: any) => void) => {
      authSignedInHandler = callback
      return () => { authSignedInHandler = null }
    },
    onSignedOut: (callback: () => void) => {
      authSignedOutHandler = callback
      return () => { authSignedOutHandler = null }
    }
  },
  events: {
    onNotificationClick: (callback: (data: any) => void) => {
      notificationClickHandler = callback
      return () => { notificationClickHandler = null }
    },
    onNavigate: (callback: (route: string) => void) => {
      navigateHandler = callback
      return () => { navigateHandler = null }
    }
  }
}

contextBridge.exposeInMainWorld('api', api)
