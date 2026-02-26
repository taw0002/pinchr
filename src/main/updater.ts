import { app, Notification, shell } from 'electron'
import { homedir } from 'os'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { createRequire } from 'module'

const PINCHR_CONFIG_PATH = join(homedir(), '.pinchr', 'config.json')
const CHECK_INTERVAL = 6 * 60 * 60 * 1000 // 6 hours
const MANUAL_RELEASE_ENDPOINT = 'https://pinchr.app/api/releases/latest'
const MANUAL_DOWNLOAD_URL = 'https://pinchr.app/download'
const RELEASE_FEED_URL = 'https://pinchr-releases.s3.us-east-1.amazonaws.com/'

let updaterInitialized = false
let availableVersion: string | null = null
let downloadedVersion: string | null = null
let lastAvailableNotificationVersion: string | null = null
let checkingElectronUpdater = false
let updaterLoadAttempted = false

type AutoUpdaterLike = {
  autoDownload: boolean
  autoInstallOnAppQuit: boolean
  setFeedURL: (options: { provider: 'generic'; url: string }) => void
  on: (event: string, listener: (...args: any[]) => void) => void
  checkForUpdates: () => Promise<{ updateInfo?: { version?: string } } | null>
  downloadUpdate: () => Promise<unknown>
  quitAndInstall: () => void
}

let autoUpdaterInstance: AutoUpdaterLike | null = null

function getAutoUpdater(): AutoUpdaterLike | null {
  if (updaterLoadAttempted) return autoUpdaterInstance
  updaterLoadAttempted = true

  try {
    const require = createRequire(import.meta.url)
    const updaterModule = require('electron-updater') as { autoUpdater: AutoUpdaterLike }
    autoUpdaterInstance = updaterModule.autoUpdater
  } catch {
    autoUpdaterInstance = null
  }

  return autoUpdaterInstance
}

export interface UpdateCheckResult {
  available: boolean
  version?: string
  downloaded?: boolean
  canDownload?: boolean
  source?: 'electron-updater' | 'manual'
}

export interface UpdateDownloadResult {
  started: boolean
  downloaded?: boolean
  version?: string
  source?: 'electron-updater' | 'manual'
}

function readConfig(): Record<string, unknown> {
  try {
    if (existsSync(PINCHR_CONFIG_PATH)) {
      return JSON.parse(readFileSync(PINCHR_CONFIG_PATH, 'utf-8'))
    }
  } catch {
    // Ignore malformed config and continue.
  }
  return {}
}

function writeConfig(config: Record<string, unknown>): void {
  const configDir = join(homedir(), '.pinchr')
  if (!existsSync(configDir)) mkdirSync(configDir, { recursive: true })
  writeFileSync(PINCHR_CONFIG_PATH, JSON.stringify(config, null, 2))
}

function compareVersions(a: string, b: string): number {
  const partsA = a.replace(/^v/, '').split('.').map(Number)
  const partsB = b.replace(/^v/, '').split('.').map(Number)
  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const diff = (partsA[i] || 0) - (partsB[i] || 0)
    if (diff !== 0) return diff
  }
  return 0
}

function trackUpdateCheck(config: Record<string, unknown>): void {
  config.lastUpdateCheck = new Date().toISOString()
  writeConfig(config)
}

function notifyUpdateAvailable(version: string, dismissedVersion: string | null): void {
  if (dismissedVersion === version) return
  if (lastAvailableNotificationVersion === version) return
  lastAvailableNotificationVersion = version

  const notification = new Notification({
    title: `Pinchr v${version} is available`,
    body: 'Click to download and install the update.'
  })

  notification.on('click', () => {
    void downloadUpdate()
  })

  notification.show()
}

function notifyUpdateDownloaded(version: string): void {
  const notification = new Notification({
    title: `Pinchr v${version} is ready`,
    body: 'Click to restart and finish installing the update.'
  })

  notification.on('click', () => {
    restartToUpdate()
  })

  notification.show()
}

function initElectronUpdater(): void {
  if (updaterInitialized) return
  const autoUpdater = getAutoUpdater()
  if (!autoUpdater) return

  updaterInitialized = true
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  if (app.isPackaged) {
    autoUpdater.setFeedURL({
      provider: 'generic',
      url: RELEASE_FEED_URL
    })
  }

  autoUpdater.on('update-available', (info) => {
    availableVersion = info.version || null
  })

  autoUpdater.on('update-not-available', () => {
    availableVersion = null
    downloadedVersion = null
  })

  autoUpdater.on('update-downloaded', (info) => {
    if (info.version) {
      downloadedVersion = info.version
      availableVersion = info.version
      notifyUpdateDownloaded(info.version)
    }
  })

  autoUpdater.on('error', (error) => {
    console.warn('[Pinchr updater] electron-updater error:', error)
  })
}

async function checkElectronUpdater(dismissedVersion: string | null): Promise<UpdateCheckResult | null> {
  if (!app.isPackaged) return null

  initElectronUpdater()
  const autoUpdater = getAutoUpdater()
  if (!autoUpdater) return null

  if (checkingElectronUpdater) {
    if (availableVersion && compareVersions(availableVersion, app.getVersion()) > 0) {
      return {
        available: true,
        version: availableVersion,
        downloaded: downloadedVersion === availableVersion,
        canDownload: true,
        source: 'electron-updater'
      }
    }
    return null
  }

  checkingElectronUpdater = true
  try {
    const result = await autoUpdater.checkForUpdates()
    const latestVersion = result?.updateInfo?.version

    if (latestVersion && compareVersions(latestVersion, app.getVersion()) > 0) {
      availableVersion = latestVersion
      const downloaded = downloadedVersion === latestVersion
      notifyUpdateAvailable(latestVersion, dismissedVersion)

      return {
        available: true,
        version: latestVersion,
        downloaded,
        canDownload: true,
        source: 'electron-updater'
      }
    }

    return {
      available: false,
      source: 'electron-updater'
    }
  } catch {
    return null
  } finally {
    checkingElectronUpdater = false
  }
}

async function checkManualFallback(dismissedVersion: string | null): Promise<UpdateCheckResult> {
  try {
    const res = await fetch(MANUAL_RELEASE_ENDPOINT, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000)
    })
    if (!res.ok) return { available: false, source: 'manual' }

    const data = (await res.json()) as { version?: string }
    const latestVersion = data.version
    if (!latestVersion) return { available: false, source: 'manual' }

    if (compareVersions(latestVersion, app.getVersion()) <= 0) {
      return { available: false, source: 'manual' }
    }

    if (dismissedVersion !== latestVersion) {
      const notification = new Notification({
        title: `Pinchr v${latestVersion} is available`,
        body: 'Click to download the latest version.'
      })
      notification.on('click', () => {
        shell.openExternal(MANUAL_DOWNLOAD_URL)
      })
      notification.show()
    }

    return {
      available: true,
      version: latestVersion,
      downloaded: false,
      canDownload: false,
      source: 'manual'
    }
  } catch {
    return { available: false, source: 'manual' }
  }
}

export async function checkForUpdates(): Promise<UpdateCheckResult> {
  const config = readConfig()
  trackUpdateCheck(config)
  const dismissedVersion =
    typeof config.dismissedVersion === 'string' ? config.dismissedVersion : null

  const electronUpdaterResult = await checkElectronUpdater(dismissedVersion)
  if (electronUpdaterResult) return electronUpdaterResult

  return await checkManualFallback(dismissedVersion)
}

export async function downloadUpdate(): Promise<UpdateDownloadResult> {
  const latestStatus = await checkForUpdates()
  if (!latestStatus.available) {
    return { started: false }
  }

  if (latestStatus.source === 'electron-updater') {
    initElectronUpdater()
    const autoUpdater = getAutoUpdater()
    if (!autoUpdater) {
      shell.openExternal(MANUAL_DOWNLOAD_URL)
      return {
        started: true,
        source: 'manual',
        version: latestStatus.version
      }
    }

    if (latestStatus.downloaded || (latestStatus.version && latestStatus.version === downloadedVersion)) {
      return {
        started: false,
        downloaded: true,
        version: latestStatus.version,
        source: 'electron-updater'
      }
    }

    await autoUpdater.downloadUpdate()
    return {
      started: true,
      downloaded: false,
      version: latestStatus.version,
      source: 'electron-updater'
    }
  }

  shell.openExternal(MANUAL_DOWNLOAD_URL)
  return {
    started: true,
    source: 'manual',
    version: latestStatus.version
  }
}

export function restartToUpdate(): void {
  const autoUpdater = getAutoUpdater()
  if (!autoUpdater) {
    throw new Error('electron-updater is unavailable.')
  }
  if (!downloadedVersion) {
    throw new Error('No downloaded update is ready to install.')
  }

  // Ensure the main window close handler does not route this into "hide to tray".
  const runtimeApp = app as typeof app & { isQuitting?: boolean; isInstallingUpdate?: boolean }
  runtimeApp.isInstallingUpdate = true
  runtimeApp.isQuitting = true

  try {
    autoUpdater.quitAndInstall()
  } catch {
    // Fallback to normal app quit; with autoInstallOnAppQuit this still applies the update.
    app.quit()
  }
}

export function startUpdateChecker(): void {
  initElectronUpdater()
  setTimeout(() => {
    void checkForUpdates()
  }, 10_000)
  setInterval(() => {
    void checkForUpdates()
  }, CHECK_INTERVAL)
}

export function dismissVersion(version: string): void {
  const config = readConfig()
  config.dismissedVersion = version
  writeConfig(config)
}
