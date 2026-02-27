import { spawnSync } from 'child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import type {
  MCPConnectionStatus,
  MCPConnectionTestResult,
  MCPServerConfig,
  MCPServerInfo,
  MCPToolCallRecord,
  MCPToolDefinition
} from '../shared/types'

const PINCHR_CONFIG_DIR = join(homedir(), '.pinchr')
const MCP_SERVERS_PATH = join(PINCHR_CONFIG_DIR, 'mcp-servers.json')
const GATEWAY_TOOL_PREFIX = 'mcp__'
const MAX_CALL_HISTORY_PER_SERVER = 50

type MCPClientLike = {
  connect: (transport: unknown) => Promise<void>
  close: () => Promise<void>
  listTools: (params?: Record<string, unknown>) => Promise<{ tools?: unknown[] }>
  callTool: (params: { name: string; arguments?: Record<string, unknown> }) => Promise<unknown>
}

type MCPTransportLike = {
  close?: () => Promise<void> | void
}

type MCPClientCtor = new (
  info: { name: string; version: string },
  options?: Record<string, unknown>
) => MCPClientLike

type StdioTransportCtor = new (params: {
  command: string
  args?: string[]
  env?: Record<string, string>
  cwd?: string
}) => MCPTransportLike

type SSETransportCtor = new (url: URL, options?: Record<string, unknown>) => MCPTransportLike

type MCPModules = {
  Client: MCPClientCtor
  StdioClientTransport: StdioTransportCtor
  SSEClientTransport: SSETransportCtor
}

interface MCPServerRuntime {
  config: MCPServerConfig
  status: MCPConnectionStatus
  error?: string
  tools: MCPToolDefinition[]
  lastConnectedAt?: string
  client?: MCPClientLike
  transport?: MCPTransportLike
  connecting?: Promise<void>
}

let cachedModules: MCPModules | null = null

function ensureMcpModules(): MCPModules {
  if (cachedModules) return cachedModules

  const { Client } = require('@modelcontextprotocol/sdk/client') as { Client: MCPClientCtor }
  const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js') as {
    StdioClientTransport: StdioTransportCtor
  }
  const { SSEClientTransport } = require('@modelcontextprotocol/sdk/client/sse.js') as {
    SSEClientTransport: SSETransportCtor
  }

  cachedModules = { Client, StdioClientTransport, SSEClientTransport }
  return cachedModules
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function toId(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '')

  return normalized || 'mcp-server'
}

function toToolDefinition(raw: unknown): MCPToolDefinition | null {
  if (!isRecord(raw)) return null
  const name = readString(raw.name)
  if (!name) return null

  const description = readString(raw.description) || undefined
  const inputSchema = isRecord(raw.inputSchema) ? raw.inputSchema : undefined

  return {
    name,
    description,
    inputSchema
  }
}

function safeError(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

function normalizeSchema(schema: unknown): Record<string, unknown> {
  if (isRecord(schema)) return schema
  return {
    type: 'object',
    properties: {}
  }
}

function normalizeAllowedSessions(input: unknown): string[] {
  if (!Array.isArray(input)) return []

  const seen = new Set<string>()
  const sessions: string[] = []
  for (const value of input) {
    const key = readString(value)
    if (!key || seen.has(key)) continue
    seen.add(key)
    sessions.push(key)
  }

  return sessions
}

export class MCPManager {
  private readonly servers = new Map<string, MCPServerRuntime>()
  private readonly callHistory = new Map<string, MCPToolCallRecord[]>()

  constructor() {
    const loaded = this.readConfigs()
    for (const config of loaded) {
      const id = this.ensureUniqueId(toId(config.id || config.name))
      this.servers.set(id, {
        config: { ...config, id },
        status: 'disconnected',
        tools: []
      })
      this.callHistory.set(id, [])
    }
    this.persist()
  }

  async initialize(): Promise<void> {
    const enabledIds = Array.from(this.servers.values())
      .filter((server) => server.config.enabled)
      .map((server) => server.config.id)

    await Promise.allSettled(enabledIds.map((id) => this.connectServer(id)))
  }

  listServers(): MCPServerInfo[] {
    return Array.from(this.servers.values()).map((server) => this.toServerInfo(server))
  }

  async addServer(input: MCPServerConfig): Promise<MCPServerInfo> {
    const normalized = this.normalizeServerConfig(input)
    const id = this.ensureUniqueId(normalized.id)
    const config: MCPServerConfig = { ...normalized, id }

    const runtime: MCPServerRuntime = {
      config,
      status: 'disconnected',
      tools: []
    }

    this.servers.set(id, runtime)
    this.callHistory.set(id, [])
    this.persist()

    if (config.enabled) {
      await this.connectServer(id)
    }

    return this.toServerInfo(this.requireServer(id))
  }

  async updateServer(id: string, patch: Partial<MCPServerConfig>): Promise<MCPServerInfo> {
    const runtime = this.requireServer(id)

    const previous = runtime.config
    const merged = this.normalizeServerConfig({
      ...previous,
      ...patch,
      id: previous.id
    })
    const nextConfig: MCPServerConfig = { ...merged, id: previous.id }

    const connectionFieldsChanged =
      previous.transport !== nextConfig.transport ||
      previous.command !== nextConfig.command ||
      JSON.stringify(previous.args ?? []) !== JSON.stringify(nextConfig.args ?? []) ||
      JSON.stringify(previous.env ?? {}) !== JSON.stringify(nextConfig.env ?? {}) ||
      previous.url !== nextConfig.url

    runtime.config = nextConfig
    this.persist()

    if (runtime.config.enabled && connectionFieldsChanged) {
      await this.disconnectRuntime(runtime)
      await this.connectServer(id)
    }

    return this.toServerInfo(runtime)
  }

  async removeServer(id: string): Promise<void> {
    const runtime = this.requireServer(id)
    await this.disconnectRuntime(runtime)
    this.servers.delete(id)
    this.callHistory.delete(id)
    this.persist()
  }

  async toggleServer(id: string, enabled: boolean): Promise<MCPServerInfo> {
    const runtime = this.requireServer(id)
    runtime.config.enabled = Boolean(enabled)
    this.persist()

    if (runtime.config.enabled) {
      await this.connectServer(id)
    } else {
      await this.disconnectServer(id)
    }

    return this.toServerInfo(runtime)
  }

  async connectServer(id: string): Promise<void> {
    const runtime = this.requireServer(id)
    if (runtime.status === 'connected') return
    if (runtime.connecting) return runtime.connecting

    runtime.status = 'connecting'
    runtime.error = undefined

    runtime.connecting = (async () => {
      const { Client, SSEClientTransport, StdioClientTransport } = ensureMcpModules()
      let client: MCPClientLike | undefined
      let transport: MCPTransportLike | undefined

      try {
        if (runtime.config.transport === 'stdio') {
          const command = readString(runtime.config.command)
          if (!command) {
            throw new Error(`Server "${runtime.config.name}" is missing a command`)
          }
          this.assertCommandAvailable(command)

          transport = new StdioClientTransport({
            command,
            args: Array.isArray(runtime.config.args) ? runtime.config.args.map(String) : [],
            env: runtime.config.env && Object.keys(runtime.config.env).length > 0 ? runtime.config.env : undefined,
            cwd: homedir()
          })
        } else {
          const rawUrl = readString(runtime.config.url)
          if (!rawUrl) {
            throw new Error(`Server "${runtime.config.name}" is missing an SSE URL`)
          }
          transport = new SSEClientTransport(new URL(rawUrl))
        }

        client = new Client({
          name: 'Pinchr MCP Host',
          version: '1.0.0'
        })

        await client.connect(transport)
        const toolsResponse = await client.listTools()
        const tools = Array.isArray(toolsResponse?.tools)
          ? toolsResponse.tools.map(toToolDefinition).filter((tool): tool is MCPToolDefinition => Boolean(tool))
          : []

        runtime.client = client
        runtime.transport = transport
        runtime.tools = tools
        runtime.status = 'connected'
        runtime.error = undefined
        runtime.lastConnectedAt = new Date().toISOString()
      } catch (error) {
        runtime.status = 'error'
        runtime.error = safeError(error)
        runtime.tools = []
        runtime.client = undefined
        runtime.transport = undefined
        await this.safeClose(client, transport)
        throw error
      } finally {
        runtime.connecting = undefined
      }
    })()

    return runtime.connecting
  }

  async disconnectServer(id: string): Promise<void> {
    const runtime = this.requireServer(id)
    await this.disconnectRuntime(runtime)
  }

  async listTools(serverId: string): Promise<MCPToolDefinition[]> {
    const runtime = this.requireServer(serverId)
    if (runtime.status !== 'connected') {
      if (!runtime.config.enabled) {
        throw new Error(`Server "${runtime.config.name}" is disabled`)
      }
      await this.connectServer(serverId)
    }

    if (!runtime.client) {
      throw new Error(`Server "${runtime.config.name}" is not connected`)
    }

    const response = await runtime.client.listTools()
    runtime.tools = Array.isArray(response?.tools)
      ? response.tools.map(toToolDefinition).filter((tool): tool is MCPToolDefinition => Boolean(tool))
      : []

    return runtime.tools
  }

  getStatus(serverId: string): MCPConnectionStatus {
    return this.requireServer(serverId).status
  }

  recordCall(serverId: string, record: MCPToolCallRecord): void {
    this.requireServer(serverId)
    const existing = this.callHistory.get(serverId) ?? []
    existing.unshift(record)
    if (existing.length > MAX_CALL_HISTORY_PER_SERVER) {
      existing.splice(MAX_CALL_HISTORY_PER_SERVER)
    }
    this.callHistory.set(serverId, existing)
  }

  getCallHistory(serverId: string): MCPToolCallRecord[] {
    this.requireServer(serverId)
    return [...(this.callHistory.get(serverId) ?? [])]
  }

  async callTool(serverId: string, toolName: string, args?: Record<string, unknown>): Promise<unknown> {
    const runtime = this.requireServer(serverId)
    if (runtime.status !== 'connected') {
      if (!runtime.config.enabled) {
        throw new Error(`Server "${runtime.config.name}" is disabled`)
      }
      await this.connectServer(serverId)
    }

    if (!runtime.client) {
      throw new Error(`Server "${runtime.config.name}" is not connected`)
    }

    return runtime.client.callTool({
      name: toolName,
      arguments: isRecord(args) ? args : {}
    })
  }

  async testConnection(input: MCPServerConfig): Promise<MCPConnectionTestResult> {
    const config = this.normalizeServerConfig(input)
    const { Client, SSEClientTransport, StdioClientTransport } = ensureMcpModules()

    let client: MCPClientLike | undefined
    let transport: MCPTransportLike | undefined

    try {
      if (config.transport === 'stdio') {
        const command = readString(config.command)
        if (!command) throw new Error('Command is required for stdio transport')
        this.assertCommandAvailable(command)

        transport = new StdioClientTransport({
          command,
          args: Array.isArray(config.args) ? config.args.map(String) : [],
          env: config.env && Object.keys(config.env).length > 0 ? config.env : undefined,
          cwd: homedir()
        })
      } else {
        const rawUrl = readString(config.url)
        if (!rawUrl) throw new Error('URL is required for SSE transport')
        transport = new SSEClientTransport(new URL(rawUrl))
      }

      client = new Client({
        name: 'Pinchr MCP Test',
        version: '1.0.0'
      })
      await client.connect(transport)
      const result = await client.listTools()
      const tools = Array.isArray(result?.tools)
        ? result.tools.map(toToolDefinition).filter((tool): tool is MCPToolDefinition => Boolean(tool))
        : []

      return { ok: true, tools }
    } catch (error) {
      return { ok: false, error: safeError(error), tools: [] }
    } finally {
      await this.safeClose(client, transport)
    }
  }

  getGatewayToolDefinitions(sessionKey?: string): Array<{
    type: 'function'
    function: {
      name: string
      description?: string
      parameters: Record<string, unknown>
    }
  }> {
    const tools: Array<{
      type: 'function'
      function: {
        name: string
        description?: string
        parameters: Record<string, unknown>
      }
    }> = []

    for (const runtime of this.servers.values()) {
      if (runtime.status !== 'connected') continue
      if (!this.canSessionUseServer(runtime.config.id, sessionKey, true)) continue

      for (const tool of runtime.tools) {
        tools.push({
          type: 'function',
          function: {
            name: this.toGatewayToolName(runtime.config.id, tool.name),
            description: tool.description
              ? `${tool.description} (MCP: ${runtime.config.name})`
              : `MCP tool from ${runtime.config.name}`,
            parameters: normalizeSchema(tool.inputSchema)
          }
        })
      }
    }

    return tools
  }

  parseGatewayToolName(
    gatewayToolName: string
  ): { serverId: string; serverName: string; toolName: string } | null {
    const parsed = this.fromGatewayToolName(gatewayToolName)
    if (!parsed) {
      return null
    }

    const runtime = this.servers.get(parsed.serverId)
    return {
      serverId: parsed.serverId,
      serverName: runtime?.config.name ?? parsed.serverId,
      toolName: parsed.toolName
    }
  }

  canUseGatewayTool(gatewayToolName: string, sessionKey?: string): boolean {
    const parsed = this.fromGatewayToolName(gatewayToolName)
    if (!parsed) return false
    return this.canSessionUseServer(parsed.serverId, sessionKey)
  }

  async callGatewayTool(
    gatewayToolName: string,
    args?: Record<string, unknown>,
    sessionKey?: string
  ): Promise<unknown> {
    const parsed = this.fromGatewayToolName(gatewayToolName)
    if (!parsed) {
      throw new Error(`Invalid MCP gateway tool name: ${gatewayToolName}`)
    }
    if (!this.canSessionUseServer(parsed.serverId, sessionKey)) {
      throw new Error(`Session "${sessionKey || 'unknown'}" is not allowed to use MCP server "${parsed.serverId}"`)
    }
    return this.callTool(parsed.serverId, parsed.toolName, args)
  }

  async shutdown(): Promise<void> {
    const ids = Array.from(this.servers.keys())
    await Promise.allSettled(ids.map((id) => this.disconnectServer(id)))
  }

  private normalizeServerConfig(input: Record<string, unknown> | MCPServerConfig): MCPServerConfig {
    const transport = input.transport === 'sse' ? 'sse' : 'stdio'
    const env: Record<string, string> = {}
    for (const [key, value] of Object.entries(input.env ?? {})) {
      const envKey = readString(key)
      if (!envKey) continue
      env[envKey] = String(value)
    }

    return {
      id: toId(readString(input.id) || readString(input.name) || `mcp-${Date.now()}`),
      name: readString(input.name) || 'MCP Server',
      description: readString(input.description) || undefined,
      transport,
      command: readString(input.command) || undefined,
      args: Array.isArray(input.args) ? input.args.map(String) : [],
      env,
      url: readString(input.url) || undefined,
      enabled: Boolean(input.enabled),
      allowedSessions: normalizeAllowedSessions(input.allowedSessions)
    }
  }

  private readConfigs(): MCPServerConfig[] {
    try {
      if (!existsSync(MCP_SERVERS_PATH)) return []
      const parsed = JSON.parse(readFileSync(MCP_SERVERS_PATH, 'utf-8')) as unknown
      if (!Array.isArray(parsed)) return []

      return parsed
        .map((entry) => {
          if (!isRecord(entry)) return null
          return this.normalizeServerConfig(entry)
        })
        .filter((entry): entry is MCPServerConfig => Boolean(entry))
    } catch {
      return []
    }
  }

  private persist(): void {
    const config = Array.from(this.servers.values()).map((server) => server.config)
    if (!existsSync(PINCHR_CONFIG_DIR)) {
      mkdirSync(PINCHR_CONFIG_DIR, { recursive: true })
    }
    writeFileSync(MCP_SERVERS_PATH, JSON.stringify(config, null, 2))
  }

  private requireServer(id: string): MCPServerRuntime {
    const runtime = this.servers.get(id)
    if (!runtime) {
      throw new Error(`MCP server not found: ${id}`)
    }
    return runtime
  }

  private toServerInfo(server: MCPServerRuntime): MCPServerInfo {
    return {
      ...server.config,
      status: server.status,
      error: server.error,
      tools: server.tools,
      lastConnectedAt: server.lastConnectedAt
    }
  }

  private ensureUniqueId(baseId: string): string {
    let candidate = baseId
    let counter = 2
    while (this.servers.has(candidate)) {
      candidate = `${baseId}-${counter}`
      counter += 1
    }
    return candidate
  }

  private canSessionUseServer(serverId: string, sessionKey?: string, allowWhenMissingSession = false): boolean {
    const runtime = this.servers.get(serverId)
    if (!runtime) return false

    const allowedSessions = normalizeAllowedSessions(runtime.config.allowedSessions)
    if (allowedSessions.length === 0) return true
    if (!sessionKey) return allowWhenMissingSession

    return allowedSessions.includes(sessionKey)
  }

  private assertCommandAvailable(command: string): void {
    if (command.includes('/') || command.includes('\\')) {
      if (existsSync(command)) return
      throw new Error(`Command not found: ${command}`)
    }

    const result = process.platform === 'win32'
      ? spawnSync('where', [command], { stdio: 'ignore' })
      : spawnSync('which', [command], { stdio: 'ignore' })

    if (result.status !== 0) {
      throw new Error(`Command not found: ${command}. Install it or use a full executable path.`)
    }
  }

  private async disconnectRuntime(runtime: MCPServerRuntime): Promise<void> {
    await this.safeClose(runtime.client, runtime.transport)
    runtime.client = undefined
    runtime.transport = undefined
    runtime.connecting = undefined
    runtime.tools = []
    runtime.status = 'disconnected'
    runtime.error = undefined
  }

  private async safeClose(client?: MCPClientLike, transport?: MCPTransportLike): Promise<void> {
    if (client) {
      try {
        await client.close()
      } catch {
        // Ignore close failures during cleanup.
      }
    }
    if (transport && typeof transport.close === 'function') {
      try {
        await transport.close()
      } catch {
        // Ignore close failures during cleanup.
      }
    }
  }

  private toGatewayToolName(serverId: string, toolName: string): string {
    const encodedServer = Buffer.from(serverId, 'utf-8').toString('base64url')
    const encodedTool = Buffer.from(toolName, 'utf-8').toString('base64url')
    return `${GATEWAY_TOOL_PREFIX}${encodedServer}__${encodedTool}`
  }

  private fromGatewayToolName(gatewayToolName: string): { serverId: string; toolName: string } | null {
    if (!gatewayToolName.startsWith(GATEWAY_TOOL_PREFIX)) return null

    const encoded = gatewayToolName.slice(GATEWAY_TOOL_PREFIX.length)
    const splitIndex = encoded.indexOf('__')
    if (splitIndex <= 0) return null

    const encodedServer = encoded.slice(0, splitIndex)
    const encodedTool = encoded.slice(splitIndex + 2)
    if (!encodedServer || !encodedTool) return null

    try {
      return {
        serverId: Buffer.from(encodedServer, 'base64url').toString('utf-8'),
        toolName: Buffer.from(encodedTool, 'base64url').toString('utf-8')
      }
    } catch {
      return null
    }
  }
}
