import { createServer, IncomingMessage, ServerResponse } from 'http'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { randomBytes } from 'crypto'
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

const CONFIG_PATH = join(homedir(), '.pinchr', 'config.json')
const DEFAULT_PORT = 18790

interface ComputerServerConfig {
  enabled: boolean
  port: number
  authToken: string
}

let server: ReturnType<typeof createServer> | null = null
let serverConfig: ComputerServerConfig | null = null

/**
 * Load or generate server configuration
 */
function loadConfig(): ComputerServerConfig {
  try {
    const configDir = join(homedir(), '.pinchr')
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true })
    }

    let config: Record<string, unknown> = {}
    if (existsSync(CONFIG_PATH)) {
      config = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'))
    }

    // Initialize computer server config if not exists
    if (!config.computerServer) {
      config.computerServer = {
        enabled: true,
        port: DEFAULT_PORT,
        authToken: randomBytes(32).toString('hex')
      }
      writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2))
    }

    return config.computerServer as ComputerServerConfig
  } catch (error) {
    console.error('Failed to load computer server config:', error)
    // Return default config if loading fails
    return {
      enabled: true,
      port: DEFAULT_PORT,
      authToken: randomBytes(32).toString('hex')
    }
  }
}

/**
 * Parse JSON body from request
 */
async function parseBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (chunk) => {
      body += chunk.toString()
    })
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {})
      } catch (error) {
        reject(new Error('Invalid JSON'))
      }
    })
    req.on('error', reject)
  })
}

/**
 * Send JSON response
 */
function sendJson(res: ServerResponse, status: number, data: { ok: boolean; data?: unknown; error?: string }): void {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  })
  res.end(JSON.stringify(data))
}

/**
 * Verify bearer token
 */
function verifyAuth(req: IncomingMessage): boolean {
  if (!serverConfig) return false
  
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return false
  }

  const token = authHeader.substring(7)
  return token === serverConfig.authToken
}

/**
 * Handle incoming HTTP requests
 */
async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const { method, url } = req

  // Handle CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    })
    res.end()
    return
  }

  // Health check doesn't require auth
  if (method === 'GET' && url === '/health') {
    try {
      const permissions = await checkPermissions()
      sendJson(res, 200, {
        ok: true,
        data: {
          status: 'online',
          version: '1.0.0',
          permissions
        }
      })
    } catch (error) {
      sendJson(res, 500, { ok: false, error: String(error) })
    }
    return
  }

  // All other endpoints require authentication
  if (!verifyAuth(req)) {
    sendJson(res, 401, { ok: false, error: 'Unauthorized' })
    return
  }

  try {
    // POST /screenshot
    if (method === 'POST' && url === '/screenshot') {
      const body = await parseBody(req) as { mode?: 'screen' | 'window' | 'frontmost'; app?: string; windowTitle?: string }
      const result = await screenshot({
        mode: body.mode || 'screen',
        app: body.windowTitle || body.app
      })
      sendJson(res, 200, { ok: true, data: result })
      return
    }

    // POST /see
    if (method === 'POST' && url === '/see') {
      const body = await parseBody(req) as { app?: string; windowTitle?: string; annotate?: boolean }
      const result = await see({
        app: body.windowTitle || body.app,
        annotate: body.annotate !== false
      })
      sendJson(res, 200, { ok: true, data: result })
      return
    }

    // POST /click
    if (method === 'POST' && url === '/click') {
      const body = await parseBody(req) as {
        target?: string
        elementId?: string
        coords?: [number, number]
        x?: number
        y?: number
        query?: string
        app?: string
      }
      
      // Support both "target" (element ID) and "coords" from the spec
      const clickTarget: { elementId?: string; x?: number; y?: number; query?: string; app?: string } = {}
      
      if (body.target) {
        clickTarget.elementId = body.target
      } else if (body.elementId) {
        clickTarget.elementId = body.elementId
      } else if (body.coords && body.coords.length === 2) {
        clickTarget.x = body.coords[0]
        clickTarget.y = body.coords[1]
      } else if (body.x !== undefined && body.y !== undefined) {
        clickTarget.x = body.x
        clickTarget.y = body.y
      } else if (body.query) {
        clickTarget.query = body.query
      }

      if (body.app) {
        clickTarget.app = body.app
      }

      await click(clickTarget)
      sendJson(res, 200, { ok: true })
      return
    }

    // POST /type
    if (method === 'POST' && url === '/type') {
      const body = await parseBody(req) as {
        text: string
        returnKey?: boolean
        clear?: boolean
        slowly?: boolean
        app?: string
      }
      
      if (!body.text) {
        sendJson(res, 400, { ok: false, error: 'Missing required field: text' })
        return
      }

      await typeText(body.text, {
        pressReturn: body.returnKey,
        clearFirst: body.clear,
        slowly: body.slowly,
        app: body.app
      })
      sendJson(res, 200, { ok: true })
      return
    }

    // POST /press
    if (method === 'POST' && url === '/press') {
      const body = await parseBody(req) as { key: string; count?: number; modifiers?: string[] }
      
      if (!body.key) {
        sendJson(res, 400, { ok: false, error: 'Missing required field: key' })
        return
      }

      await press(body.key, { 
        modifiers: body.modifiers,
        count: body.count
      })
      
      sendJson(res, 200, { ok: true })
      return
    }

    // POST /hotkey
    if (method === 'POST' && url === '/hotkey') {
      const body = await parseBody(req) as { keys: string }
      
      if (!body.keys) {
        sendJson(res, 400, { ok: false, error: 'Missing required field: keys' })
        return
      }

      await hotkey(body.keys)
      sendJson(res, 200, { ok: true })
      return
    }

    // POST /scroll
    if (method === 'POST' && url === '/scroll') {
      const body = await parseBody(req) as {
        direction: 'up' | 'down' | 'left' | 'right'
        amount?: number
        app?: string
      }
      
      if (!body.direction) {
        sendJson(res, 400, { ok: false, error: 'Missing required field: direction' })
        return
      }

      await scroll(body.direction, body.amount, body.app)
      sendJson(res, 200, { ok: true })
      return
    }

    // GET /apps
    if (method === 'GET' && url === '/apps') {
      const apps = await listApps()
      sendJson(res, 200, { ok: true, data: apps })
      return
    }

    // GET /windows
    if (method === 'GET' && url?.startsWith('/windows')) {
      const urlObj = new URL(url, `http://localhost:${serverConfig?.port}`)
      const app = urlObj.searchParams.get('app') || undefined
      const windows = await listWindows(app)
      sendJson(res, 200, { ok: true, data: windows })
      return
    }

    // POST /app/launch
    if (method === 'POST' && url === '/app/launch') {
      const body = await parseBody(req) as { name: string }
      
      if (!body.name) {
        sendJson(res, 400, { ok: false, error: 'Missing required field: name' })
        return
      }

      await appLaunch(body.name)
      sendJson(res, 200, { ok: true })
      return
    }

    // POST /app/focus
    if (method === 'POST' && url === '/app/focus') {
      const body = await parseBody(req) as { name: string }
      
      if (!body.name) {
        sendJson(res, 400, { ok: false, error: 'Missing required field: name' })
        return
      }

      await appFocus(body.name)
      sendJson(res, 200, { ok: true })
      return
    }

    // 404 for unknown endpoints
    sendJson(res, 404, { ok: false, error: 'Not found' })
  } catch (error) {
    console.error('Computer server error:', error)
    sendJson(res, 500, { ok: false, error: String(error) })
  }
}

/**
 * Start the computer server
 */
export function startComputerServer(): { port: number; url: string; authToken: string } {
  if (server) {
    throw new Error('Computer server is already running')
  }

  serverConfig = loadConfig()
  
  if (!serverConfig.enabled) {
    throw new Error('Computer server is disabled in config')
  }

  server = createServer(handleRequest)

  server.listen(serverConfig.port, '127.0.0.1')

  server.on('error', (error) => {
    console.error('[Computer Server] Error:', error)
  })

  return {
    port: serverConfig.port,
    url: `http://127.0.0.1:${serverConfig.port}`,
    authToken: serverConfig.authToken
  }
}

/**
 * Stop the computer server
 */
export function stopComputerServer(): void {
  if (!server) {
    throw new Error('Computer server is not running')
  }

  server.close()

  server = null
  serverConfig = null
}

/**
 * Get server status
 */
export function getServerStatus(): { running: boolean; port?: number; url?: string } {
  if (!server || !serverConfig) {
    return { running: false }
  }

  return {
    running: true,
    port: serverConfig.port,
    url: `http://127.0.0.1:${serverConfig.port}`
  }
}

/**
 * Get the auth token for external use
 */
export function getAuthToken(): string | null {
  return serverConfig?.authToken || null
}
