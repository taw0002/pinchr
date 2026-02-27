import { execFile } from 'child_process'
import { promisify } from 'util'
import { writeFileSync, readFileSync, unlinkSync, existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { systemPreferences } from 'electron'
import type { 
  ComputerPermissions, 
  ScreenshotResult, 
  SeeResult, 
  ComputerElement,
  AppInfo,
  WindowInfo
} from '../shared/types'

const execFileAsync = promisify(execFile)

// TODO: Bundle peekaboo with the app for distribution
const PEEKABOO_CANDIDATES = [
  '/opt/homebrew/bin/peekaboo',
  '/usr/local/bin/peekaboo',
  'peekaboo'
] as const
const TMP_DIR = join(homedir(), '.openclaw', 'tmp')
const PEEKABOO_CACHE_MS = 4000
const PERMISSION_PROBE_CACHE_MS = 60_000

type PeekabooPermissions = {
  screenRecording?: boolean
  accessibility?: boolean
}

let peekabooPathCache: string | null = null
let peekabooInstalledCache: { value: boolean; checkedAt: number } | null = null
let peekabooPermissionsCache: { value: PeekabooPermissions | null; checkedAt: number } | null = null
let capabilityProbeCache: {
  value: PeekabooPermissions | null
  checkedAt: number
} | null = null
let lastStablePermissions: {
  screenRecording: boolean
  accessibility: boolean
  checkedAt: number
} | null = null

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function parsePeekabooPermissions(stdout: string): PeekabooPermissions | null {
  try {
    const parsed = JSON.parse(stdout) as unknown
    const root = asRecord(parsed)
    if (!root) return null

    const fromDirect = {
      screenRecording:
        typeof root.screenRecording === 'boolean'
          ? root.screenRecording
          : undefined,
      accessibility:
        typeof root.accessibility === 'boolean'
          ? root.accessibility
          : undefined
    }

    const data = asRecord(root.data)
    const fromData = {
      screenRecording:
        typeof data?.screenRecording === 'boolean'
          ? data.screenRecording
          : undefined,
      accessibility:
        typeof data?.accessibility === 'boolean'
          ? data.accessibility
          : undefined
    }

    const rootPermissions = Array.isArray(root.permissions) ? root.permissions : []
    const dataPermissions = Array.isArray(data?.permissions) ? data.permissions : []
    const permissions = [...rootPermissions, ...dataPermissions]
    let screenRecording: boolean | undefined = fromDirect.screenRecording ?? fromData.screenRecording
    let accessibility: boolean | undefined = fromDirect.accessibility ?? fromData.accessibility

    for (const entry of permissions) {
      const item = asRecord(entry)
      if (!item) continue
      const name = String(item.name ?? '').toLowerCase()
      const isGranted =
        typeof item.isGranted === 'boolean'
          ? item.isGranted
          : undefined
      if (isGranted === undefined) continue
      if (name.includes('screen')) screenRecording = isGranted
      if (name.includes('accessibility')) accessibility = isGranted
    }

    if (screenRecording === undefined && accessibility === undefined) return null
    return { screenRecording, accessibility }
  } catch {
    return null
  }
}

function normalizeHotkeyModifier(modifier: string): string {
  const value = modifier.trim().toLowerCase()
  if (value === 'command' || value === 'cmd' || value === 'meta') return 'cmd'
  if (value === 'control' || value === 'ctrl') return 'ctrl'
  if (value === 'option' || value === 'alt') return 'alt'
  if (value === 'function') return 'fn'
  return value
}

async function runPeekaboo(args: string[], timeout = 5000): Promise<{ stdout: string; stderr: string }> {
  const candidates = peekabooPathCache
    ? [peekabooPathCache, ...PEEKABOO_CANDIDATES.filter((candidate) => candidate !== peekabooPathCache)]
    : [...PEEKABOO_CANDIDATES]

  const errors: string[] = []
  for (const binary of candidates) {
    try {
      const result = await execFileAsync(binary, args, {
        timeout,
        encoding: 'utf-8'
      }) as { stdout: string; stderr: string }
      peekabooPathCache = binary
      return result
    } catch (error) {
      const details = (() => {
        if (!error || typeof error !== 'object') return String(error)
        const err = error as {
          message?: string
          code?: string | number
          signal?: string
          stdout?: string
          stderr?: string
        }
        const stdout = (err.stdout || '').trim()
        const stderr = (err.stderr || '').trim()
        return [
          err.message ? `message=${err.message}` : null,
          err.code !== undefined ? `code=${String(err.code)}` : null,
          err.signal ? `signal=${err.signal}` : null,
          stdout ? `stdout=${stdout.slice(0, 2000)}` : null,
          stderr ? `stderr=${stderr.slice(0, 2000)}` : null
        ]
          .filter(Boolean)
          .join(', ')
      })()
      errors.push(`${binary}: ${details}`)
    }
  }

  throw new Error(`peekaboo command failed (${args.join(' ')}): ${errors.join(' | ')}`)
}

async function getPeekabooPermissions(): Promise<PeekabooPermissions | null> {
  const now = Date.now()
  if (peekabooPermissionsCache && now - peekabooPermissionsCache.checkedAt < PEEKABOO_CACHE_MS) {
    return peekabooPermissionsCache.value
  }

  try {
    // `list permissions` is currently more reliable than `permissions` across macOS variants.
    const primary = await runPeekaboo(['list', 'permissions', '--json'], 8000)
    let parsed = parsePeekabooPermissions(primary.stdout)
    if (!parsed) {
      const fallback = await runPeekaboo(['permissions', '--json'], 8000)
      parsed = parsePeekabooPermissions(fallback.stdout)
    }
    peekabooPermissionsCache = { value: parsed, checkedAt: now }
    return parsed
  } catch {
    peekabooPermissionsCache = { value: null, checkedAt: now }
    return null
  }
}

async function probeCapabilities(): Promise<PeekabooPermissions | null> {
  const now = Date.now()
  if (capabilityProbeCache && now - capabilityProbeCache.checkedAt < PERMISSION_PROBE_CACHE_MS) {
    return capabilityProbeCache.value
  }

  if (!existsSync(TMP_DIR)) {
    require('fs').mkdirSync(TMP_DIR, { recursive: true })
  }

  const base = join(TMP_DIR, `permission-probe-${now}.png`)
  const extra = base.replace(/\.png$/i, '_1.png')
  const seen = join(TMP_DIR, `permission-probe-see-${now}.png`)

  const result: PeekabooPermissions = {}
  try {
    await runPeekaboo(['image', '--mode', 'screen', '--path', base, '--json'], 4000)
    result.screenRecording = true
  } catch {
    // Keep as unknown/false.
  } finally {
    try { unlinkSync(base) } catch { /* ignore */ }
    try { unlinkSync(extra) } catch { /* ignore */ }
  }

  try {
    await runPeekaboo(['see', '--path', seen, '--json'], 6000)
    result.screenRecording = true
    result.accessibility = true
  } catch {
    // Keep current state.
  } finally {
    try { unlinkSync(seen) } catch { /* ignore */ }
  }

  const normalized =
    result.screenRecording === true || result.accessibility === true
      ? result
      : null

  capabilityProbeCache = {
    value: normalized,
    checkedAt: now
  }

  return normalized
}

/**
 * Check if peekaboo is installed and available
 */
export async function checkPeekabooInstalled(): Promise<boolean> {
  const now = Date.now()
  if (peekabooInstalledCache && now - peekabooInstalledCache.checkedAt < PEEKABOO_CACHE_MS) {
    return peekabooInstalledCache.value
  }

  try {
    await runPeekaboo(['--version'], 3000)
    peekabooInstalledCache = { value: true, checkedAt: now }
    return true
  } catch {
    peekabooInstalledCache = { value: false, checkedAt: now }
    return false
  }
}

/**
 * Check if Screen Recording and Accessibility permissions are granted
 * Uses Electron's native APIs instead of peekaboo CLI for accurate permission detection
 */
export async function checkPermissions(): Promise<ComputerPermissions> {
  try {
    const now = Date.now()

    // Check Screen Recording permission using Electron's native API
    const screenStatus = systemPreferences.getMediaAccessStatus('screen')
    const nativeScreenRecording = screenStatus === 'granted'

    // Check Accessibility permission using Electron's native API
    const nativeAccessibility = systemPreferences.isTrustedAccessibilityClient(false)

    // Check if peekaboo is installed (still needed for actual automation)
    const peekabooInstalled = await checkPeekabooInstalled()
    const peekabooPermissions =
      peekabooInstalled && (!nativeScreenRecording || !nativeAccessibility)
        ? await getPeekabooPermissions()
        : null

    let screenRecording = nativeScreenRecording || peekabooPermissions?.screenRecording === true
    let accessibility = nativeAccessibility || peekabooPermissions?.accessibility === true

    if (peekabooInstalled && (!screenRecording || !accessibility)) {
      const probe = await probeCapabilities()
      screenRecording = screenRecording || probe?.screenRecording === true
      accessibility = accessibility || probe?.accessibility === true
    }

    // Avoid rapid false flips when macOS/CLI status is temporarily inconsistent.
    if (!screenRecording || !accessibility) {
      if (
        lastStablePermissions &&
        now - lastStablePermissions.checkedAt < PERMISSION_PROBE_CACHE_MS &&
        lastStablePermissions.screenRecording &&
        lastStablePermissions.accessibility
      ) {
        screenRecording = true
        accessibility = true
      }
    }

    if (screenRecording && accessibility) {
      lastStablePermissions = {
        screenRecording,
        accessibility,
        checkedAt: now
      }
    }

    return {
      screenRecording,
      accessibility,
      peekabooInstalled
    }
  } catch (error) {
    console.error('Failed to check permissions:', error)
    // Fallback: check if peekaboo is installed
    const installed = await checkPeekabooInstalled()
    const peekabooPermissions = installed ? await getPeekabooPermissions() : null
    const probe = installed ? await probeCapabilities() : null
    const screenRecording =
      peekabooPermissions?.screenRecording === true || probe?.screenRecording === true
    const accessibility =
      peekabooPermissions?.accessibility === true || probe?.accessibility === true

    if (screenRecording && accessibility) {
      lastStablePermissions = {
        screenRecording: true,
        accessibility: true,
        checkedAt: Date.now()
      }
    }

    return {
      screenRecording,
      accessibility,
      peekabooInstalled: installed
    }
  }
}

/**
 * Capture a screenshot and return base64 PNG
 */
export async function screenshot(options?: {
  mode?: 'screen' | 'window' | 'region'
  app?: string
  x?: number
  y?: number
  width?: number
  height?: number
}): Promise<ScreenshotResult> {
  try {
    // Ensure tmp directory exists
    if (!existsSync(TMP_DIR)) {
      require('fs').mkdirSync(TMP_DIR, { recursive: true })
    }

    const tmpFile = join(TMP_DIR, `screenshot-${Date.now()}.png`)
    const args = ['image', '--mode', options?.mode || 'screen', '--path', tmpFile, '--json']

    if (options?.app) {
      args.push('--app', options.app)
    }

    const { stdout } = await runPeekaboo(args, 10000)
    
    // Parse peekaboo response: { success: bool, data: {...} }
    const result = JSON.parse(stdout)
    if (!result.success) {
      throw new Error(result.error || 'Screenshot failed')
    }

    // Read the image and convert to base64
    const imageBuffer = readFileSync(tmpFile)
    const base64 = imageBuffer.toString('base64')

    // Clean up temp file
    try { unlinkSync(tmpFile) } catch { /* ignore */ }

    return {
      image: base64,
      width: result.data?.width,
      height: result.data?.height
    }
  } catch (error) {
    throw new Error(`Screenshot failed: ${String(error)}`)
  }
}

/**
 * Capture an annotated UI map with element IDs (for vision-based automation)
 */
export async function see(options?: {
  app?: string
  annotate?: boolean
}): Promise<SeeResult> {
  try {
    // Ensure tmp directory exists
    if (!existsSync(TMP_DIR)) {
      require('fs').mkdirSync(TMP_DIR, { recursive: true })
    }

    const tmpFile = join(TMP_DIR, `see-${Date.now()}.png`)
    const args = ['see', '--path', tmpFile, '--json']

    if (options?.annotate !== false) {
      args.push('--annotate')
    }
    if (options?.app) {
      args.push('--app', options.app)
    }

    const { stdout } = await runPeekaboo(args, 15000)
    
    // Parse peekaboo response: { success: bool, data: {...} }
    const result = JSON.parse(stdout)
    if (!result.success) {
      throw new Error(result.error || 'See failed')
    }

    // Read the annotated image
    const imageBuffer = readFileSync(tmpFile)
    const base64 = imageBuffer.toString('base64')

    // Clean up temp file
    try { unlinkSync(tmpFile) } catch { /* ignore */ }

    // Parse elements from peekaboo output
    const elements: ComputerElement[] = (result.data?.elements || []).map((el: any) => ({
      id: el.id,
      role: el.role,
      label: el.label,
      value: el.value,
      bounds: el.bounds,
      description: el.description
    }))

    return {
      image: base64,
      elements
    }
  } catch (error) {
    throw new Error(`See failed: ${String(error)}`)
  }
}

/**
 * Click on an element by ID, coordinates, or query
 */
export async function click(target: {
  elementId?: string
  x?: number
  y?: number
  query?: string
  app?: string
}): Promise<void> {
  try {
    const args = ['click']

    if (target.elementId) {
      args.push('--on', target.elementId)
    } else if (target.x !== undefined && target.y !== undefined) {
      args.push('--coords', `${target.x},${target.y}`)
    } else if (target.query) {
      args.push(target.query)
    } else {
      throw new Error('Must provide elementId, coordinates (x,y), or query')
    }

    if (target.app) {
      args.push('--app', target.app)
    }

    await runPeekaboo(args, 5000)
  } catch (error) {
    throw new Error(`Click failed: ${String(error)}`)
  }
}

/**
 * Type text (with optional modifiers like --return or --clear)
 */
export async function type(text: string, options?: {
  pressReturn?: boolean
  clearFirst?: boolean
  slowly?: boolean
  app?: string
}): Promise<void> {
  try {
    const args = ['type', text]

    if (options?.pressReturn) {
      args.push('--return')
    }
    if (options?.clearFirst) {
      args.push('--clear')
    }
    if (options?.slowly) {
      args.push('--slowly')
    }
    if (options?.app) {
      args.push('--app', options.app)
    }

    await runPeekaboo(args, 10000)
  } catch (error) {
    throw new Error(`Type failed: ${String(error)}`)
  }
}

/**
 * Press a special key (escape, tab, enter, etc.)
 */
export async function press(key: string, options?: {
  modifiers?: string[]
  count?: number
}): Promise<void> {
  try {
    const count = options?.count && options.count > 1 ? options.count : 1

    if (options?.modifiers && options.modifiers.length > 0) {
      const modifiers = options.modifiers.map(normalizeHotkeyModifier)
      const keys = [...modifiers, key].join(',')
      for (let i = 0; i < count; i += 1) {
        await runPeekaboo(['hotkey', '--keys', keys], 5000)
      }
      return
    }

    const args = ['press', key]
    if (count > 1) args.push('--count', String(count))
    await runPeekaboo(args, 5000)
  } catch (error) {
    throw new Error(`Press failed: ${String(error)}`)
  }
}

/**
 * Execute a hotkey combination (e.g., cmd+shift+t)
 */
export async function hotkey(keys: string): Promise<void> {
  try {
    await runPeekaboo(['hotkey', '--keys', keys], 5000)
  } catch (error) {
    throw new Error(`Hotkey failed: ${String(error)}`)
  }
}

/**
 * Scroll in a direction
 */
export async function scroll(direction: 'up' | 'down' | 'left' | 'right', amount?: number, app?: string): Promise<void> {
  try {
    const args = ['scroll', '--direction', direction]
    if (amount) {
      args.push('--amount', String(amount))
    }
    if (app) {
      args.push('--app', app)
    }

    await runPeekaboo(args, 5000)
  } catch (error) {
    throw new Error(`Scroll failed: ${String(error)}`)
  }
}

/**
 * List running applications
 */
export async function listApps(): Promise<AppInfo[]> {
  try {
    const { stdout } = await runPeekaboo(['list', 'apps', '--json'], 5000)
    
    // Parse peekaboo response: { success: bool, data: {...} }
    const result = JSON.parse(stdout)
    if (!result.success) {
      throw new Error(result.error || 'List apps failed')
    }
    
    return (result.data?.apps || []).map((app: any) => ({
      name: app.name,
      bundleId: app.bundleId,
      pid: app.pid,
      active: app.active
    }))
  } catch (error) {
    throw new Error(`List apps failed: ${String(error)}`)
  }
}

/**
 * List windows (optionally filtered by app)
 */
export async function listWindows(app?: string): Promise<WindowInfo[]> {
  try {
    const args = ['list', 'windows', '--json']
    if (app) {
      args.push('--app', app)
    }

    const { stdout } = await runPeekaboo(args, 5000)
    
    // Parse peekaboo response: { success: bool, data: {...} }
    const result = JSON.parse(stdout)
    if (!result.success) {
      throw new Error(result.error || 'List windows failed')
    }
    
    return (result.data?.windows || []).map((win: any) => ({
      id: win.id,
      title: win.title,
      app: win.app,
      bounds: win.bounds,
      focused: win.focused
    }))
  } catch (error) {
    throw new Error(`List windows failed: ${String(error)}`)
  }
}

/**
 * Launch an application (also focuses if already running)
 */
export async function appLaunch(name: string): Promise<void> {
  try {
    await runPeekaboo(['app', 'launch', name], 10000)
  } catch (error) {
    throw new Error(`App launch failed: ${String(error)}`)
  }
}

/**
 * Focus (bring to front) an application
 * Note: This is an alias for appLaunch since peekaboo doesn't have a separate focus command
 */
export async function appFocus(name: string): Promise<void> {
  return appLaunch(name)
}
