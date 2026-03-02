import { app, BrowserWindow, shell, Tray, Menu, nativeImage, globalShortcut } from 'electron'
import { join } from 'path'
import { homedir } from 'os'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { registerIpcHandlers } from './ipc'
import { startNotificationMonitoring } from './monitor'
import { telemetry } from './telemetry'
import { startUpdateChecker } from './updater'
import { startComputerServer, stopComputerServer } from './computer-server'
import { startDiscovery, stopDiscovery } from './local-models'
import { scaffoldWorkspace } from './workspace-scaffold'
import { startCompanionRelay, stopCompanionRelay, getCompanionRelayStatus } from './companion-relay'
import { MCPManager } from './mcp'
import {
  resolveWorkspacePathFromGatewayConfig,
  startWorkspaceFileWatcher,
  type WorkspaceFileWatcher
} from './fileWatcher'
import { handleAuthCallback } from './auth'

const WINDOW_STATE_PATH = join(homedir(), '.pinchr', 'window-state.json')

interface WindowState {
  x: number
  y: number
  width: number
  height: number
  isMaximized: boolean
}

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let quickMessageWindow: BrowserWindow | null = null
let workspaceFileWatcher: WorkspaceFileWatcher | null = null
const mcpManager = new MCPManager()

function saveWindowState(window: BrowserWindow): void {
  try {
    const bounds = window.getBounds()
    const state: WindowState = {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      isMaximized: window.isMaximized()
    }
    
    const configDir = join(homedir(), '.pinchr')
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true })
    }
    
    writeFileSync(WINDOW_STATE_PATH, JSON.stringify(state, null, 2))
  } catch (error) {
    console.error('Failed to save window state:', error)
  }
}

function loadWindowState(): Partial<WindowState> {
  try {
    if (existsSync(WINDOW_STATE_PATH)) {
      const state = JSON.parse(readFileSync(WINDOW_STATE_PATH, 'utf-8'))
      return state
    }
  } catch (error) {
    console.error('Failed to load window state:', error)
  }
  
  // Default window state
  return {
    width: 1280,
    height: 820
  }
}

function createQuickMessageWindow(): BrowserWindow {
  const quickWindow = new BrowserWindow({
    width: 400,
    height: 150,
    minWidth: 350,
    minHeight: 120,
    maxHeight: 200,
    resizable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 10, y: 10 },
    backgroundColor: '#0a0a0a',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // Load a simple quick message interface
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    quickWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#/quick-message`)
  } else {
    quickWindow.loadFile(join(__dirname, '../renderer/index.html'), { hash: '#/quick-message' })
  }

  quickWindow.on('blur', () => {
    quickWindow.hide()
  })

  return quickWindow
}

function createTray(): void {
  // Create tray icon from build/icon.png
  const iconPath = join(__dirname, '../../build/icon.png')
  const trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
  
  tray = new Tray(trayIcon)
  tray.setToolTip('Pinchr - AI Mission Control')

  // Handle tray click to toggle window
  tray.on('click', () => {
    toggleMainWindow()
  })

  updateTrayMenu()
}

function updateTrayMenu(): void {
  if (!tray) return

  const template = [
    {
      label: 'Open Pinchr',
      click: () => showMainWindow()
    },
    {
      label: 'Quick Message',
      click: () => showQuickMessage()
    },
    { type: 'separator' },
    {
      label: 'Gateway: Checking...',
      enabled: false
    },
    {
      label: 'Sessions: Loading...',
      enabled: false
    },
    { type: 'separator' },
    {
      label: 'Settings',
      click: () => {
        showMainWindow()
        mainWindow?.webContents.send('navigate-to', '/settings')
      }
    },
    { type: 'separator' },
    {
      label: 'Quit Pinchr',
      click: () => app.quit()
    }
  ]

  tray.setContextMenu(Menu.buildFromTemplate(template as any))
}

async function updateTrayStatus(): Promise<void> {
  if (!tray) return

  try {
    // Check gateway health
    const healthResult = await mainWindow?.webContents.executeJavaScript(`
      window.electronAPI?.gateway?.health?.().then(r => r).catch(e => ({ ok: false, error: e.message }))
    `) as { ok: boolean; data?: any; error?: string }

    // Get sessions count
    const sessionsResult = await mainWindow?.webContents.executeJavaScript(`
      window.electronAPI?.gateway?.sessions?.().then(r => r).catch(e => ({ ok: false, error: e.message }))
    `) as { ok: boolean; data?: any[]; error?: string }

    const isGatewayOnline = healthResult?.ok
    const sessionsCount = sessionsResult?.ok ? (sessionsResult.data?.length || 0) : 0

    const template = [
      {
        label: 'Open Pinchr',
        click: () => showMainWindow()
      },
      {
        label: 'Quick Message',
        click: () => showQuickMessage()
      },
      { type: 'separator' },
      {
        label: `Gateway: ${isGatewayOnline ? 'Online' : 'Offline'}`,
        enabled: false,
        icon: isGatewayOnline ? undefined : undefined // Could add status icons here
      },
      {
        label: `Sessions: ${sessionsCount} active`,
        enabled: false
      },
      { type: 'separator' },
      {
        label: 'Settings',
        click: () => {
          showMainWindow()
          mainWindow?.webContents.send('navigate-to', '/settings')
        }
      },
      { type: 'separator' },
      {
        label: 'Quit Pinchr',
        click: () => app.quit()
      }
    ]

    tray.setContextMenu(Menu.buildFromTemplate(template as any))
  } catch (error) {
    console.error('Failed to update tray status:', error)
  }
}

function showMainWindow(): void {
  if (!mainWindow) {
    mainWindow = createWindow()
  }
  
  if (mainWindow.isMinimized()) {
    mainWindow.restore()
  }
  
  mainWindow.show()
  mainWindow.focus()
}

function hideMainWindow(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    saveWindowState(mainWindow)
    mainWindow.hide()
  }
}

function toggleMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    showMainWindow()
  } else if (mainWindow.isVisible() && mainWindow.isFocused()) {
    hideMainWindow()
  } else {
    showMainWindow()
  }
}

function showQuickMessage(): void {
  if (!quickMessageWindow) {
    quickMessageWindow = createQuickMessageWindow()
  }
  
  const bounds = quickMessageWindow.getBounds()
  const { screen } = require('electron')
  const primaryDisplay = screen.getPrimaryDisplay()
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize
  
  // Center the quick message window
  quickMessageWindow.setPosition(
    Math.round((screenWidth - bounds.width) / 2),
    Math.round((screenHeight - bounds.height) / 3) // Slightly higher than center
  )
  
  quickMessageWindow.show()
  quickMessageWindow.focus()
}

function createWindow(): BrowserWindow {
  const windowState = loadWindowState()
  
  const newWindow = new BrowserWindow({
    x: windowState.x,
    y: windowState.y,
    width: windowState.width || 1280,
    height: windowState.height || 820,
    minWidth: 900,
    minHeight: 700,
    show: false,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: '#0a0a0a',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  if (windowState.isMaximized) {
    newWindow.maximize()
  }

  // Save window state on resize and move
  newWindow.on('resize', () => saveWindowState(newWindow))
  newWindow.on('move', () => saveWindowState(newWindow))
  newWindow.on('maximize', () => saveWindowState(newWindow))
  newWindow.on('unmaximize', () => saveWindowState(newWindow))

  newWindow.on('ready-to-show', () => {
    newWindow.show()
  })

  // Handle close to hide to tray instead of quit
  newWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault()
      hideMainWindow()
      return false
    }
  })

  newWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    newWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    newWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return newWindow
}

// Register pinchr:// protocol handler (must be before app.ready)
if (process.defaultApp) {
  // Dev mode: register with path to electron
  if (process.argv[1]) {
    app.setAsDefaultProtocolClient('pinchr', process.execPath, [join(process.argv[1])])
  }
} else {
  app.setAsDefaultProtocolClient('pinchr')
}

// Handle protocol URLs (macOS)
app.on('open-url', (event, url) => {
  event.preventDefault()

  if (url.startsWith('pinchr://')) {
    handleAuthCallback(url, mainWindow).catch((error) => {
      console.error('[Protocol] Failed to handle auth callback:', error)
    })
  }
})

// Handle protocol URLs (Windows/Linux via second-instance)
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', (event, commandLine) => {
    // Someone tried to run a second instance, we should focus our window
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }

    // Handle protocol URL on Windows/Linux
    const url = commandLine.find((arg) => arg.startsWith('pinchr://'))
    if (url) {
      handleAuthCallback(url, mainWindow).catch((error) => {
        console.error('[Protocol] Failed to handle auth callback:', error)
      })
    }
  })
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.pinchr.app')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Register global shortcut for show/hide (Cmd+Shift+P)
  globalShortcut.register('CommandOrControl+Shift+P', () => {
    toggleMainWindow()
  })

  registerIpcHandlers(mcpManager)
  createTray()
  mainWindow = createWindow()

  const workspacePath = resolveWorkspacePathFromGatewayConfig()
  workspaceFileWatcher = startWorkspaceFileWatcher({
    workspacePath,
    getMainWindow: () => mainWindow
  })

  mcpManager.initialize().catch((error) => {
    console.error('[Pinchr] Failed to initialize MCP manager:', error)
  })

  // Scaffold workspace with essential memory/compaction files
  scaffoldWorkspace()

  // Start notification monitoring
  startNotificationMonitoring()

  // Start update checker
  startUpdateChecker()

  // Start computer server (HTTP API for OpenClaw)
  try {
    startComputerServer()
  } catch (error) {
    console.error('[Pinchr] Failed to start computer server:', error)
  }

  // Start local model discovery (LM Studio, Ollama)
  startDiscovery()

  // Start companion relay (if paired/configured)
  try {
    const status = startCompanionRelay()
    void status
  } catch (error) {
    console.error('[Pinchr] Failed to start companion relay:', error)
  }

  // Telemetry: track app_opened
  const configPath = join(homedir(), '.pinchr', 'config.json')
  let isFirstLaunch = false
  try {
    const configDir = join(homedir(), '.pinchr')
    if (!existsSync(configDir)) mkdirSync(configDir, { recursive: true })
    let config: Record<string, unknown> = {}
    if (existsSync(configPath)) {
      config = JSON.parse(readFileSync(configPath, 'utf-8'))
    }
    isFirstLaunch = !config.firstLaunchRecorded
    if (isFirstLaunch) {
      config.firstLaunchRecorded = true
      writeFileSync(configPath, JSON.stringify(config, null, 2))
    }
  } catch { /* ignore */ }

  telemetry.track('app_opened', { first_launch: isFirstLaunch })

  // First-launch download ping
  if (isFirstLaunch) {
    fetch('https://pinchr.app/api/downloads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        version: app.getVersion(),
        platform: process.platform
      })
    }).catch(() => { /* silent */ })
  }

  // Update tray status periodically
  setInterval(updateTrayStatus, 30000) // Every 30 seconds
  setTimeout(updateTrayStatus, 2000) // Initial update after 2 seconds

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow()
    } else {
      showMainWindow()
    }
  })

  app.on('before-quit', async () => {
    app.isQuitting = true
    if (mainWindow && !mainWindow.isDestroyed()) {
      saveWindowState(mainWindow)
    }

    if (workspaceFileWatcher) {
      workspaceFileWatcher.stop()
      workspaceFileWatcher = null
    }
    
    // Stop local model discovery
    stopDiscovery()

    // Stop computer server
    try {
      stopComputerServer()
    } catch {
      // Server might not be running
    }

    // Stop companion relay
    try {
      const status = getCompanionRelayStatus()
      if (status.running) {
        stopCompanionRelay()
      }
    } catch {
      // Relay might not be running
    }

    try {
      await mcpManager.shutdown()
    } catch (error) {
      console.error('[Pinchr] Failed to shutdown MCP manager:', error)
    }
    
    telemetry.track('app_closed')
    await telemetry.shutdown()
  })

  // Handle Cmd+W to hide instead of close
  app.on('browser-window-created', (_, window) => {
    window.webContents.on('before-input-event', (event, input) => {
      if (input.key === 'w' && (input.meta || input.control)) {
        event.preventDefault()
        hideMainWindow()
      }
    })
  })
})

app.on('window-all-closed', () => {
  // Keep running in tray on all platforms
})

app.on('will-quit', () => {
  // Unregister global shortcuts
  globalShortcut.unregisterAll()
})
