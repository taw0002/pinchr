import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Activity,
  AlertCircle,
  Bot,
  Check,
  CheckCircle,
  CheckCircle2,
  Cpu,
  Eye,
  Globe,
  Hash,
  Loader2,
  Mail,
  MessageCircle,
  MessageSquare,
  Monitor,
  MousePointer,
  Phone,
  Radio,
  TerminalSquare,
  Play,
  PlaySquare,
  RotateCw,
  Settings,
  Send,
  Tv,
  Users,
  Wrench,
  XCircle,
  Zap
} from 'lucide-react'
import { Streamdown } from 'streamdown'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { useGatewayHealth, useSessions, useCronList, useStreamMessage, useStartGateway, useRestartGateway, useGatewayConfig } from '@/hooks/useGateway'
import { useQuery } from '@tanstack/react-query'
import { CompactActivityLog } from '@/components/ActivityLog'
import UsageDashboard from '@/components/UsageDashboard'
import type { Page } from '@/types/navigation'
import type { GatewayConfig } from '../../../shared/types'

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.05 }
  }
}

const item = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0 }
}

interface ComputerPermissions {
  screenRecording: boolean
  accessibility: boolean
  peekabooInstalled: boolean
}

const DASHBOARD_ASSISTANT_SESSION_KEY = 'agent:main:openai-user:pinchr-dashboard-guide'
const DASHBOARD_ASSISTANT_USER = 'pinchr-dashboard-guide'

const SUGGESTED_QUERIES = [
  'Connect Slack and start using it with my assistant',
  'Set up a daily morning summary automation',
  'Build a skill and then connect it to my task flow',
  'Make computer use work on my Mac',
  'Best way to debug why messages are not sending'
]

type ChannelIconType = typeof MessageSquare
type AgentListItem = { id: string; name?: string; configured?: boolean }

interface ChannelHealthItem {
  id: string
  label: string
  icon: ChannelIconType
  requiredFields?: string[]
}

const CHANNEL_HEALTH_ITEMS: ChannelHealthItem[] = [
  { id: 'slack', label: 'Slack', icon: Hash, requiredFields: ['botToken', 'appToken'] },
  { id: 'telegram', label: 'Telegram', icon: Send, requiredFields: ['botToken'] },
  { id: 'discord', label: 'Discord', icon: MessageSquare, requiredFields: ['botToken'] },
  { id: 'signal', label: 'Signal', icon: Phone, requiredFields: ['phoneNumber'] },
  { id: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
  { id: 'imessage', label: 'iMessage', icon: MessageCircle },
  { id: 'googlechat', label: 'Google Chat', icon: Mail, requiredFields: ['credentialsPath'] },
  { id: 'msteams', label: 'Microsoft Teams', icon: Users, requiredFields: ['appId', 'appPassword'] },
  { id: 'matrix', label: 'Matrix', icon: Globe, requiredFields: ['homeserver', 'accessToken'] },
  { id: 'mattermost', label: 'Mattermost', icon: Monitor, requiredFields: ['url', 'token'] },
  { id: 'twitch', label: 'Twitch', icon: Tv, requiredFields: ['username', 'oauthToken'] },
  { id: 'line', label: 'LINE', icon: MessageSquare, requiredFields: ['channelAccessToken', 'channelSecret'] },
  { id: 'nostr', label: 'Nostr', icon: Radio, requiredFields: ['privateKey'] }
]

const DEFAULT_AGENT_NAME = 'OpenClaw Agent'
const DEFAULT_AGENT_EMOJI = '🤖'

export default function Dashboard({ onNavigate }: { onNavigate?: (page: Page) => void }) {
  const { data: health, isLoading: healthLoading } = useGatewayHealth()
  const { data: sessions, isLoading: sessionsLoading } = useSessions()
  const { data: config, isLoading: configLoading } = useGatewayConfig()
  const { mutate: streamMessage } = useStreamMessage()
  const startGateway = useStartGateway()
  const restartGateway = useRestartGateway()
  const [permissions, setPermissions] = useState<ComputerPermissions | null>(null)
  const [checkingPermissions, setCheckingPermissions] = useState(true)
  const [waitingForPermissionGrant, setWaitingForPermissionGrant] = useState(false)
  const [relaunchingAfterGrant, setRelaunchingAfterGrant] = useState(false)
  const [assistantQuery, setAssistantQuery] = useState('')
  const [assistantAnswer, setAssistantAnswer] = useState('')
  const [assistantBusy, setAssistantBusy] = useState(false)
  const [assistantError, setAssistantError] = useState<string | null>(null)
  const waitingForPermissionGrantRef = useRef(false)
  const relaunchingAfterGrantRef = useRef(false)
  const greeting = useMemo(() => getGreeting(new Date()), [])

  const updatePermissionState = (next: ComputerPermissions | null) => {
    if (!next) return

    setPermissions(next)

    const ready = next.screenRecording && next.accessibility && next.peekabooInstalled
    if (!ready || !waitingForPermissionGrantRef.current || relaunchingAfterGrantRef.current) {
      return
    }

    relaunchingAfterGrantRef.current = true
    setRelaunchingAfterGrant(true)
    // Relaunch once permissions are detected so macOS screen capture state refreshes immediately.
    setTimeout(() => {
      void window.api.permissions.relaunch()
    }, 500)
  }

  const isOnline = !!health
  const sessionCount = sessions?.length ?? 0
  const hasPermissionsData = permissions !== null
  const isGatewayPending = healthLoading || startGateway.isPending

  const { data: identityDoc, isLoading: identityLoading } = useQuery({
    queryKey: ['dashboard', 'identity-doc'],
    queryFn: async (): Promise<string | null> => {
      const result = await window.api.files.read('IDENTITY.md')
      if (!result.ok) return null
      return result.data ?? null
    },
    staleTime: 60_000,
    refetchInterval: 120_000
  })

  const { data: agents, isLoading: agentsLoading } = useQuery({
    queryKey: ['dashboard', 'agents-list'],
    queryFn: async (): Promise<AgentListItem[]> => {
      const result = await window.api.gateway.getAgentsList()
      if (!result.ok || !Array.isArray(result.data)) return []
      return result.data
    },
    enabled: isOnline,
    refetchInterval: 60_000
  })

  const { data: sessionStatus } = useQuery({
    queryKey: ['dashboard', 'session-status'],
    queryFn: async () => {
      const result = await window.api.gateway.getSessionStatus()
      if (!result.ok || !result.data) return null
      return result.data as { openclawVersion?: string } | null
    },
    enabled: isOnline,
    refetchInterval: 15_000
  })

  const displayOpenclawVersion = sessionStatus?.openclawVersion || 'Unknown'
  const agentIdentity = useMemo(() => resolveAgentIdentity(identityDoc, agents), [identityDoc, agents])
  const channelHealth = useMemo(
    () => CHANNEL_HEALTH_ITEMS.map((channel) => ({ ...channel, configured: isChannelConfigured(config, channel) })),
    [config]
  )
  const configuredChannelCount = channelHealth.filter((channel) => channel.configured).length
  const hasAgents = Array.isArray(agents) && agents.length > 0
  const agentLoading = (identityLoading && !identityDoc) || (isOnline && agentsLoading && !hasAgents)

  useEffect(() => {
    waitingForPermissionGrantRef.current = waitingForPermissionGrant
  }, [waitingForPermissionGrant])

  useEffect(() => {
    const checkPermissions = async () => {
      try {
        const result = await window.api.computer.checkPermissions()
        if (result.ok && result.data) {
          updatePermissionState({
            screenRecording: result.data.screenRecording ?? false,
            accessibility: result.data.accessibility ?? false,
            peekabooInstalled: result.data.peekabooInstalled ?? false
          })
        }
      } catch (error) {
        console.error('Failed to check permissions:', error)
      } finally {
        setCheckingPermissions(false)
      }
    }

    checkPermissions()
    const interval = setInterval(checkPermissions, 3000)
    const onFocus = () => {
      void checkPermissions()
    }
    window.addEventListener('focus', onFocus)
    return () => {
      clearInterval(interval)
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  const allPermissionsGranted =
    permissions?.screenRecording && permissions?.accessibility && permissions?.peekabooInstalled

  const handleCheckPermissions = async () => {
    setCheckingPermissions(true)
    try {
      const result = await window.api.computer.checkPermissions()
      if (result.ok && result.data) {
        updatePermissionState({
          screenRecording: result.data.screenRecording ?? false,
          accessibility: result.data.accessibility ?? false,
          peekabooInstalled: result.data.peekabooInstalled ?? false
        })
      }
    } catch (error) {
      console.error('Failed to check permissions:', error)
    } finally {
      setCheckingPermissions(false)
    }
  }

  const handleOpenSettings = async (type: 'screenRecording' | 'accessibility') => {
    try {
      setWaitingForPermissionGrant(true)
      waitingForPermissionGrantRef.current = true
      // Prime permission checks so Pinchr appears in the macOS list before opening settings.
      await window.api.permissions.check()
      await window.api.permissions.openSettings(type)
    } catch (error) {
      console.error('Failed to open settings:', error)
    }
  }

  const buildAssistantPrompt = (query: string): string => {
    return `You are the Pinchr onboarding and operations guide.

Goal:
- Help the user accomplish tasks inside Pinchr and OpenClaw as easily as possible.
- Prefer clear step-by-step instructions and specific page names in Pinchr.
- When relevant, include an OpenClaw CLI fallback command.

Pinchr app areas:
- Dashboard: status, quick actions, readiness checks.
- Connections: channel and integration setup.
- Automations: scheduled jobs and recurring tasks.
- Skills: workspace skills and marketplace discovery.
- Settings: gateway/model/update and configuration.
- Sessions: inspect active gateway sessions and process activity.
- Chat: direct interaction with the assistant.

Output format:
1) "Fastest path in Pinchr" (3-7 steps max)
2) "If needed via OpenClaw CLI"
3) "Verify success"

User request:
${query}`
  }

  const askAssistant = (query: string) => {
    const trimmed = query.trim()
    if (!trimmed) return
    if (!isOnline) {
      setAssistantError('Gateway is offline. Start OpenClaw gateway to use the assistant.')
      return
    }

    setAssistantBusy(true)
    setAssistantError(null)
    setAssistantAnswer('')

    try {
      streamMessage(
        {
          sessionKey: DASHBOARD_ASSISTANT_SESSION_KEY,
          sessionUser: DASHBOARD_ASSISTANT_USER,
          message: buildAssistantPrompt(trimmed),
          onChunk: (payload) => {
            if (payload?.content) {
              setAssistantAnswer((prev) => prev + payload.content)
            }
            if (payload?.done) {
              setAssistantBusy(false)
            }
          }
        },
        {
          onError: (error) => {
            setAssistantBusy(false)
            const errorMessage = error instanceof Error ? error.message : 'Failed to get answer'
            setAssistantError(errorMessage)
          }
        }
      )
    } catch (error) {
      setAssistantBusy(false)
      const errorMessage = error instanceof Error ? error.message : 'Failed to send request'
      setAssistantError(errorMessage)
    }
  }

  return (
    <ScrollArea className="h-full">
      <div className="px-6 pb-10 pt-9 md:px-8">
        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="mx-auto max-w-6xl space-y-5"
        >
          <motion.div variants={item}>
            <p className="text-sm font-medium text-accent">{greeting}</p>
            <h1 className="mt-1 text-2xl font-bold text-text-primary">Dashboard</h1>
            <p className="mt-1 text-text-secondary">
              Clean operational overview. Configure deeper options in Settings, Connections, and Automations.
            </p>
          </motion.div>

          {checkingPermissions && (
            <motion.div variants={item}>
              <Card className="p-0">
                <CardContent className="flex min-h-[84px] items-center gap-4 px-5 py-4">
                  <SkeletonBlock className="h-11 w-11 rounded-xl" />
                  <div className="flex-1 space-y-2">
                    <SkeletonBlock className="h-3 w-44" />
                    <SkeletonBlock className="h-3 w-72 max-w-full" />
                  </div>
                  <SkeletonBlock className="h-8 w-24 rounded-lg" />
                </CardContent>
              </Card>
            </motion.div>
          )}

          {!checkingPermissions && hasPermissionsData && (
            <motion.div variants={item}>
              {allPermissionsGranted ? (
                <Card className="border-accent/30 bg-accent/5 p-0">
                  <CardContent className="flex min-h-[84px] items-center gap-4 px-5 py-4">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/15">
                      <CheckCircle className="h-5 w-5 text-accent" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-text-primary">Computer Use Ready</p>
                      <p className="text-xs text-text-secondary mt-0.5">
                        Screen + accessibility permissions are enabled.
                      </p>
                    </div>
                    <Button variant="secondary" size="sm" onClick={() => onNavigate?.('settings')}>
                      <Settings className="h-3.5 w-3.5 mr-1.5" />
                      Settings
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <Card className="border-orange-500/30 bg-orange-500/5 p-0">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <AlertCircle className="h-4 w-4 text-orange-400" />
                        Finish Computer Setup
                      </CardTitle>
                      <Button size="sm" variant="outline" onClick={handleCheckPermissions} disabled={relaunchingAfterGrant}>
                        Check Again
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <PermissionRow
                      icon={Monitor}
                      label="Screen Recording"
                      description="Required for seeing screen content"
                      granted={permissions?.screenRecording ?? false}
                      onGrant={() => handleOpenSettings('screenRecording')}
                    />
                    <PermissionRow
                      icon={MousePointer}
                      label="Accessibility"
                      description="Required for keyboard and mouse control"
                      granted={permissions?.accessibility ?? false}
                      onGrant={() => handleOpenSettings('accessibility')}
                    />
                    {!permissions?.peekabooInstalled && (
                      <div className="flex items-center justify-between p-3 rounded-lg bg-surface-2">
                        <div className="flex items-center gap-3">
                          <Eye className="h-4 w-4 text-orange-400" />
                          <div>
                            <p className="text-sm font-medium text-text-primary">Peekaboo</p>
                            <p className="text-xs text-text-secondary">Screen helper is missing</p>
                          </div>
                        </div>
                        <Badge variant="warning">Install needed</Badge>
                      </div>
                    )}
                    {waitingForPermissionGrant && !relaunchingAfterGrant && (
                      <p className="text-xs text-text-secondary">
                        After you enable permissions in System Settings, Pinchr will relaunch automatically to refresh.
                      </p>
                    )}
                    {relaunchingAfterGrant && (
                      <p className="text-xs text-accent">
                        Permissions detected. Relaunching Pinchr...
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}
            </motion.div>
          )}

          {/* Prominent offline banner with Start button */}
          {!healthLoading && !isOnline && (
            <motion.div variants={item}>
              <Card className="border-red-500/30 bg-red-500/5 p-0">
                <CardContent className="flex items-center gap-4 py-5">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-500/15">
                    <XCircle className="h-6 w-6 text-red-400" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-text-primary">Gateway is Offline</p>
                    <p className="text-xs text-text-secondary mt-0.5">
                      Start the OpenClaw gateway to use chat, automations, and all agent features.
                    </p>
                  </div>
                  <Button
                    size="default"
                    onClick={() => startGateway.mutate()}
                    disabled={startGateway.isPending}
                    className="gap-2"
                  >
                    {startGateway.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                    {startGateway.isPending ? 'Starting…' : 'Start Gateway'}
                  </Button>
                </CardContent>
                {startGateway.isError && (
                  <div className="px-6 pb-4">
                    <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-sm text-red-300">
                      Failed to start: {startGateway.error?.message || 'Unknown error'}
                    </div>
                  </div>
                )}
              </Card>
            </motion.div>
          )}

          <SectionDivider title="Live Status" />

          <motion.div variants={container} className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <motion.div variants={item}>
              <Card className={cn('h-full p-0 transition-all duration-200', isOnline && 'shadow-glow-sm')}>
                <CardContent className="flex min-h-[132px] items-center gap-4 px-5 py-4">
                  <div className={cn('flex h-11 w-11 items-center justify-center rounded-xl', isOnline ? 'bg-accent/15' : 'bg-red-500/15')}>
                    {isOnline ? <CheckCircle2 className="h-5 w-5 text-accent" /> : <XCircle className="h-5 w-5 text-red-400" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-text-secondary">Gateway</p>
                    {isGatewayPending ? (
                      <SkeletonBlock className="mt-2 h-5 w-28" />
                    ) : (
                      <p className="text-base font-semibold text-text-primary">{isOnline ? 'Online' : 'Offline'}</p>
                    )}
                    {isOnline && (
                      <p className="mt-1 truncate text-xs font-mono text-text-muted">
                        {displayOpenclawVersion} (external gateway)
                      </p>
                    )}
                  </div>
                  {isOnline && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => restartGateway.mutate()}
                      disabled={restartGateway.isPending}
                      className="h-8 w-8 shrink-0 p-0"
                      title="Restart Gateway"
                    >
                      <RotateCw className={cn('h-3.5 w-3.5', restartGateway.isPending && 'animate-spin')} />
                    </Button>
                  )}
                </CardContent>
              </Card>
            </motion.div>

            <motion.div variants={item}>
              <Card className="h-full p-0">
                <CardContent className="flex min-h-[132px] items-center gap-4 px-5 py-4">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-surface-2 text-lg">
                    {agentIdentity.emoji}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-text-secondary">Agent</p>
                    {agentLoading ? (
                      <SkeletonBlock className="mt-2 h-5 w-36" />
                    ) : (
                      <p className="truncate text-base font-semibold text-text-primary">{agentIdentity.name}</p>
                    )}
                    <div className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-text-secondary">
                      <span className={cn('h-2 w-2 rounded-full', isOnline ? 'bg-accent animate-pulse' : 'bg-red-400')} />
                      {isOnline ? 'alive' : 'idle'}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div variants={item}>
              <Card className="h-full p-0">
                <CardContent className="flex min-h-[132px] items-center gap-4 px-5 py-4">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-500/15">
                    <Cpu className="h-5 w-5 text-blue-400" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-text-secondary">Active Sessions</p>
                    {sessionsLoading ? (
                      <SkeletonBlock className="mt-2 h-5 w-10" />
                    ) : (
                      <p className="text-base font-semibold text-text-primary">{sessionCount}</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div variants={item}>
              <CronJobsCard />
            </motion.div>
          </motion.div>

          <motion.div variants={item}>
            <Card className="p-0">
              <CardContent className="space-y-3 px-5 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-text-primary">Connection Health</p>
                    <p className="text-xs text-text-secondary">
                      {configuredChannelCount}/{CHANNEL_HEALTH_ITEMS.length} channels configured
                    </p>
                  </div>
                  <Button variant="secondary" size="sm" onClick={() => onNavigate?.('connections')}>
                    <Wrench className="mr-1.5 h-3.5 w-3.5" />
                    Manage
                  </Button>
                </div>

                {configLoading ? (
                  <div className="flex flex-wrap gap-2">
                    {CHANNEL_HEALTH_ITEMS.map((channel) => (
                      <SkeletonBlock key={channel.id} className="h-10 w-10 rounded-xl" />
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {channelHealth.map((channel) => {
                      const Icon = channel.icon
                      return (
                        <div key={channel.id} className="group relative">
                          <div
                            title={`${channel.label} ${channel.configured ? 'configured' : 'not configured'}`}
                            className={cn(
                              'relative flex h-10 w-10 items-center justify-center rounded-xl border transition-colors',
                              channel.configured
                                ? 'border-accent/40 bg-accent/10 text-accent'
                                : 'border-border bg-surface-2 text-text-secondary'
                            )}
                          >
                            <Icon className="h-4 w-4" />
                            {channel.configured && (
                              <span className="absolute -right-1 -top-1 rounded-full border border-accent/20 bg-accent/90 p-0.5 text-white">
                                <Check className="h-2.5 w-2.5" />
                              </span>
                            )}
                          </div>
                          <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 rounded bg-surface-3 px-2 py-1 text-[10px] text-text-secondary opacity-0 shadow-sm transition-opacity group-hover:opacity-100">
                            {channel.label}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>

          <SectionDivider title="Assistant" />

          <motion.div variants={item}>
            <Card className="p-0">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Bot className="h-4 w-4 text-accent" />
                  What do you want to do?
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 px-6 pb-6">
                <p className="text-sm text-text-secondary">
                  Ask in plain English. Pinchr will tell you the quickest way to do it in-app, plus OpenClaw fallback steps.
                </p>
                <Separator />

                <div className="space-y-2">
                  <Textarea
                    value={assistantQuery}
                    onChange={(e) => setAssistantQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        askAssistant(assistantQuery)
                      }
                    }}
                    placeholder="Example: I want daily summaries in Slack at 8am"
                    className="min-h-[90px]"
                  />
                  <div className="flex items-center justify-end">
                    <Button
                      size="sm"
                      onClick={() => askAssistant(assistantQuery)}
                      disabled={assistantBusy || !assistantQuery.trim()}
                    >
                      <Send className="h-3.5 w-3.5 mr-1.5" />
                      {assistantBusy ? 'Thinking...' : 'Get Plan'}
                    </Button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  {SUGGESTED_QUERIES.map((query) => (
                    <button
                      key={query}
                      className="text-xs rounded-full border border-border bg-surface-2 px-3 py-1.5 text-text-secondary hover:text-text-primary hover:bg-surface-3 transition-colors"
                      onClick={() => {
                        setAssistantQuery(query)
                        askAssistant(query)
                      }}
                    >
                      {query}
                    </button>
                  ))}
                </div>

                {assistantError && (
                  <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                    {assistantError}
                  </div>
                )}

                {(assistantBusy || assistantAnswer.trim()) && (
                  <div className="rounded-lg border border-border bg-surface-2 p-3">
                    <div className="select-text text-sm leading-relaxed text-text-primary">
                      <Streamdown mode="streaming" isAnimating={assistantBusy}>
                        {assistantAnswer || 'Working on it...'}
                      </Streamdown>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>

          <SectionDivider title="Execution" />

          <motion.div variants={container} className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <motion.div variants={item}>
              <Card className="h-full p-0">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Zap className="h-4 w-4 text-accent" />
                    Quick Actions
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-2 px-6 pb-6">
                  <QuickAction
                    icon={MessageSquare}
                    label="Open Chat"
                    tooltip="Start a direct conversation with your assistant."
                    onClick={() => onNavigate?.('chat')}
                  />
                  <QuickAction
                    icon={PlaySquare}
                    label="Sessions"
                    tooltip="Review active and recent session activity."
                    onClick={() => onNavigate?.('sessions')}
                  />
                  <QuickAction
                    icon={TerminalSquare}
                    label="Open Terminal"
                    tooltip="Jump into the embedded terminal workspace."
                    onClick={() => onNavigate?.('terminal')}
                  />
                  <QuickAction
                    icon={Wrench}
                    label="Connections"
                    tooltip="Connect channels and integration endpoints."
                    onClick={() => onNavigate?.('connections')}
                  />
                  <QuickAction
                    icon={Activity}
                    label="Automations"
                    tooltip="Create and manage scheduled agent workflows."
                    onClick={() => onNavigate?.('automations')}
                  />
                  <QuickAction
                    icon={Settings}
                    label="Settings"
                    tooltip="Configure runtime, model, and app behavior."
                    onClick={() => onNavigate?.('settings')}
                  />
                </CardContent>
              </Card>
            </motion.div>

            <motion.div variants={item}>
              <CompactActivityLog
                limit={10}
                onViewAll={() => onNavigate?.('sessions')}
              />
            </motion.div>
          </motion.div>

          <SectionDivider title="Usage" />

          <motion.div variants={item}>
            <UsageDashboard />
          </motion.div>
        </motion.div>
      </div>
    </ScrollArea>
  )
}

function PermissionRow({
  icon: Icon,
  label,
  description,
  granted,
  onGrant
}: {
  icon: typeof Monitor
  label: string
  description: string
  granted: boolean
  onGrant: () => void
}) {
  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-surface-2">
      <div className="flex items-center gap-3">
        <Icon className={cn('h-4 w-4', granted ? 'text-accent' : 'text-orange-400')} />
        <div>
          <p className="text-sm font-medium text-text-primary">{label}</p>
          <p className="text-xs text-text-secondary">{description}</p>
        </div>
      </div>
      {granted ? (
        <Badge variant="success">Granted</Badge>
      ) : (
        <Button size="sm" variant="outline" onClick={onGrant}>
          Grant
        </Button>
      )}
    </div>
  )
}

function CronJobsCard() {
  const { data: jobs, isLoading } = useCronList(15000)
  const activeCount = (jobs ?? []).filter((j) => j.enabled).length
  const totalCount = (jobs ?? []).length

  return (
    <Card className="h-full p-0">
      <CardContent className="flex min-h-[132px] items-center gap-4 px-5 py-4">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-purple-500/15">
          <Zap className="h-5 w-5 text-purple-400" />
        </div>
        <div className="flex-1">
          <p className="text-sm text-text-secondary">Automations</p>
          {isLoading ? (
            <SkeletonBlock className="mt-2 h-5 w-28" />
          ) : (
            <p className="text-base font-semibold text-text-primary">
              {totalCount > 0 ? `${activeCount}/${totalCount} active` : 'None configured'}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function QuickAction({
  icon: Icon,
  label,
  tooltip,
  onClick
}: {
  icon: typeof MessageSquare
  label: string
  tooltip?: string
  onClick?: () => void
}) {
  return (
    <div className="group relative">
      <Button
        variant="ghost"
        className="h-auto w-full flex-col gap-2 py-3 hover:bg-surface-2"
        onClick={onClick}
        title={tooltip || label}
      >
        <Icon className="h-4 w-4 text-text-secondary" />
        <span className="text-xs text-text-secondary">{label}</span>
      </Button>
      <span className="pointer-events-none absolute -top-8 left-1/2 z-10 w-max max-w-[220px] -translate-x-1/2 rounded bg-surface-3 px-2 py-1 text-[10px] text-text-secondary opacity-0 shadow-sm transition-opacity group-hover:opacity-100">
        {tooltip || label}
      </span>
    </div>
  )
}

function SectionDivider({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-3 px-1">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">{title}</p>
      <Separator className="bg-border/70" />
    </div>
  )
}

function SkeletonBlock({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-surface-2', className)} />
}

function getGreeting(now: Date): string {
  const hour = now.getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

function resolveAgentIdentity(identityDoc: string | null | undefined, agents: AgentListItem[] | undefined) {
  const parsed = parseIdentityDoc(identityDoc)
  const preferredAgent = agents?.find((agent) => agent.configured) ?? agents?.[0]
  const fallbackName = sanitizeText(preferredAgent?.name) ?? sanitizeText(preferredAgent?.id) ?? DEFAULT_AGENT_NAME

  return {
    name: parsed.name ?? fallbackName,
    emoji: parsed.emoji ?? DEFAULT_AGENT_EMOJI
  }
}

function parseIdentityDoc(content: string | null | undefined): { name?: string; emoji?: string } {
  if (!content) return {}

  const lines = content.split(/\r?\n/)
  const nameLine = lines.find((line) => /^name\s*:/i.test(line.trim()))
  const emojiLine = lines.find((line) => /^(emoji|avatar)\s*:/i.test(line.trim()))
  const headingLine = lines.find((line) => /^#{1,2}\s+/.test(line.trim()))

  const explicitName = sanitizeText(nameLine?.replace(/^name\s*:\s*/i, ''))
  const explicitEmoji = sanitizeEmoji(emojiLine?.replace(/^(emoji|avatar)\s*:\s*/i, ''))

  if (explicitName || explicitEmoji) {
    return { name: explicitName, emoji: explicitEmoji }
  }

  if (!headingLine) return {}

  const headingText = headingLine.replace(/^#{1,2}\s+/, '').trim()
  const headingEmoji = sanitizeEmoji(headingText)
  const headingName = sanitizeText(headingText.replace(/[\u{1F300}-\u{1FAFF}\u2600-\u27BF]/gu, ''))

  return { name: headingName, emoji: headingEmoji }
}

function sanitizeText(value: string | undefined): string | undefined {
  if (!value) return undefined
  const cleaned = value.replace(/[`*_#]/g, '').trim()
  return cleaned.length > 0 ? cleaned : undefined
}

function sanitizeEmoji(value: string | undefined): string | undefined {
  if (!value) return undefined
  const match = value.match(/[\u{1F300}-\u{1FAFF}\u2600-\u27BF]/u)
  return match?.[0]
}

function isChannelConfigured(config: GatewayConfig | null | undefined, channel: ChannelHealthItem): boolean {
  const channelConfig = config?.channels?.[channel.id]
  const pluginEnabled = config?.plugins?.entries?.[channel.id]?.enabled

  if (!channelConfig && !pluginEnabled) return false
  if (pluginEnabled === false) return false
  if (channelConfig?.enabled === false) return false

  const requiredFields = channel.requiredFields ?? []
  return requiredFields.every((field) => hasConfiguredValue((channelConfig as Record<string, unknown> | undefined)?.[field]))
}

function hasConfiguredValue(value: unknown): boolean {
  if (typeof value === 'string') return value.trim().length > 0
  if (Array.isArray(value)) return value.length > 0
  return value !== undefined && value !== null
}
