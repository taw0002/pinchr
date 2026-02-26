import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertCircle,
  CheckCircle2,
  Hash,
  Link2,
  Loader2,
  MessageCircle,
  MessageSquare,
  Phone,
  Save,
  Send,
  Server,
  Smartphone,
  Sparkles,
  XCircle,
  type LucideIcon
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { useGatewayConfig, useGatewayHealth, useUpdateConfig } from '@/hooks/useGateway'
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
type ConnectionCategory = 'messaging' | 'mcp' | 'other'
type SupportedChannelId = 'slack' | 'whatsapp' | 'discord' | 'telegram' | 'signal' | 'imessage'
type FieldType = 'text' | 'password' | 'select'

interface ConnectionRowData {
  id: string
  icon: LucideIcon
  name: string
  type: string
  status: ConnectionStatus
  error?: string
}

interface ChannelFieldOption {
  label: string
  value: string
}

interface ChannelFieldDefinition {
  key: string
  label: string
  type: FieldType
  required?: boolean
  placeholder?: string
  description?: string
  options?: ChannelFieldOption[]
  validator?: (value: string) => string | null
}

interface ChannelDefinition {
  id: SupportedChannelId
  name: string
  description: string
  icon: LucideIcon
  fields: ChannelFieldDefinition[]
}

interface ConnectionSectionData {
  id: ConnectionCategory
  title: string
  description: string
  icon: LucideIcon
  connections: ConnectionRowData[]
  emptyLabel: string
}

interface FormNotice {
  type: 'success' | 'error'
  message: string
}

const POLICY_OPTIONS: ChannelFieldOption[] = [
  { value: 'open', label: 'Open' },
  { value: 'allowlist', label: 'Allowlist' },
  { value: 'pairing', label: 'Pairing' }
]

const ENABLED_OPTIONS: ChannelFieldOption[] = [
  { value: 'true', label: 'Enabled' },
  { value: 'false', label: 'Disabled' }
]

const SUPPORTED_CHANNELS: ChannelDefinition[] = [
  {
    id: 'slack',
    name: 'Slack',
    description: 'Workspace messaging',
    icon: Hash,
    fields: [
      {
        key: 'mode',
        label: 'Connection Mode',
        type: 'select',
        required: true,
        options: [
          { value: 'socket', label: 'Socket Mode' },
          { value: 'webhook', label: 'Webhook' }
        ]
      },
      {
        key: 'botToken',
        label: 'Bot Token',
        type: 'password',
        required: true,
        placeholder: 'xoxb-...'
      },
      {
        key: 'appToken',
        label: 'App Token',
        type: 'password',
        required: true,
        placeholder: 'xapp-...'
      },
      {
        key: 'groupPolicy',
        label: 'Group Policy',
        type: 'select',
        options: POLICY_OPTIONS
      }
    ]
  },
  {
    id: 'whatsapp',
    name: 'WhatsApp',
    description: 'WhatsApp channel',
    icon: MessageCircle,
    fields: [
      {
        key: 'enabled',
        label: 'Enabled',
        type: 'select',
        options: ENABLED_OPTIONS
      },
      {
        key: 'dmPolicy',
        label: 'DM Policy',
        type: 'select',
        options: POLICY_OPTIONS
      },
      {
        key: 'groupPolicy',
        label: 'Group Policy',
        type: 'select',
        options: POLICY_OPTIONS
      }
    ]
  },
  {
    id: 'discord',
    name: 'Discord',
    description: 'Discord community servers',
    icon: MessageSquare,
    fields: [
      {
        key: 'botToken',
        label: 'Bot Token',
        type: 'password',
        required: true,
        placeholder: 'Discord bot token'
      },
      {
        key: 'guildId',
        label: 'Guild ID',
        type: 'text',
        placeholder: 'Optional'
      }
    ]
  },
  {
    id: 'telegram',
    name: 'Telegram',
    description: 'Telegram bot integration',
    icon: Send,
    fields: [
      {
        key: 'botToken',
        label: 'Bot Token',
        type: 'password',
        required: true,
        placeholder: '123456:ABC-DEF...'
      }
    ]
  },
  {
    id: 'signal',
    name: 'Signal',
    description: 'Secure direct messaging',
    icon: Phone,
    fields: [
      {
        key: 'phoneNumber',
        label: 'Phone Number',
        type: 'text',
        required: true,
        placeholder: '+15551234567',
        validator: (value: string) => {
          if (!/^\+?[0-9]{7,15}$/.test(value.trim())) {
            return 'Enter a valid phone number (digits with optional leading +).'
          }
          return null
        }
      }
    ]
  },
  {
    id: 'imessage',
    name: 'iMessage',
    description: 'Apple Messages on macOS',
    icon: MessageCircle,
    fields: [
      {
        key: 'enabled',
        label: 'Enabled',
        type: 'select',
        options: ENABLED_OPTIONS
      },
      {
        key: 'dmPolicy',
        label: 'DM Policy',
        type: 'select',
        options: POLICY_OPTIONS
      },
      {
        key: 'groupPolicy',
        label: 'Group Policy',
        type: 'select',
        options: POLICY_OPTIONS
      },
      {
        key: 'cliPath',
        label: 'CLI Path',
        type: 'text',
        placeholder: 'imsg'
      }
    ]
  }
]

const CHANNEL_BY_ID: Record<SupportedChannelId, ChannelDefinition> = SUPPORTED_CHANNELS.reduce(
  (acc, channel) => {
    acc[channel.id] = channel
    return acc
  },
  {} as Record<SupportedChannelId, ChannelDefinition>
)

const SECRET_FIELD_HINTS = ['token', 'secret', 'password', 'key']

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

function toFormValue(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number') return String(value)
  return ''
}

function toConfigValue(field: ChannelFieldDefinition, value: string): unknown {
  if (field.type === 'select') {
    if (value === 'true') return true
    if (value === 'false') return false
  }
  return value
}

function isConfiguredValue(value: unknown): boolean {
  if (value === undefined || value === null) return false
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length > 0
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

function formatChannelType(channelId: SupportedChannelId, channelConfig: Record<string, unknown>): string {
  const nonSecretKeys = Object.entries(channelConfig).filter(([key, value]) => {
    if (value === null || value === undefined) return false
    const keyLower = key.toLowerCase()
    return !SECRET_FIELD_HINTS.some((hint) => keyLower.includes(hint))
  })

  if (channelId === 'slack') {
    const mode = readString(channelConfig.mode)
    if (mode) return `Mode: ${mode}`
  }
  if (channelId === 'discord') {
    const guildId = readString(channelConfig.guildId)
    if (guildId) return `Guild: ${guildId}`
  }
  if (channelId === 'signal') {
    const phoneNumber = readString(channelConfig.phoneNumber)
    if (phoneNumber) return `Phone: ${phoneNumber}`
  }
  if (channelId === 'imessage') {
    const cliPath = readString(channelConfig.cliPath)
    if (cliPath) return `CLI: ${cliPath}`
  }

  const firstDetail = nonSecretKeys.find(([, value]) => {
    if (typeof value === 'boolean') return true
    const text = readString(value)
    return Boolean(text && text !== '__OPENCLAW_REDACTED__')
  })

  if (firstDetail) {
    const [key, value] = firstDetail
    if (typeof value === 'boolean') return `${key}: ${value ? 'enabled' : 'disabled'}`
    const text = readString(value)
    if (text) return `${key}: ${text}`
  }

  return 'Configured'
}

function resolveMessagingStatus(
  channelId: SupportedChannelId,
  config: GatewayConfig | null,
  gatewayOnline: boolean
): ConnectionStatus {
  const rawConfig = config?.channels?.[channelId]
  if (!isRecord(rawConfig)) return 'disconnected'

  if (!gatewayOnline) return 'error'

  const pluginEnabled = config?.plugins?.entries?.[channelId]?.enabled
  const channelEnabled = readBoolean(rawConfig.enabled)
  if (pluginEnabled === false || channelEnabled === false) return 'disconnected'

  const definition = CHANNEL_BY_ID[channelId]
  const missingRequired = definition.fields.some((field) => {
    if (!field.required) return false
    return !isConfiguredValue(rawConfig[field.key])
  })

  return missingRequired ? 'disconnected' : 'connected'
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

const SETUP_GUIDE_URLS: Record<string, string> = {
  slack: 'https://docs.openclaw.ai/channels/slack',
  discord: 'https://docs.openclaw.ai/channels/discord',
  whatsapp: 'https://docs.openclaw.ai/channels/whatsapp',
  telegram: 'https://docs.openclaw.ai/channels/telegram',
  signal: 'https://docs.openclaw.ai/channels/signal',
  imessage: 'https://docs.openclaw.ai/channels/imessage',
}

function EmptyState({ onAddConnection, onQuickConfigure }: { onAddConnection: () => void; onQuickConfigure: () => void }) {
  return (
    <Card className="border-border/80 bg-surface/80">
      <CardContent className="p-8">
        <div className="mx-auto flex max-w-xl flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/15">
            <Sparkles className="h-6 w-6 text-accent" />
          </div>
          <h2 className="text-xl font-semibold text-text-primary">Connect your agent to the world</h2>
          <p className="mt-2 text-sm text-text-secondary">
            Connections let your agent talk through Slack, Discord, WhatsApp, and more.
            You can also configure them by chatting with your agent — just ask it to set up a channel!
          </p>
          <div className="mt-4 rounded-lg border border-accent/30 bg-accent/5 px-4 py-3">
            <p className="text-xs text-accent">
              💡 <strong>Tip:</strong> Go to Chat and tell your agent: &quot;Help me connect Slack&quot; — it can walk you through the setup step by step.
            </p>
          </div>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            <Button className="gap-1.5" onClick={onQuickConfigure}>
              <Link2 className="h-3.5 w-3.5" />
              Quick Configure
            </Button>
            <Button
              variant="secondary"
              className="gap-1.5"
              onClick={() => window.open('https://docs.openclaw.ai/channels', '_blank')}
            >
              Setup Guides
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
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

interface ConnectionsProps {
  onNavigate?: (page: Page) => void
}

export default function Connections({ onNavigate }: ConnectionsProps) {
  const { data: config, isLoading: configLoading } = useGatewayConfig()
  const { data: health } = useGatewayHealth()
  const updateConfig = useUpdateConfig()
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

  const [selectedChannelId, setSelectedChannelId] = useState<SupportedChannelId>('slack')
  const [formValues, setFormValues] = useState<Record<string, string>>({})
  const [originalValues, setOriginalValues] = useState<Record<string, string>>({})
  const [redactedFields, setRedactedFields] = useState<Record<string, boolean>>({})
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [formNotice, setFormNotice] = useState<FormNotice | null>(null)
  const [isFormDirty, setIsFormDirty] = useState(false)

  const selectedChannel = useMemo(() => CHANNEL_BY_ID[selectedChannelId], [selectedChannelId])

  const onAddConnection = () => {
    if (onNavigate) {
      onNavigate('settings')
      return
    }
    window.location.hash = '#/settings'
  }

  const hydrateSelectedChannelForm = (targetChannelId: SupportedChannelId) => {
    const channel = CHANNEL_BY_ID[targetChannelId]
    const sourceConfig = config?.channels?.[targetChannelId]
    const channelConfig = isRecord(sourceConfig) ? sourceConfig : {}

    const nextValues: Record<string, string> = {}
    const nextOriginalValues: Record<string, string> = {}
    const nextRedacted: Record<string, boolean> = {}

    channel.fields.forEach((field) => {
      const normalized = toFormValue(channelConfig[field.key])
      nextOriginalValues[field.key] = normalized

      if (normalized === '__OPENCLAW_REDACTED__') {
        nextValues[field.key] = ''
        nextRedacted[field.key] = true
      } else {
        nextValues[field.key] = normalized
      }
    })

    setFormValues(nextValues)
    setOriginalValues(nextOriginalValues)
    setRedactedFields(nextRedacted)
    setFieldErrors({})
    setFormNotice(null)
  }

  useEffect(() => {
    if (isFormDirty) return
    hydrateSelectedChannelForm(selectedChannelId)
  }, [config, selectedChannelId, isFormDirty])

  useEffect(() => {
    if (formNotice?.type !== 'success') return
    const timeoutId = window.setTimeout(() => {
      setFormNotice((current) => (current?.type === 'success' ? null : current))
    }, 2200)

    return () => window.clearTimeout(timeoutId)
  }, [formNotice])

  const channelConnections = useMemo<ConnectionRowData[]>(() => {
    return SUPPORTED_CHANNELS.flatMap((channel): ConnectionRowData[] => {
      const rawConfig = config?.channels?.[channel.id]
      const hasPluginEntry = config?.plugins?.entries?.[channel.id] !== undefined
      if (!isRecord(rawConfig) && !hasPluginEntry) return []

      const status = resolveMessagingStatus(channel.id, config ?? null, gatewayOnline)

      return [
        {
          id: channel.id,
          icon: channel.icon,
          name: channel.name,
          type: isRecord(rawConfig) ? formatChannelType(channel.id, rawConfig) : 'Plugin configured',
          status,
          error: status === 'error' && !gatewayOnline ? 'Gateway is offline' : undefined
        }
      ]
    })
  }, [config, gatewayOnline])

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

  const selectedMessagingStatus = useMemo(
    () => resolveMessagingStatus(selectedChannelId, config ?? null, gatewayOnline),
    [config, gatewayOnline, selectedChannelId]
  )

  const selectedPluginDisabled =
    config?.plugins?.entries?.[selectedChannelId] !== undefined &&
    config?.plugins?.entries?.[selectedChannelId]?.enabled === false

  const hasPendingChanges = useMemo(() => {
    return selectedChannel.fields.some((field) => {
      const current = (formValues[field.key] ?? '').trim()
      const original = (originalValues[field.key] ?? '').trim()
      const redacted = redactedFields[field.key] === true
      if (redacted && current.length === 0) return false
      return current !== original
    })
  }, [formValues, originalValues, redactedFields, selectedChannel])

  const connectionSections = useMemo<ConnectionSectionData[]>(() => {
    return [
      {
        id: 'messaging',
        title: 'Messaging',
        description: 'Channels your agent can talk through',
        icon: MessageCircle,
        connections: channelConnections,
        emptyLabel: 'No messaging integrations configured yet.'
      },
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
  }, [channelConnections, mcpConnections, pairedNodeConnections])

  const loading = configLoading || mcpLoading || nodesLoading
  const hasConnections =
    channelConnections.length > 0 || mcpConnections.length > 0 || pairedNodeConnections.length > 0

  const setFieldValue = (key: string, value: string) => {
    setFormValues((prev) => ({ ...prev, [key]: value }))
    setIsFormDirty(true)
    setFieldErrors((prev) => {
      if (!prev[key]) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
    setFormNotice(null)
  }

  const validateSelectedChannelForm = (): boolean => {
    const nextErrors: Record<string, string> = {}

    selectedChannel.fields.forEach((field) => {
      const value = (formValues[field.key] ?? '').trim()
      const redacted = redactedFields[field.key] === true

      if (field.required && !value && !redacted) {
        nextErrors[field.key] = `${field.label} is required.`
        return
      }

      if (!value) return
      const validationMessage = field.validator?.(value)
      if (validationMessage) {
        nextErrors[field.key] = validationMessage
      }
    })

    setFieldErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const handleSaveSelectedChannel = async () => {
    if (!validateSelectedChannelForm()) return

    const existingRaw = config?.channels?.[selectedChannel.id]
    const existingChannel = isRecord(existingRaw) ? existingRaw : {}
    const nextChannel: Record<string, unknown> = { ...existingChannel }

    selectedChannel.fields.forEach((field) => {
      const value = (formValues[field.key] ?? '').trim()
      const original = (originalValues[field.key] ?? '').trim()
      const redacted = redactedFields[field.key] === true

      if (redacted && value.length === 0) return
      if (value.length === 0) return
      if (value === original) return

      nextChannel[field.key] = toConfigValue(field, value)
    })

    const enabledField = selectedChannel.fields.find((field) => field.key === 'enabled')
    const enabledValue = enabledField
      ? toConfigValue(enabledField, (formValues.enabled ?? '').trim())
      : true

    try {
      await updateConfig.mutateAsync({
        channels: {
          [selectedChannel.id]: nextChannel
        },
        plugins: {
          entries: {
            [selectedChannel.id]: { enabled: enabledValue !== false }
          }
        }
      })

      setIsFormDirty(false)
      setFieldErrors({})
      setFormNotice({ type: 'success', message: `${selectedChannel.name} settings saved.` })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save connection settings.'
      setFormNotice({ type: 'error', message })
    }
  }

  const quickConfigure = (channelId: SupportedChannelId) => {
    setSelectedChannelId(channelId)
    setIsFormDirty(false)
    setFieldErrors({})
    setFormNotice(null)

    const target = document.getElementById('connections-quick-config')
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

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
                      Connect messaging channels, MCP servers, and companion services. You can also ask your agent in Chat to help set these up.
                    </p>
                  </div>
                  <Button onClick={onAddConnection} className="gap-1.5">
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

            {!loading && !hasConnections && (
              <motion.div variants={item}>
                <EmptyState
                  onAddConnection={onAddConnection}
                  onQuickConfigure={() => quickConfigure('slack')}
                />
              </motion.div>
            )}

            <motion.div variants={item} id="connections-quick-config">
              <Card className="border-border/80 bg-surface/80">
                <CardHeader>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-base">Quick Configure Messaging</CardTitle>
                      <CardDescription>
                        Update core channel settings directly here. Advanced options remain available in Settings.
                      </CardDescription>
                    </div>
                    <Badge variant={statusMeta(selectedMessagingStatus).variant} className="gap-1.5">
                      <span
                        className={cn(
                          'h-1.5 w-1.5 rounded-full',
                          statusMeta(selectedMessagingStatus).dotClassName
                        )}
                      />
                      {statusMeta(selectedMessagingStatus).label}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="channel-select">Channel</Label>
                      <Select
                        value={selectedChannelId}
                        onValueChange={(value) => {
                          setSelectedChannelId(value as SupportedChannelId)
                          setIsFormDirty(false)
                          setFieldErrors({})
                          setFormNotice(null)
                        }}
                      >
                        <SelectTrigger id="channel-select" className="bg-surface-2">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SUPPORTED_CHANNELS.map((channel) => (
                            <SelectItem key={channel.id} value={channel.id}>
                              {channel.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="rounded-lg border border-border bg-surface-2 p-3">
                      <p className="text-sm font-medium text-text-primary">{selectedChannel.name}</p>
                      <p className="mt-1 text-xs text-text-muted">{selectedChannel.description}</p>
                      {SETUP_GUIDE_URLS[selectedChannelId] && (
                        <a
                          href={SETUP_GUIDE_URLS[selectedChannelId]}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-2 inline-flex items-center gap-1 text-xs text-accent hover:underline"
                        >
                          Setup guide →
                        </a>
                      )}
                    </div>
                  </div>

                  <motion.div variants={listContainer} className="grid gap-4 md:grid-cols-2">
                    {selectedChannel.fields.map((field) => {
                      const value = formValues[field.key] ?? ''
                      const hasError = Boolean(fieldErrors[field.key])
                      const redacted = redactedFields[field.key] === true

                      return (
                        <motion.div key={field.key} variants={listItem} className="space-y-1.5">
                          <Label htmlFor={`${selectedChannel.id}-${field.key}`}>{field.label}</Label>

                          {field.type === 'select' ? (
                            <Select value={value} onValueChange={(nextValue) => setFieldValue(field.key, nextValue)}>
                              <SelectTrigger
                                id={`${selectedChannel.id}-${field.key}`}
                                className={cn('bg-surface-2', hasError && 'border-red-500 focus:ring-red-500')}
                              >
                                <SelectValue placeholder="Select an option" />
                              </SelectTrigger>
                              <SelectContent>
                                {(field.options ?? []).map((option) => (
                                  <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <Input
                              id={`${selectedChannel.id}-${field.key}`}
                              type={field.type}
                              value={value}
                              placeholder={
                                redacted && !value ? 'Configured (enter to replace)' : field.placeholder
                              }
                              onChange={(event) => setFieldValue(field.key, event.target.value)}
                              className={cn('bg-surface-2', hasError && 'border-red-500 focus-visible:ring-red-500')}
                            />
                          )}

                          {field.description && (
                            <p className="text-xs text-text-muted">{field.description}</p>
                          )}
                          {redacted && !value && (
                            <p className="text-xs text-text-muted">A value is already configured and hidden.</p>
                          )}
                          {hasError && <p className="text-xs text-red-400">{fieldErrors[field.key]}</p>}
                        </motion.div>
                      )
                    })}
                  </motion.div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      onClick={handleSaveSelectedChannel}
                      disabled={updateConfig.isPending || (!hasPendingChanges && !selectedPluginDisabled)}
                      className="gap-1.5"
                    >
                      {updateConfig.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : formNotice?.type === 'success' ? (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      ) : (
                        <Save className="h-3.5 w-3.5" />
                      )}
                      {updateConfig.isPending ? 'Saving...' : 'Save Changes'}
                    </Button>

                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        setIsFormDirty(false)
                        hydrateSelectedChannelForm(selectedChannelId)
                      }}
                      disabled={updateConfig.isPending || !hasPendingChanges}
                    >
                      Reset
                    </Button>

                    <AnimatePresence initial={false}>
                      {formNotice && (
                        <motion.div
                          key={formNotice.message}
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          className={cn(
                            'inline-flex items-center gap-1.5 text-sm',
                            formNotice.type === 'success' ? 'text-emerald-400' : 'text-red-400'
                          )}
                        >
                          {formNotice.type === 'success' ? (
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          ) : (
                            <AlertCircle className="h-3.5 w-3.5" />
                          )}
                          {formNotice.message}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {!loading && (
              <motion.div variants={item} className="grid gap-4 xl:grid-cols-3">
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
