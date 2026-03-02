import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Hash,
  Link2,
  Loader2,
  MessageCircle,
  MessageSquare,
  Phone,
  Send,
  Server,
  Settings,
  Smartphone,
  XCircle,
  type LucideIcon
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useGatewayConfig, useGatewayHealth } from '@/hooks/useGateway'
import { cn } from '@/lib/utils'
import type { Page } from '@/types/navigation'
import type { CompanionRelayStatus, GatewayConfig, MCPServerInfo } from '../../../shared/types'

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06 }
  }
}

const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 }
}

const listContainer = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.04 }
  }
}

const listItem = {
  hidden: { opacity: 0, y: 6 },
  show: { opacity: 1, y: 0 }
}

type ConnectionStatus = 'connected' | 'disconnected' | 'error'
type ConnectionCategory = 'mcp' | 'other'
type SupportedChannelId = 'slack' | 'whatsapp' | 'discord' | 'telegram' | 'signal' | 'imessage'

interface ConnectionRowData {
  id: string
  icon: LucideIcon
  name: string
  type: string
  status: ConnectionStatus
  error?: string
}

interface ChannelRequirement {
  keys: string[]
}

interface ChannelDefinition {
  id: SupportedChannelId
  name: string
  description: string
  icon: LucideIcon
  setupGuideUrl: string
  requirements: ChannelRequirement[]
}

interface ConnectionSectionData {
  id: ConnectionCategory
  title: string
  description: string
  icon: LucideIcon
  connections: ConnectionRowData[]
  emptyLabel: string
}

const CHANNELS_CONFIG: ChannelDefinition[] = [
  {
    id: 'slack',
    name: 'Slack',
    description: 'Workspace messaging',
    icon: Hash,
    setupGuideUrl: 'https://docs.openclaw.ai/channels/slack',
    requirements: [{ keys: ['botToken'] }, { keys: ['appToken'] }]
  },
  {
    id: 'discord',
    name: 'Discord',
    description: 'Discord community servers',
    icon: MessageSquare,
    setupGuideUrl: 'https://docs.openclaw.ai/channels/discord',
    requirements: [{ keys: ['token', 'botToken'] }]
  },
  {
    id: 'whatsapp',
    name: 'WhatsApp',
    description: 'WhatsApp channel',
    icon: MessageCircle,
    setupGuideUrl: 'https://docs.openclaw.ai/channels/whatsapp',
    requirements: []
  },
  {
    id: 'telegram',
    name: 'Telegram',
    description: 'Telegram bot integration',
    icon: Send,
    setupGuideUrl: 'https://docs.openclaw.ai/channels/telegram',
    requirements: [{ keys: ['botToken', 'token'] }]
  },
  {
    id: 'signal',
    name: 'Signal',
    description: 'Secure direct messaging',
    icon: Phone,
    setupGuideUrl: 'https://docs.openclaw.ai/channels/signal',
    requirements: [{ keys: ['phoneNumber'] }]
  },
  {
    id: 'imessage',
    name: 'iMessage',
    description: 'Apple Messages on macOS',
    icon: MessageCircle,
    setupGuideUrl: 'https://docs.openclaw.ai/channels/imessage',
    requirements: []
  }
]

const CHANNEL_BY_ID: Record<SupportedChannelId, ChannelDefinition> = CHANNELS_CONFIG.reduce(
  (acc, channel) => {
    acc[channel.id] = channel
    return acc
  },
  {} as Record<SupportedChannelId, ChannelDefinition>
)

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function readString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function readBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (normalized === 'true' || normalized === 'enabled' || normalized === 'on') return true
    if (normalized === 'false' || normalized === 'disabled' || normalized === 'off') return false
  }
  return undefined
}

function isConfiguredValue(value: unknown): boolean {
  if (value === undefined || value === null) return false
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length > 0 && trimmed !== '__OPENCLAW_REDACTED__'
  }
  return true
}

function statusMeta(
  status: ConnectionStatus
): {
  label: string
  variant: 'success' | 'error' | 'secondary'
  icon: LucideIcon
  iconClassName: string
  dotClassName: string
} {
  if (status === 'connected') {
    return {
      label: 'Connected',
      variant: 'success',
      icon: CheckCircle2,
      iconClassName: 'text-emerald-400',
      dotClassName: 'bg-emerald-400'
    }
  }

  if (status === 'error') {
    return {
      label: 'Error',
      variant: 'error',
      icon: AlertCircle,
      iconClassName: 'text-red-400',
      dotClassName: 'bg-red-400'
    }
  }

  return {
    label: 'Disconnected',
    variant: 'secondary',
    icon: XCircle,
    iconClassName: 'text-text-muted',
    dotClassName: 'bg-text-muted'
  }
}

function resolveMessagingStatus(
  channelId: SupportedChannelId,
  config: GatewayConfig | null,
  gatewayOnline: boolean
): ConnectionStatus {
  const rawConfig = config?.channels?.[channelId]
  const channelConfig = isRecord(rawConfig) ? rawConfig : null
  if (!channelConfig) return 'disconnected'

  const pluginEntry = config?.plugins?.entries?.[channelId]
  const pluginEnabled = isRecord(pluginEntry) ? readBoolean(pluginEntry.enabled) : undefined
  const channelEnabled = readBoolean(channelConfig.enabled)
  if (pluginEnabled === false || channelEnabled === false) return 'disconnected'

  const definition = CHANNEL_BY_ID[channelId]
  const missingRequired = definition.requirements.some((requirement) => {
    return !requirement.keys.some((key) => isConfiguredValue(channelConfig[key]))
  })

  if (missingRequired) return 'disconnected'
  if (!gatewayOnline) return 'disconnected'

  return 'connected'
}

function extractMcpServersFromGatewayConfig(config: GatewayConfig | null): ConnectionRowData[] {
  if (!config || !isRecord(config.mcp)) return []
  const mcp = config.mcp as Record<string, unknown>
  const parsed: ConnectionRowData[] = []
  const seen = new Set<string>()

  const pushServer = (fallbackId: string, rawServer: unknown) => {
    if (!isRecord(rawServer)) return

    const id = readString(rawServer.id) ?? fallbackId
    if (!id || seen.has(id)) return

    const name = readString(rawServer.name) ?? id
    const transport = readString(rawServer.transport) ?? 'unknown'

    parsed.push({
      id,
      name,
      type: `MCP (${transport})`,
      icon: Server,
      status: 'disconnected'
    })
    seen.add(id)
  }

  const servers = mcp.servers
  if (Array.isArray(servers)) {
    servers.forEach((server, index) => pushServer(`mcp-${index + 1}`, server))
  }

  if (isRecord(mcp.entries)) {
    Object.entries(mcp.entries).forEach(([id, value]) => pushServer(id, value))
  }

  Object.entries(mcp).forEach(([key, value]) => {
    if (key === 'servers' || key === 'entries') return
    if (!isRecord(value)) return
    if (!('transport' in value) && !('enabled' in value) && !('name' in value)) return
    pushServer(key, value)
  })

  return parsed
}

function ConnectionRow({ connection }: { connection: ConnectionRowData }) {
  const Icon = connection.icon
  const meta = statusMeta(connection.status)
  const StatusIcon = meta.icon

  return (
    <div className="rounded-xl border border-border/80 bg-surface-2 p-4 transition-colors hover:bg-surface-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/15">
            <Icon className="h-4 w-4 text-accent" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-text-primary">{connection.name}</p>
            <p className="truncate text-xs text-text-muted">{connection.type}</p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <StatusIcon className={cn('h-4 w-4', meta.iconClassName)} />
          <Badge variant={meta.variant} className="gap-1.5">
            <span className={cn('h-1.5 w-1.5 rounded-full', meta.dotClassName)} />
            {meta.label}
          </Badge>
        </div>
      </div>

      {connection.error && <p className="mt-2 text-xs text-red-400">{connection.error}</p>}
    </div>
  )
}

function ConnectionSection({ section }: { section: ConnectionSectionData }) {
  const SectionIcon = section.icon

  return (
    <motion.div variants={item}>
      <Card className="border-border/80 bg-surface/80">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <SectionIcon className="h-4 w-4 text-accent" />
                {section.title}
              </CardTitle>
              <CardDescription>{section.description}</CardDescription>
            </div>
            <Badge variant="secondary">{section.connections.length}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {section.connections.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border bg-surface-2 px-3 py-4 text-sm text-text-muted">
              {section.emptyLabel}
            </p>
          ) : (
            <motion.div variants={listContainer} className="space-y-3">
              {section.connections.map((connection) => (
                <motion.div key={connection.id} variants={listItem}>
                  <ConnectionRow connection={connection} />
                </motion.div>
              ))}
            </motion.div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
}

function MessagingChannelCard({
  channel,
  status,
  onSettings,
  onConnect
}: {
  channel: ChannelDefinition
  status: ConnectionStatus
  onSettings: () => void
  onConnect: () => void
}) {
  const Icon = channel.icon
  const meta = statusMeta(status)

  return (
    <Card className="border-border/80 bg-surface/80">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="h-4 w-4 text-accent" />
          {channel.name}
        </CardTitle>
        <CardDescription>{channel.description}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <Badge variant={meta.variant} className="gap-1.5">
          <span className={cn('h-1.5 w-1.5 rounded-full', meta.dotClassName)} />
          {meta.label}
        </Badge>

        {status === 'connected' ? (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" className="gap-1.5" onClick={onSettings}>
              <Settings className="h-3.5 w-3.5" />
              Settings
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={onSettings}>
              Disconnect
            </Button>
          </div>
        ) : (
          <Button size="sm" className="gap-1.5" onClick={onConnect}>
            Connect
            <ExternalLink className="h-3.5 w-3.5" />
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

interface ConnectionsProps {
  onNavigate?: (page: Page) => void
}

export default function Connections({ onNavigate }: ConnectionsProps) {
  const { data: config, isLoading: configLoading } = useGatewayConfig()
  const { data: health } = useGatewayHealth()
  const gatewayOnline = Boolean(health)

  const { data: mcpServers = [], isLoading: mcpLoading } = useQuery({
    queryKey: ['connections', 'mcp-servers'],
    queryFn: async (): Promise<MCPServerInfo[]> => {
      const result = await window.api.mcp.listServers()
      if (!result.ok) return []
      return result.data ?? []
    },
    refetchInterval: 10000
  })

  const { data: companionStatus, isLoading: nodesLoading } = useQuery({
    queryKey: ['connections', 'paired-nodes'],
    queryFn: async (): Promise<CompanionRelayStatus | null> => {
      const result = await window.api.companion.status()
      if (!result.ok) return null
      return result.data ?? null
    },
    refetchInterval: 10000
  })

  const onOpenSettings = () => {
    if (onNavigate) {
      onNavigate('settings')
      return
    }
    window.location.hash = '#/settings'
  }

  const channelStatuses = useMemo<Record<SupportedChannelId, ConnectionStatus>>(() => {
    return CHANNELS_CONFIG.reduce(
      (acc, channel) => {
        acc[channel.id] = resolveMessagingStatus(channel.id, config ?? null, gatewayOnline)
        return acc
      },
      {} as Record<SupportedChannelId, ConnectionStatus>
    )
  }, [config, gatewayOnline])

  const connectedMessagingCount = useMemo(() => {
    return CHANNELS_CONFIG.filter((channel) => channelStatuses[channel.id] === 'connected').length
  }, [channelStatuses])

  const mcpConnections = useMemo<ConnectionRowData[]>(() => {
    if (mcpServers.length > 0) {
      return mcpServers.map((server) => {
        const status: ConnectionStatus =
          server.status === 'error'
            ? 'error'
            : server.status === 'connected'
              ? 'connected'
              : 'disconnected'

        return {
          id: server.id,
          icon: Server,
          name: server.name,
          type: `MCP (${server.transport})`,
          status,
          error: server.error
        }
      })
    }

    return extractMcpServersFromGatewayConfig(config ?? null).map((server) => ({
      ...server,
      status: gatewayOnline ? server.status : 'error',
      error: gatewayOnline ? server.error : 'Gateway is offline'
    }))
  }, [config, gatewayOnline, mcpServers])

  const pairedNodeConnections = useMemo<ConnectionRowData[]>(() => {
    if (!companionStatus?.configured) return []
    const status: ConnectionStatus = companionStatus.lastError
      ? 'error'
      : companionStatus.running
        ? 'connected'
        : 'disconnected'

    return [
      {
        id: companionStatus.desktopId ?? 'companion-node',
        icon: Smartphone,
        name: companionStatus.desktopName ?? 'Companion Node',
        type: companionStatus.desktopId ? `Node ${companionStatus.desktopId}` : 'Paired node',
        status,
        error: companionStatus.lastError ?? undefined
      }
    ]
  }, [companionStatus])

  const connectionSections = useMemo<ConnectionSectionData[]>(() => {
    return [
      {
        id: 'mcp',
        title: 'MCP Servers',
        description: 'Tool providers connected through MCP',
        icon: Server,
        connections: mcpConnections,
        emptyLabel: 'No MCP servers are configured.'
      },
      {
        id: 'other',
        title: 'Other',
        description: 'Companion node and additional relay connections',
        icon: Smartphone,
        connections: pairedNodeConnections,
        emptyLabel: 'No additional connections are configured.'
      }
    ]
  }, [mcpConnections, pairedNodeConnections])

  const loading = configLoading || mcpLoading || nodesLoading

  return (
    <ScrollArea className="h-full">
      <div className="px-6 py-8 sm:px-8 sm:pt-10">
        <div className="mx-auto max-w-6xl">
          <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
            <motion.div variants={item}>
              <Card className="border-border/80 bg-surface/80 backdrop-blur">
                <CardContent className="flex flex-wrap items-center justify-between gap-4 p-6">
                  <div>
                    <h1 className="text-2xl font-bold text-text-primary">Connections</h1>
                    <p className="mt-1 text-sm text-text-secondary">
                      Connect messaging channels, MCP servers, and companion services.
                    </p>
                  </div>
                  <Button onClick={onOpenSettings} className="gap-1.5">
                    <Link2 className="h-3.5 w-3.5" />
                    Open Settings
                  </Button>
                </CardContent>
              </Card>
            </motion.div>

            {loading && (
              <motion.div variants={item}>
                <Card>
                  <CardContent className="flex items-center justify-center p-8">
                    <Loader2 className="h-5 w-5 animate-spin text-accent" />
                    <span className="ml-3 text-sm text-text-muted">Loading connections...</span>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {!loading && (
              <motion.div variants={item}>
                <Card className="border-border/80 bg-surface/80">
                  <CardHeader>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <CardTitle className="flex items-center gap-2 text-base">
                          <MessageCircle className="h-4 w-4 text-accent" />
                          Messaging Channels
                        </CardTitle>
                        <CardDescription>Channels your agent can talk through</CardDescription>
                      </div>
                      <Badge variant="secondary">{connectedMessagingCount} / {CHANNELS_CONFIG.length} connected</Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                      {CHANNELS_CONFIG.map((channel) => (
                        <MessagingChannelCard
                          key={channel.id}
                          channel={channel}
                          status={channelStatuses[channel.id]}
                          onSettings={onOpenSettings}
                          onConnect={() => window.open(channel.setupGuideUrl, '_blank')}
                        />
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {!loading && (
              <motion.div variants={item} className="grid gap-4 xl:grid-cols-2">
                {connectionSections.map((section) => (
                  <ConnectionSection key={section.id} section={section} />
                ))}
              </motion.div>
            )}
          </motion.div>
        </div>
      </div>
    </ScrollArea>
  )
}
