import { ipcMain, dialog, webContents, shell, app, type WebContents } from 'electron'
import {
  accessSync,
  cpSync,
  readFileSync,
  writeFileSync,
  chmodSync,
  readdirSync,
  existsSync,
  mkdirSync,
  copyFileSync,
  unlinkSync,
  statSync,
  rmSync,
  openSync,
  readSync,
  closeSync,
  constants as fsConstants
} from 'fs'
import { basename, dirname, extname, isAbsolute, join } from 'path'
import { homedir } from 'os'
import { exec, execSync } from 'child_process'
import { randomUUID } from 'crypto'
import { createRequire } from 'module'
import * as pty from 'node-pty'
import {
  gatewayHealth,
  getSessions,
  getSessionHistory,
  getAgentsList,
  sendMessage,
  streamMessage,
  getGatewayConfig,
  updateConfig,
  getGatewayUrl,
  getGatewayToken,
  getHeaders,
  restartGateway,
  getSessionStatus,
  parseSessionStatus,
  getMainSession
} from './gateway'
import { routeMessageToTopicSession, type TopicRouteInboundContext } from './topic-router'
import type {
  ActionType,
  MCPConnectionTestResult,
  MCPServerConfig,
  MessageContentPart,
  ParseTaskResult,
  ProviderId,
  PermissionScopes,
  StreamChunkPayload
} from '../shared/types'
import type { MCPManager } from './mcp'
import {
  getLicenseStatus,
  activateLicense,
  deactivateLicense
} from './license'
import {
  checkPermissions,
  screenshot,
  see,
  click,
  type as typeText,
  press,
  hotkey,
  scroll,
  listApps,
  listWindows,
  appLaunch,
  appFocus
} from './computer'
import {
  startComputerServer,
  stopComputerServer,
  getServerStatus
} from './computer-server'
import {
  getRunningApps,
  getFrontmostApp,
  getOpenDocuments,
  readDocumentContent,
  getDocumentMetadata
} from './documents'
import {
  discoverLocalModels,
  getLocalModelStatus,
  startDiscovery,
  stopDiscovery
} from './local-models'
import {
  listProviderStatuses,
  removeProviderKey,
  setProviderKey
} from './providers'
import {
  getCompanionRelayStatus,
  startCompanionRelay,
  stopCompanionRelay,
  updateCompanionRelaySettings,
  claimCompanionPairingCode,
  registerDesktop,
  disconnectCompanionRelay,
  pollCompanionRelayNow,
  companionRelayFingerprint
} from './companion-relay'
import { activityLogger } from './activity-log'
import {
  getChannelRoutingMetrics as getMonitorChannelRoutingMetrics,
  getChannelRoutingSettings as getMonitorChannelRoutingSettings,
  setChannelRoutingSettings as setMonitorChannelRoutingSettings
} from './monitor'
import { telemetry } from './telemetry'
import {
  checkForUpdates,
  dismissVersion,
  downloadUpdate as downloadAppUpdate,
  restartToUpdate as restartAppToUpdate
} from './updater'

const OPENCLAW_HOME_PATH = join(homedir(), '.openclaw')
const WORKSPACE_PATH = join(OPENCLAW_HOME_PATH, 'workspace')
const PINCHR_CONFIG_PATH = join(homedir(), '.pinchr', 'config.json')
const OPENCLAW_CONFIG_PATH = join(OPENCLAW_HOME_PATH, 'openclaw.json')
const OPENCLAW_MAIN_AGENT_DIR = join(OPENCLAW_HOME_PATH, 'agents', 'main', 'agent')
const OPENCLAW_AUTH_PROFILES_PATH = join(OPENCLAW_MAIN_AGENT_DIR, 'auth-profiles.json')
const OPENCLAW_GATEWAY_LAUNCH_AGENT_PATH = join(homedir(), 'Library', 'LaunchAgents', 'ai.openclaw.gateway.plist')
const OPENCLAW_NODE_LAUNCH_AGENT_PATH = join(homedir(), 'Library', 'LaunchAgents', 'ai.openclaw.node.plist')
const OPENCLAW_LOGS_PATH = join(homedir(), '.openclaw', 'logs')
const QUICK_ACTIONS_PATH = join(homedir(), '.pinchr', 'quick-actions.json')
const TERMINAL_ROWS = 24
const TERMINAL_COLS = 80
const LOG_TAIL_MAX_BYTES = 400_000
const OPENCLAW_LOG_FILENAMES = ['gateway.log', 'gateway.err.log', 'node.log', 'node.err.log'] as const
const BUNDLED_OPENCLAW_ENTRY = 'openclaw/openclaw.mjs'
const PINCHR_BIN_PATH = join(homedir(), '.pinchr', 'bin')
const OPENCLAW_SHIM_MARKER = '# pinchr-openclaw-shim'
const ONBOARDING_PROVIDER_DEFAULT_MODELS: Record<string, string> = {
  anthropic: 'anthropic/claude-sonnet-4-20250514',
  openai: 'openai/gpt-4.1',
  google: 'google/gemini-2.5-pro'
}
const SUPPORTED_PROVIDER_IDS: ProviderId[] = ['anthropic', 'openai', 'google', 'groq']

const DEFAULT_PERMISSIONS: PermissionScopes = {
  file_read: true,
  file_write: true,
  command_run: 'ask',
  clipboard_access: false,
  browser_action: false,
  send_messages: true
}

type TerminalSession = {
  ptyProcess: pty.IPty
}

const terminalSessions = new Map<number, TerminalSession>()
let bundledOpenclawScriptPath: string | null | undefined

function resolveShell(): string {
  if (process.platform === 'win32') {
    return process.env.COMSPEC || 'powershell.exe'
  }
  if (process.platform === 'darwin') {
    return process.env.SHELL || '/bin/zsh'
  }
  return process.env.SHELL || '/bin/bash'
}

function sendTerminalEvent(senderId: number, channel: string, payload: unknown): void {
  const targetContents = webContents.fromId(senderId)
  if (!targetContents || targetContents.isDestroyed()) return
  targetContents.send(channel, payload)
}

function closeTerminalSession(senderId: number, fromExit = false): boolean {
  const session = terminalSessions.get(senderId)
  if (!session) return false

  terminalSessions.delete(senderId)
  if (!fromExit) {
    try {
      session.ptyProcess.kill()
    } catch {
      // Ignore kill errors if the process has already exited.
    }
  }

  return true
}

function createTerminalSession(sender: WebContents): { ok: boolean; error?: string } {
  const senderId = sender.id
  closeTerminalSession(senderId)

  try {
    const ptyProcess = pty.spawn(resolveShell(), [], {
      name: 'xterm-256color',
      cols: TERMINAL_COLS,
      rows: TERMINAL_ROWS,
      cwd: WORKSPACE_PATH,
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        PATH: commandPath(),
        OPENCLAW_HOME: process.env.OPENCLAW_HOME || OPENCLAW_HOME_PATH
      }
    })

    terminalSessions.set(senderId, { ptyProcess })

    ptyProcess.onData((data) => {
      sendTerminalEvent(senderId, 'terminal:data', data)
    })

    ptyProcess.onExit((exitEvent) => {
      sendTerminalEvent(senderId, 'terminal:exit', {
        exitCode: exitEvent.exitCode,
        signal: exitEvent.signal
      })
      closeTerminalSession(senderId, true)
    })

    sender.once('destroyed', () => {
      closeTerminalSession(senderId)
    })

    return { ok: true }
  } catch (error) {
    return { ok: false, error: String(error) }
  }
}

/**
 * Check if a permission scope is allowed.
 * Returns true if allowed, false if blocked, 'ask' if needs confirmation.
 */
function checkPermissionScope(scope: keyof PermissionScopes): boolean | 'ask' {
  try {
    if (existsSync(PINCHR_CONFIG_PATH)) {
      const config = JSON.parse(readFileSync(PINCHR_CONFIG_PATH, 'utf-8'))
      const permissions = { ...DEFAULT_PERMISSIONS, ...(config.permissions || {}) }
      return permissions[scope] ?? DEFAULT_PERMISSIONS[scope]
    }
  } catch { /* fallback to defaults */ }
  return DEFAULT_PERMISSIONS[scope]
}

function enforcePermission(scope: keyof PermissionScopes, description: string): void {
  const perm = checkPermissionScope(scope)
  if (perm === false) {
    activityLogger.log(scope as ActionType, description, 'blocked')
    throw new Error(`Permission denied: ${scope} is disabled in Pinchr security settings`)
  }
  // 'ask' and true both allow (ask confirmation is handled in renderer for now)
}

function readPinchrConfig(): Record<string, unknown> {
  try {
    if (existsSync(PINCHR_CONFIG_PATH)) {
      return JSON.parse(readFileSync(PINCHR_CONFIG_PATH, 'utf-8'))
    }
  } catch { /* ignore */ }
  return {}
}

function writePinchrConfig(config: Record<string, unknown>): void {
  const configDir = join(homedir(), '.pinchr')
  if (!existsSync(configDir)) mkdirSync(configDir, { recursive: true })
  writeFileSync(PINCHR_CONFIG_PATH, JSON.stringify(config, null, 2))
}

function readChannelTopicRoutingEnabled(config: Record<string, unknown>): boolean {
  const routing = isPlainRecord(config.routing) ? config.routing : {}
  const channels = isPlainRecord(routing.channels) ? routing.channels : {}
  return typeof channels.topicRoutingEnabled === 'boolean' ? channels.topicRoutingEnabled : true
}

function writeChannelTopicRoutingEnabled(config: Record<string, unknown>, enabled: boolean): Record<string, unknown> {
  const routing = isPlainRecord(config.routing) ? { ...config.routing } : {}
  const channels = isPlainRecord((routing as Record<string, unknown>).channels)
    ? { ...((routing as Record<string, unknown>).channels as Record<string, unknown>) }
    : {}

  channels.topicRoutingEnabled = enabled
  ;(routing as Record<string, unknown>).channels = channels
  config.routing = routing
  return config
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function readOpenClawConfig(): Record<string, unknown> {
  try {
    if (!existsSync(OPENCLAW_CONFIG_PATH)) {
      return {}
    }
    const parsed = JSON.parse(readFileSync(OPENCLAW_CONFIG_PATH, 'utf-8'))
    if (isPlainRecord(parsed)) {
      return parsed
    }
  } catch {
    // Ignore parse errors and return an empty config.
  }
  return {}
}

function writeOpenClawConfig(config: Record<string, unknown>): void {
  const configDir = dirname(OPENCLAW_CONFIG_PATH)
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true })
  }
  writeFileSync(OPENCLAW_CONFIG_PATH, JSON.stringify(config, null, 2))
}

function readGatewayConfigToken(): string | null {
  const config = readOpenClawConfig()
  const gateway = isPlainRecord(config.gateway) ? (config.gateway as Record<string, unknown>) : null
  const auth = gateway && isPlainRecord(gateway.auth) ? (gateway.auth as Record<string, unknown>) : null
  return readNonEmptyString(auth?.token) ?? null
}

function readGatewayLaunchAgentToken(): string | null {
  try {
    if (!existsSync(OPENCLAW_GATEWAY_LAUNCH_AGENT_PATH)) return null
    const plist = readFileSync(OPENCLAW_GATEWAY_LAUNCH_AGENT_PATH, 'utf-8')
    const match = plist.match(
      /<key>\s*OPENCLAW_GATEWAY_TOKEN\s*<\/key>\s*<string>\s*([^<]+?)\s*<\/string>/i
    )
    return readNonEmptyString(match?.[1]) ?? null
  } catch {
    return null
  }
}

function readLaunchAgentEnvValue(plistPath: string, envKey: string): string | null {
  try {
    if (!existsSync(plistPath)) return null
    const plist = readFileSync(plistPath, 'utf-8')
    const escapedKey = envKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const pattern = new RegExp(
      `<key>\\s*${escapedKey}\\s*<\\/key>\\s*<string>\\s*([^<]+?)\\s*<\\/string>`,
      'i'
    )
    const match = plist.match(pattern)
    return readNonEmptyString(match?.[1]) ?? null
  } catch {
    return null
  }
}

function discoverLegacyOpenclawHomes(): string[] {
  const candidates = [
    readLaunchAgentEnvValue(OPENCLAW_GATEWAY_LAUNCH_AGENT_PATH, 'OPENCLAW_HOME'),
    readLaunchAgentEnvValue(OPENCLAW_NODE_LAUNCH_AGENT_PATH, 'OPENCLAW_HOME')
  ]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.trim())
    .filter((value) => value.length > 0 && isAbsolute(value))
    .filter((value) => value !== OPENCLAW_HOME_PATH)

  return Array.from(new Set(candidates))
}

function migrateLegacyOpenclawConfigIfNeeded(): { migrated: boolean; sourceHome?: string } {
  if (existsSync(OPENCLAW_CONFIG_PATH)) return { migrated: false }

  const legacyHomes = discoverLegacyOpenclawHomes()
  for (const sourceHome of legacyHomes) {
    const sourceConfigPath = join(sourceHome, 'openclaw.json')
    if (!existsSync(sourceConfigPath)) continue

    try {
      if (!existsSync(OPENCLAW_HOME_PATH)) {
        mkdirSync(OPENCLAW_HOME_PATH, { recursive: true })
      }

      copyFileSync(sourceConfigPath, OPENCLAW_CONFIG_PATH)

      const sourceAuthProfilesPath = join(sourceHome, 'agents', 'main', 'agent', 'auth-profiles.json')
      if (existsSync(sourceAuthProfilesPath) && !existsSync(OPENCLAW_AUTH_PROFILES_PATH)) {
        if (!existsSync(OPENCLAW_MAIN_AGENT_DIR)) {
          mkdirSync(OPENCLAW_MAIN_AGENT_DIR, { recursive: true })
        }
        copyFileSync(sourceAuthProfilesPath, OPENCLAW_AUTH_PROFILES_PATH)
      }

      return { migrated: true, sourceHome }
    } catch {
      // Keep scanning other candidates.
    }
  }

  return { migrated: false }
}

interface LegacyOpenclawCleanupResult {
  managedHome: string
  archived: Array<{ source: string; archive: string }>
  removed: string[]
  skipped: Array<{ home: string; reason: string }>
}

function isManagedOpenclawHomePath(pathValue: string): boolean {
  return pathValue.replace(/\/+$/, '') === OPENCLAW_HOME_PATH.replace(/\/+$/, '')
}

function isCleanupTargetSafe(pathValue: string): boolean {
  const normalized = pathValue.replace(/\/+$/, '')
  const home = homedir().replace(/\/+$/, '')
  return isAbsolute(normalized) && normalized.startsWith(`${home}/`) && !isManagedOpenclawHomePath(normalized)
}

function createLegacyOpenclawArchivePath(sourceHome: string): string {
  const backupRoot = join(homedir(), '.pinchr', 'backups', 'openclaw')
  if (!existsSync(backupRoot)) {
    mkdirSync(backupRoot, { recursive: true })
  }

  const safeBase = basename(sourceHome).replace(/[^a-zA-Z0-9._-]+/g, '-') || 'openclaw-home'
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  let archivePath = join(backupRoot, `${safeBase}-${timestamp}`)
  let suffix = 1
  while (existsSync(archivePath)) {
    archivePath = join(backupRoot, `${safeBase}-${timestamp}-${suffix}`)
    suffix += 1
  }
  return archivePath
}

function cleanupLegacyOpenclawHomes(requestedHomes?: string[]): LegacyOpenclawCleanupResult {
  const discovered = discoverLegacyOpenclawHomes()
  const discoveredSet = new Set(discovered)

  const requested = Array.isArray(requestedHomes)
    ? requestedHomes.map((home) => home.trim()).filter(Boolean)
    : []
  const targets = requested.length > 0 ? Array.from(new Set(requested)) : discovered

  const archived: Array<{ source: string; archive: string }> = []
  const removed: string[] = []
  const skipped: Array<{ home: string; reason: string }> = []

  for (const home of targets) {
    if (!discoveredSet.has(home)) {
      skipped.push({ home, reason: 'not_discovered' })
      continue
    }

    if (!isCleanupTargetSafe(home)) {
      skipped.push({ home, reason: 'unsafe_path' })
      continue
    }

    if (!existsSync(home)) {
      skipped.push({ home, reason: 'path_missing' })
      continue
    }

    if (!existsSync(join(home, 'openclaw.json'))) {
      skipped.push({ home, reason: 'missing_openclaw_config' })
      continue
    }

    const archivePath = createLegacyOpenclawArchivePath(home)
    try {
      cpSync(home, archivePath, {
        recursive: true,
        force: false,
        errorOnExist: true,
        preserveTimestamps: true
      })
      rmSync(home, { recursive: true, force: true })
      archived.push({ source: home, archive: archivePath })
      removed.push(home)
    } catch (error) {
      skipped.push({ home, reason: `archive_or_remove_failed: ${String(error)}` })
      if (existsSync(archivePath)) {
        try {
          rmSync(archivePath, { recursive: true, force: true })
        } catch {
          // Best-effort rollback cleanup.
        }
      }
    }
  }

  return {
    managedHome: OPENCLAW_HOME_PATH,
    archived,
    removed,
    skipped
  }
}

function hasGatewayTokenDrift(): boolean {
  const configToken = readGatewayConfigToken()
  const launchAgentToken = readGatewayLaunchAgentToken()
  if (!configToken || !launchAgentToken) return false
  return configToken !== launchAgentToken
}

function isGatewayAuthFailure(error: unknown): boolean {
  const text = String(error ?? '').toLowerCase()
  return text.includes('token mismatch')
    || text.includes('unauthorized')
    || text.includes('401')
    || text.includes('code=1008')
}

async function attemptGatewaySelfRepair(triggerError?: unknown): Promise<{
  attempted: boolean
  ok: boolean
  output: string
}> {
  const shouldRepair = hasGatewayTokenDrift() || isGatewayAuthFailure(triggerError)
  if (!shouldRepair) return { attempted: false, ok: false, output: '' }

  const prepared = await prepareGatewayRuntime()
  return {
    attempted: true,
    ok: prepared.ok,
    output: prepared.output || ''
  }
}

async function runGatewayOpWithAutoRepair<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    const repairResult = await attemptGatewaySelfRepair(error)
    if (!repairResult.attempted) {
      throw error
    }
    if (!repairResult.ok) {
      const message = repairResult.output || 'Gateway self-repair failed.'
      throw new Error(`${String(error)}\n\n${message}`)
    }
    return await operation()
  }
}

function readAuthProfiles(): Record<string, unknown> {
  try {
    if (!existsSync(OPENCLAW_AUTH_PROFILES_PATH)) {
      return {}
    }
    const parsed = JSON.parse(readFileSync(OPENCLAW_AUTH_PROFILES_PATH, 'utf-8'))
    if (isPlainRecord(parsed)) {
      return parsed
    }
  } catch {
    // Ignore parse errors and return a default structure.
  }
  return {}
}

function writeAuthProfiles(config: Record<string, unknown>): void {
  if (!existsSync(OPENCLAW_MAIN_AGENT_DIR)) {
    mkdirSync(OPENCLAW_MAIN_AGENT_DIR, { recursive: true })
  }
  writeFileSync(OPENCLAW_AUTH_PROFILES_PATH, JSON.stringify(config, null, 2))
}

function providerDefaultModel(provider: string): string {
  return ONBOARDING_PROVIDER_DEFAULT_MODELS[provider] || ONBOARDING_PROVIDER_DEFAULT_MODELS.anthropic
}

function getBundledNodePath(): string | null {
  // Bundled Node binary at <app>/Contents/Resources/node/node
  const bundledNode = join(process.resourcesPath, 'node', 'node')
  if (existsSync(bundledNode)) return bundledNode
  // Dev fallback: resources/node/node relative to project root
  const devNode = join(__dirname, '..', '..', 'resources', 'node', 'node')
  if (existsSync(devNode)) return devNode
  return null
}

function getBundledPeekabooDir(): string | null {
  // Bundled peekaboo binary at <app>/Contents/Resources/peekaboo/peekaboo
  const bundledPeekaboo = join(process.resourcesPath, 'peekaboo', 'peekaboo')
  if (existsSync(bundledPeekaboo)) return dirname(bundledPeekaboo)
  // Dev fallback: resources/peekaboo/peekaboo relative to project root
  const devPeekaboo = join(__dirname, '..', '..', 'resources', 'peekaboo', 'peekaboo')
  if (existsSync(devPeekaboo)) return dirname(devPeekaboo)
  return null
}

function getBundledOpenclawScriptPath(): string | null {
  if (bundledOpenclawScriptPath !== undefined) return bundledOpenclawScriptPath
  try {
    const unpackedPath = join(
      process.resourcesPath,
      'app.asar.unpacked',
      'node_modules',
      'openclaw',
      'openclaw.mjs'
    )
    if (existsSync(unpackedPath)) {
      bundledOpenclawScriptPath = unpackedPath
      return bundledOpenclawScriptPath
    }

    const require = createRequire(import.meta.url)
    bundledOpenclawScriptPath = require.resolve(BUNDLED_OPENCLAW_ENTRY)
  } catch {
    bundledOpenclawScriptPath = null
  }
  return bundledOpenclawScriptPath
}

function buildOpenclawShimScript(bundledScriptPath: string, bundledNode: string | null): string {
  const nodeResolution = bundledNode
    ? `OPENCLAW_NODE_BIN="${bundledNode}"`
    : [
        'OPENCLAW_NODE_BIN="${OPENCLAW_NODE_BIN:-$(command -v node 2>/dev/null || true)}"',
        `if [ -z "$OPENCLAW_NODE_BIN" ]; then OPENCLAW_NODE_BIN="${process.execPath}"; fi`
      ].join('\n')

  return [
    '#!/bin/sh',
    OPENCLAW_SHIM_MARKER,
    'export OPENCLAW_HOME="${OPENCLAW_HOME:-$HOME/.openclaw}"',
    nodeResolution,
    'export ELECTRON_RUN_AS_NODE=1',
    `exec "$OPENCLAW_NODE_BIN" "${bundledScriptPath}" "$@"`
  ].join('\n')
}

function isManagedOpenclawShimScript(script: string): boolean {
  return script.includes(OPENCLAW_SHIM_MARKER)
    || (
      script.includes('app.asar.unpacked/node_modules/openclaw/openclaw.mjs')
      && script.includes('OPENCLAW_HOME')
      && script.includes('ELECTRON_RUN_AS_NODE=1')
    )
}

function writeManagedOpenclawShim(shimPath: string, script: string): boolean {
  try {
    const existing = existsSync(shimPath) ? readFileSync(shimPath, 'utf-8') : ''
    if (existing && existing !== script && !isManagedOpenclawShimScript(existing)) {
      return false
    }

    if (existing !== script) {
      writeFileSync(shimPath, script, 'utf-8')
    }
    chmodSync(shimPath, 0o755)
    return true
  } catch {
    return false
  }
}

function hasUnmanagedOpenclawOnPath(): boolean {
  const pathEntries = (process.env.PATH || '')
    .split(':')
    .map((entry) => entry.trim())
    .filter(Boolean)

  for (const dir of pathEntries) {
    if (!isAbsolute(dir)) continue
    const candidate = join(dir, 'openclaw')
    if (!existsSync(candidate)) continue

    try {
      accessSync(candidate, fsConstants.X_OK)
    } catch {
      continue
    }

    try {
      const stats = statSync(candidate)
      if (!stats.isFile() || stats.size > 128 * 1024) {
        return true
      }
      const content = readFileSync(candidate, 'utf-8')
      if (!isManagedOpenclawShimScript(content)) {
        return true
      }
    } catch {
      return true
    }
  }

  return false
}

function ensureOpenclawShimOnUserPath(script: string): void {
  try {
    if (hasUnmanagedOpenclawOnPath()) {
      return
    }

    const home = homedir()
    const pathEntries = (process.env.PATH || '')
      .split(':')
      .map((entry) => entry.trim())
      .filter(Boolean)

    const preferred = [join(home, '.local', 'bin'), join(home, 'bin')]
    const candidates = Array.from(new Set([...pathEntries, ...preferred]))

    for (const dir of candidates) {
      if (!isAbsolute(dir)) continue

      const inHome = dir === home || dir.startsWith(`${home}/`)
      if (!existsSync(dir)) {
        if (!inHome) continue
        try {
          mkdirSync(dir, { recursive: true })
        } catch {
          continue
        }
      }

      try {
        accessSync(dir, fsConstants.W_OK | fsConstants.X_OK)
      } catch {
        continue
      }

      const shimPath = join(dir, 'openclaw')
      if (writeManagedOpenclawShim(shimPath, script)) {
        return
      }
    }
  } catch {
    // Best-effort only.
  }
}

function ensureBundledOpenclawShim(): string | null {
  const bundledScriptPath = getBundledOpenclawScriptPath()
  if (!bundledScriptPath) return null

  try {
    if (!existsSync(PINCHR_BIN_PATH)) {
      mkdirSync(PINCHR_BIN_PATH, { recursive: true })
    }

    const shimPath = join(PINCHR_BIN_PATH, 'openclaw')
    const bundledNode = getBundledNodePath()
    const script = buildOpenclawShimScript(bundledScriptPath, bundledNode)

    writeManagedOpenclawShim(shimPath, script)
    ensureOpenclawShimOnUserPath(script)

    return PINCHR_BIN_PATH
  } catch {
    return null
  }
}

function mergePinchrDefaults(
  input: Record<string, unknown>,
  provider = 'anthropic',
  options?: { forceLocalGateway?: boolean }
): { config: Record<string, unknown>; changed: boolean } {
  const config = isPlainRecord(input) ? { ...input } : {}
  let changed = false
  const forceLocalGateway = options?.forceLocalGateway === true

  const timestamp = new Date().toISOString()
  const touchedVersion = `pinchr-${app.getVersion()}`

  const wizard = isPlainRecord(config.wizard) ? { ...(config.wizard as Record<string, unknown>) } : {}
  if (!readNonEmptyString(wizard.lastRunAt)) {
    wizard.lastRunAt = timestamp
    changed = true
  }
  if (!readNonEmptyString(wizard.lastRunVersion)) {
    wizard.lastRunVersion = touchedVersion
    changed = true
  }
  if (!readNonEmptyString(wizard.lastRunCommand)) {
    wizard.lastRunCommand = 'pinchr-onboard'
    changed = true
  }
  if (!readNonEmptyString(wizard.lastRunMode)) {
    wizard.lastRunMode = 'local'
    changed = true
  }
  if (!isPlainRecord(config.wizard) || JSON.stringify(config.wizard) !== JSON.stringify(wizard)) {
    config.wizard = wizard
  }

  const gateway = isPlainRecord(config.gateway) ? { ...(config.gateway as Record<string, unknown>) } : {}
  if (forceLocalGateway && gateway.port !== 18789) {
    gateway.port = 18789
    changed = true
  } else if (typeof gateway.port !== 'number') {
    gateway.port = 18789
    changed = true
  }
  if (forceLocalGateway && gateway.mode !== 'local') {
    gateway.mode = 'local'
    changed = true
  } else if (!readNonEmptyString(gateway.mode)) {
    gateway.mode = 'local'
    changed = true
  }
  if (forceLocalGateway && gateway.bind !== 'loopback') {
    gateway.bind = 'loopback'
    changed = true
  } else if (!readNonEmptyString(gateway.bind)) {
    gateway.bind = 'loopback'
    changed = true
  }

  const auth = isPlainRecord(gateway.auth) ? { ...(gateway.auth as Record<string, unknown>) } : {}
  if (forceLocalGateway && auth.mode !== 'token') {
    auth.mode = 'token'
    changed = true
  } else if (!readNonEmptyString(auth.mode)) {
    auth.mode = 'token'
    changed = true
  }
  if (!readNonEmptyString(auth.token)) {
    auth.token = randomUUID()
    changed = true
  }
  gateway.auth = auth

  const http = isPlainRecord(gateway.http) ? { ...(gateway.http as Record<string, unknown>) } : {}
  const endpoints = isPlainRecord(http.endpoints) ? { ...(http.endpoints as Record<string, unknown>) } : {}
  const chatCompletions = isPlainRecord(endpoints.chatCompletions)
    ? { ...(endpoints.chatCompletions as Record<string, unknown>) }
    : {}
  const responses = isPlainRecord(endpoints.responses)
    ? { ...(endpoints.responses as Record<string, unknown>) }
    : {}

  if (typeof chatCompletions.enabled !== 'boolean') {
    chatCompletions.enabled = true
    changed = true
  }
  if (typeof responses.enabled !== 'boolean') {
    responses.enabled = true
    changed = true
  }

  endpoints.chatCompletions = chatCompletions
  endpoints.responses = responses
  http.endpoints = endpoints
  gateway.http = http
  config.gateway = gateway

  const agents = isPlainRecord(config.agents) ? { ...(config.agents as Record<string, unknown>) } : {}
  const defaults = isPlainRecord(agents.defaults) ? { ...(agents.defaults as Record<string, unknown>) } : {}
  const model = isPlainRecord(defaults.model) ? { ...(defaults.model as Record<string, unknown>) } : {}

  if (!readNonEmptyString(model.primary)) {
    model.primary = providerDefaultModel(provider)
    changed = true
  }
  defaults.model = model

  if (!readNonEmptyString(defaults.workspace)) {
    defaults.workspace = '~/.openclaw/workspace'
    changed = true
  }

  const compaction = isPlainRecord(defaults.compaction)
    ? { ...(defaults.compaction as Record<string, unknown>) }
    : {}
  if (!readNonEmptyString(compaction.mode)) {
    compaction.mode = 'safeguard'
    changed = true
  }

  const memoryFlush = isPlainRecord(compaction.memoryFlush)
    ? { ...(compaction.memoryFlush as Record<string, unknown>) }
    : {}
  if (typeof memoryFlush.enabled !== 'boolean') {
    memoryFlush.enabled = true
    changed = true
  }

  compaction.memoryFlush = memoryFlush
  defaults.compaction = compaction
  agents.defaults = defaults

  const list = Array.isArray(agents.list) ? [...agents.list] : []
  const hasMain = list.some((entry) => {
    if (!entry || typeof entry !== 'object') return false
    return readNonEmptyString((entry as Record<string, unknown>).id) === 'main'
  })
  if (!hasMain) {
    list.push({ id: 'main' })
    changed = true
  }
  agents.list = list
  config.agents = agents

  return { config, changed }
}

function commandPath(): string {
  const bundledShimDir = ensureBundledOpenclawShim()
  const bundledNodeDir = getBundledNodePath()
  const bundledNodeBinDir = bundledNodeDir ? join(bundledNodeDir, '..') : ''
  const bundledPeekabooDir = getBundledPeekabooDir()
  const segments = [
    bundledPeekabooDir || '',
    PINCHR_BIN_PATH,
    bundledShimDir || '',
    bundledNodeBinDir,
    join(OPENCLAW_HOME_PATH, 'bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
    process.env.PATH || ''
  ]
    .flatMap((entry) => entry.split(':'))
    .map((entry) => entry.trim())
    .filter(Boolean)

  return Array.from(new Set(segments)).join(':')
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

function buildGatewayRepairCommand(): string {
  return [
    'command -v openclaw >/dev/null 2>&1 || { echo "openclaw not found in PATH"; exit 127; }',
    'openclaw setup --local',
    'launchctl bootout gui/$UID/ai.openclaw.node >/dev/null 2>&1 || true',
    'rm -f "$HOME/Library/LaunchAgents/ai.openclaw.node.plist" || true',
    'openclaw gateway uninstall || true',
    'launchctl bootout gui/$UID/ai.openclaw.gateway >/dev/null 2>&1 || true',
    'rm -f "$HOME/Library/LaunchAgents/ai.openclaw.gateway.plist" || true',
    'openclaw gateway install --force --port 18789',
    'openclaw gateway start || openclaw gateway restart',
    'openclaw gateway status'
  ].join('\n')
}

async function isGatewayReachable(): Promise<boolean> {
  try {
    await gatewayHealth()
    return true
  } catch {
    return false
  }
}

async function waitForGatewayReachable(attempts = 8, delayMs = 2000): Promise<boolean> {
  for (let i = 0; i < attempts; i += 1) {
    const reachable = await isGatewayReachable()
    if (reachable) return true
    await sleep(delayMs)
  }
  return false
}

async function prepareGatewayRuntime(): Promise<{ ok: boolean; output: string }> {
  const initResult = await writeInitialOpenClawConfig({ forceLocalGateway: true })
  if (!initResult.ok) {
    return {
      ok: false,
      output: initResult.output || 'Failed to initialize OpenClaw config.'
    }
  }

  const repairResult = await runShellCommand(buildGatewayRepairCommand(), 3 * 60_000)
  let gatewayReachable = await waitForGatewayReachable()

  let retryOutput = ''
  if (!gatewayReachable) {
    const retryResult = await runShellCommand(
      [
        'openclaw gateway restart || openclaw gateway start || true',
        'openclaw gateway status || true'
      ].join('\n'),
      90_000
    )
    retryOutput = retryResult.output || ''
    gatewayReachable = await waitForGatewayReachable(6, 1500)
  }

  const combined = [initResult.output, repairResult.output, retryOutput]
    .filter(Boolean)
    .join('\n\n')
    .trim()

  if (!repairResult.ok && !gatewayReachable) {
    return {
      ok: false,
      output: combined || 'Gateway repair command failed before connectivity checks.'
    }
  }

  if (!gatewayReachable) {
    return {
      ok: false,
      output: combined || 'Gateway is still offline after repair attempts.'
    }
  }

  return {
    ok: true,
    output: combined || 'Gateway prepared and reachable.'
  }
}

async function writeInitialOpenClawConfig(options?: {
  forceLocalGateway?: boolean
}): Promise<{ ok: boolean; output: string; created: boolean }> {
  const forceLocalGateway = options?.forceLocalGateway === true
  const migration = migrateLegacyOpenclawConfigIfNeeded()
  const migrationNote = migration.migrated && migration.sourceHome
    ? `Migrated existing OpenClaw config from ${migration.sourceHome}.`
    : ''

  if (existsSync(OPENCLAW_CONFIG_PATH)) {
    if (!existsSync(OPENCLAW_MAIN_AGENT_DIR)) {
      mkdirSync(OPENCLAW_MAIN_AGENT_DIR, { recursive: true })
    }
    const existingConfig = readOpenClawConfig()
    const merged = mergePinchrDefaults(existingConfig, 'anthropic', { forceLocalGateway })
    if (merged.changed) {
      writeOpenClawConfig(merged.config)
      return {
        ok: true,
        output: [migrationNote, 'openclaw.json exists. Appended Pinchr defaults without overwriting user settings.']
          .filter(Boolean)
          .join(' '),
        created: false
      }
    }
    return {
      ok: true,
      output: [migrationNote, 'openclaw.json already exists. No default changes needed.']
        .filter(Boolean)
        .join(' '),
      created: false
    }
  }

  if (!existsSync(OPENCLAW_MAIN_AGENT_DIR)) {
    mkdirSync(OPENCLAW_MAIN_AGENT_DIR, { recursive: true })
  }

  const timestamp = new Date().toISOString()
  const touchedVersion = `pinchr-${app.getVersion()}`
  const token = randomUUID()
  const agentList = JSON.stringify([{ id: 'main' }])

  const command = [
    'command -v openclaw >/dev/null 2>&1 || { echo "openclaw not found in PATH"; exit 127; }',
    `openclaw config set wizard.lastRunAt ${shellEscapeArg(timestamp)}`,
    `openclaw config set wizard.lastRunVersion ${shellEscapeArg(touchedVersion)}`,
    'openclaw config set wizard.lastRunCommand pinchr-onboard',
    'openclaw config set wizard.lastRunMode local',
    'openclaw config set gateway.port 18789 --json',
    'openclaw config set gateway.mode local',
    'openclaw config set gateway.bind loopback',
    'openclaw config set gateway.auth.mode token',
    `openclaw config set gateway.auth.token ${shellEscapeArg(token)}`,
    'openclaw config set gateway.http.endpoints.chatCompletions.enabled true --json',
    'openclaw config set gateway.http.endpoints.responses.enabled true --json',
    `openclaw config set agents.defaults.workspace ${shellEscapeArg('~/.openclaw/workspace')}`,
    'openclaw config set agents.defaults.compaction.mode safeguard',
    'openclaw config set agents.defaults.compaction.memoryFlush.enabled true --json',
    `openclaw config set agents.defaults.model.primary ${shellEscapeArg(providerDefaultModel('anthropic'))}`,
    `openclaw config set agents.list ${shellEscapeArg(agentList)} --json`
  ].join('\n')

  const result = await runShellCommand(command, 60_000)
  if (result.ok) {
    const merged = mergePinchrDefaults(readOpenClawConfig(), 'anthropic', { forceLocalGateway })
    if (merged.changed) {
      writeOpenClawConfig(merged.config)
    }
    return {
      ok: true,
      output: result.output || 'Initialized openclaw.json for onboarding.',
      created: true
    }
  }

  // Fallback for older OpenClaw versions where config set might be missing.
  const fallbackConfig = mergePinchrDefaults({}, 'anthropic', { forceLocalGateway }).config
  writeOpenClawConfig(fallbackConfig)
  return {
    ok: true,
    output: result.output || 'Initialized openclaw.json using fallback writer.',
    created: true
  }
}

function setNestedValue(target: Record<string, unknown>, path: string[], value: unknown): void {
  if (path.length === 0) return

  let cursor: Record<string, unknown> = target
  for (let i = 0; i < path.length - 1; i++) {
    const segment = path[i]
    const next = cursor[segment]
    if (!isPlainRecord(next)) {
      const nextRecord: Record<string, unknown> = {}
      cursor[segment] = nextRecord
      cursor = nextRecord
      continue
    }
    cursor = next
  }
  cursor[path[path.length - 1]] = value
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = 15_000
): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal
    })
  } finally {
    clearTimeout(timeout)
  }
}

async function validateProviderApiKey(
  provider: string,
  apiKey: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    let response: Response

    if (provider === 'anthropic') {
      response = await fetchWithTimeout('https://api.anthropic.com/v1/models', {
        method: 'GET',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        }
      })
    } else if (provider === 'openai') {
      response = await fetchWithTimeout('https://api.openai.com/v1/models', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`
        }
      })
    } else if (provider === 'google') {
      response = await fetchWithTimeout(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
        { method: 'GET' }
      )
    } else {
      return { ok: false, error: 'Invalid provider.' }
    }

    if (response.ok) {
      return { ok: true }
    }

    const rawError = (await response.text()).slice(0, 300)
    const friendlyError = rawError || `HTTP ${response.status}`
    return {
      ok: false,
      error: `API key verification failed (${response.status}): ${friendlyError}`
    }
  } catch (error) {
    return {
      ok: false,
      error: `API key verification failed: ${String(error)}`
    }
  }
}

async function runShellCommand(
  command: string,
  timeoutMs = 60_000
): Promise<{ ok: boolean; output: string; code: number | null }> {
  const bundledOpenclaw = getBundledOpenclawScriptPath()
  const bundledNode = getBundledNodePath()
  const nodeResolution = bundledNode
    ? `  __openclaw_node=${shellEscapeArg(bundledNode)}`
    : [
        '  __openclaw_node="${OPENCLAW_NODE_BIN:-$(command -v node 2>/dev/null || true)}"',
        `  if [ -z "$__openclaw_node" ]; then __openclaw_node=${shellEscapeArg(process.execPath)}; fi`
      ].join('\n')
  const commandWithBundledOpenclaw = bundledOpenclaw
    ? [
        'openclaw() {',
        '  local __openclaw_node',
        nodeResolution,
        `  ELECTRON_RUN_AS_NODE=1 "$__openclaw_node" ${shellEscapeArg(bundledOpenclaw)} "$@"`,
        '}',
        command
      ].join('\n')
    : command

  return await new Promise((resolve) => {
    exec(
      commandWithBundledOpenclaw,
      {
        shell: '/bin/zsh',
        timeout: timeoutMs,
        maxBuffer: 8 * 1024 * 1024,
        env: {
          ...process.env,
          PATH: commandPath(),
          OPENCLAW_HOME: process.env.OPENCLAW_HOME || OPENCLAW_HOME_PATH
        }
      },
      (error, stdout, stderr) => {
        const output = `${stdout || ''}${stderr || ''}`.trim()
        if (error) {
          const errorCode = (error as NodeJS.ErrnoException).code
          const code = typeof errorCode === 'number' ? errorCode : null
          resolve({ ok: false, output, code })
          return
        }
        resolve({ ok: true, output, code: 0 })
      }
    )
  })
}

function shellEscapeArg(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

function readTailText(filePath: string, maxBytes = LOG_TAIL_MAX_BYTES): string {
  if (!existsSync(filePath)) return ''

  const stats = statSync(filePath)
  const safeSize = Math.max(0, stats.size)
  const readLength = Math.min(maxBytes, safeSize)
  const offset = Math.max(0, safeSize - readLength)
  if (readLength === 0) return ''

  const fd = openSync(filePath, 'r')
  try {
    const buffer = Buffer.alloc(readLength)
    readSync(fd, buffer, 0, readLength, offset)
    return buffer.toString('utf-8')
  } finally {
    closeSync(fd)
  }
}

function tailLines(input: string, lineLimit: number): string[] {
  const normalized = input.replace(/\r\n/g, '\n')
  const lines = normalized.split('\n').filter((line) => line.length > 0)
  if (lines.length <= lineLimit) return lines
  return lines.slice(-lineLimit)
}

function listFilesRecursive(dir: string, prefix = '', depth = 0): string[] {
  const results: string[] = []
  if (!existsSync(dir)) return results

  const entries = readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      // At root: only recurse into memory/ and skills/
      // Inside those dirs: recurse into all subdirectories (skill folders, etc.)
      if (depth === 0 && (entry.name === 'memory' || entry.name === 'skills' || entry.name === 'specs' || entry.name === 'research')) {
        results.push(...listFilesRecursive(join(dir, entry.name), relativePath, depth + 1))
      } else if (depth > 0 && depth < 4) {
        results.push(...listFilesRecursive(join(dir, entry.name), relativePath, depth + 1))
      }
    } else if (entry.name.endsWith('.md') || entry.name.endsWith('.json')) {
      results.push(relativePath)
    }
  }
  return results
}

function sanitizeFilename(value: string): string {
  const base = basename(value).replace(/[/\\?%*:|"<>]/g, '-').trim()
  return base || 'attachment'
}

function inferAttachmentMimeType(sourcePath: string): string {
  const ext = extname(sourcePath).toLowerCase()
  const mimeByExt: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.pdf': 'application/pdf',
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.csv': 'text/csv',
    '.json': 'application/json',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  }
  return mimeByExt[ext] ?? 'application/octet-stream'
}

function extractToolInvokeData(payload: unknown): unknown {
  if (!payload || typeof payload !== 'object') return payload

  const root = payload as Record<string, unknown>
  const result = root.result && typeof root.result === 'object'
    ? root.result as Record<string, unknown>
    : null

  const details = result?.details
  const content = Array.isArray(result?.content) ? result.content : []
  const textValue = content.find((item) => {
    if (!item || typeof item !== 'object') return false
    const chunk = item as Record<string, unknown>
    return chunk.type === 'text' && typeof chunk.text === 'string'
  }) as { text?: string } | undefined

  if (typeof textValue?.text === 'string' && textValue.text.trim()) {
    try {
      return JSON.parse(textValue.text)
    } catch {
      if (details !== undefined) return details
      return textValue.text
    }
  }

  if (details !== undefined) return details
  if (result) return result
  if (root.data !== undefined) return root.data
  return root
}

function readNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function normalizeRouteMessageInboundContext(value: unknown): TopicRouteInboundContext | undefined {
  if (!isPlainRecord(value)) return undefined
  const channel = readNonEmptyString(value.channel)?.toLowerCase()
  const requestId = readNonEmptyString(value.requestId) ?? readNonEmptyString(value.request_id)
  const threadId = readNonEmptyString(value.threadId) ?? readNonEmptyString(value.thread_id)
  const sourceSessionKey =
    readNonEmptyString(value.sourceSessionKey) ?? readNonEmptyString(value.source_session_key)
  const sourceMessageId =
    readNonEmptyString(value.sourceMessageId) ?? readNonEmptyString(value.source_message_id)
  const sourceFingerprint =
    readNonEmptyString(value.sourceFingerprint) ?? readNonEmptyString(value.source_fingerprint)

  const normalized: TopicRouteInboundContext = {
    ...(channel ? { channel } : {}),
    ...(requestId ? { requestId } : {}),
    ...(threadId ? { threadId } : {}),
    ...(sourceSessionKey ? { sourceSessionKey } : {}),
    ...(sourceMessageId ? { sourceMessageId } : {}),
    ...(sourceFingerprint ? { sourceFingerprint } : {})
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined
}

function readPositiveInt(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const normalized = Math.floor(value)
    return normalized > 0 ? normalized : undefined
  }
  if (typeof value === 'string') {
    const parsed = Number(value.trim())
    if (!Number.isFinite(parsed)) return undefined
    const normalized = Math.floor(parsed)
    return normalized > 0 ? normalized : undefined
  }
  return undefined
}

function normalizeParseTaskProjects(
  projects: Array<{ id: string; name: string }>
): Array<{ id: string; name: string }> {
  return projects
    .map((project) => ({
      id: readNonEmptyString(project.id),
      name: readNonEmptyString(project.name)
    }))
    .filter(
      (project): project is { id: string; name: string } =>
        typeof project.id === 'string' && typeof project.name === 'string'
    )
}

function buildParseTaskSystemPrompt(projects: Array<{ id: string; name: string }>): string {
  const projectList = projects.length > 0
    ? projects.map((project) => `- ${project.name} (${project.id})`).join('\n')
    : '- none'

  return [
    'You are a task parsing assistant for Pinchr.',
    'Convert the user input into a structured task.',
    'Return ONLY valid JSON with this exact shape:',
    '{',
    '  "title": "string (concise, under 80 chars)",',
    '  "subtitle": "string (one line, under 100 chars)",',
    '  "description": "string",',
    '  "priority": "urgent|high|medium|low",',
    '  "projectId": "string|null (must be one of the available project IDs or null)",',
    '  "subtasks": ["string", "..."],',
    '  "tags": ["string", "..."]',
    '}',
    'Rules:',
    '- If unsure about priority, use "medium".',
    '- If no project clearly matches, set projectId to null.',
    '- Do not include markdown, code fences, or any explanation.',
    '',
    'Available projects:',
    projectList
  ].join('\n')
}

function extractTextFromUnknown(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map((entry) => extractTextFromUnknown(entry)).join('')
  if (!value || typeof value !== 'object') return ''

  const record = value as Record<string, unknown>
  const direct = [record.text, record.content, record.value]
    .filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
    .join('')
  if (direct) return direct

  if (Array.isArray(record.content)) {
    const contentText = record.content.map((entry) => extractTextFromUnknown(entry)).join('')
    if (contentText) return contentText
  }

  if (Array.isArray(record.parts)) {
    const partsText = record.parts.map((entry) => extractTextFromUnknown(entry)).join('')
    if (partsText) return partsText
  }

  return ''
}

function extractJsonObject(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  const fencedMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  const content = fencedMatch ? fencedMatch[1].trim() : trimmed
  const firstBrace = content.indexOf('{')
  const lastBrace = content.lastIndexOf('}')
  if (firstBrace < 0 || lastBrace <= firstBrace) return null
  return content.slice(firstBrace, lastBrace + 1)
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const unique = new Set<string>()
  for (const entry of value) {
    const parsed = readNonEmptyString(entry)
    if (parsed) unique.add(parsed)
  }
  return Array.from(unique)
}

function normalizeParseTaskPriority(value: unknown): ParseTaskResult['priority'] {
  const normalized = readNonEmptyString(value)?.toLowerCase()
  if (normalized === 'urgent' || normalized === 'high' || normalized === 'medium' || normalized === 'low') {
    return normalized
  }
  return 'medium'
}

function normalizeParseTaskProjectId(
  value: unknown,
  projects: Array<{ id: string; name: string }>
): string | null {
  const raw = readNonEmptyString(value)
  if (!raw) return null

  const byId = projects.find((project) => project.id === raw)
  if (byId) return byId.id

  const lowerRaw = raw.toLowerCase()
  const byName = projects.find((project) => project.name.toLowerCase() === lowerRaw)
  if (byName) return byName.id

  return null
}

function normalizeParseTaskResult(
  payload: unknown,
  fallbackTitle: string,
  projects: Array<{ id: string; name: string }>
): ParseTaskResult {
  if (!isPlainRecord(payload)) {
    throw new Error('AI parser did not return a JSON object')
  }

  const title = readNonEmptyString(payload.title) ?? fallbackTitle
  if (!title) {
    throw new Error('AI parser returned an empty title')
  }

  const subtitle = readNonEmptyString(payload.subtitle) ?? ''
  const description = readNonEmptyString(payload.description) ?? subtitle

  return {
    title,
    subtitle,
    description,
    priority: normalizeParseTaskPriority(payload.priority),
    projectId: normalizeParseTaskProjectId(payload.projectId, projects),
    subtasks: normalizeStringArray(payload.subtasks),
    tags: normalizeStringArray(payload.tags)
  }
}

function formatMcpDuration(durationMs: number): string {
  if (durationMs < 1000) return `${durationMs}ms`
  return `${(durationMs / 1000).toFixed(1)}s`
}

function buildArgsPreview(args: unknown): string {
  if (args === undefined) return ''
  try {
    return JSON.stringify(args).slice(0, 200)
  } catch {
    return String(args).slice(0, 200)
  }
}

function logMcpToolCall(
  mcpManager: MCPManager | undefined,
  details: {
    serverId: string
    serverName: string
    toolName: string
    args?: unknown
    status: 'success' | 'error'
    durationMs: number
    error?: unknown
  }
): void {
  const errorText = details.error ? String(details.error) : undefined
  const description = details.status === 'success'
    ? `MCP: ${details.serverName} → ${details.toolName} (${formatMcpDuration(details.durationMs)}) ✓`
    : `MCP: ${details.serverName} → ${details.toolName} (${formatMcpDuration(details.durationMs)}) ✗${errorText ? ` ${errorText}` : ''}`

  activityLogger.log(
    'mcp_tool_call',
    description,
    details.status === 'success' ? 'allowed' : 'blocked',
    {
      serverId: details.serverId,
      serverName: details.serverName,
      toolName: details.toolName,
      durationMs: details.durationMs,
      status: details.status,
      argsPreview: buildArgsPreview(details.args),
      error: errorText
    }
  )

  if (!mcpManager) return
  mcpManager.recordCall(details.serverId, {
    toolName: details.toolName,
    timestamp: new Date().toISOString(),
    durationMs: details.durationMs,
    status: details.status,
    error: errorText
  })
}

async function invokeGatewayTool(
  tool: string,
  parameters: Record<string, unknown> = {},
  sessionKey?: string
): Promise<unknown> {
  const token = getGatewayToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }
  const normalizedSessionKey = readNonEmptyString(sessionKey)

  const response = await fetch(`${getGatewayUrl()}/tools/invoke`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      tool,
      args: parameters,
      ...(normalizedSessionKey ? { sessionKey: normalizedSessionKey } : {})
    })
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`tools/invoke ${tool} failed (${response.status}): ${errorText.slice(0, 300)}`)
  }

  const payload = await response.json() as unknown
  return extractToolInvokeData(payload)
}

export function registerIpcHandlers(mcpManager?: MCPManager): void {
  ipcMain.handle('gateway:health', async () => {
    try {
      return {
        ok: true,
        data: await runGatewayOpWithAutoRepair(() => gatewayHealth())
      }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  ipcMain.handle('gateway:sessions', async () => {
    try {
      return {
        ok: true,
        data: await runGatewayOpWithAutoRepair(() => getSessions())
      }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  ipcMain.handle('gateway:agents-list', async () => {
    try {
      return {
        ok: true,
        data: await runGatewayOpWithAutoRepair(() => getAgentsList())
      }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  ipcMain.handle('gateway:session-history', async (_, sessionKey: string, limit?: number) => {
    try {
      const normalizedLimit = Math.min(Math.max(readPositiveInt(limit) ?? 50, 10), 5000)
      return {
        ok: true,
        data: await runGatewayOpWithAutoRepair(() => getSessionHistory(sessionKey, normalizedLimit))
      }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  ipcMain.handle('gateway:send-message', async (_, sessionKey: string, message: string) => {
    try {
      enforcePermission('send_messages', `Send message to session: ${sessionKey}`)
      activityLogger.log('api_call', `Send message to session: ${sessionKey}`)
      return { ok: true, data: await sendMessage(sessionKey, message) }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  ipcMain.handle(
    'gateway:parse-task',
    async (_, input: string, projects: Array<{ id: string; name: string }>) => {
      try {
        enforcePermission('send_messages', 'Parse natural language task')
        activityLogger.log('api_call', 'Parse natural language task')

        const normalizedInput = readNonEmptyString(input)
        if (!normalizedInput) {
          throw new Error('Task input is required')
        }

        const normalizedProjects = normalizeParseTaskProjects(Array.isArray(projects) ? projects : [])
        const config = readOpenClawConfig()
        const gatewayConfig = isPlainRecord(config.gateway) ? config.gateway : null
        const gatewayAuth = gatewayConfig && isPlainRecord(gatewayConfig.auth) ? gatewayConfig.auth : null
        const token = readNonEmptyString(gatewayAuth?.token)

        const response = await fetchWithTimeout(
          'http://127.0.0.1:18789/v1/chat/completions',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {})
            },
            body: JSON.stringify({
              messages: [
                { role: 'system', content: buildParseTaskSystemPrompt(normalizedProjects) },
                { role: 'user', content: normalizedInput }
              ],
              stream: false
            })
          },
          15_000
        )

        if (!response.ok) {
          const errorText = await response.text()
          throw new Error(`Task parser request failed (${response.status}): ${errorText.slice(0, 300)}`)
        }

        const payload = await response.json() as unknown
        const root = isPlainRecord(payload) ? payload : {}
        const choices = Array.isArray(root.choices) ? root.choices : []
        const firstChoice = choices.length > 0 && isPlainRecord(choices[0]) ? choices[0] : null
        const message = firstChoice && isPlainRecord(firstChoice.message) ? firstChoice.message : null
        const content = extractTextFromUnknown(message?.content)
        const jsonText = extractJsonObject(content)

        if (!jsonText) {
          throw new Error('Task parser returned no JSON content')
        }

        const parsedPayload = JSON.parse(jsonText) as unknown
        const data = normalizeParseTaskResult(parsedPayload, normalizedInput, normalizedProjects)

        return { ok: true, data }
      } catch (error) {
        return { ok: false, error: String(error) }
      }
    }
  )

  ipcMain.handle('gateway:get-main-session', async () => {
    try {
      const mainSessionKey = await getMainSession()
      return { ok: true, data: mainSessionKey }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  ipcMain.handle(
    'gateway:stream-message',
    async (
      event,
      sessionKey: string,
      message: string | MessageContentPart[],
      workspaceContext?: { name: string; systemPromptAddition: string },
      sessionUser?: string,
      mainSessionKey?: string
    ) => {
    try {
      enforcePermission('send_messages', `Stream message to session: ${sessionKey}`)
      activityLogger.log('api_call', `Stream message to session: ${sessionKey}`)
      const streamId = `stream-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      const webContent = event.sender
      const mcpTools = mcpManager?.getGatewayToolDefinitions(sessionKey) ?? []
      const pendingMcpCalls = new Map<string, number[]>()

      // Start streaming in the background
      streamMessage(sessionKey, message, (payload: StreamChunkPayload) => {
        if (mcpManager && payload.toolName?.startsWith('mcp__')) {
          const parsed = mcpManager.parseGatewayToolName(payload.toolName)
          if (parsed) {
            if (payload.toolEvent === 'start') {
              const starts = pendingMcpCalls.get(payload.toolName) ?? []
              starts.push(Date.now())
              pendingMcpCalls.set(payload.toolName, starts)
            } else if (payload.toolEvent === 'result') {
              const starts = pendingMcpCalls.get(payload.toolName) ?? []
              const startedAt = starts.shift()
              if (starts.length === 0) {
                pendingMcpCalls.delete(payload.toolName)
              } else {
                pendingMcpCalls.set(payload.toolName, starts)
              }
              if (typeof startedAt === 'number') {
                logMcpToolCall(mcpManager, {
                  serverId: parsed.serverId,
                  serverName: parsed.serverName,
                  toolName: parsed.toolName,
                  args: payload.toolResult,
                  status: 'success',
                  durationMs: Date.now() - startedAt
                })
              }
            }
          }
        }

        webContent.send('gateway:stream-chunk', {
          streamId,
          ...payload
        })
      }, workspaceContext, sessionUser, {
        tools: mcpTools,
        mainSessionKey: mainSessionKey || undefined
      }).catch((error) => {
        if (mcpManager && pendingMcpCalls.size > 0) {
          const message = String(error)
          for (const [gatewayToolName, starts] of pendingMcpCalls.entries()) {
            const parsed = mcpManager.parseGatewayToolName(gatewayToolName)
            if (!parsed) continue
            for (const startedAt of starts) {
              logMcpToolCall(mcpManager, {
                serverId: parsed.serverId,
                serverName: parsed.serverName,
                toolName: parsed.toolName,
                status: 'error',
                durationMs: Math.max(0, Date.now() - startedAt),
                error: message
              })
            }
          }
        }
        webContent.send('gateway:stream-error', {
          streamId,
          error: String(error)
        })
      })
      
      return { ok: true, data: streamId }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
    }
  )

  ipcMain.handle(
    'gateway:route-message',
    async (event, mainSessionKey: string, message: string, inboundContext?: unknown) => {
      try {
        enforcePermission('send_messages', `Route message from main session: ${mainSessionKey}`)
        activityLogger.log('api_call', `Route message from main session: ${mainSessionKey}`)

        const normalizedSessionKey = readNonEmptyString(mainSessionKey)
        if (!normalizedSessionKey) {
          throw new Error('A valid main session key is required for routing')
        }

        const normalizedMessage = readNonEmptyString(message)
        if (!normalizedMessage) {
          throw new Error('Cannot route an empty message')
        }

        const streamId = `stream-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
        const webContent = event.sender
        const normalizedInboundContext = normalizeRouteMessageInboundContext(inboundContext)
        const routeInboundContext: TopicRouteInboundContext = {
          channel: normalizedInboundContext?.channel ?? 'pinchr',
          requestId: normalizedInboundContext?.requestId ?? streamId,
          threadId: normalizedInboundContext?.threadId ?? normalizedSessionKey,
          sourceSessionKey: normalizedInboundContext?.sourceSessionKey ?? normalizedSessionKey,
          ...(normalizedInboundContext?.sourceMessageId
            ? { sourceMessageId: normalizedInboundContext.sourceMessageId }
            : {}),
          ...(normalizedInboundContext?.sourceFingerprint
            ? { sourceFingerprint: normalizedInboundContext.sourceFingerprint }
            : {})
        }

        const runRoute = async () => {
          let finished = false
          let lastProgressText = ''
          const emitProgress = (status: string) => {
            const normalizedStatus = status.trim()
            if (!normalizedStatus || normalizedStatus === lastProgressText) return
            lastProgressText = normalizedStatus
            webContent.send('gateway:stream-chunk', {
              streamId,
              content: '',
              done: false,
              reasoning: normalizedStatus
            })
          }
          const slowNudgeTimer = setTimeout(() => {
            if (finished) return
            emitProgress('Still working on this request...')
          }, 8000)

          try {
            webContent.send('gateway:stream-chunk', {
              streamId,
              content: '',
              done: false,
              toolEvent: 'start',
              toolName: 'topic_router'
            })
            emitProgress('Routing message and preparing response...')

            const result = await routeMessageToTopicSession({
              workspacePath: WORKSPACE_PATH,
              mainSessionKey: normalizedSessionKey,
              message: normalizedMessage,
              invokeTool: invokeGatewayTool,
              inboundContext: routeInboundContext,
              onProgress: (status) => emitProgress(status)
            })

            webContent.send('gateway:stream-chunk', {
              streamId,
              content: '',
              done: false,
              toolEvent: 'result',
              toolName: 'topic_router',
              toolResult: JSON.stringify(result.envelope)
            })

            webContent.send('gateway:stream-chunk', {
              streamId,
              content: result.response.text,
              done: false
            })

            webContent.send('gateway:stream-chunk', {
              streamId,
              content: '',
              done: true
            })
            finished = true
          } catch (error) {
            webContent.send('gateway:stream-error', {
              streamId,
              error: String(error)
            })
            webContent.send('gateway:stream-chunk', {
              streamId,
              content: '',
              done: true
            })
            finished = true
          } finally {
            clearTimeout(slowNudgeTimer)
          }
        }

        void runRoute()
        return { ok: true, data: streamId }
      } catch (error) {
        return { ok: false, error: String(error) }
      }
    }
  )

  ipcMain.handle('gateway:config', async () => {
    try {
      return { ok: true, data: await getGatewayConfig() }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  ipcMain.handle('gateway:legacy-homes', async () => {
    try {
      return {
        ok: true,
        data: {
          managedHome: OPENCLAW_HOME_PATH,
          homes: discoverLegacyOpenclawHomes()
        }
      }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  ipcMain.handle('gateway:cleanup-legacy-homes', async (_, homes?: string[]) => {
    try {
      const cleanup = cleanupLegacyOpenclawHomes(homes)
      let repairOutput = ''
      let repairOk = true

      if (cleanup.removed.length > 0) {
        const prepared = await prepareGatewayRuntime()
        repairOk = prepared.ok
        repairOutput = prepared.output || ''
      }

      return {
        ok: true,
        data: {
          ...cleanup,
          repairOk,
          repairOutput
        }
      }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  ipcMain.handle('gateway:update-config', async (_, config: Record<string, unknown>) => {
    try {
      // Transform shorthand keys to proper OpenClaw config paths
      const patch: Record<string, unknown> = {}
      const agentsDefaults: Record<string, unknown> = {}
      let sessionModel: string | undefined

      for (const [key, value] of Object.entries(config)) {
        if (key === 'model' && typeof value === 'string' && value) {
          // Set both config default AND session override for immediate effect
          agentsDefaults.model = { primary: value }
          sessionModel = value
        } else if (key === 'thinking' && typeof value === 'string') {
          if (value && value !== 'off') {
            agentsDefaults.thinkingDefault = value
          }
          // 'off' = don't include (uses default)
        } else {
          // Pass through as-is (for nested config patches)
          patch[key] = value
        }
      }

      if (Object.keys(agentsDefaults).length > 0) {
        patch.agents = { defaults: agentsDefaults }
      }

      // Apply config patch if there's anything to patch
      let result: unknown = null
      if (Object.keys(patch).length > 0) {
        result = await updateConfig(patch)
      }

      // Try session model override for immediate effect (may fail for local/custom models due to allowlist)
      if (sessionModel) {
        try { await getSessionStatus(sessionModel) } catch { /* config.patch auto-restarts gateway instead */ }
      }

      return { ok: true, data: result }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  ipcMain.handle('gateway:restart', async () => {
    try {
      const data = await restartGateway()
      return { ok: true, data }
    } catch (error) {
      try {
        const repairResult = await attemptGatewaySelfRepair(error)
        if (repairResult.attempted && !repairResult.ok) {
          return {
            ok: false,
            error: `${String(error)}\n\n${repairResult.output || 'Gateway self-repair failed.'}`
          }
        }

        const shellRestartResult = await runShellCommand('openclaw gateway restart || openclaw gateway start', 60_000)
        if (shellRestartResult.ok) {
          return {
            ok: true,
            data: shellRestartResult.output || repairResult.output || 'Gateway restarted with shell fallback.'
          }
        }

        return {
          ok: false,
          error: shellRestartResult.output || String(error)
        }
      } catch (fallbackError) {
        return { ok: false, error: String(fallbackError) }
      }
    }
  })

  ipcMain.handle('providers:list', async () => {
    try {
      const providers = listProviderStatuses(SUPPORTED_PROVIDER_IDS)
      return {
        ok: true,
        data: { providers }
      }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  ipcMain.handle('providers:setKey', async (_, payload: { provider: ProviderId; apiKey: string }) => {
    try {
      const provider = payload?.provider
      const apiKey = typeof payload?.apiKey === 'string' ? payload.apiKey : ''

      if (!provider || !SUPPORTED_PROVIDER_IDS.includes(provider)) {
        return { ok: false, error: 'Unsupported provider.' }
      }
      if (!apiKey.trim()) {
        return { ok: false, error: 'API key is required.' }
      }

      setProviderKey(provider, apiKey)
      return { ok: true, data: { ok: true } }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  ipcMain.handle('providers:removeKey', async (_, payload: { provider: ProviderId }) => {
    try {
      const provider = payload?.provider
      if (!provider || !SUPPORTED_PROVIDER_IDS.includes(provider)) {
        return { ok: false, error: 'Unsupported provider.' }
      }

      removeProviderKey(provider)
      return { ok: true, data: { ok: true } }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  // Shell-based gateway start — works even when the gateway HTTP endpoint is down
  ipcMain.handle('gateway:start-shell', async () => {
    try {
      const result = await runShellCommand('openclaw gateway restart', 60_000)
      if (!result.ok) {
        const prepared = await prepareGatewayRuntime()
        if (!prepared.ok) {
          return {
            ok: false,
            error: `${result.output || 'Failed to start gateway'}\n\n${prepared.output || 'Gateway repair failed.'}`
          }
        }
        return { ok: true, data: prepared.output || result.output }
      }
      return { ok: true, data: result.output }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  ipcMain.handle('gateway:session-status', async () => {
    try {
      const result = await getSessionStatus()
      // Result could be a string (raw text) or an object with statusText
      let text = ''
      if (typeof result === 'string') {
        text = result
      } else if (result && typeof result === 'object') {
        const obj = result as Record<string, unknown>
        text = (obj.statusText as string) || (obj.raw as string) || ''
      }
      if (text) {
        const parsed = parseSessionStatus(text)
        return { ok: true, data: parsed }
      }
      return { ok: true, data: result }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  ipcMain.handle(
    'gateway:tools-invoke',
    async (_, tool: string, args?: Record<string, unknown>, sessionKey?: string) => {
      try {
        if (!mcpManager && tool.startsWith('mcp__')) {
          return { ok: false, error: 'MCP manager is not initialized' }
        }

        if (mcpManager && tool.startsWith('mcp__')) {
          const parsed = mcpManager.parseGatewayToolName(tool)
          if (!parsed) {
            return { ok: false, error: `Invalid MCP gateway tool name: ${tool}` }
          }

          const effectiveSessionKey =
            readNonEmptyString(sessionKey) ??
            readNonEmptyString((args as { sessionKey?: unknown } | undefined)?.sessionKey)

          const startedAt = Date.now()
          if (!mcpManager.canUseGatewayTool(tool, effectiveSessionKey)) {
            const errorMessage = `Session "${effectiveSessionKey || 'unknown'}" cannot use MCP server "${parsed.serverName}"`
            logMcpToolCall(mcpManager, {
              serverId: parsed.serverId,
              serverName: parsed.serverName,
              toolName: parsed.toolName,
              args,
              status: 'error',
              durationMs: Date.now() - startedAt,
              error: errorMessage
            })
            return { ok: false, error: errorMessage }
          }

          try {
            const data = await mcpManager.callGatewayTool(tool, args ?? {}, effectiveSessionKey)
            logMcpToolCall(mcpManager, {
              serverId: parsed.serverId,
              serverName: parsed.serverName,
              toolName: parsed.toolName,
              args,
              status: 'success',
              durationMs: Date.now() - startedAt
            })
            return { ok: true, data }
          } catch (error) {
            logMcpToolCall(mcpManager, {
              serverId: parsed.serverId,
              serverName: parsed.serverName,
              toolName: parsed.toolName,
              args,
              status: 'error',
              durationMs: Date.now() - startedAt,
              error
            })
            return { ok: false, error: String(error) }
          }
        }
        const data = await runGatewayOpWithAutoRepair(
          () => invokeGatewayTool(tool, args ?? {}, sessionKey)
        )
        return { ok: true, data }
      } catch (error) {
        return { ok: false, error: String(error) }
      }
    }
  )

  ipcMain.handle('gateway:tools-sessions-list', async (_, parameters?: Record<string, unknown>) => {
    try {
      const data = await runGatewayOpWithAutoRepair(
        () => invokeGatewayTool('sessions_list', parameters ?? {})
      )
      return { ok: true, data }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  ipcMain.handle('gateway:tools-session-status', async (_, parameters?: Record<string, unknown>) => {
    try {
      const data = await runGatewayOpWithAutoRepair(
        () => invokeGatewayTool('session_status', parameters ?? {})
      )
      return { ok: true, data }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  ipcMain.handle('gateway:tools-cron-list', async () => {
    try {
      const data = await invokeGatewayTool('cron', { action: 'list' })
      return { ok: true, data }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  ipcMain.handle('gateway:tools-cron-runs', async (_, jobId: string, limit = 20) => {
    try {
      const data = await invokeGatewayTool('cron', { action: 'runs', jobId, limit })
      return { ok: true, data }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  ipcMain.handle('gateway:tools-cron-set-enabled', async (_, jobId: string, enabled: boolean) => {
    try {
      const action = enabled ? 'enable' : 'disable'
      const data = await invokeGatewayTool('cron', { action, jobId })
      return { ok: true, data }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  ipcMain.handle('gateway:tools-cron-add', async (_, job: Record<string, unknown>) => {
    try {
      activityLogger.log('gateway_action', `Add cron job: ${job.name || 'unnamed'}`)
      const data = await invokeGatewayTool('cron', { action: 'add', job })
      return { ok: true, data }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  ipcMain.handle('gateway:tools-cron-remove', async (_, jobId: string) => {
    try {
      activityLogger.log('gateway_action', `Remove cron job: ${jobId}`)
      const data = await invokeGatewayTool('cron', { action: 'remove', jobId })
      return { ok: true, data }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  ipcMain.handle('gateway:tools-cron-run', async (_, jobId: string) => {
    try {
      activityLogger.log('gateway_action', `Run cron job now: ${jobId}`)
      const data = await invokeGatewayTool('cron', { action: 'run', jobId })
      return { ok: true, data }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  ipcMain.handle('mcp:list-servers', async () => {
    try {
      if (!mcpManager) {
        return { ok: false, error: 'MCP manager is not initialized' }
      }
      return { ok: true, data: mcpManager.listServers() }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  ipcMain.handle('mcp:add-server', async (_, config: MCPServerConfig) => {
    try {
      if (!mcpManager) {
        return { ok: false, error: 'MCP manager is not initialized' }
      }
      const data = await mcpManager.addServer(config)
      return { ok: true, data }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  ipcMain.handle('mcp:update-server', async (_, id: string, patch: Partial<MCPServerConfig>) => {
    try {
      if (!mcpManager) {
        return { ok: false, error: 'MCP manager is not initialized' }
      }
      const data = await mcpManager.updateServer(id, patch)
      return { ok: true, data }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  ipcMain.handle('mcp:remove-server', async (_, id: string) => {
    try {
      if (!mcpManager) {
        return { ok: false, error: 'MCP manager is not initialized' }
      }
      await mcpManager.removeServer(id)
      return { ok: true }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  ipcMain.handle('mcp:toggle-server', async (_, id: string, enabled: boolean) => {
    try {
      if (!mcpManager) {
        return { ok: false, error: 'MCP manager is not initialized' }
      }
      const data = await mcpManager.toggleServer(id, enabled)
      return { ok: true, data }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  ipcMain.handle('mcp:list-tools', async (_, id: string) => {
    try {
      if (!mcpManager) {
        return { ok: false, error: 'MCP manager is not initialized' }
      }
      const data = await mcpManager.listTools(id)
      return { ok: true, data }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  ipcMain.handle('mcp:call-history', async (_, id: string) => {
    try {
      if (!mcpManager) {
        return { ok: false, error: 'MCP manager is not initialized' }
      }
      const data = mcpManager.getCallHistory(id)
      return { ok: true, data }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  ipcMain.handle(
    'mcp:call-tool',
    async (_, serverId: string, toolName: string, args?: Record<string, unknown>) => {
      try {
        if (!mcpManager) {
          return { ok: false, error: 'MCP manager is not initialized' }
        }
        const serverName = mcpManager.listServers().find((server) => server.id === serverId)?.name ?? serverId
        const startedAt = Date.now()
        try {
          const data = await mcpManager.callTool(serverId, toolName, args ?? {})
          logMcpToolCall(mcpManager, {
            serverId,
            serverName,
            toolName,
            args,
            status: 'success',
            durationMs: Date.now() - startedAt
          })
          return { ok: true, data }
        } catch (error) {
          logMcpToolCall(mcpManager, {
            serverId,
            serverName,
            toolName,
            args,
            status: 'error',
            durationMs: Date.now() - startedAt,
            error
          })
          return { ok: false, error: String(error) }
        }
      } catch (error) {
        return { ok: false, error: String(error) }
      }
    }
  )

  ipcMain.handle('mcp:test-connection', async (_, config: MCPServerConfig) => {
    try {
      if (!mcpManager) {
        return { ok: false, error: 'MCP manager is not initialized' }
      }
      const data: MCPConnectionTestResult = await mcpManager.testConnection(config)
      return { ok: true, data }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  ipcMain.handle('app:version', async () => {
    try {
      return { ok: true, data: app.getVersion() }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  ipcMain.handle('terminal:create', async (event) => {
    try {
      const result = createTerminalSession(event.sender)
      if (!result.ok) {
        return { ok: false, error: result.error || 'Failed to create terminal session.' }
      }
      return { ok: true }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  ipcMain.handle('terminal:write', async (event, data: string) => {
    try {
      const session = terminalSessions.get(event.sender.id)
      if (!session) {
        return { ok: false, error: 'No active terminal session.' }
      }
      session.ptyProcess.write(String(data ?? ''))
      return { ok: true }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  ipcMain.handle('terminal:resize', async (event, cols: number, rows: number) => {
    try {
      const session = terminalSessions.get(event.sender.id)
      if (!session) {
        return { ok: false, error: 'No active terminal session.' }
      }
      const safeCols = Math.max(2, Math.floor(Number(cols) || TERMINAL_COLS))
      const safeRows = Math.max(1, Math.floor(Number(rows) || TERMINAL_ROWS))
      session.ptyProcess.resize(safeCols, safeRows)
      return { ok: true }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  ipcMain.handle('terminal:close', async (event) => {
    try {
      closeTerminalSession(event.sender.id)
      return { ok: true }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  ipcMain.handle('files:list', async () => {
    try {
      const files = listFilesRecursive(WORKSPACE_PATH)
      return { ok: true, data: files }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  ipcMain.handle('files:read', async (_, filename: string) => {
    try {
      enforcePermission('file_read', `Read file: ${filename}`)
      activityLogger.log('file_read', `Read file: ${filename}`)
      const filepath = join(WORKSPACE_PATH, filename)
      if (!filepath.startsWith(WORKSPACE_PATH)) {
        return { ok: false, error: 'Invalid file path' }
      }
      const content = readFileSync(filepath, 'utf-8')
      return { ok: true, data: content }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  ipcMain.handle('files:read-binary', async (_, filename: string) => {
    try {
      enforcePermission('file_read', `Read file: ${filename}`)
      activityLogger.log('file_read', `Read binary file: ${filename}`)
      const filepath = join(WORKSPACE_PATH, filename)
      if (!filepath.startsWith(WORKSPACE_PATH)) {
        return { ok: false, error: 'Invalid file path' }
      }
      const buffer = readFileSync(filepath)
      const ext = filename.split('.').pop()?.toLowerCase() || ''
      const mimeMap: Record<string, string> = {
        png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
        gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
        ico: 'image/x-icon', bmp: 'image/bmp', pdf: 'application/pdf'
      }
      const mime = mimeMap[ext] || 'application/octet-stream'
      return { ok: true, data: { base64: buffer.toString('base64'), mime, size: buffer.length } }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  ipcMain.handle('files:write', async (_, filename: string, content: string) => {
    try {
      enforcePermission('file_write', `Write file: ${filename}`)
      activityLogger.log('file_write', `Write file: ${filename}`)
      const filepath = join(WORKSPACE_PATH, filename)
      if (!filepath.startsWith(WORKSPACE_PATH)) {
        return { ok: false, error: 'Invalid file path' }
      }
      const parentDir = dirname(filepath)
      if (!existsSync(parentDir)) {
        mkdirSync(parentDir, { recursive: true })
      }
      writeFileSync(filepath, content, 'utf-8')
      return { ok: true }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  ipcMain.handle('files:delete', async (_, filename: string) => {
    try {
      enforcePermission('file_write', `Delete file: ${filename}`)
      activityLogger.log('file_write', `Delete file: ${filename}`)
      const filepath = join(WORKSPACE_PATH, filename)
      if (!filepath.startsWith(WORKSPACE_PATH)) {
        return { ok: false, error: 'Invalid file path' }
      }

      if (!existsSync(filepath)) {
        return { ok: false, error: 'File does not exist' }
      }

      const fileStats = statSync(filepath)
      if (!fileStats.isFile()) {
        return { ok: false, error: 'Only files can be deleted' }
      }

      unlinkSync(filepath)
      return { ok: true }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  ipcMain.handle('files:import-from-path', async (_, sourcePath: string, targetRelativePath: string) => {
    try {
      enforcePermission('file_read', `Import file from: ${sourcePath}`)
      enforcePermission('file_write', `Import file to: ${targetRelativePath}`)
      activityLogger.log('file_read', `Import source file: ${sourcePath}`)
      activityLogger.log('file_write', `Import destination file: ${targetRelativePath}`)

      const normalizedSource = readNonEmptyString(sourcePath)
      const normalizedTarget = readNonEmptyString(targetRelativePath)?.replace(/\\/g, '/')
      if (!normalizedSource || !normalizedTarget) {
        return { ok: false, error: 'Source and destination paths are required' }
      }

      const sourceStats = statSync(normalizedSource)
      if (!sourceStats.isFile()) {
        return { ok: false, error: 'Source must be a file' }
      }

      const rawSegments = normalizedTarget.split('/').filter((segment) => segment.length > 0)
      if (rawSegments.length === 0 || rawSegments.some((segment) => segment === '..')) {
        return { ok: false, error: 'Invalid destination path' }
      }
      if (rawSegments[0] !== 'attachments') {
        return { ok: false, error: 'Attachments must be stored under attachments/' }
      }

      const safeSegments = rawSegments.map((segment, index) => {
        if (index === rawSegments.length - 1) return sanitizeFilename(segment)
        return segment.replace(/[^a-zA-Z0-9._-]/g, '-')
      })

      const destinationRelative = safeSegments.join('/')
      const destinationPath = join(WORKSPACE_PATH, destinationRelative)
      if (!destinationPath.startsWith(WORKSPACE_PATH)) {
        return { ok: false, error: 'Invalid destination path' }
      }

      const destinationDir = dirname(destinationPath)
      if (!existsSync(destinationDir)) {
        mkdirSync(destinationDir, { recursive: true })
      }

      copyFileSync(normalizedSource, destinationPath)
      const importedStats = statSync(destinationPath)

      return {
        ok: true,
        data: {
          path: destinationRelative,
          name: basename(destinationRelative),
          size: importedStats.size,
          type: inferAttachmentMimeType(destinationPath),
          createdAt: new Date().toISOString()
        }
      }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  // Voice: transcribe audio via OpenAI Whisper API directly
  ipcMain.handle('voice:transcribe', async (_, audioBase64: string) => {
    try {
      // Get OpenAI API key from env or OpenClaw config
      let apiKey = process.env.OPENAI_API_KEY
      if (!apiKey) {
        try {
          const configPath = join(homedir(), '.openclaw', 'openclaw.json')
          const config = JSON.parse(readFileSync(configPath, 'utf-8'))
          apiKey = config?.openaiApiKey || config?.providers?.openai?.apiKey || config?.env?.OPENAI_API_KEY
        } catch { /* ignore */ }
      }
      if (!apiKey) {
        return { ok: false, error: 'OpenAI API key not found. Set OPENAI_API_KEY or configure it in OpenClaw.' }
      }

      // Save audio to temp file
      const tmpDir = join(homedir(), '.openclaw', 'tmp')
      if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true })
      const tmpFile = join(tmpDir, `voice-${Date.now()}.webm`)
      writeFileSync(tmpFile, Buffer.from(audioBase64, 'base64'))

      // Call OpenAI Whisper API directly
      const audioBuffer = readFileSync(tmpFile)
      const formData = new FormData()
      formData.append('file', new Blob([audioBuffer], { type: 'audio/webm' }), 'audio.webm')
      formData.append('model', 'whisper-1')

      const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}` },
        body: formData
      })

      if (!res.ok) {
        const err = await res.text()
        return { ok: false, error: `Whisper API error ${res.status}: ${err}` }
      }

      const json = await res.json() as { text: string }
      // Clean up temp file
      try { unlinkSync(tmpFile) } catch { /* ignore */ }

      return { ok: true, data: json.text }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  // Voice: text-to-speech via OpenClaw tools/invoke → tts tool
  ipcMain.handle('voice:speak', async (_, text: string) => {
    try {
      const res = await fetch(`${getGatewayUrl()}/tools/invoke`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ tool: 'tts', args: { text }, sessionKey: 'main' })
      })
      if (!res.ok) return { ok: false, error: `TTS failed: ${res.status}` }
      const json = await res.json() as { result?: { content?: Array<{ type: string; text: string }> } }
      const mediaLine = json?.result?.content?.find((c: { type: string; text: string }) => c.type === 'text')?.text
      // Extract MEDIA: path from response
      const mediaMatch = mediaLine?.match(/MEDIA:\s*(.+)/)
      if (mediaMatch) {
        const audioPath = mediaMatch[1].trim()
        const audioData = readFileSync(audioPath)
        return { ok: true, data: audioData.toString('base64'), path: audioPath }
      }
      return { ok: false, error: 'No audio generated' }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  // Connections: Twilio
  const connectionsPath = join(homedir(), '.openclaw', 'pinchr-connections.json')

  function readConnections(): Record<string, unknown> {
    try {
      return JSON.parse(readFileSync(connectionsPath, 'utf-8'))
    } catch {
      return {}
    }
  }

  function writeConnections(data: Record<string, unknown>) {
    const dir = join(homedir(), '.openclaw')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(connectionsPath, JSON.stringify(data, null, 2))
  }

  ipcMain.handle('connections:get-twilio', async () => {
    const conns = readConnections()
    return { ok: true, data: conns.twilio || null }
  })

  ipcMain.handle('connections:save-twilio', async (_, config: { accountSid: string; authToken: string; phoneNumber: string; enableSms: boolean; enableVoice: boolean }) => {
    try {
      const conns = readConnections()
      conns.twilio = { ...config, connectedAt: new Date().toISOString() }
      writeConnections(conns)
      return { ok: true }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  ipcMain.handle('connections:test-twilio', async (_, config: { accountSid: string; authToken: string }) => {
    try {
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}.json`, {
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`${config.accountSid}:${config.authToken}`).toString('base64')
        }
      })
      if (!res.ok) {
        return { ok: false, error: `Invalid credentials (${res.status})` }
      }
      const data = await res.json() as { friendly_name: string; status: string }
      return { ok: true, data: { name: data.friendly_name, status: data.status } }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  ipcMain.handle('connections:remove-twilio', async () => {
    try {
      const conns = readConnections()
      delete conns.twilio
      writeConnections(conns)
      return { ok: true }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  // Media: file picker
  ipcMain.handle('media:pick-file', async () => {
    try {
      const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [
          { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] },
          { name: 'Documents', extensions: ['pdf', 'txt', 'md', 'csv'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      })
      if (result.canceled || !result.filePaths[0]) return { ok: false, error: 'Cancelled' }
      return { ok: true, data: result.filePaths[0] }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  // Media: send file with message
  ipcMain.handle('media:send-file', async (_, sessionKey: string, _filePath: string, message: string) => {
    try {
      // For now, send the message with a note about the attachment
      // Full media support requires multipart upload to the gateway
      return await sendMessage(sessionKey, message)
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  // Dialog: save file to disk
  ipcMain.handle(
    'dialog:save-file',
    async (
      _,
      content: string,
      options?: { defaultPath?: string; filters?: Array<{ name: string; extensions: string[] }> }
    ) => {
      try {
        const result = await dialog.showSaveDialog({
          defaultPath: options?.defaultPath,
          filters: options?.filters
        })
        if (result.canceled || !result.filePath) {
          return { ok: false, error: 'Cancelled' }
        }
        writeFileSync(result.filePath, content, 'utf-8')
        return { ok: true, data: result.filePath }
      } catch (error) {
        return { ok: false, error: String(error) }
      }
    }
  )

  // Onboarding: check if onboarding is complete
  ipcMain.handle('onboarding:check', async () => {
    try {
      if (!existsSync(PINCHR_CONFIG_PATH)) {
        return { ok: true, data: { completed: false } }
      }
      const config = JSON.parse(readFileSync(PINCHR_CONFIG_PATH, 'utf-8'))
      return { ok: true, data: { completed: config.onboardingCompleted || false } }
    } catch (error) {
      return { ok: true, data: { completed: false } }
    }
  })

  // Onboarding: mark onboarding as complete
  ipcMain.handle('onboarding:complete', async () => {
    try {
      const configDir = join(homedir(), '.pinchr')
      if (!existsSync(configDir)) {
        mkdirSync(configDir, { recursive: true })
      }
      
      let config = {}
      if (existsSync(PINCHR_CONFIG_PATH)) {
        config = JSON.parse(readFileSync(PINCHR_CONFIG_PATH, 'utf-8'))
      }
      
      config = { ...config, onboardingCompleted: true }
      writeFileSync(PINCHR_CONFIG_PATH, JSON.stringify(config, null, 2))
      
      return { ok: true }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  // Onboarding: check system readiness for in-app install flow
  ipcMain.handle('onboarding:system-check', async () => {
    try {
      const versionResult = await runShellCommand('openclaw --version', 15000)
      const cliInstalled = versionResult.ok
      const cliVersion = cliInstalled
        ? (versionResult.output.split('\n').map((line) => line.trim()).find(Boolean) || null)
        : null

      let gatewayStatus: string | null = null
      if (cliInstalled) {
        const statusResult = await runShellCommand('openclaw gateway status', 20000)
        gatewayStatus = statusResult.output || (statusResult.ok ? 'Gateway status checked.' : 'Gateway status unavailable.')
      }

      let gatewayReachable = false
      try {
        await gatewayHealth()
        gatewayReachable = true
      } catch {
        gatewayReachable = false
      }

      return {
        ok: true,
        data: {
          cliInstalled,
          cliVersion,
          gatewayReachable,
          gatewayStatus
        }
      }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  // Onboarding: background install is disabled; onboarding must run through embedded PTY.
  ipcMain.handle('onboarding:install-openclaw', async () => {
    return {
      ok: false,
      needsTerminal: true,
      error: 'Install must run in Pinchr embedded terminal.'
    }
  })

  ipcMain.handle('onboarding:open-install-terminal', async () => {
    return { ok: false, error: 'External terminal flow is disabled.' }
  })

  ipcMain.handle('onboarding:write-initial-config', async () => {
    try {
      const result = await writeInitialOpenClawConfig()
      if (!result.ok) {
        return { ok: false, error: result.output || 'Failed to initialize OpenClaw config.' }
      }
      return {
        ok: true,
        data: {
          created: result.created,
          output: result.output
        }
      }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  // Onboarding: install/restart gateway and verify local connectivity
  ipcMain.handle('onboarding:prepare-gateway', async () => {
    try {
      const prepared = await prepareGatewayRuntime()
      if (!prepared.ok) {
        return { ok: false, error: prepared.output }
      }

      return {
        ok: true,
        data: {
          output: prepared.output
        }
      }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  // Gateway: repair service state and restart using bundled runtime
  ipcMain.handle('gateway:repair-shell', async () => {
    try {
      const prepared = await prepareGatewayRuntime()
      if (!prepared.ok) {
        return { ok: false, error: prepared.output || 'Gateway repair failed.' }
      }
      return { ok: true, data: prepared.output || 'Gateway repaired and running.' }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  // Onboarding: save API key to OpenClaw config
  ipcMain.handle('onboarding:save-api-key', async (_, provider: string, apiKey: string) => {
    try {
      const trimmedKey = apiKey.trim()
      if (!trimmedKey) {
        return { ok: false, error: 'API key is required.' }
      }
      if (!['anthropic', 'openai', 'google'].includes(provider)) {
        return { ok: false, error: 'Invalid provider' }
      }

      const validationResult = await validateProviderApiKey(provider, trimmedKey)
      if (!validationResult.ok) {
        return { ok: false, error: validationResult.error || 'API key validation failed.' }
      }

      const initResult = await writeInitialOpenClawConfig()
      if (!initResult.ok) {
        return { ok: false, error: initResult.output || 'Failed to initialize OpenClaw config.' }
      }

      let config = readOpenClawConfig()

      const env = (config.env && typeof config.env === 'object' && !Array.isArray(config.env))
        ? { ...(config.env as Record<string, unknown>) }
        : {}
      const vars = (env.vars && typeof env.vars === 'object' && !Array.isArray(env.vars))
        ? { ...(env.vars as Record<string, unknown>) }
        : {}

      if (provider === 'anthropic') {
        vars.ANTHROPIC_API_KEY = trimmedKey
      } else if (provider === 'openai') {
        vars.OPENAI_API_KEY = trimmedKey
      } else if (provider === 'google') {
        vars.GEMINI_API_KEY = trimmedKey
        vars.GOOGLE_API_KEY = trimmedKey
      }

      env.vars = vars

      const agents = isPlainRecord(config.agents)
        ? { ...(config.agents as Record<string, unknown>) }
        : {}
      const defaults = isPlainRecord(agents.defaults)
        ? { ...(agents.defaults as Record<string, unknown>) }
        : {}
      const model = isPlainRecord(defaults.model)
        ? { ...(defaults.model as Record<string, unknown>) }
        : {}
      const currentPrimaryModel = readNonEmptyString(model.primary)
      if (
        !currentPrimaryModel
        || Object.values(ONBOARDING_PROVIDER_DEFAULT_MODELS).includes(currentPrimaryModel)
      ) {
        model.primary = providerDefaultModel(provider)
      }
      defaults.model = model
      agents.defaults = defaults

      config = { ...config, env, agents }
      writeOpenClawConfig(config)

      const authProfiles = readAuthProfiles()
      const profiles = isPlainRecord(authProfiles.profiles)
        ? { ...(authProfiles.profiles as Record<string, unknown>) }
        : {}
      const lastGood = isPlainRecord(authProfiles.lastGood)
        ? { ...(authProfiles.lastGood as Record<string, unknown>) }
        : {}
      const usageStats = isPlainRecord(authProfiles.usageStats)
        ? { ...(authProfiles.usageStats as Record<string, unknown>) }
        : {}
      const profileId = `${provider}:default`

      profiles[profileId] = {
        type: 'api_key',
        provider,
        key: trimmedKey
      }
      lastGood[provider] = profileId

      writeAuthProfiles({
        ...authProfiles,
        version: 1,
        profiles,
        lastGood,
        usageStats
      })

      const restartResult = await runShellCommand('openclaw gateway restart', 60_000)
      if (!restartResult.ok) {
        return {
          ok: false,
          error: `Saved API key, but failed to restart gateway: ${restartResult.output || 'Unknown error'}`
        }
      }

      const healthReady = await (async () => {
        for (let i = 0; i < 5; i++) {
          try {
            await gatewayHealth()
            return true
          } catch {
            await sleep(1500)
          }
        }
        return false
      })()

      if (!healthReady) {
        return {
          ok: false,
          error: 'Saved API key, but gateway did not become reachable after restart.'
        }
      }

      return { ok: true }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  // Onboarding: save per-channel config to openclaw.json and restart gateway
  ipcMain.handle(
    'onboarding:save-channel-config',
    async (_, channel: string, channelConfig: Record<string, unknown>) => {
      try {
        const trimmedChannel = channel.trim()
        if (!trimmedChannel) {
          return { ok: false, error: 'Channel is required.' }
        }
        if (!isPlainRecord(channelConfig)) {
          return { ok: false, error: 'Channel config must be an object.' }
        }

        const config = readOpenClawConfig()
        const channels = isPlainRecord(config.channels)
          ? { ...(config.channels as Record<string, unknown>) }
          : {}
        const existing = isPlainRecord(channels[trimmedChannel])
          ? channels[trimmedChannel] as Record<string, unknown>
          : {}

        const enabled = typeof channelConfig.enabled === 'boolean' ? channelConfig.enabled : true
        channels[trimmedChannel] = {
          ...existing,
          ...channelConfig,
          enabled
        }

        writeOpenClawConfig({
          ...config,
          channels
        })

        const restartResult = await runShellCommand('openclaw gateway restart', 60_000)
        if (!restartResult.ok) {
          return {
            ok: false,
            error: `Saved channel config, but failed to restart gateway: ${restartResult.output || 'Unknown error'}`
          }
        }

        return { ok: true }
      } catch (error) {
        return { ok: false, error: String(error) }
      }
    }
  )

  // Onboarding: save tool/skill configuration at a dot path and restart gateway
  ipcMain.handle('onboarding:save-tool-config', async (_, toolPath: string, value: unknown) => {
    try {
      const normalizedPath = toolPath.trim()
      if (!normalizedPath) {
        return { ok: false, error: 'Tool path is required.' }
      }

      const segments = normalizedPath
        .split('.')
        .map((segment) => segment.trim())
        .filter(Boolean)

      if (segments.length === 0) {
        return { ok: false, error: 'Tool path is invalid.' }
      }

      const config = readOpenClawConfig()
      setNestedValue(config, segments, value)
      writeOpenClawConfig(config)

      const restartResult = await runShellCommand('openclaw gateway restart', 60_000)
      if (!restartResult.ok) {
        return {
          ok: false,
          error: `Saved tool config, but failed to restart gateway: ${restartResult.output || 'Unknown error'}`
        }
      }

      return { ok: true }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  // Onboarding: check if a CLI tool is installed and return best-effort version text
  ipcMain.handle('onboarding:check-tool', async (_, toolName: string) => {
    try {
      const trimmedTool = toolName.trim()
      if (!trimmedTool || !/^[a-zA-Z0-9._-]+$/.test(trimmedTool)) {
        return { ok: false, error: 'Invalid tool name.' }
      }

      const checkResult = await runShellCommand(`command -v ${trimmedTool}`, 10_000)
      if (!checkResult.ok) {
        return {
          ok: true,
          data: {
            ok: false,
            version: null
          }
        }
      }

      const versionResult = await runShellCommand(
        `${trimmedTool} --version || ${trimmedTool} -v || ${trimmedTool} version`,
        15_000
      )
      const versionText = (versionResult.output || checkResult.output)
        .split('\n')
        .map((line) => line.trim())
        .find(Boolean) || null

      return {
        ok: true,
        data: {
          ok: true,
          version: versionText
        }
      }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  // Onboarding: install a named skill through the OpenClaw CLI
  ipcMain.handle('onboarding:install-skill', async (_, skillName: string) => {
    try {
      const trimmedSkill = skillName.trim()
      if (!trimmedSkill || !/^[a-zA-Z0-9._/-]+$/.test(trimmedSkill)) {
        return { ok: false, error: 'Invalid skill name.' }
      }
      if (trimmedSkill.includes('..') || trimmedSkill.startsWith('/') || trimmedSkill.startsWith('./')) {
        return { ok: false, error: 'Invalid skill path.' }
      }

      const openclawCheck = await runShellCommand('command -v openclaw', 10_000)
      if (!openclawCheck.ok) {
        return {
          ok: false,
          error: 'OpenClaw CLI not found. Install OpenClaw before installing skills.'
        }
      }

      const installCommand = `openclaw skills install ${shellEscapeArg(trimmedSkill)}`
      const installResult = await runShellCommand(installCommand, 3 * 60_000)
      if (!installResult.ok) {
        return {
          ok: false,
          error: installResult.output || `Failed to install skill: ${trimmedSkill}`,
          data: {
            command: installCommand
          }
        }
      }

      const listResult = await runShellCommand('openclaw skills list', 20_000)
      const skillInstalled = listResult.ok && listResult.output.toLowerCase().includes(trimmedSkill.toLowerCase())

      return {
        ok: true,
        data: {
          output: installResult.output || `Installed skill: ${trimmedSkill}`,
          installed: skillInstalled,
          verifyOutput: listResult.output || ''
        }
      }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  // Permissions: check macOS permissions
  ipcMain.handle('permissions:check', async () => {
    try {
      const permissions = await checkPermissions()
      return {
        ok: true,
        data: {
          screenRecording: permissions.screenRecording ?? false,
          accessibility: permissions.accessibility ?? false
        }
      }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  // OpenClaw Control pages: logs snapshot from local gateway log files
  ipcMain.handle('openclaw:logs-snapshot', async (_, lineLimit?: number) => {
    try {
      const safeLimit = Math.max(50, Math.min(5000, Math.floor(Number(lineLimit) || 500)))
      const perFileLimit = Math.max(25, Math.floor(safeLimit / OPENCLAW_LOG_FILENAMES.length))

      const files = OPENCLAW_LOG_FILENAMES.map((name) => {
        const filePath = join(OPENCLAW_LOGS_PATH, name)
        if (!existsSync(filePath)) {
          return {
            name,
            path: filePath,
            exists: false,
            updatedAt: null,
            lineCount: 0,
            truncated: false,
            lines: []
          }
        }

        const stats = statSync(filePath)
        const tail = readTailText(filePath)
        const lines = tailLines(tail, perFileLimit)

        return {
          name,
          path: filePath,
          exists: true,
          updatedAt: Number.isFinite(stats.mtimeMs) ? new Date(stats.mtimeMs).toISOString() : null,
          lineCount: lines.length,
          truncated: lines.length >= perFileLimit,
          lines
        }
      })

      const combined = files
        .flatMap((file) =>
          file.lines.map((line) => `[${file.name}] ${line}`)
        )
        .slice(-safeLimit)

      return {
        ok: true,
        data: {
          generatedAt: new Date().toISOString(),
          files,
          combined
        }
      }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  // Permissions: open system settings
  ipcMain.handle('permissions:open-settings', async (_event, pane?: string) => {
    try {
      // Prime permission probes first so Pinchr is present in the macOS permission list.
      try {
        await checkPermissions()
      } catch {
        // Ignore probe failures here; still open the settings pane.
      }

      // Open macOS System Settings to the specific Privacy pane
      const paneMap: Record<string, string> = {
        screenRecording: 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture',
        accessibility: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility',
        microphone: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone',
      }
      const url = (pane && paneMap[pane]) || 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'
      await shell.openExternal(url)
      return { ok: true }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  // Permissions: relaunch app after permission grant (macOS requires restart for Screen Recording)
  ipcMain.handle('permissions:relaunch', async () => {
    app.relaunch()
    app.exit(0)
  })

  // Quick Actions: load configuration
  ipcMain.handle('quick-actions:load', async () => {
    try {
      if (!existsSync(QUICK_ACTIONS_PATH)) {
        // Return default actions if config doesn't exist
        const defaultActions = [
          {
            id: 'email',
            emoji: '📧',
            label: 'Check email',
            prompt: 'Check my email for anything urgent'
          },
          {
            id: 'schedule',
            emoji: '📅',
            label: "Today's schedule",
            prompt: "What's on my calendar today?"
          },
          {
            id: 'news',
            emoji: '📰',
            label: 'News briefing',
            prompt: 'Give me a quick news briefing'
          },
          {
            id: 'tasks',
            emoji: '✅',
            label: 'My tasks',
            prompt: 'What tasks do I have pending?'
          }
        ]
        return { ok: true, data: defaultActions }
      }
      
      const config = JSON.parse(readFileSync(QUICK_ACTIONS_PATH, 'utf-8'))
      return { ok: true, data: config }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  // Quick Actions: save configuration
  ipcMain.handle('quick-actions:save', async (_, actions) => {
    try {
      const configDir = join(homedir(), '.pinchr')
      if (!existsSync(configDir)) {
        mkdirSync(configDir, { recursive: true })
      }
      
      writeFileSync(QUICK_ACTIONS_PATH, JSON.stringify(actions, null, 2))
      return { ok: true }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  // Notifications: send native notification
  ipcMain.handle('notifications:send', async (_, options: {
    title: string
    body: string
    silent?: boolean
  }) => {
    try {
      const { Notification } = require('electron')
      const notification = new Notification({
        title: options.title,
        body: options.body,
        silent: options.silent || false
      })
      
      notification.show()
      
      return { ok: true }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  // Open external links (for markdown links)
  ipcMain.handle('shell:open-external', async (_, url: string) => {
    try {
      await shell.openExternal(url)
      return { ok: true }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  ipcMain.handle('shell:open-path', async (_, filePath: string) => {
    try {
      const normalizedPath = readNonEmptyString(filePath)
      if (!normalizedPath) {
        return { ok: false, error: 'Path is required' }
      }

      const resolvedPath = isAbsolute(normalizedPath) ? normalizedPath : join(WORKSPACE_PATH, normalizedPath)
      if (!isAbsolute(normalizedPath) && !resolvedPath.startsWith(WORKSPACE_PATH)) {
        return { ok: false, error: 'Invalid file path' }
      }

      const openError = await shell.openPath(resolvedPath)
      if (openError) {
        return { ok: false, error: openError }
      }
      return { ok: true }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  // License: get current status
  ipcMain.handle('license:status', async () => {
    try {
      return { ok: true, data: getLicenseStatus() }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  // License: activate a license key
  ipcMain.handle('license:activate', async (_, key: string) => {
    try {
      const result = activateLicense(key)
      return { ok: result.success, error: result.error, data: result.success ? getLicenseStatus() : null }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  // License: deactivate current license
  ipcMain.handle('license:deactivate', async () => {
    try {
      const result = deactivateLicense()
      return { ok: result.success, error: result.error, data: result.success ? getLicenseStatus() : null }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  // Security: get recent activity log
  ipcMain.handle('security:get-activity', async (_, limit?: number, filterType?: ActionType) => {
    try {
      return { ok: true, data: activityLogger.getRecent(limit, filterType) }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  // Security: get resource stats
  ipcMain.handle('security:get-resources', async () => {
    try {
      const cpuUsage = process.cpuUsage()
      const memUsage = process.memoryUsage()
      const cpuPercent = (cpuUsage.user + cpuUsage.system) / 1e6 // rough seconds
      return {
        ok: true,
        data: {
          cpu: Math.min(100, Math.round(cpuPercent * 10) / 10),
          memory: {
            rss: memUsage.rss,
            heapUsed: memUsage.heapUsed,
            heapTotal: memUsage.heapTotal
          },
          networkRequests: activityLogger.getNetworkCount(),
          uptime: activityLogger.getUptime()
        }
      }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  // Security: get permission scopes
  ipcMain.handle('security:get-permissions', async () => {
    try {
      const config = readPinchrConfig()
      const permissions = (config.permissions as PermissionScopes) || DEFAULT_PERMISSIONS
      return { ok: true, data: { ...DEFAULT_PERMISSIONS, ...permissions } }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  // Security: set a permission scope
  ipcMain.handle('security:set-permission', async (_, key: string, value: boolean | 'ask') => {
    try {
      const config = readPinchrConfig()
      const permissions = { ...DEFAULT_PERMISSIONS, ...(config.permissions as object || {}) }
      ;(permissions as Record<string, unknown>)[key] = value
      config.permissions = permissions
      writePinchrConfig(config)
      activityLogger.log('permission_change', `Permission "${key}" changed to ${String(value)}`)
      return { ok: true }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  // Security: kill switch - disconnect gateway, revoke permissions
  ipcMain.handle('security:kill-switch', async () => {
    try {
      activityLogger.log('gateway_action', 'Emergency kill switch activated', 'blocked')
      // Revoke all permissions
      const config = readPinchrConfig()
      config.permissions = {
        file_read: false,
        file_write: false,
        command_run: false,
        clipboard_access: false,
        browser_action: false,
        send_messages: false
      }
      writePinchrConfig(config)
      // Attempt gateway shutdown
      void runShellCommand('openclaw gateway stop', 5000)
      return { ok: true }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  // Security: get recent workspace file changes (what the agent touched)
  ipcMain.handle('security:workspace-changes', async () => {
    try {
      const files: Array<{
        path: string
        modified: string
        size: number
        action: 'created' | 'modified' | 'deleted'
        summary?: string // e.g. "+12 −3 lines" or "new file (2.1 KB)" or brief content preview
      }> = []

      // Helper: get git diff stats for a file
      const getGitDiffSummary = (filePath: string): string => {
        try {
          // Try unstaged first, then HEAD
          let diffStat = ''
          try {
            diffStat = execSync(
              `git diff --numstat -- "${filePath}"`,
              { cwd: WORKSPACE_PATH, encoding: 'utf-8', timeout: 3000 }
            ).trim()
          } catch { /* ignore */ }

          if (!diffStat) {
            try {
              diffStat = execSync(
                `git diff HEAD --numstat -- "${filePath}"`,
                { cwd: WORKSPACE_PATH, encoding: 'utf-8', timeout: 3000 }
              ).trim()
            } catch { /* ignore */ }
          }

          if (diffStat) {
            const [added, removed] = diffStat.split('\t')
            const parts: string[] = []
            if (added && added !== '0') parts.push(`+${added}`)
            if (removed && removed !== '0') parts.push(`−${removed}`)
            if (parts.length > 0) return `${parts.join(' ')} lines`
          }
        } catch { /* ignore */ }
        return ''
      }

      // Helper: get brief content preview for new files
      const getContentPreview = (fullPath: string, maxLen = 80): string => {
        try {
          const content = readFileSync(fullPath, 'utf-8')
          // Skip frontmatter / headers, find first real content line
          const lines = content.split('\n').filter(l => l.trim() && !l.startsWith('#') && !l.startsWith('---'))
          const preview = lines[0]?.trim() || ''
          if (preview.length > maxLen) return preview.slice(0, maxLen) + '…'
          return preview
        } catch { return '' }
      }

      // Check for deleted files via git
      const deletedFiles = new Set<string>()
      try {
        const gitStatus = execSync('git status --porcelain', {
          cwd: WORKSPACE_PATH, encoding: 'utf-8', timeout: 5000
        }).trim()
        if (gitStatus) {
          for (const line of gitStatus.split('\n')) {
            const status = line.slice(0, 2)
            const filePath = line.slice(3).trim()
            if (status.includes('D') && !filePath.startsWith('.')) {
              // Get last modify time from git log
              let lastModified = new Date().toISOString()
              try {
                const logDate = execSync(
                  `git log -1 --format="%ai" -- "${filePath}"`,
                  { cwd: WORKSPACE_PATH, encoding: 'utf-8', timeout: 3000 }
                ).trim()
                if (logDate) lastModified = new Date(logDate).toISOString()
              } catch { /* ignore */ }

              files.push({
                path: filePath,
                modified: lastModified,
                size: 0,
                action: 'deleted',
                summary: 'file removed'
              })
              deletedFiles.add(filePath)
            }
          }
        }
      } catch { /* no git or no changes */ }

      // Helper: detect binary/image files
      const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'bmp'])
      const isBinaryExt = (p: string) => {
        const ext = p.split('.').pop()?.toLowerCase() || ''
        return IMAGE_EXTS.has(ext) || ['pdf', 'zip', 'gz', 'tar', 'dmg', 'exe'].includes(ext)
      }

      const scanDir = (dir: string, prefix = '') => {
        if (!existsSync(dir)) return
        const entries = readdirSync(dir, { withFileTypes: true })
        for (const entry of entries) {
          if (entry.name.startsWith('.')) continue
          const fullPath = join(dir, entry.name)
          const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name

          if (entry.isDirectory()) {
            scanDir(fullPath, relativePath)
          } else {
            try {
              const { statSync } = require('fs')
              const stat = statSync(fullPath)
              // Use 5-second threshold — files written once have birth≈mtime within ms
              const timeDiff = Math.abs(stat.mtime.getTime() - stat.birthtime.getTime())
              const isNew = timeDiff < 5000
              const action: 'created' | 'modified' = isNew ? 'created' : 'modified'
              const binary = isBinaryExt(relativePath)
              const ext = relativePath.split('.').pop()?.toLowerCase() || ''

              let summary = ''
              if (binary) {
                // Binary files: show type + size
                if (IMAGE_EXTS.has(ext)) {
                  summary = isNew ? `${ext.toUpperCase()} image` : `${ext.toUpperCase()} image updated`
                } else {
                  summary = `${ext.toUpperCase()} file`
                }
              } else if (isNew) {
                // New text file: show brief content preview
                const preview = getContentPreview(fullPath)
                if (preview) summary = preview
              } else {
                // Modified text file: try git diff stats first
                summary = getGitDiffSummary(relativePath)
                if (!summary) {
                  // No git diff available — show line count as context
                  try {
                    const content = readFileSync(fullPath, 'utf-8')
                    const lineCount = content.split('\n').length
                    summary = `${lineCount} lines`
                  } catch { summary = '' }
                }
              }

              files.push({
                path: relativePath,
                modified: stat.mtime.toISOString(),
                size: stat.size,
                action,
                summary
              })
            } catch { /* skip */ }
          }
        }
      }

      scanDir(WORKSPACE_PATH)

      // Sort by most recently modified
      files.sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime())

      return { ok: true, data: files.slice(0, 50) }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  // Security: get git diff for a workspace file
  ipcMain.handle('security:file-diff', async (_, filePath: string) => {
    try {
      // Try git diff (unstaged changes) first, then git diff HEAD (staged + unstaged)
      const fullPath = join(WORKSPACE_PATH, filePath)
      if (!fullPath.startsWith(WORKSPACE_PATH)) {
        return { ok: false, error: 'Invalid file path' }
      }

      let diff = ''
      try {
        // Show unstaged changes
        diff = execSync(`git diff -- "${filePath}"`, {
          cwd: WORKSPACE_PATH,
          encoding: 'utf-8',
          timeout: 5000
        }).trim()
      } catch { /* no git or no diff */ }

      // If no unstaged diff, check if file is untracked (new file)
      if (!diff) {
        try {
          const status = execSync(`git status --porcelain -- "${filePath}"`, {
            cwd: WORKSPACE_PATH,
            encoding: 'utf-8',
            timeout: 5000
          }).trim()

          if (status.startsWith('??') || status.startsWith('A ')) {
            // Untracked or newly added — show entire file as addition
            const content = readFileSync(fullPath, 'utf-8')
            diff = content
              .split('\n')
              .map((line) => `+ ${line}`)
              .join('\n')
            diff = `--- /dev/null\n+++ b/${filePath}\n${diff}`
          } else if (status) {
            // Has staged changes
            try {
              diff = execSync(`git diff HEAD -- "${filePath}"`, {
                cwd: WORKSPACE_PATH,
                encoding: 'utf-8',
                timeout: 5000
              }).trim()
            } catch { /* ignore */ }
          }
        } catch { /* no git */ }
      }

      // Also get recent git log for the file
      let history: Array<{ hash: string; date: string; message: string }> = []
      try {
        const log = execSync(
          `git log --pretty=format:"%h|%ai|%s" -10 -- "${filePath}"`,
          { cwd: WORKSPACE_PATH, encoding: 'utf-8', timeout: 5000 }
        ).trim()
        if (log) {
          history = log.split('\n').map((line) => {
            const [hash, date, ...msgParts] = line.split('|')
            return { hash, date, message: msgParts.join('|') }
          })
        }
      } catch { /* ignore */ }

      return { ok: true, data: { diff, history } }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  // Security: export activity log as JSON
  ipcMain.handle('security:export-log', async () => {
    try {
      return { ok: true, data: JSON.stringify(activityLogger.getAll(), null, 2) }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  // Telemetry: track event from renderer
  ipcMain.handle('telemetry:track', async (_, eventType: string, eventData?: Record<string, unknown>) => {
    try {
      telemetry.track(eventType, eventData)
      return { ok: true }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  // Telemetry: get/set opt-out
  ipcMain.handle('telemetry:get-opt-out', async () => {
    try {
      const config = readPinchrConfig()
      return { ok: true, data: config.telemetryOptOut === true }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  ipcMain.handle('telemetry:set-opt-out', async (_, optOut: boolean) => {
    try {
      const config = readPinchrConfig()
      config.telemetryOptOut = optOut
      writePinchrConfig(config)
      return { ok: true }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  // Updater: check for updates
  ipcMain.handle('updater:check', async () => {
    try {
      const result = await checkForUpdates()
      return { ok: true, data: result }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  // Updater: download the available update
  ipcMain.handle('updater:download', async () => {
    try {
      const result = await downloadAppUpdate()
      return { ok: true, data: result }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  // Updater: restart and install downloaded update
  ipcMain.handle('updater:restart', async () => {
    try {
      restartAppToUpdate()
      return { ok: true }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  // Updater: dismiss a version
  ipcMain.handle('updater:dismiss', async (_, version: string) => {
    try {
      dismissVersion(version)
      return { ok: true }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  // Computer: check permissions (no logging — this is polled frequently)
  ipcMain.handle('computer:check-permissions', async () => {
    try {
      const permissions = await checkPermissions()
      return { ok: true, data: permissions }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  ipcMain.handle('computer:install-helper', async (_event, helper?: 'peekaboo') => {
    try {
      const targetHelper = helper || 'peekaboo'
      if (targetHelper !== 'peekaboo') {
        return { ok: false, error: `Unsupported helper: ${String(targetHelper)}` }
      }

      activityLogger.log('command_run', 'Install computer helper: peekaboo')
      const installCommand = [
        'command -v brew >/dev/null 2>&1 || { echo "Homebrew is required to install peekaboo."; exit 127; }',
        'brew tap steipete/tap >/dev/null 2>&1 || true',
        'brew list --versions peekaboo >/dev/null 2>&1 || (brew install steipete/tap/peekaboo || brew install peekaboo)'
      ].join('\n')
      const installResult = await runShellCommand(installCommand, 8 * 60_000)

      const permissions = await checkPermissions()
      if (!permissions.peekabooInstalled) {
        return {
          ok: false,
          error: installResult.output || 'Peekaboo install did not complete successfully.'
        }
      }

      return {
        ok: true,
        data: {
          installed: true,
          output: installResult.output || 'Peekaboo is installed and ready.'
        }
      }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  ipcMain.handle('computer:self-test', async () => {
    try {
      const permissions = await checkPermissions()
      if (!permissions.peekabooInstalled) {
        return { ok: false, error: 'Peekaboo is not installed.' }
      }
      if (!permissions.screenRecording || !permissions.accessibility) {
        return {
          ok: false,
          error: 'Screen Recording and Accessibility must both be granted before running self-test.'
        }
      }

      const screenshotResult = await screenshot({ mode: 'screen' })
      const seeResult = await see({ annotate: false })
      const screenshotOk = typeof screenshotResult.image === 'string' && screenshotResult.image.length > 1000
      const seeOk = typeof seeResult.image === 'string' && seeResult.image.length > 1000
      const elementCount = Array.isArray(seeResult.elements) ? seeResult.elements.length : 0

      if (!screenshotOk || !seeOk) {
        return {
          ok: false,
          error: 'Computer self-test could not capture both screenshot and UI map.'
        }
      }

      return {
        ok: true,
        data: {
          ok: true,
          screenshotOk,
          seeOk,
          elementCount,
          details: `Self-test passed. Captured screenshot + UI map (${elementCount} elements detected).`
        }
      }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  ipcMain.handle('computer:open-accessibility-prefs', async () => {
    try {
      await shell.openExternal(
        'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility'
      )
      return { ok: true }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  ipcMain.handle('computer:open-screen-recording-prefs', async () => {
    try {
      await shell.openExternal(
        'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'
      )
      return { ok: true }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  // Computer: screenshot (requires browser_action permission)
  ipcMain.handle('computer:screenshot', async (_, options?: {
    mode?: 'screen' | 'window' | 'region'
    window?: string
    x?: number
    y?: number
    width?: number
    height?: number
  }) => {
    try {
      enforcePermission('browser_action', 'Capture screenshot')
      activityLogger.log('api_call', 'Capture screenshot')
      const result = await screenshot(options)
      return { ok: true, data: result }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  // Computer: see (annotated UI map)
  ipcMain.handle('computer:see', async (_, options?: {
    window?: string
    annotate?: boolean
  }) => {
    try {
      activityLogger.log('api_call', 'Capture annotated UI map')
      const result = await see(options)
      return { ok: true, data: result }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  // Computer: click
  ipcMain.handle('computer:click', async (_, target: {
    elementId?: string
    x?: number
    y?: number
    query?: string
  }) => {
    try {
      enforcePermission('browser_action', `Click: ${JSON.stringify(target)}`)
      activityLogger.log('browser_action', `Click: ${JSON.stringify(target)}`)
      await click(target)
      return { ok: true }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  // Computer: type text
  ipcMain.handle('computer:type', async (_, text: string, options?: {
    pressReturn?: boolean
    clearFirst?: boolean
    slowly?: boolean
  }) => {
    try {
      enforcePermission('browser_action', `Type text`)
      activityLogger.log('browser_action', `Type text: ${text.substring(0, 50)}${text.length > 50 ? '...' : ''}`)
      await typeText(text, options)
      return { ok: true }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  // Computer: press key
  ipcMain.handle('computer:press', async (_, key: string, options?: {
    modifiers?: string[]
  }) => {
    try {
      activityLogger.log('browser_action', `Press key: ${key}${options?.modifiers ? ` with ${options.modifiers.join('+')}` : ''}`)
      await press(key, options)
      return { ok: true }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  // Computer: hotkey
  ipcMain.handle('computer:hotkey', async (_, keys: string) => {
    try {
      activityLogger.log('browser_action', `Hotkey: ${keys}`)
      await hotkey(keys)
      return { ok: true }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  // Computer: scroll
  ipcMain.handle('computer:scroll', async (_, direction: 'up' | 'down' | 'left' | 'right', amount?: number) => {
    try {
      activityLogger.log('browser_action', `Scroll ${direction}${amount ? ` by ${amount}` : ''}`)
      await scroll(direction, amount)
      return { ok: true }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  // Computer: list apps
  ipcMain.handle('computer:list-apps', async () => {
    try {
      const apps = await listApps()
      return { ok: true, data: apps }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  // Computer: list windows
  ipcMain.handle('computer:list-windows', async (_, app?: string) => {
    try {
      const windows = await listWindows(app)
      return { ok: true, data: windows }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  // Computer: launch app
  ipcMain.handle('computer:app-launch', async (_, name: string) => {
    try {
      activityLogger.log('command_run', `Launch app: ${name}`)
      await appLaunch(name)
      return { ok: true }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  // Computer: focus app
  ipcMain.handle('computer:app-focus', async (_, name: string) => {
    try {
      activityLogger.log('browser_action', `Focus app: ${name}`)
      await appFocus(name)
      return { ok: true }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  // Computer Server: start
  ipcMain.handle('computer:server-start', async () => {
    try {
      activityLogger.log('gateway_action', 'Start computer server')
      const info = startComputerServer()
      return { ok: true, data: info }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  // Computer Server: stop
  ipcMain.handle('computer:server-stop', async () => {
    try {
      activityLogger.log('gateway_action', 'Stop computer server')
      stopComputerServer()
      return { ok: true }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  // Local Models: discover
  ipcMain.handle('local-models:discover', async () => {
    try {
      const status = await discoverLocalModels()
      return { ok: true, data: status }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  // Local Models: cached status
  ipcMain.handle('local-models:status', async () => {
    try {
      return { ok: true, data: getLocalModelStatus() }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  // Local Models: select a model and patch gateway config
  ipcMain.handle('local-models:select', async (_, modelId: string, provider: string) => {
    try {
      // modelId is like "lmstudio:model-name" or "ollama:model-name"
      const modelName = modelId.replace(/^(lmstudio|ollama):/, '')

      // Register the provider in config and set the model
      let providerName: string
      let baseUrl: string
      let apiKey: string

      if (provider === 'lmstudio') {
        providerName = 'lmstudio'
        baseUrl = 'http://localhost:1234/v1'
        apiKey = 'lm-studio'
      } else if (provider === 'ollama') {
        providerName = 'ollama'
        baseUrl = 'http://localhost:11434/v1'
        apiKey = 'ollama'
      } else {
        return { ok: false, error: `Unknown provider: ${provider}` }
      }

      const modelString = `${providerName}/${modelName}`

      // Get all discovered models for this provider to register them
      const status = getLocalModelStatus()
      const providerModels = status.models
        .filter(m => m.provider === provider)
        .map(m => ({
          id: m.name,
          name: m.name,
          api: 'openai-completions' as const
        }))

      // Ensure at least the selected model is registered
      if (!providerModels.find(m => m.id === modelName)) {
        providerModels.push({ id: modelName, name: modelName, api: 'openai-completions' })
      }

      // 1) Register the provider + set default model in config
      const patch = {
        models: {
          providers: {
            [providerName]: {
              baseUrl,
              apiKey,
              models: providerModels
            }
          }
        },
        agents: {
          defaults: {
            model: { primary: modelString }
          }
        }
      }
      await updateConfig(patch)
      // config.patch auto-restarts the gateway, which picks up the new default model

      activityLogger.log('gateway_action', `Switched to local model: ${modelName} (${provider})`)
      return { ok: true, data: { model: modelString, provider: providerName } }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  // Companion Relay: status
  ipcMain.handle('companion:status', async () => {
    try {
      return {
        ok: true,
        data: {
          ...getCompanionRelayStatus(),
          relayKeyFingerprint: companionRelayFingerprint()
        }
      }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  // Companion Relay: start
  ipcMain.handle('companion:start', async () => {
    try {
      activityLogger.log('gateway_action', 'Start companion relay')
      return {
        ok: true,
        data: {
          ...startCompanionRelay(),
          relayKeyFingerprint: companionRelayFingerprint()
        }
      }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  // Companion Relay: stop
  ipcMain.handle('companion:stop', async () => {
    try {
      activityLogger.log('gateway_action', 'Stop companion relay')
      return {
        ok: true,
        data: {
          ...stopCompanionRelay(),
          relayKeyFingerprint: companionRelayFingerprint()
        }
      }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  // Companion Relay: settings update
  ipcMain.handle('companion:update-settings', async (_, settings: {
    enabled?: boolean
    apiBaseUrl?: string
    pollIntervalMs?: number
    allowHighRiskRemoteActions?: boolean
  }) => {
    try {
      activityLogger.log('gateway_action', 'Update companion relay settings')
      return {
        ok: true,
        data: {
          ...updateCompanionRelaySettings(settings || {}),
          relayKeyFingerprint: companionRelayFingerprint()
        }
      }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  // Companion Relay: claim pairing code
  ipcMain.handle('companion:claim-pairing', async (_, pairingCode: string, desktopName?: string) => {
    try {
      activityLogger.log('gateway_action', 'Claim companion pairing code')
      const status = await claimCompanionPairingCode(pairingCode, desktopName)
      return {
        ok: true,
        data: {
          ...status,
          relayKeyFingerprint: companionRelayFingerprint()
        }
      }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  // Companion Relay: register desktop via Supabase auth token (seamless connection)
  ipcMain.handle('companion:register', async (_, authToken: string, desktopName?: string) => {
    try {
      activityLogger.log('gateway_action', 'Register desktop via auth token')
      const status = await registerDesktop(authToken, desktopName)
      return {
        ok: true,
        data: {
          ...status,
          relayKeyFingerprint: companionRelayFingerprint()
        }
      }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  // Companion Relay: disconnect local credentials
  ipcMain.handle('companion:disconnect', async () => {
    try {
      activityLogger.log('gateway_action', 'Disconnect companion relay')
      return {
        ok: true,
        data: {
          ...disconnectCompanionRelay(),
          relayKeyFingerprint: companionRelayFingerprint()
        }
      }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  // Companion Relay: force immediate poll (debug/testing)
  ipcMain.handle('companion:poll-now', async () => {
    try {
      const status = await pollCompanionRelayNow()
      return {
        ok: true,
        data: {
          ...status,
          relayKeyFingerprint: companionRelayFingerprint()
        }
      }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  ipcMain.handle('channels:get-routing-settings', async () => {
    try {
      const config = readPinchrConfig()
      const enabled = readChannelTopicRoutingEnabled(config)
      setMonitorChannelRoutingSettings({ enabled })
      return { ok: true, data: getMonitorChannelRoutingSettings() }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  ipcMain.handle('channels:set-routing-settings', async (_, settings: { enabled?: boolean }) => {
    try {
      const currentConfig = readPinchrConfig()
      const nextEnabled = typeof settings?.enabled === 'boolean'
        ? settings.enabled
        : readChannelTopicRoutingEnabled(currentConfig)

      const nextConfig = writeChannelTopicRoutingEnabled(currentConfig, nextEnabled)
      writePinchrConfig(nextConfig)
      activityLogger.log('gateway_action', `Channel topic routing ${nextEnabled ? 'enabled' : 'disabled'}`)
      return { ok: true, data: setMonitorChannelRoutingSettings({ enabled: nextEnabled }) }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  ipcMain.handle('channels:get-routing-metrics', async () => {
    try {
      return { ok: true, data: getMonitorChannelRoutingMetrics() }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  // Start local model discovery polling
  startDiscovery()

  // Computer Server: status
  ipcMain.handle('computer:server-status', async () => {
    try {
      const status = getServerStatus()
      return { ok: true, data: status }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  // ── Document Intelligence ──────────────────────────────────────────

  ipcMain.handle('documents:running-apps', async () => {
    try {
      const apps = await getRunningApps()
      return { ok: true, data: apps }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  ipcMain.handle('documents:frontmost-app', async () => {
    try {
      const app = await getFrontmostApp()
      return { ok: true, data: app }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  ipcMain.handle('documents:open-documents', async (_, appName?: string) => {
    try {
      const docs = await getOpenDocuments(appName)
      return { ok: true, data: docs }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  ipcMain.handle('documents:read', async (_, filePath: string) => {
    try {
      const content = await readDocumentContent(filePath)
      return { ok: true, data: content }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  ipcMain.handle('documents:metadata', async (_, filePath: string) => {
    try {
      const metadata = getDocumentMetadata(filePath)
      return { ok: true, data: metadata }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  // ── Authentication ──────────────────────────────────────────

  ipcMain.handle('auth:sign-in', async () => {
    try {
      activityLogger.log('browser_action', 'Open browser for sign-in')
      await shell.openExternal('https://pinchr.app/auth/desktop')
      return { ok: true }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  ipcMain.handle('auth:sign-out', async () => {
    try {
      const { signOut } = await import('./auth')
      const { BrowserWindow } = await import('electron')
      const mainWindow = BrowserWindow.getAllWindows()[0] || null
      signOut(mainWindow)
      activityLogger.log('gateway_action', 'User signed out')
      return { ok: true }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  ipcMain.handle('auth:get-session', async () => {
    try {
      const { getSession } = await import('./auth')
      const session = await getSession()
      if (session) {
        return { ok: true, data: { user: session.user } }
      } else {
        return { ok: true, data: null }
      }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })
}
