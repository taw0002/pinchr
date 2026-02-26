import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import {
  Settings as SettingsIcon,
  RotateCw,
  Save,
  CheckCircle2,
  Loader2,
  Server,
  ExternalLink,
  Info,
  Heart,
  Download,
  RefreshCw,
  Smartphone,
  Shield,
  Brain,
  AlertTriangle,
  Zap,
  ShieldCheck,
  HardDrive,
  Search,
  Link2,
  Unplug,
  Wifi,
  WifiOff,
  Wrench,
  KeyRound,
  Flag,
  BarChart3
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { useGatewayHealth } from '@/hooks/useGateway'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { ReportIssue } from '@/components/ReportIssue'
import { PermissionGuide } from '@/components/PermissionGuide'
import { ApiModeSelector } from '@/components/ApiModeSelector'
import { ProviderManager } from '@/components/ProviderManager'
import { ModelSelector } from '@/components/ModelSelector'
import { useWorkMode } from '@/hooks/useWorkMode'
import { useAiProxy } from '@/hooks/useAiProxy'
import { formatCents } from '@/services/aiProxy'
import type { Page } from '@/types/navigation'

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.05 }
  }
}

const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 }
}

const THINKING_LEVELS = ['off', 'low', 'medium', 'high'] as const
type AppUpdateStatus = {
  available: boolean
  version?: string
  downloaded?: boolean
  canDownload?: boolean
}

type ChannelRoutingMetricsSnapshot = {
  enabled: boolean
  metrics: {
    startedAt: string
    lastPollAt: string | null
    pollCount: number
    sessionsScanned: number
    sessionsRoutable: number
    pendingInbound: number
    routedCount: number
    failedCount: number
    dedupedCount: number
    skippedDisabledCount: number
    skippedNoPendingCount: number
    skippedCommandCount: number
    skippedCooldownCount: number
    lastRoutedAt: string | null
    lastRoutedSessionKey: string | null
    lastTopicLabel: string | null
    lastError: string | null
  }
  events: Array<{
    id: string
    at: string
    sessionKey: string
    status: 'routed' | 'failed' | 'skipped'
    reason: string
    topicId?: string
    topicLabel?: string
    messagePreview?: string
  }>
}

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '—'
  return parsed.toLocaleString()
}

function parseLocalSelection(modelId: string): { provider: 'lmstudio' | 'ollama'; modelName: string } | null {
  const match = modelId.match(/^(lmstudio|ollama)\/(.+)$/)
  if (!match) return null
  return {
    provider: match[1] as 'lmstudio' | 'ollama',
    modelName: match[2]
  }
}

function MemoryContextCard() {
  const queryClient = useQueryClient()

  const { data: configResult, isLoading } = useQuery({
    queryKey: ['gateway-config-memory'],
    queryFn: async () => {
      try {
        const result = await window.api.gateway.getConfig()
        if (!result?.ok) return null
        // Handle double-nesting: result.data might be {ok, result: {parsed}} or direct config
        const data = result.data as Record<string, unknown> | null
        if (!data) return null
        // If data has a 'parsed' key, it's the raw gateway response
        if (data.parsed) return data.parsed
        // If data has a 'result' key with parsed inside
        const inner = data.result as Record<string, unknown> | undefined
        if (inner?.parsed) return inner.parsed
        return data
      } catch (e) {
        console.error('Failed to fetch gateway config for memory card:', e)
        return null
      }
    }
  })

  const fixConfig = useMutation({
    mutationFn: async () => {
      const result = await window.api.gateway.updateConfig({
        agents: { defaults: { compaction: { memoryFlush: { enabled: true } } } }
      })
      if (!result.ok) throw new Error(result.error)
      return result.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gateway-config-memory'] })
    }
  })

  // Dig into the config to find compaction settings
  const agents = (configResult as Record<string, unknown>)?.agents as Record<string, unknown> | undefined
  const defaults = agents?.defaults as Record<string, unknown> | undefined
  const compaction = defaults?.compaction as Record<string, unknown> | undefined
  const memoryFlush = compaction?.memoryFlush as Record<string, unknown> | undefined
  const flushEnabled = memoryFlush?.enabled
  const compactionMode = (compaction?.mode as string) || 'default'
  const isDisabledOrMissing = flushEnabled !== true

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Brain className="h-4 w-4 text-accent" />
          Memory & Context
        </CardTitle>
      </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="flex items-center gap-2 py-4 text-text-muted">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Checking configuration...</span>
            </div>
          ) : (
            <>
              {/* Compaction Mode */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-text-primary">Compaction Mode</p>
                  <p className="text-xs text-text-muted mt-0.5">
                    How context is managed during long conversations
                  </p>
                </div>
                <Badge variant={compactionMode === 'safeguard' ? 'success' : 'secondary'} className="gap-1">
                  {compactionMode === 'safeguard' ? (
                    <ShieldCheck className="h-3 w-3" />
                  ) : (
                    <Zap className="h-3 w-3" />
                  )}
                  {compactionMode}
                </Badge>
              </div>

              <Separator />

              {/* Memory Flush Status */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-text-primary">Memory Flush on Compaction</p>
                  <p className="text-xs text-text-muted mt-0.5">
                    Saves context to files before compacting
                  </p>
                </div>
                <Badge variant={isDisabledOrMissing ? 'error' : 'success'}>
                  {isDisabledOrMissing ? 'Disabled' : 'Enabled'}
                </Badge>
              </div>

              {/* Warning Card */}
              {isDisabledOrMissing && (
                <>
                  <Separator />
                  <div className="rounded-lg bg-yellow-500/10 border border-yellow-500/20 p-3 space-y-3">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-yellow-400">
                          Memory flush is disabled
                        </p>
                        <p className="text-xs text-text-muted mt-1">
                          Your assistant may lose context during long conversations. Enable memory flush so it writes important context to files before compaction occurs.
                        </p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => fixConfig.mutate()}
                      disabled={fixConfig.isPending}
                      className="gap-1.5 w-full"
                    >
                      {fixConfig.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : fixConfig.isSuccess ? (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      ) : (
                        <Zap className="h-3.5 w-3.5" />
                      )}
                      {fixConfig.isSuccess ? 'Fixed!' : 'Fix Now'}
                    </Button>
                  </div>
                </>
              )}
            </>
          )}
        </CardContent>
      </Card>
  )
}

function LocalModelsStatus() {
  const queryClient = useQueryClient()

  const { data: status, isLoading } = useQuery({
    queryKey: ['local-models-detail'],
    queryFn: async () => {
      const result = await window.api.localModels.status()
      return result.ok ? result.data : { providers: [], models: [], lastScan: 0 }
    },
    refetchInterval: 10000
  })

  const rescan = useMutation({
    mutationFn: async () => {
      const result = await window.api.localModels.discover()
      if (!result.ok) throw new Error(result.error)
      return result.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['local-models'] })
      queryClient.invalidateQueries({ queryKey: ['local-models-detail'] })
    }
  })

  const providers = status?.providers || []
  const models = status?.models || []
  const lmStudioCount = models.filter((m: { provider: string }) => m.provider === 'lmstudio').length
  const ollamaCount = models.filter((m: { provider: string }) => m.provider === 'ollama').length

  return (
    <div className="rounded-lg border border-border bg-surface-2 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <HardDrive className="h-4 w-4 text-text-muted" />
          <span className="text-sm font-medium text-text-primary">Local Models</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => rescan.mutate()}
          disabled={rescan.isPending}
          className="h-7 gap-1 px-2"
        >
          {rescan.isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Search className="h-3 w-3" />
          )}
          Scan
        </Button>
      </div>
      {isLoading ? (
        <p className="text-xs text-text-muted">Scanning...</p>
      ) : models.length === 0 ? (
        <p className="text-xs text-text-muted">No local models detected</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {providers.includes('lmstudio') && (
            <Badge variant="success" className="text-[10px] gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-green-400 inline-block" />
              LM Studio: {lmStudioCount} model{lmStudioCount !== 1 ? 's' : ''}
            </Badge>
          )}
          {providers.includes('ollama') && (
            <Badge className="text-[10px] gap-1 bg-purple-500/15 text-purple-400 border-purple-500/30">
              <span className="h-1.5 w-1.5 rounded-full bg-purple-400 inline-block" />
              Ollama: {ollamaCount} model{ollamaCount !== 1 ? 's' : ''}
            </Badge>
          )}
        </div>
      )}
    </div>
  )
}

function CompanionRelayCard() {
  const queryClient = useQueryClient()
  const [pairingCode, setPairingCode] = useState('')
  const [desktopName, setDesktopName] = useState('My Mac')
  const [apiBaseUrlInput, setApiBaseUrlInput] = useState('')
  const [pollIntervalInput, setPollIntervalInput] = useState('5000')
  const [allowHighRiskInput, setAllowHighRiskInput] = useState(false)
  const [settingsDirty, setSettingsDirty] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const { data: companionStatus, isLoading } = useQuery({
    queryKey: ['companion-relay-status'],
    queryFn: async () => {
      const result = await window.api.companion.status()
      if (!result.ok) throw new Error(result.error || 'Failed to load companion relay status')
      return result.data
    },
    refetchInterval: 10000
  })

  useEffect(() => {
    if (!companionStatus || settingsDirty) return
    setApiBaseUrlInput(companionStatus.apiBaseUrl || '')
    setPollIntervalInput(String(companionStatus.pollIntervalMs || 5000))
    setAllowHighRiskInput(companionStatus.allowHighRiskRemoteActions === true)
  }, [companionStatus, settingsDirty])

  const refreshStatus = () => {
    queryClient.invalidateQueries({ queryKey: ['companion-relay-status'] })
  }

  const claimPairing = useMutation({
    mutationFn: async () => {
      const code = pairingCode.trim()
      if (!code) throw new Error('Enter a pairing code first')
      const result = await window.api.companion.claimPairing(code, desktopName.trim() || undefined)
      if (!result.ok) throw new Error(result.error || 'Failed to claim pairing code')
      return result.data
    },
    onSuccess: () => {
      setNotice('Desktop paired. Relay started.')
      setPairingCode('')
      refreshStatus()
    },
    onError: (error) => {
      setNotice(`Pairing failed: ${error.message}`)
    }
  })

  const startRelay = useMutation({
    mutationFn: async () => {
      const result = await window.api.companion.start()
      if (!result.ok) throw new Error(result.error || 'Failed to start relay')
      return result.data
    },
    onSuccess: () => {
      setNotice('Companion relay started.')
      refreshStatus()
    },
    onError: (error) => {
      setNotice(`Start failed: ${error.message}`)
    }
  })

  const stopRelay = useMutation({
    mutationFn: async () => {
      const result = await window.api.companion.stop()
      if (!result.ok) throw new Error(result.error || 'Failed to stop relay')
      return result.data
    },
    onSuccess: () => {
      setNotice('Companion relay stopped.')
      refreshStatus()
    },
    onError: (error) => {
      setNotice(`Stop failed: ${error.message}`)
    }
  })

  const disconnectRelay = useMutation({
    mutationFn: async () => {
      const result = await window.api.companion.disconnect()
      if (!result.ok) throw new Error(result.error || 'Failed to disconnect relay')
      return result.data
    },
    onSuccess: () => {
      setNotice('Companion relay credentials removed.')
      refreshStatus()
    },
    onError: (error) => {
      setNotice(`Disconnect failed: ${error.message}`)
    }
  })

  const pollNow = useMutation({
    mutationFn: async () => {
      const result = await window.api.companion.pollNow()
      if (!result.ok) throw new Error(result.error || 'Failed to sync relay')
      return result.data
    },
    onSuccess: () => {
      setNotice('Companion relay sync complete.')
      refreshStatus()
    },
    onError: (error) => {
      setNotice(`Sync failed: ${error.message}`)
    }
  })

  const saveSettings = useMutation({
    mutationFn: async () => {
      const pollIntervalMs = Number.parseInt(pollIntervalInput, 10)
      if (!Number.isFinite(pollIntervalMs)) {
        throw new Error('Poll interval must be a number (milliseconds)')
      }

      const result = await window.api.companion.updateSettings({
        apiBaseUrl: apiBaseUrlInput.trim(),
        pollIntervalMs,
        allowHighRiskRemoteActions: allowHighRiskInput
      })
      if (!result.ok) throw new Error(result.error || 'Failed to update companion settings')
      return result.data
    },
    onSuccess: () => {
      setSettingsDirty(false)
      setNotice('Companion relay settings saved.')
      refreshStatus()
    },
    onError: (error) => {
      setNotice(`Save failed: ${error.message}`)
    }
  })

  const relayBusy =
    claimPairing.isPending ||
    startRelay.isPending ||
    stopRelay.isPending ||
    disconnectRelay.isPending ||
    pollNow.isPending ||
    saveSettings.isPending

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Smartphone className="h-4 w-4 text-accent" />
          Companion Relay
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex items-center gap-2 py-2 text-text-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Loading companion status...</span>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={companionStatus?.configured ? 'success' : 'secondary'} className="gap-1">
                <KeyRound className="h-3 w-3" />
                {companionStatus?.configured ? 'Paired' : 'Not paired'}
              </Badge>
              <Badge variant={companionStatus?.running ? 'success' : 'secondary'} className="gap-1">
                {companionStatus?.running ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                {companionStatus?.running ? 'Running' : 'Stopped'}
              </Badge>
            </div>

            {companionStatus?.desktopName && (
              <p className="text-xs text-text-muted">
                Desktop: <span className="font-medium text-text-secondary">{companionStatus.desktopName}</span>
                {companionStatus.desktopId ? ` (${companionStatus.desktopId})` : ''}
              </p>
            )}

            {companionStatus?.relayKeyFingerprint && (
              <p className="text-xs text-text-muted font-mono">
                Relay key: {companionStatus.relayKeyFingerprint}
              </p>
            )}

            <p className="text-xs text-text-muted">
              High-risk remote actions: {companionStatus?.allowHighRiskRemoteActions ? 'Enabled' : 'Disabled'}
            </p>

            {companionStatus?.lastSyncAt && (
              <p className="text-xs text-text-muted">
                Last sync: {new Date(companionStatus.lastSyncAt).toLocaleString()}
              </p>
            )}

            {companionStatus?.lastError && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-2.5 text-xs text-red-400">
                {companionStatus.lastError}
              </div>
            )}

            {notice && (
              <div className="rounded-lg border border-accent/25 bg-accent/10 p-2.5 text-xs text-accent">
                {notice}
              </div>
            )}

            <Separator />

            <div className="space-y-2">
              <p className="text-sm font-medium text-text-primary">Pair this desktop</p>
              <p className="text-xs text-text-muted">
                Generate a code on your account page, then paste it here.
              </p>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => window.api.shell.openExternal('https://pinchr.app/account/companion')}
                  className="gap-1.5"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open Companion Dashboard
                </Button>
              </div>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                <input
                  type="text"
                  value={pairingCode}
                  onChange={(e) => setPairingCode(e.target.value)}
                  placeholder="ABCD-1234"
                  className="h-9 rounded-lg border border-border bg-surface-2 px-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
                />
                <input
                  type="text"
                  value={desktopName}
                  onChange={(e) => setDesktopName(e.target.value)}
                  placeholder="Desktop name"
                  className="h-9 rounded-lg border border-border bg-surface-2 px-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>
              <Button
                size="sm"
                onClick={() => claimPairing.mutate()}
                disabled={claimPairing.isPending || relayBusy}
                className="gap-1.5"
              >
                {claimPairing.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Link2 className="h-3.5 w-3.5" />
                )}
                Claim Pairing Code
              </Button>
            </div>

            <Separator />

            <div className="space-y-2">
              <p className="text-sm font-medium text-text-primary">Relay controls</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant={companionStatus?.running ? 'outline' : 'default'}
                  size="sm"
                  onClick={() => (companionStatus?.running ? stopRelay.mutate() : startRelay.mutate())}
                  disabled={relayBusy || !companionStatus?.configured}
                  className="gap-1.5"
                >
                  {(startRelay.isPending || stopRelay.isPending) ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : companionStatus?.running ? (
                    <WifiOff className="h-3.5 w-3.5" />
                  ) : (
                    <Wifi className="h-3.5 w-3.5" />
                  )}
                  {companionStatus?.running ? 'Stop Relay' : 'Start Relay'}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => pollNow.mutate()}
                  disabled={relayBusy || !companionStatus?.configured}
                  className="gap-1.5"
                >
                  {pollNow.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  Sync Now
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => disconnectRelay.mutate()}
                  disabled={relayBusy || !companionStatus?.configured}
                  className="gap-1.5"
                >
                  {disconnectRelay.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Unplug className="h-3.5 w-3.5" />
                  )}
                  Disconnect
                </Button>
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <p className="text-sm font-medium text-text-primary">Advanced</p>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                <input
                  type="text"
                  value={apiBaseUrlInput}
                  onChange={(e) => {
                    setApiBaseUrlInput(e.target.value)
                    setSettingsDirty(true)
                  }}
                  placeholder="https://pinchr.app"
                  className="h-9 rounded-lg border border-border bg-surface-2 px-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
                />
                <input
                  type="number"
                  value={pollIntervalInput}
                  onChange={(e) => {
                    setPollIntervalInput(e.target.value)
                    setSettingsDirty(true)
                  }}
                  placeholder="5000"
                  min={1000}
                  max={60000}
                  className="h-9 rounded-lg border border-border bg-surface-2 px-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>
              <label className="flex items-start gap-2 rounded-lg border border-yellow-500/20 bg-yellow-500/10 p-2.5 text-xs text-yellow-300">
                <input
                  type="checkbox"
                  checked={allowHighRiskInput}
                  onChange={(e) => {
                    setAllowHighRiskInput(e.target.checked)
                    setSettingsDirty(true)
                  }}
                  className="mt-0.5 h-4 w-4"
                />
                <span>
                  Allow high-risk remote actions (gateway restart, config writes).
                  <br />
                  Only enable this on trusted devices and networks.
                </span>
              </label>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => saveSettings.mutate()}
                disabled={!settingsDirty || relayBusy}
                className="gap-1.5"
              >
                {saveSettings.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                Save Relay Settings
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function SpendLimitCard() {
  const { settings, updateSettings, mode } = useAiProxy()
  const [inputValue, setInputValue] = useState(
    String(settings.dailySpendLimitCents / 100)
  )
  const [saved, setSaved] = useState(false)

  const handleSave = () => {
    const dollars = parseFloat(inputValue)
    if (!Number.isFinite(dollars) || dollars < 0) return
    const cents = Math.round(dollars * 100)
    updateSettings({ dailySpendLimitCents: cents })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  if (mode !== 'managed') return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Shield className="h-4 w-4 text-accent" />
          Daily Spend Limit
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-text-muted">
          Set a daily spending cap to prevent runaway costs. Current limit:{' '}
          <span className="font-medium text-text-secondary">
            {formatCents(settings.dailySpendLimitCents)}/day
          </span>
        </p>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-text-muted">$</span>
            <input
              type="number"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              min={0}
              step={1}
              className="w-full h-9 rounded-lg border border-border bg-surface-2 pl-7 pr-3 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saved}
            className="gap-1.5"
          >
            {saved ? (
              <CheckCircle2 className="h-3.5 w-3.5" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            {saved ? 'Saved' : 'Save'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export default function Settings({ onNavigate }: { onNavigate?: (page: Page) => void }) {
  const queryClient = useQueryClient()
  const { data: health } = useGatewayHealth()
  const [isReportIssueOpen, setIsReportIssueOpen] = useState(false)
  const [telemetryEnabled, setTelemetryEnabled] = useState(() => {
    try {
      const enabled = localStorage.getItem('pinchr_telemetry_enabled')
      return enabled !== 'false' // Default: true
    } catch {
      return true
    }
  })

  // Work Mode hook
  const { enabled: workModeEnabled, status: workModeStatus, toggleWorkMode, completedTasks, queuedTasks } = useWorkMode()

  // Fetch session status for current model and thinking level
  const { data: sessionStatus, isLoading: sessionStatusLoading } = useQuery({
    queryKey: ['session-status'],
    queryFn: async () => {
      const result = await window.api.gateway.getSessionStatus()
      return result.ok ? result.data : null
    },
    refetchInterval: 10000 // Refresh every 10s
  })

  const { data: channelRoutingSettings, isLoading: channelRoutingLoading } = useQuery({
    queryKey: ['channel-routing-settings'],
    queryFn: async () => {
      const result = await window.api.channelRouting.getSettings()
      if (!result.ok) throw new Error(result.error || 'Failed to load channel routing settings')
      return result.data ?? { enabled: true }
    }
  })

  const { data: channelRoutingMetrics } = useQuery({
    queryKey: ['channel-routing-metrics'],
    queryFn: async () => {
      const result = await window.api.channelRouting.getMetrics()
      if (!result.ok) throw new Error(result.error || 'Failed to load channel routing metrics')
      return result.data as ChannelRoutingMetricsSnapshot
    },
    refetchInterval: 10000
  })

  const updateChannelRouting = useMutation({
    mutationFn: async (enabled: boolean) => {
      const result = await window.api.channelRouting.updateSettings({ enabled })
      if (!result.ok) throw new Error(result.error || 'Failed to update channel routing settings')
      return result.data ?? { enabled }
    },
    onMutate: async (enabled) => {
      await queryClient.cancelQueries({ queryKey: ['channel-routing-settings'] })
      const previous = queryClient.getQueryData<{ enabled: boolean }>(['channel-routing-settings'])
      queryClient.setQueryData<{ enabled: boolean }>(['channel-routing-settings'], { enabled })
      return { previous }
    },
    onError: (_error, _enabled, context) => {
      if (context?.previous) {
        queryClient.setQueryData<{ enabled: boolean }>(['channel-routing-settings'], context.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['channel-routing-settings'] })
      queryClient.invalidateQueries({ queryKey: ['channel-routing-metrics'] })
    }
  })

  const runtimeOpenclawVersion = sessionStatus?.openclawVersion || health?.version || 'Unknown'

  // Get Pinchr app version
  const { data: appVersion } = useQuery({
    queryKey: ['app-version'],
    queryFn: async () => {
      const result = await window.api.app.version()
      return result.ok ? result.data : '0.1.0'
    }
  })

  // Local models discovery
  const { data: localModelsData } = useQuery({
    queryKey: ['local-models'],
    queryFn: async () => {
      const result = await window.api.localModels.status()
      return result.ok ? result.data : { providers: [], models: [], lastScan: 0 }
    },
    refetchInterval: 10000
  })

  const { data: providerStatusData, isLoading: providerStatusLoading } = useQuery({
    queryKey: ['providers-status'],
    queryFn: async () => {
      const result = await window.api.providers.list()
      return result.ok ? result.data : { providers: [] }
    },
    refetchInterval: 10000
  })

  const refreshProviderStatus = () => {
    queryClient.invalidateQueries({ queryKey: ['providers-status'] })
    queryClient.invalidateQueries({ queryKey: ['session-status'] })
    queryClient.invalidateQueries({ queryKey: ['gateway', 'health'] })
  }

  // Local state for model configuration
  const [selectedModel, setSelectedModel] = useState('')
  const [thinking, setThinking] = useState<typeof THINKING_LEVELS[number]>('off')
  const [hasModelChanges, setHasModelChanges] = useState(false)

  // Check for updates state
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false)
  const [isDownloadingUpdate, setIsDownloadingUpdate] = useState(false)
  const [isRestartingToUpdate, setIsRestartingToUpdate] = useState(false)
  const [updateResult, setUpdateResult] = useState<AppUpdateStatus | null>(null)
  const [updateActionError, setUpdateActionError] = useState<string | null>(null)
  const [updateActionInfo, setUpdateActionInfo] = useState<string | null>(null)
  const updatePollTimerRef = useRef<number | null>(null)
  const updatePollAttemptsRef = useRef(0)
  const [restartFeedback, setRestartFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const restartFeedbackTimerRef = useRef<number | null>(null)

  const clearRestartFeedbackTimer = () => {
    if (restartFeedbackTimerRef.current !== null) {
      window.clearTimeout(restartFeedbackTimerRef.current)
      restartFeedbackTimerRef.current = null
    }
  }

  // Initialize model/thinking from session status
  useEffect(() => {
    if (sessionStatus) {
      const model = sessionStatus.model || ''
      const thinkingLevel = sessionStatus.thinking || 'off'

      setSelectedModel(model)
      setThinking(THINKING_LEVELS.find((level) => level === thinkingLevel) ?? 'off')
      setHasModelChanges(false)
    }
  }, [sessionStatus])

  // Track changes
  useEffect(() => {
    if (!sessionStatus) return

    const originalModel = sessionStatus.model || ''
    const originalThinking = sessionStatus.thinking || 'off'

    const modelChanged = selectedModel !== originalModel
    const thinkingChanged = thinking !== originalThinking

    setHasModelChanges(modelChanged || thinkingChanged)
  }, [selectedModel, thinking, sessionStatus])

  // Save model configuration
  const saveModelConfig = useMutation({
    mutationFn: async () => {
      const originalModel = sessionStatus?.model || ''
      const originalThinking = sessionStatus?.thinking || 'off'
      const modelChanged = selectedModel !== originalModel
      const thinkingChanged = thinking !== originalThinking
      if (!modelChanged && !thinkingChanged) return null

      const localSelection = parseLocalSelection(selectedModel)
      if (modelChanged && localSelection) {
        const localResult = await window.api.localModels.select(
          `${localSelection.provider}:${localSelection.modelName}`,
          localSelection.provider
        )
        if (!localResult.ok) throw new Error(localResult.error)
      }

      const updates: Record<string, unknown> = {}
      if (modelChanged && !localSelection && selectedModel) {
        updates.model = selectedModel
      }
      if (thinkingChanged) {
        updates.thinking = thinking
      }

      if (Object.keys(updates).length > 0) {
        const result = await window.api.gateway.updateConfig(updates)
        if (!result.ok) throw new Error(result.error)
      }

      return null
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['session-status'] })
      queryClient.invalidateQueries({ queryKey: ['local-models'] })
      queryClient.invalidateQueries({ queryKey: ['providers-status'] })
      setHasModelChanges(false)
    }
  })

  // Restart gateway
  const restartGateway = useMutation({
    mutationFn: async () => {
      const result = await window.api.gateway.restart()
      if (!result.ok) throw new Error(result.error)
      return result.data
    },
    onMutate: () => {
      clearRestartFeedbackTimer()
      setRestartFeedback(null)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gateway', 'health'] })
      queryClient.invalidateQueries({ queryKey: ['session-status'] })
      setRestartFeedback({ type: 'success', message: 'Gateway restarted successfully.' })
      restartFeedbackTimerRef.current = window.setTimeout(() => {
        setRestartFeedback(null)
      }, 5000)
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Failed to restart gateway.'
      setRestartFeedback({ type: 'error', message: `Restart failed: ${message}` })
    }
  })

  const repairGateway = useMutation({
    mutationFn: async () => {
      const result = await window.api.gateway.repairShell()
      if (!result.ok) throw new Error(result.error)
      return result.data
    },
    onMutate: () => {
      clearRestartFeedbackTimer()
      setRestartFeedback(null)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gateway', 'health'] })
      queryClient.invalidateQueries({ queryKey: ['session-status'] })
      setRestartFeedback({ type: 'success', message: 'Gateway repair completed successfully.' })
      restartFeedbackTimerRef.current = window.setTimeout(() => {
        setRestartFeedback(null)
      }, 7000)
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Failed to repair gateway.'
      setRestartFeedback({ type: 'error', message: `Repair failed: ${message}` })
    }
  })

  const displayOpenclawVersion = runtimeOpenclawVersion

  const stopUpdatePolling = () => {
    if (updatePollTimerRef.current !== null) {
      window.clearInterval(updatePollTimerRef.current)
      updatePollTimerRef.current = null
    }
    updatePollAttemptsRef.current = 0
  }

  const startUpdatePolling = () => {
    stopUpdatePolling()
    updatePollTimerRef.current = window.setInterval(async () => {
      updatePollAttemptsRef.current += 1
      try {
        const res = await window.api.updater.check()
        if (res.ok && res.data) {
          setUpdateResult(res.data)
          if (!res.data.available) {
            setIsDownloadingUpdate(false)
            stopUpdatePolling()
            return
          }
          if (res.data.downloaded) {
            setIsDownloadingUpdate(false)
            setUpdateActionInfo('Update downloaded. Restart to install.')
            stopUpdatePolling()
            return
          }
        }
      } catch {
        // Ignore transient polling errors.
      }

      // Stop polling after ~3 minutes.
      if (updatePollAttemptsRef.current >= 45) {
        setIsDownloadingUpdate(false)
        stopUpdatePolling()
      }
    }, 4000)
  }

  useEffect(() => {
    return () => {
      stopUpdatePolling()
      clearRestartFeedbackTimer()
    }
  }, [])

  const handleCheckUpdate = async () => {
    setIsCheckingUpdate(true)
    setUpdateActionError(null)
    try {
      const res = await window.api.updater.check()
      if (res.ok && res.data) {
        setUpdateResult(res.data)
        if (res.data.available && res.data.downloaded) {
          setIsDownloadingUpdate(false)
          setUpdateActionInfo('Update downloaded. Restart to install.')
          stopUpdatePolling()
        }
      }
    } finally {
      setIsCheckingUpdate(false)
    }
  }

  const handleDownloadUpdate = async () => {
    setUpdateActionError(null)
    setUpdateActionInfo(null)
    setIsDownloadingUpdate(true)

    try {
      const res = await window.api.updater.download()
      if (!res.ok) {
        throw new Error(res.error || 'Failed to start update download.')
      }

      if (res.data?.downloaded) {
        setUpdateResult((prev) => ({
          available: true,
          version: res.data?.version || prev?.version,
          downloaded: true,
          canDownload: prev?.canDownload
        }))
        setIsDownloadingUpdate(false)
        setUpdateActionInfo('Update downloaded. Restart to install.')
        stopUpdatePolling()
        return
      }

      if (res.data?.source === 'manual') {
        setIsDownloadingUpdate(false)
        setUpdateActionInfo('Opened download page. Install the update and relaunch Pinchr.')
        stopUpdatePolling()
        return
      }

      if (res.data?.started) {
        setUpdateActionInfo('Downloading update in background...')
        startUpdatePolling()
        return
      }

      setIsDownloadingUpdate(false)
      stopUpdatePolling()
      await handleCheckUpdate()
    } catch (error) {
      setIsDownloadingUpdate(false)
      stopUpdatePolling()
      setUpdateActionError(error instanceof Error ? error.message : 'Failed to download update.')
    }
  }

  const handleRestartToUpdate = async () => {
    setUpdateActionError(null)
    setIsRestartingToUpdate(true)
    try {
      const res = await window.api.updater.restart()
      if (!res.ok) {
        throw new Error(res.error || 'Failed to restart and install update.')
      }
    } catch (error) {
      setIsRestartingToUpdate(false)
      setUpdateActionError(error instanceof Error ? error.message : 'Failed to restart and install update.')
    }
  }

  const handleOpenLink = (url: string) => {
    window.api.shell.openExternal(url)
  }

  const handleTelemetryToggle = (checked: boolean) => {
    setTelemetryEnabled(checked)
    try {
      localStorage.setItem('pinchr_telemetry_enabled', String(checked))
    } catch (error) {
      console.error('Failed to save telemetry preference:', error)
    }
  }

  const isOnline = !!health

  return (
    <ScrollArea className="h-full">
      <div className="p-8 pt-12">
        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="max-w-3xl mx-auto space-y-6"
        >
          <motion.div variants={item} className="mb-8">
            <h1 className="text-2xl font-bold text-text-primary flex items-center gap-3">
              <SettingsIcon className="h-6 w-6 text-accent" />
              Settings
            </h1>
            <p className="text-text-secondary mt-1">Configure OpenClaw and Pinchr</p>
          </motion.div>

          <motion.div variants={item}>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Zap className="h-4 w-4 text-accent" />
                  Configuration Shortcuts
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-2">
                <Button variant="secondary" className="justify-start" onClick={() => onNavigate?.('connections')}>
                  Channels & Connections
                </Button>
                <Button variant="secondary" className="justify-start" onClick={() => onNavigate?.('tasks')}>
                  Automations
                </Button>
                <Button variant="secondary" className="justify-start" onClick={() => onNavigate?.('skills')}>
                  Skills
                </Button>
                <Button variant="secondary" className="justify-start" onClick={() => onNavigate?.('automations')}>
                  Automations
                </Button>
                <Button variant="secondary" className="justify-start" onClick={() => onNavigate?.('support')}>
                  Support
                </Button>
                <Button variant="secondary" className="justify-start" onClick={() => onNavigate?.('dashboard')}>
                  Dashboard
                </Button>
              </CardContent>
            </Card>
          </motion.div>

          {/* OpenClaw Section */}
          <motion.div variants={item}>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Server className="h-4 w-4 text-accent" />
                  OpenClaw Gateway
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Status */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        'h-3 w-3 rounded-full',
                        isOnline ? 'bg-accent animate-pulse' : 'bg-red-500'
                      )}
                    />
                    <span className="text-sm text-text-primary">
                      {isOnline ? 'Running' : 'Offline'}
                    </span>
                    <Badge variant={isOnline ? 'success' : 'error'}>
                      {isOnline ? 'Connected' : 'Disconnected'}
                    </Badge>
                  </div>
                </div>

                <Separator />

                {/* Version */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-text-primary">OpenClaw Version</p>
                    <p className="text-xs text-text-muted font-mono mt-1">{displayOpenclawVersion}</p>
                    <p className="text-xs text-text-muted mt-1">OpenClaw is bundled with Pinchr app updates.</p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => restartGateway.mutate()}
                      disabled={restartGateway.isPending || repairGateway.isPending}
                      className="gap-2"
                    >
                      <RotateCw
                        className={cn(
                          'h-3.5 w-3.5',
                          restartGateway.isPending && 'animate-spin'
                        )}
                      />
                      Restart
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => repairGateway.mutate()}
                      disabled={restartGateway.isPending || repairGateway.isPending}
                      className="gap-2"
                    >
                      {repairGateway.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Wrench className="h-3.5 w-3.5" />
                      )}
                      Repair
                    </Button>
                  </div>
                </div>

                {/* Restart feedback */}
                {restartFeedback && (
                  <div
                    className={cn(
                      'rounded-lg border p-3 flex items-center gap-2',
                      restartFeedback.type === 'success'
                        ? 'bg-accent/10 border-accent/20'
                        : 'bg-red-500/10 border-red-500/20'
                    )}
                  >
                    {restartFeedback.type === 'success' ? (
                      <CheckCircle2 className="h-4 w-4 text-accent shrink-0" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
                    )}
                    <p
                      className={cn(
                        'text-sm',
                        restartFeedback.type === 'success' ? 'text-accent' : 'text-red-400'
                      )}
                    >
                      {restartFeedback.message}
                    </p>
                  </div>
                )}

                <Separator />

                {/* Endpoint */}
                <div>
                  <p className="text-sm font-medium text-text-primary">Gateway Endpoint</p>
                  <p className="text-xs text-text-muted font-mono mt-1">
                    http://127.0.0.1:18789
                  </p>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Providers & Models Section */}
          <motion.div variants={item}>
            <ProviderManager
              statuses={providerStatusData?.providers ?? []}
              isLoading={providerStatusLoading}
              gatewayRunning={health ? health.status !== 'offline' && health.status !== 'error' : true}
              onProvidersChanged={refreshProviderStatus}
              onNavigateToCommandCenter={onNavigate ? () => onNavigate('chat') : undefined}
            />
          </motion.div>

          <motion.div variants={item}>
            <ModelSelector
              selectedModel={selectedModel}
              onSelectModel={setSelectedModel}
              providerStatuses={providerStatusData?.providers ?? []}
              localModels={localModelsData ?? { providers: [], models: [], lastScan: 0 }}
              isLoading={sessionStatusLoading || providerStatusLoading}
            />
          </motion.div>

          <motion.div variants={item}>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Thinking Level</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  {THINKING_LEVELS.map((level) => (
                    <button
                      key={level}
                      onClick={() => setThinking(level)}
                      className={cn(
                        'flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                        thinking === level
                          ? 'border-accent bg-accent/15 text-accent'
                          : 'border-border bg-surface-2 text-text-secondary hover:bg-surface-3'
                      )}
                    >
                      {level.charAt(0).toUpperCase() + level.slice(1)}
                    </button>
                  ))}
                </div>

                {sessionStatus?.contextUsage && (
                  <p className="text-xs text-text-muted">
                    Current context usage: <span className="text-text-secondary">{sessionStatus.contextUsage}</span>
                  </p>
                )}

                {hasModelChanges && (
                  <div className="flex justify-end pt-1">
                    <Button
                      onClick={() => saveModelConfig.mutate()}
                      disabled={saveModelConfig.isPending}
                      size="sm"
                      className="gap-1.5"
                    >
                      {saveModelConfig.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : saveModelConfig.isSuccess ? (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      ) : (
                        <Save className="h-3.5 w-3.5" />
                      )}
                      Save Changes
                    </Button>
                  </div>
                )}

                {saveModelConfig.isError && (
                  <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
                    {saveModelConfig.error instanceof Error
                      ? saveModelConfig.error.message
                      : 'Failed to update model configuration.'}
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* Spend Limit Section — only visible in managed proxy mode */}
          <motion.div variants={item}>
            <SpendLimitCard />
          </motion.div>

          {/* Memory & Context Section */}
          <motion.div variants={item}>
            <MemoryContextCard />
          </motion.div>

          {/* Channel Topic Routing Section */}
          <motion.div variants={item}>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Link2 className="h-4 w-4 text-accent" />
                  Channel Topic Routing
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-text-primary">Route channel messages into topic threads</p>
                    <p className="text-xs text-text-muted mt-0.5">
                      Default on. Keeps Slack/WhatsApp/channel conversations isolated by topic to prevent context blow-up.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={(channelRoutingSettings?.enabled ?? true) ? 'success' : 'secondary'}>
                      {(channelRoutingSettings?.enabled ?? true) ? 'Enabled' : 'Disabled'}
                    </Badge>
                    <Switch
                      checked={channelRoutingSettings?.enabled ?? true}
                      onCheckedChange={(checked) => updateChannelRouting.mutate(Boolean(checked))}
                      disabled={channelRoutingLoading || updateChannelRouting.isPending}
                      className="data-[state=checked]:bg-accent"
                    />
                  </div>
                </div>
                {updateChannelRouting.isError && (
                  <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-2.5 text-xs text-red-400">
                    {updateChannelRouting.error?.message || 'Failed to update channel routing settings.'}
                  </div>
                )}

                {channelRoutingMetrics?.metrics && (
                  <>
                    <Separator />

                    <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                      <div className="rounded-lg border border-border bg-surface-2 p-2">
                        <p className="text-[10px] uppercase tracking-wide text-text-muted">Routed</p>
                        <p className="text-sm font-semibold text-text-primary">{channelRoutingMetrics.metrics.routedCount}</p>
                      </div>
                      <div className="rounded-lg border border-border bg-surface-2 p-2">
                        <p className="text-[10px] uppercase tracking-wide text-text-muted">Pending</p>
                        <p className="text-sm font-semibold text-text-primary">{channelRoutingMetrics.metrics.pendingInbound}</p>
                      </div>
                      <div className="rounded-lg border border-border bg-surface-2 p-2">
                        <p className="text-[10px] uppercase tracking-wide text-text-muted">Deduped</p>
                        <p className="text-sm font-semibold text-text-primary">{channelRoutingMetrics.metrics.dedupedCount}</p>
                      </div>
                      <div className="rounded-lg border border-border bg-surface-2 p-2">
                        <p className="text-[10px] uppercase tracking-wide text-text-muted">Failures</p>
                        <p className="text-sm font-semibold text-text-primary">{channelRoutingMetrics.metrics.failedCount}</p>
                      </div>
                    </div>

                    <div className="rounded-lg border border-border bg-surface-2 p-2.5 text-xs text-text-secondary">
                      <p>Last poll: {formatTimestamp(channelRoutingMetrics.metrics.lastPollAt)}</p>
                      <p>Last routed: {formatTimestamp(channelRoutingMetrics.metrics.lastRoutedAt)}</p>
                      <p>Last topic: {channelRoutingMetrics.metrics.lastTopicLabel || '—'}</p>
                      <p>Scanned sessions: {channelRoutingMetrics.metrics.sessionsScanned}</p>
                    </div>

                    <div className="space-y-2">
                      <p className="text-xs font-medium uppercase tracking-wide text-text-muted">Recent routing events</p>
                      {channelRoutingMetrics.events.length === 0 ? (
                        <p className="rounded-lg border border-border bg-surface-2 p-2 text-xs text-text-muted">No routing events yet.</p>
                      ) : (
                        <div className="max-h-48 space-y-1 overflow-auto pr-1">
                          {channelRoutingMetrics.events.slice(0, 8).map((event) => (
                            <div key={event.id} className="rounded-lg border border-border bg-surface-2 p-2 text-xs">
                              <div className="flex items-center justify-between gap-2">
                                <Badge
                                  variant={event.status === 'routed' ? 'success' : event.status === 'failed' ? 'destructive' : 'secondary'}
                                  className="h-5 text-[10px]"
                                >
                                  {event.status}
                                </Badge>
                                <span className="text-text-muted">{formatTimestamp(event.at)}</span>
                              </div>
                              <p className="mt-1 text-text-secondary">{event.reason}</p>
                              <p className="text-text-muted truncate">{event.topicLabel || event.sessionKey}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* Work Mode Section */}
          <motion.div variants={item}>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Zap className="h-4 w-4 text-accent" />
                  Work Mode
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Toggle */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-text-primary">Enable Work Mode</p>
                    <p className="text-xs text-text-muted mt-0.5">
                      Let your agent work through tasks autonomously. It will pick up tasks by priority, work until blocked, and surface blockers for your review.
                    </p>
                  </div>
                  <Switch
                    checked={workModeEnabled}
                    onCheckedChange={toggleWorkMode}
                    className="data-[state=checked]:bg-accent"
                  />
                </div>

                {/* Status indicators when enabled */}
                {workModeEnabled && (
                  <>
                    <Separator />

                    <div className="space-y-3">
                      {/* Status */}
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-text-secondary">Status</span>
                        <Badge
                          variant={workModeStatus === 'working' ? 'success' : 'secondary'}
                          className={cn(
                            'gap-1.5',
                            workModeStatus === 'working' && 'animate-pulse'
                          )}
                        >
                          {workModeStatus === 'working' && <Loader2 className="h-3 w-3 animate-spin" />}
                          {workModeStatus === 'blocked' && <AlertTriangle className="h-3 w-3" />}
                          {workModeStatus.charAt(0).toUpperCase() + workModeStatus.slice(1)}
                        </Badge>
                      </div>

                      {/* Tasks completed this session */}
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-text-secondary">Completed today</span>
                        <Badge variant="secondary">{completedTasks.length} task{completedTasks.length !== 1 ? 's' : ''}</Badge>
                      </div>

                      {/* Queue size */}
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-text-secondary">Tasks in queue</span>
                        <Badge variant="secondary">{queuedTasks.length} task{queuedTasks.length !== 1 ? 's' : ''}</Badge>
                      </div>
                    </div>

                    <Separator />

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onNavigate?.('tasks')}
                      className="w-full gap-1.5"
                    >
                      <Zap className="h-3.5 w-3.5" />
                      Open Tasks Dashboard
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* Pinchr App Section */}
          <motion.div variants={item}>
            <CompanionRelayCard />
          </motion.div>

          {/* Pinchr App Section */}
          <motion.div variants={item}>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Smartphone className="h-4 w-4 text-accent" />
                  Pinchr App
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Version */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-text-primary">Pinchr Version</p>
                    <p className="text-xs text-text-muted font-mono mt-1">{appVersion}</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCheckUpdate}
                    disabled={isCheckingUpdate || isRestartingToUpdate}
                    className="gap-1.5"
                  >
                    {isCheckingUpdate ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5" />
                    )}
                    Check for Updates
                  </Button>
                </div>

                {updateResult && updateResult.available && (
                  <div className="rounded-lg bg-accent/10 border border-accent/20 p-3">
                    <p className="text-sm font-medium text-accent mb-2">
                      {updateResult.downloaded
                        ? `Update Ready: v${updateResult.version}`
                        : `Update Available: v${updateResult.version}`}
                    </p>
                    {updateResult.downloaded ? (
                      <Button
                        size="sm"
                        onClick={handleRestartToUpdate}
                        disabled={isRestartingToUpdate}
                        className="gap-1.5 w-full"
                      >
                        {isRestartingToUpdate ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <RefreshCw className="h-3.5 w-3.5" />
                        )}
                        Restart & Install
                      </Button>
                    ) : updateResult.canDownload === false ? (
                      <Button
                        size="sm"
                        onClick={() => handleOpenLink('https://pinchr.app/download')}
                        className="gap-1.5 w-full"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Download from Website
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        onClick={handleDownloadUpdate}
                        disabled={isDownloadingUpdate}
                        className="gap-1.5 w-full"
                      >
                        {isDownloadingUpdate ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Download className="h-3.5 w-3.5" />
                        )}
                        {isDownloadingUpdate ? 'Downloading…' : `Download v${updateResult.version}`}
                      </Button>
                    )}
                    {(isDownloadingUpdate || updateActionInfo) && (
                      <p className="text-xs text-text-secondary mt-2">
                        {updateActionInfo || 'Downloading update in background...'}
                      </p>
                    )}
                    {updateActionError && (
                      <p className="text-xs text-red-400 mt-2">
                        {updateActionError}
                      </p>
                    )}
                  </div>
                )}

                {updateResult && !updateResult.available && (
                  <p className="text-xs text-text-muted">You're up to date!</p>
                )}

                <Separator />

                {/* Computer Use Permissions */}
                <div>
                  <p className="text-sm font-medium text-text-primary mb-3">Computer Use Permissions</p>
                  <PermissionGuide />
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Telemetry & Support Section */}
          <motion.div variants={item}>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <BarChart3 className="h-4 w-4 text-accent" />
                  Privacy & Support
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Telemetry Toggle */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-text-primary">Send anonymous usage data</p>
                    <p className="text-xs text-text-muted mt-0.5">
                      Help improve Pinchr by sharing anonymous usage patterns
                    </p>
                  </div>
                  <Switch
                    checked={telemetryEnabled}
                    onCheckedChange={handleTelemetryToggle}
                  />
                </div>

                <Separator />

                {/* Report Issue */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-text-primary">Report an Issue</p>
                    <p className="text-xs text-text-muted mt-0.5">
                      Found a bug or have feedback? Let us know
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsReportIssueOpen(true)}
                    className="gap-1.5"
                  >
                    <Flag className="h-3.5 w-3.5" />
                    Report Issue
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* About Section */}
          <motion.div variants={item}>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Info className="h-4 w-4 text-accent" />
                  About Pinchr
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-2 text-sm">
                  <Heart className="h-4 w-4 text-red-500" />
                  <span className="text-text-secondary">Built on</span>
                  <button
                    onClick={() => handleOpenLink('https://github.com/openclaw')}
                    className="text-accent hover:underline font-medium"
                  >
                    OpenClaw
                  </button>
                  <Badge variant="secondary" className="text-[10px]">MIT</Badge>
                </div>

                <Separator />

                <div className="flex flex-wrap gap-3 text-sm">
                  <button
                    onClick={() => handleOpenLink('https://pinchr.app')}
                    className="text-accent hover:underline flex items-center gap-1"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Website
                  </button>
                  <button
                    onClick={() => handleOpenLink('https://docs.pinchr.app')}
                    className="text-accent hover:underline flex items-center gap-1"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Documentation
                  </button>
                  <button
                    onClick={() => handleOpenLink('https://discord.gg/pinchr')}
                    className="text-accent hover:underline flex items-center gap-1"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Discord
                  </button>
                  <button
                    onClick={() => handleOpenLink('https://github.com/pinchr-app/pinchr')}
                    className="text-accent hover:underline flex items-center gap-1"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    GitHub
                  </button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </motion.div>
      </div>
      <ReportIssue isOpen={isReportIssueOpen} onClose={() => setIsReportIssueOpen(false)} />
    </ScrollArea>
  )
}
