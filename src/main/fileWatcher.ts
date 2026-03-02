import type { BrowserWindow } from 'electron'
import { existsSync, readFileSync, watch, type FSWatcher } from 'fs'
import { homedir } from 'os'
import { basename, dirname, isAbsolute, join, resolve } from 'path'
import type { WorkspaceFileChangedEvent } from '../shared/types'

const OPENCLAW_CONFIG_PATH = join(homedir(), '.openclaw', 'openclaw.json')
const DEFAULT_WORKSPACE_PATH = join(homedir(), '.openclaw', 'workspace')
const FILE_CHANGED_EVENT = 'workspace:file-changed'
const WATCHER_DEBOUNCE_MS = 200
const WATCHED_FILES = ['tasks.json', 'session-state.json', 'notifications.json', 'topic-sessions.json'] as const

type WatchedFile = (typeof WATCHED_FILES)[number]

export interface WorkspaceFileWatcher {
  stop: () => void
}

interface StartWorkspaceFileWatcherOptions {
  workspacePath: string
  getMainWindow: () => BrowserWindow | null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function readNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function readWorkspaceFromConfigValue(value: unknown): string | null {
  const root = asRecord(value)
  if (!root) return null

  const agents = asRecord(root.agents)
  const defaults = asRecord(agents?.defaults)
  const defaultWorkspace = readNonEmptyString(defaults?.workspace)
  if (defaultWorkspace) return defaultWorkspace

  const configuredAgents = Array.isArray(agents?.list) ? agents.list : []
  for (const agentEntry of configuredAgents) {
    const agent = asRecord(agentEntry)
    const agentWorkspace = readNonEmptyString(agent?.workspace)
    if (agentWorkspace) return agentWorkspace
  }

  return null
}

function normalizeWorkspacePath(workspacePath: string): string {
  if (isAbsolute(workspacePath)) return workspacePath
  return resolve(dirname(OPENCLAW_CONFIG_PATH), workspacePath)
}

export function resolveWorkspacePathFromGatewayConfig(): string {
  try {
    if (!existsSync(OPENCLAW_CONFIG_PATH)) return DEFAULT_WORKSPACE_PATH

    const parsedConfig = JSON.parse(readFileSync(OPENCLAW_CONFIG_PATH, 'utf-8')) as unknown
    const directWorkspace = readWorkspaceFromConfigValue(parsedConfig)
    if (directWorkspace) return normalizeWorkspacePath(directWorkspace)

    const parsedRoot = asRecord(parsedConfig)
    const nestedResult = asRecord(parsedRoot?.result)
    const nestedWorkspace =
      readWorkspaceFromConfigValue(parsedRoot?.parsed) ??
      readWorkspaceFromConfigValue(nestedResult?.parsed)
    if (nestedWorkspace) return normalizeWorkspacePath(nestedWorkspace)
  } catch (error) {
    console.error('[Pinchr] Failed to read gateway config for workspace path:', error)
  }

  return DEFAULT_WORKSPACE_PATH
}

export function startWorkspaceFileWatcher({
  workspacePath,
  getMainWindow
}: StartWorkspaceFileWatcherOptions): WorkspaceFileWatcher {
  if (!existsSync(workspacePath)) {
    return { stop: () => undefined }
  }

  const watchedFiles = new Set<WatchedFile>(WATCHED_FILES)
  const debounceTimers = new Map<WatchedFile, NodeJS.Timeout>()
  let watcher: FSWatcher | null = null

  const emitFileChanged = (file: WatchedFile): void => {
    const existingTimer = debounceTimers.get(file)
    if (existingTimer) clearTimeout(existingTimer)

    const timer = setTimeout(() => {
      debounceTimers.delete(file)
      const mainWindow = getMainWindow()
      if (!mainWindow || mainWindow.isDestroyed()) return

      const payload: WorkspaceFileChangedEvent = {
        file,
        timestamp: Date.now()
      }
      mainWindow.webContents.send(FILE_CHANGED_EVENT, payload)
    }, WATCHER_DEBOUNCE_MS)

    debounceTimers.set(file, timer)
  }

  try {
    watcher = watch(workspacePath, (_eventType, filename) => {
      const changedFile = typeof filename === 'string' ? filename : filename?.toString()
      if (!changedFile) return
      const fileName = basename(changedFile)
      if (!watchedFiles.has(fileName as WatchedFile)) return
      emitFileChanged(fileName as WatchedFile)
    })

    watcher.on('error', (error) => {
      console.error('[Pinchr] Workspace file watcher error:', error)
    })
  } catch (error) {
    console.error('[Pinchr] Failed to start workspace file watcher:', error)
  }

  return {
    stop: () => {
      for (const timer of debounceTimers.values()) {
        clearTimeout(timer)
      }
      debounceTimers.clear()

      if (watcher) {
        watcher.close()
        watcher = null
      }
    }
  }
}
