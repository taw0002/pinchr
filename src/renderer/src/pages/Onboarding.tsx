import { FormEvent, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { motion } from 'framer-motion'
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  ExternalLink,
  Loader2,
  RefreshCw,
  Terminal
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import logoIcon from '@/assets/icon.png'
import { cn } from '@/lib/utils'
import type {
  GatewayDetection,
  OnboardingInstallCommand,
  OnboardingInstallExitEvent
} from '../../../shared/types'

type AiProvider = 'anthropic' | 'openai' | 'google'
type SaveState = 'idle' | 'checking' | 'success' | 'error'
type GatewayStep = 'checking' | 'install' | 'api' | 'finishing'

type OnboardingSystemCheck = {
  nodeInstalled: boolean
  nodeVersion: string | null
  cliInstalled: boolean
  cliVersion: string | null
  gatewayReachable: boolean
  gatewayStatus: string | null
}

const PROVIDERS: Array<{ id: AiProvider; label: string; hint: string }> = [
  { id: 'anthropic', label: 'Anthropic', hint: 'sk-ant-...' },
  { id: 'openai', label: 'OpenAI', hint: 'sk-...' },
  { id: 'google', label: 'Google', hint: 'AIza...' }
]

const PROVIDER_KEY_LINKS: Record<AiProvider, string> = {
  anthropic: 'https://console.anthropic.com/settings/keys',
  openai: 'https://platform.openai.com/api-keys',
  google: 'https://aistudio.google.com/apikey'
}

const INSTALL_OPENCLAW_COMMAND: OnboardingInstallCommand = 'npm i -g openclaw'
const GATEWAY_INSTALL_COMMAND: OnboardingInstallCommand = 'openclaw gateway install'
const GATEWAY_START_COMMAND: OnboardingInstallCommand = 'openclaw gateway start'
const NODE_DOWNLOAD_URL = 'https://nodejs.org/'

function inferProviderFromKey(value: string): AiProvider | null {
  const trimmed = value.trim()
  if (trimmed.startsWith('sk-ant-')) return 'anthropic'
  if (trimmed.startsWith('sk-')) return 'openai'
  return null
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export default function Onboarding() {
  const [provider, setProvider] = useState<AiProvider>('anthropic')
  const [apiKey, setApiKey] = useState('')
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [gatewayStep, setGatewayStep] = useState<GatewayStep>('checking')
  const [gatewayInfo, setGatewayInfo] = useState<GatewayDetection | null>(null)
  const [gatewayMessage, setGatewayMessage] = useState<string | null>('Checking local gateway...')
  const [finishing, setFinishing] = useState(false)

  const [systemCheck, setSystemCheck] = useState<OnboardingSystemCheck | null>(null)
  const [copiedInstall, setCopiedInstall] = useState(false)
  const [installLogs, setInstallLogs] = useState('')
  const [activeInstallCommand, setActiveInstallCommand] = useState<OnboardingInstallCommand | null>(null)
  const [installError, setInstallError] = useState<string | null>(null)

  const installResolversRef = useRef(new Map<string, (event: OnboardingInstallExitEvent) => void>())
  const activeRunIdRef = useRef<string | null>(null)
  const logsRef = useRef<HTMLPreElement>(null)

  const inferredProvider = useMemo(() => inferProviderFromKey(apiKey), [apiKey])

  const selectedProvider = useMemo(
    () => PROVIDERS.find((entry) => entry.id === provider) ?? PROVIDERS[0],
    [provider]
  )

  const appendInstallLog = useCallback((chunk: string) => {
    setInstallLogs((current) => `${current}${chunk}`)
  }, [])

  const completeOnboarding = useCallback(async () => {
    if (finishing) return

    setFinishing(true)
    setGatewayStep('finishing')
    setGatewayMessage('Opening chat...')
    try {
      localStorage.setItem('onboarding_completed', 'true')
      await window.api.onboarding.complete()
      window.location.hash = '#/chat'
      window.location.reload()
    } catch {
      setFinishing(false)
      setGatewayStep(gatewayInfo?.status === 'connected' ? 'api' : 'install')
      setSaveState('error')
      setSaveMessage('Could not finalize onboarding. Please try again.')
    }
  }, [finishing, gatewayInfo?.status])

  const refreshSetupState = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!options?.silent) {
        setGatewayStep('checking')
        setGatewayMessage('Checking local gateway...')
      }

      const [gatewayResult, systemResult] = await Promise.all([
        window.api.gateway.detect(),
        window.api.onboarding.systemCheck()
      ])

      if (systemResult.ok && systemResult.data) {
        setSystemCheck(systemResult.data)
      }

      if (!gatewayResult.ok || !gatewayResult.data) {
        setGatewayInfo(null)
        setGatewayStep('install')
        setGatewayMessage(gatewayResult.error || 'Could not detect OpenClaw gateway.')
        return
      }

      const data = gatewayResult.data
      setGatewayInfo(data)

      if (data.status === 'connected') {
        if (data.hasApiKey) {
          setGatewayMessage('Gateway detected and API key is configured.')
          await completeOnboarding()
          return
        }

        setGatewayStep('api')
        setGatewayMessage('Gateway detected. Add an API key to continue.')
        return
      }

      setGatewayStep('install')
      setGatewayMessage('OpenClaw gateway is not running yet. Complete the steps below.')
    },
    [completeOnboarding]
  )

  useEffect(() => {
    void refreshSetupState()
  }, [refreshSetupState])

  useEffect(() => {
    if (finishing) return

    const timer = window.setInterval(() => {
      void refreshSetupState({ silent: true })
    }, 3000)

    return () => window.clearInterval(timer)
  }, [finishing, refreshSetupState])

  useEffect(() => {
    const unsubscribeOutput = window.api.onboarding.onInstallOutput((event) => {
      const currentRunId = activeRunIdRef.current
      if (currentRunId && event.runId !== currentRunId) return
      appendInstallLog(event.chunk)
    })

    const unsubscribeExit = window.api.onboarding.onInstallExit((event) => {
      const currentRunId = activeRunIdRef.current
      if (currentRunId && event.runId !== currentRunId) return

      setActiveInstallCommand(null)
      activeRunIdRef.current = null

      const resolver = installResolversRef.current.get(event.runId)
      if (resolver) {
        installResolversRef.current.delete(event.runId)
        resolver(event)
      }

      if (!event.ok) {
        setInstallError(`Command failed (${event.code ?? 'unknown'}): ${event.command}`)
      }
    })

    return () => {
      unsubscribeOutput()
      unsubscribeExit()
      installResolversRef.current.clear()
    }
  }, [appendInstallLog])

  useEffect(() => {
    if (!logsRef.current) return
    logsRef.current.scrollTop = logsRef.current.scrollHeight
  }, [installLogs, activeInstallCommand])

  useEffect(() => {
    if (!inferredProvider || inferredProvider === provider) return
    setProvider(inferredProvider)
  }, [inferredProvider, provider])

  const runInstallCommand = useCallback(
    async (command: OnboardingInstallCommand): Promise<boolean> => {
      if (activeInstallCommand) {
        setInstallError('Wait for the current command to finish.')
        return false
      }

      setInstallError(null)
      appendInstallLog(`\n$ ${command}\n`)

      const startResult = await window.api.onboarding.runInstall(command)
      if (!startResult.ok || !startResult.data?.runId) {
        setInstallError(startResult.error || 'Failed to start install command.')
        return false
      }

      const runId = startResult.data.runId
      activeRunIdRef.current = runId
      setActiveInstallCommand(command)

      return await new Promise<boolean>((resolve) => {
        installResolversRef.current.set(runId, (event) => {
          resolve(event.ok)
        })
      })
    },
    [activeInstallCommand, appendInstallLog]
  )

  const copyInstallCommand = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(INSTALL_OPENCLAW_COMMAND)
      setCopiedInstall(true)
      window.setTimeout(() => setCopiedInstall(false), 1500)
    } catch {
      setInstallError('Copy failed. Select and copy the command manually.')
    }
  }, [])

  const handleInstallOpenclaw = useCallback(async () => {
    if (!systemCheck?.nodeInstalled) {
      setInstallError('Install Node.js first, then install OpenClaw.')
      return
    }

    const ok = await runInstallCommand(INSTALL_OPENCLAW_COMMAND)
    if (ok) {
      setGatewayMessage('OpenClaw CLI installed. Rechecking...')
      await refreshSetupState({ silent: true })
    }
  }, [refreshSetupState, runInstallCommand, systemCheck?.nodeInstalled])

  const handleStartGateway = useCallback(async () => {
    if (!systemCheck?.cliInstalled) {
      setInstallError('Install OpenClaw CLI first.')
      return
    }

    setGatewayMessage('Starting OpenClaw gateway...')
    const installOk = await runInstallCommand(GATEWAY_INSTALL_COMMAND)
    if (!installOk) return

    const startOk = await runInstallCommand(GATEWAY_START_COMMAND)
    if (!startOk) return

    setGatewayMessage('Gateway start command finished. Rechecking...')
    await refreshSetupState({ silent: true })
  }, [refreshSetupState, runInstallCommand, systemCheck?.cliInstalled])

  const handlePaste = useCallback(async () => {
    try {
      const pasted = await navigator.clipboard.readText()
      if (pasted.trim().length > 0) {
        setApiKey(pasted.trim())
        setSaveState('idle')
        setSaveMessage(null)
      }
    } catch {
      setSaveState('error')
      setSaveMessage('Clipboard access is blocked. Paste with Cmd+V.')
    }
  }, [])

  const handleSaveApiKey = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()

      const trimmedKey = apiKey.trim()
      if (!trimmedKey) {
        setSaveState('error')
        setSaveMessage('Please enter an API key.')
        return
      }

      const detectedProvider = inferProviderFromKey(trimmedKey)
      const effectiveProvider = detectedProvider || provider

      setProvider(effectiveProvider)
      setSaveState('checking')
      setSaveMessage('Updating OpenClaw config...')

      const envVars: Record<string, string> = {}
      if (effectiveProvider === 'anthropic') {
        envVars.ANTHROPIC_API_KEY = trimmedKey
      } else if (effectiveProvider === 'openai') {
        envVars.OPENAI_API_KEY = trimmedKey
      } else {
        envVars.GEMINI_API_KEY = trimmedKey
        envVars.GOOGLE_API_KEY = trimmedKey
      }

      const configResult = await window.api.gateway.getConfig()
      const existingConfig = configResult.ok && isPlainRecord(configResult.data)
        ? configResult.data
        : {}
      const existingEnv = isPlainRecord(existingConfig.env) ? existingConfig.env : {}
      const existingVars = isPlainRecord(existingEnv.vars) ? existingEnv.vars : {}

      const updateResult = await window.api.gateway.updateConfig({
        env: {
          ...existingEnv,
          vars: {
            ...existingVars,
            ...envVars
          }
        }
      })
      if (!updateResult.ok) {
        setSaveState('error')
        setSaveMessage(updateResult.error || 'Could not save API key.')
        return
      }

      await window.api.gateway.restart()

      setSaveState('success')
      setSaveMessage('API key saved. Checking gateway...')
      await refreshSetupState({ silent: true })
    },
    [apiKey, provider, refreshSetupState]
  )

  const busy = activeInstallCommand !== null
  const nodeInstalled = systemCheck?.nodeInstalled === true
  const openclawInstalled = systemCheck?.cliInstalled === true
  const gatewayRunning = gatewayInfo?.status === 'connected' || systemCheck?.gatewayReachable === true

  return (
    <div className="flex h-screen flex-col bg-[#0a0a0a] text-text-primary">
      <div className="h-8 w-full flex-shrink-0" style={{ WebkitAppRegion: 'drag' } as CSSProperties} />

      <div className="flex flex-1 items-center justify-center px-6 pb-10">
        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="w-full max-w-3xl"
        >
          {gatewayStep === 'checking' || gatewayStep === 'finishing' ? (
            <Card className="border-border/70 bg-surface/85 text-center backdrop-blur">
              <CardHeader className="items-center">
                <img src={logoIcon} alt="Pinchr" className="mb-2 h-16 w-16 rounded-2xl" />
                <CardTitle className="text-2xl">Preparing Pinchr</CardTitle>
                <CardDescription>{gatewayMessage || 'Checking OpenClaw gateway...'}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="inline-flex items-center gap-2 rounded-lg border border-border/70 px-3 py-2 text-sm text-text-secondary">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {gatewayStep === 'finishing' ? 'Opening chat...' : 'Checking setup...'}
                </div>
              </CardContent>
            </Card>
          ) : null}

          {gatewayStep === 'install' ? (
            <Card className="border-border/70 bg-surface/85 backdrop-blur">
              <CardHeader>
                <CardTitle className="text-2xl">Set up OpenClaw</CardTitle>
                <CardDescription>
                  Pinchr connects to a separately running OpenClaw gateway. Complete these steps in order.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="rounded-lg border border-border/70 bg-surface-2/40 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-text-primary">1. Install Node.js</p>
                        <p className="text-xs text-text-secondary">
                          {nodeInstalled
                            ? `Detected ${systemCheck?.nodeVersion || 'Node.js'}`
                            : 'Node.js is required to install the OpenClaw CLI.'}
                        </p>
                      </div>
                      {nodeInstalled ? (
                        <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                      ) : (
                        <Button type="button" variant="outline" size="sm" onClick={() => void window.api.shell.openExternal(NODE_DOWNLOAD_URL)}>
                          Download Node.js
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="rounded-lg border border-border/70 bg-surface-2/40 p-4">
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-text-primary">2. Install OpenClaw CLI</p>
                        <p className="text-xs text-text-secondary">
                          {openclawInstalled
                            ? `Installed ${systemCheck?.cliVersion || 'OpenClaw CLI'}`
                            : 'Install OpenClaw globally using npm.'}
                        </p>
                      </div>
                      {openclawInstalled ? (
                        <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                      ) : null}
                    </div>

                    <div className="rounded-md border border-border/80 bg-black/50 p-3 font-mono text-xs text-emerald-300">
                      {INSTALL_OPENCLAW_COMMAND}
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => void copyInstallCommand()}>
                        <Copy className="mr-2 h-4 w-4" />
                        {copiedInstall ? 'Copied' : 'Copy'}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => void handleInstallOpenclaw()}
                        disabled={busy || !nodeInstalled || openclawInstalled}
                      >
                        {busy && activeInstallCommand === INSTALL_OPENCLAW_COMMAND ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Terminal className="mr-2 h-4 w-4" />
                        )}
                        Install Now
                      </Button>
                    </div>
                  </div>

                  <div className="rounded-lg border border-border/70 bg-surface-2/40 p-4">
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-text-primary">3. Start Gateway</p>
                        <p className="text-xs text-text-secondary">
                          Run gateway install, then gateway start.
                        </p>
                      </div>
                      {gatewayRunning ? (
                        <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                      ) : null}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => void handleStartGateway()}
                        disabled={busy || !openclawInstalled}
                      >
                        {busy && (activeInstallCommand === GATEWAY_INSTALL_COMMAND || activeInstallCommand === GATEWAY_START_COMMAND) ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Terminal className="mr-2 h-4 w-4" />
                        )}
                        Start Gateway
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void refreshSetupState()}
                        disabled={busy}
                      >
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Recheck
                      </Button>
                    </div>
                  </div>
                </div>

                {(installLogs.trim().length > 0 || busy) && (
                  <div className="rounded-lg border border-border/70 bg-[#0f1014] p-3">
                    <div className="mb-2 text-xs font-medium uppercase tracking-wide text-text-muted">Live Output</div>
                    <pre
                      ref={logsRef}
                      className="max-h-44 overflow-auto whitespace-pre-wrap break-words font-mono text-xs text-text-secondary"
                    >
                      {installLogs || `$ ${activeInstallCommand}\n`}
                    </pre>
                  </div>
                )}

                {(installError || gatewayMessage) && (
                  <p className="flex items-start gap-2 text-sm text-amber-400">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{installError || gatewayMessage}</span>
                  </p>
                )}
              </CardContent>
            </Card>
          ) : null}

          {gatewayStep === 'api' ? (
            <Card className="border-border/70 bg-surface/85 backdrop-blur">
              <CardHeader>
                <CardTitle>Connect an AI provider</CardTitle>
                <CardDescription>
                  Gateway detected at {gatewayInfo?.url || 'http://127.0.0.1:18789'}. Add an API key to finish setup.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="mb-4 grid grid-cols-3 gap-2">
                  {PROVIDERS.map((entry) => (
                    <Button
                      key={entry.id}
                      type="button"
                      variant={provider === entry.id ? 'default' : 'outline'}
                      onClick={() => {
                        setProvider(entry.id)
                        setSaveState('idle')
                        setSaveMessage(null)
                      }}
                    >
                      {entry.label}
                    </Button>
                  ))}
                </div>

                <details className="mb-4 rounded-lg border border-border/70 bg-surface-2/40 px-3 py-2 text-xs text-text-secondary">
                  <summary className="cursor-pointer select-none">Where do I get a key?</summary>
                  <div className="mt-2 space-y-1">
                    {PROVIDERS.map((entry) => (
                      <p key={`${entry.id}-key-link`}>
                        <button
                          type="button"
                          onClick={() => void window.api.shell.openExternal(PROVIDER_KEY_LINKS[entry.id])}
                          className={cn(
                            'underline underline-offset-2 transition-colors hover:text-text-primary',
                            provider === entry.id ? 'text-accent' : 'text-text-secondary'
                          )}
                        >
                          {entry.label} API keys
                          <ExternalLink className="ml-1 inline h-3 w-3" />
                        </button>
                      </p>
                    ))}
                  </div>
                </details>

                {inferredProvider ? (
                  <div className="mb-3 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
                    Detected provider from key prefix: {inferredProvider === 'anthropic' ? 'Anthropic' : 'OpenAI'}
                  </div>
                ) : null}

                <form onSubmit={handleSaveApiKey} className="space-y-3">
                  <div className="flex gap-2">
                    <Input
                      value={apiKey}
                      onChange={(event) => {
                        setApiKey(event.target.value)
                        setSaveState('idle')
                        setSaveMessage(null)
                      }}
                      autoFocus
                      placeholder={selectedProvider.hint}
                      className="flex-1"
                    />
                    <Button type="button" variant="outline" onClick={() => void handlePaste()}>
                      Paste
                    </Button>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <Button type="button" variant="outline" onClick={() => void refreshSetupState()} disabled={finishing}>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Recheck
                    </Button>
                    <Button type="submit" disabled={saveState === 'checking' || finishing}>
                      {saveState === 'checking' || finishing ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        'Save & Continue'
                      )}
                    </Button>
                  </div>
                </form>

                {saveMessage && (
                  <p
                    className={cn(
                      'mt-4 flex items-center gap-2 text-sm',
                      saveState === 'error' && 'text-red-400',
                      saveState === 'success' && 'text-emerald-400',
                      (saveState === 'checking' || saveState === 'idle') && 'text-text-secondary'
                    )}
                  >
                    {saveState === 'checking' && <Loader2 className="h-4 w-4 animate-spin" />}
                    {saveState === 'success' && <CheckCircle2 className="h-4 w-4" />}
                    {saveState === 'error' && <AlertCircle className="h-4 w-4" />}
                    {saveMessage}
                  </p>
                )}
              </CardContent>
            </Card>
          ) : null}
        </motion.div>
      </div>
    </div>
  )
}
