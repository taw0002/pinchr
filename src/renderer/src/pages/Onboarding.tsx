import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertCircle, CheckCircle2, Loader2, ShieldCheck, Terminal, FileText, Globe, KeyRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import logoIcon from '@/assets/icon.png'
import { cn } from '@/lib/utils'

type OnboardingStep = 'welcome' | 'api' | 'security'
type AiProvider = 'anthropic' | 'openai' | 'google'
type SaveState = 'idle' | 'checking' | 'success' | 'error'
type GatewayState = 'idle' | 'starting' | 'ready' | 'error'

const STEP_ORDER: OnboardingStep[] = ['welcome', 'api', 'security']

const SECURITY_CAPABILITIES = [
  { icon: Terminal, text: 'Run commands on your machine' },
  { icon: FileText, text: 'Read and write files on your system' },
  { icon: Globe, text: 'Access the internet on your behalf' },
  { icon: KeyRound, text: 'Your API keys stay local — never sent to us' }
] as const

const THREAT_MODEL_URL =
  'https://github.com/openclaw/openclaw/blob/main/docs/security/THREAT-MODEL-ATLAS.md'
const TRUST_PAGE_URL = 'https://trust.openclaw.ai'
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

export default function Onboarding() {
  const [currentStep, setCurrentStep] = useState<OnboardingStep>('welcome')
  const [provider, setProvider] = useState<AiProvider>('anthropic')
  const [apiKey, setApiKey] = useState('')
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [gatewayState, setGatewayState] = useState<GatewayState>('idle')
  const [gatewayMessage, setGatewayMessage] = useState<string | null>(null)
  const [finishing, setFinishing] = useState(false)
  const [threatModelAcked, setThreatModelAcked] = useState(false)
  const [trustPageAcked, setTrustPageAcked] = useState(false)

  const stepIndex = STEP_ORDER.indexOf(currentStep)
  const progress = ((stepIndex + 1) / STEP_ORDER.length) * 100

  const selectedProvider = useMemo(
    () => PROVIDERS.find((entry) => entry.id === provider) ?? PROVIDERS[0],
    [provider]
  )

  const prepareGateway = useCallback(async () => {
    setGatewayState('starting')
    setGatewayMessage('Starting local gateway...')

    const init = await window.api.onboarding.writeInitialConfig()
    if (!init.ok) {
      setGatewayState('error')
      setGatewayMessage(init.error || 'Unable to prepare OpenClaw config.')
      return
    }

    const prepared = await window.api.onboarding.prepareGateway()
    if (!prepared.ok) {
      setGatewayState('error')
      setGatewayMessage(prepared.error || 'Unable to start gateway right now.')
      return
    }

    setGatewayState('ready')
    setGatewayMessage('Gateway is ready.')
  }, [])

  useEffect(() => {
    if (currentStep !== 'api') return

    void prepareGateway()
  }, [currentStep, prepareGateway])

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
      if (!apiKey.trim()) {
        setSaveState('error')
        setSaveMessage('Please enter an API key.')
        return
      }

      setSaveState('checking')
      setSaveMessage('Checking key and connecting...')

      const result = await window.api.onboarding.saveApiKey(provider, apiKey.trim())
      if (!result.ok) {
        setSaveState('error')
        setSaveMessage(result.error || 'Could not save API key.')
        return
      }

      setSaveState('success')
      setSaveMessage(gatewayState === 'ready' ? 'Connected! Opening chat...' : 'Connected. Waiting for gateway...')
    },
    [apiKey, gatewayState, provider]
  )

  const handleCompleteOnboarding = useCallback(async () => {
    setFinishing(true)
    try {
      localStorage.setItem('onboarding_completed', 'true')
      await window.api.onboarding.complete()
      window.location.hash = '#/chat'
      window.location.reload()
    } catch {
      setFinishing(false)
      setSaveState('error')
      setSaveMessage('Could not finalize onboarding. Please try again.')
    }
  }, [])

  useEffect(() => {
    if (currentStep !== 'api') return
    if (saveState !== 'success') return
    if (gatewayState !== 'ready') return
    if (finishing) return

    setCurrentStep('security')
  }, [currentStep, finishing, gatewayState, saveState])

  return (
    <div className="flex h-screen flex-col bg-[#0a0a0a] text-text-primary">
      <div className="h-8 w-full flex-shrink-0" style={{ WebkitAppRegion: 'drag' }} />

      <div className="relative h-[3px] w-full flex-shrink-0 bg-surface-2">
        <motion.div
          className="absolute inset-y-0 left-0 bg-accent"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.35, ease: 'easeInOut' }}
        />
      </div>

      <div className="px-6 py-4">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-3">
          {STEP_ORDER.map((step, index) => {
            const isActive = index === stepIndex
            const isPast = index < stepIndex
            return (
              <div key={step} className="flex flex-1 items-center gap-2">
                <div
                  className={cn(
                    'h-2.5 w-2.5 rounded-full transition-colors',
                    isPast && 'bg-accent',
                    isActive && 'bg-white',
                    !isPast && !isActive && 'bg-surface-3'
                  )}
                />
                <span
                  className={cn(
                    'text-xs capitalize',
                    isPast || isActive ? 'text-text-primary' : 'text-text-muted'
                  )}
                >
                  {step === 'api' ? 'API Key' : step === 'security' ? 'Security' : step}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center px-6 pb-10">
        <AnimatePresence mode="wait">
          {currentStep === 'welcome' && (
            <motion.div
              key="welcome"
              initial={{ opacity: 0, y: 18, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -12, scale: 0.98 }}
              transition={{ duration: 0.35, ease: 'easeOut' }}
              className="w-full max-w-2xl"
            >
              <Card className="border-border/70 bg-surface/80 text-center backdrop-blur">
                <CardHeader className="items-center">
                  <motion.img
                    src={logoIcon}
                    alt="Pinchr"
                    className="mb-3 h-16 w-16 rounded-2xl"
                    initial={{ opacity: 0, scale: 0.85, rotate: -8 }}
                    animate={{ opacity: 1, scale: 1, rotate: 0 }}
                    transition={{ duration: 0.4, ease: 'easeOut' }}
                  />
                  <CardTitle className="text-3xl">Meet your AI assistant</CardTitle>
                  <CardDescription className="max-w-xl text-base">
                    Pinchr gives you a personal AI that lives on your desktop - it can help you think, build, research, and get things done. Let&apos;s get you set up.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button size="lg" className="h-11 px-8" onClick={() => setCurrentStep('api')}>
                    Let&apos;s go
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {currentStep === 'api' && (
            <motion.div
              key="api"
              initial={{ opacity: 0, y: 18, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -12, scale: 0.98 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              className="w-full max-w-2xl"
            >
              <Card className="border-border/70 bg-surface/85 backdrop-blur">
                <CardHeader>
                  <CardTitle>Connect an AI provider</CardTitle>
                  <CardDescription>
                    Your assistant needs an AI model to think with. Paste an API key from any provider below. Your key stays on your machine - it&apos;s never sent to us.
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
                          <a
                            href={PROVIDER_KEY_LINKS[entry.id]}
                            target="_blank"
                            rel="noreferrer"
                            className={cn(
                              'underline underline-offset-2 transition-colors hover:text-text-primary',
                              provider === entry.id ? 'text-accent' : 'text-text-secondary'
                            )}
                          >
                            {entry.label} API keys
                          </a>
                        </p>
                      ))}
                    </div>
                  </details>

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
                      <Button type="button" variant="ghost" onClick={() => void handleCompleteOnboarding()} disabled={finishing}>
                        {finishing ? 'Opening chat...' : 'Skip for now'}
                      </Button>
                      <Button type="submit" disabled={saveState === 'checking' || finishing}>
                        {saveState === 'checking' || finishing ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            {finishing ? 'Opening chat...' : 'Checking...'}
                          </>
                        ) : (
                          'Save & Continue'
                        )}
                      </Button>
                    </div>
                  </form>

                  <div className="mt-4 min-h-5 text-sm">
                    {gatewayState === 'starting' && (
                      <p className="flex items-center gap-2 text-text-secondary">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {gatewayMessage}
                      </p>
                    )}
                    {gatewayState === 'ready' && (
                      <p className="flex items-center gap-2 text-emerald-400">
                        <CheckCircle2 className="h-4 w-4" />
                        {gatewayMessage}
                      </p>
                    )}
                    {gatewayState === 'error' && (
                      <p className="flex items-center gap-2 text-amber-400">
                        <AlertCircle className="h-4 w-4" />
                        {gatewayMessage}
                      </p>
                    )}

                    {saveMessage && (
                      <p
                        className={cn(
                          'mt-1 flex items-center gap-2',
                          saveState === 'error' && 'text-red-400',
                          saveState === 'success' && 'text-emerald-400',
                          saveState === 'checking' && 'text-text-secondary',
                          saveState === 'idle' && 'text-text-secondary'
                        )}
                      >
                        {saveState === 'checking' && <Loader2 className="h-4 w-4 animate-spin" />}
                        {saveState === 'success' && <CheckCircle2 className="h-4 w-4" />}
                        {saveState === 'error' && <AlertCircle className="h-4 w-4" />}
                        {saveMessage}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
          {currentStep === 'security' && (
            <motion.div
              key="security"
              initial={{ opacity: 0, y: 18, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -12, scale: 0.98 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              className="w-full max-w-2xl"
            >
              <Card className="border-border/70 bg-surface/85 backdrop-blur">
                <CardHeader className="items-center text-center">
                  <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/10">
                    <ShieldCheck className="h-6 w-6 text-amber-400" />
                  </div>
                  <CardTitle className="text-2xl">Before you begin</CardTitle>
                  <CardDescription className="max-w-lg text-sm">
                    Pinchr runs an AI agent with real access to your system.
                    Please review what that means.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  {/* Capabilities */}
                  <div className="space-y-2">
                    {SECURITY_CAPABILITIES.map((cap) => (
                      <div
                        key={cap.text}
                        className="flex items-center gap-3 rounded-lg border border-border/50 bg-surface-2/40 px-4 py-2.5 text-sm text-text-secondary"
                      >
                        <cap.icon className="h-4 w-4 shrink-0 text-text-muted" />
                        <span>{cap.text}</span>
                      </div>
                    ))}
                  </div>

                  {/* Acknowledgment checkboxes */}
                  <div className="space-y-3 pt-1">
                    <label className="flex cursor-pointer items-start gap-3">
                      <input
                        type="checkbox"
                        checked={threatModelAcked}
                        onChange={(e) => setThreatModelAcked(e.target.checked)}
                        className="mt-0.5 h-4 w-4 shrink-0 accent-accent"
                      />
                      <span className="text-sm text-text-secondary">
                        I have read the{' '}
                        <button
                          type="button"
                          className="text-accent underline underline-offset-2 hover:text-accent/80"
                          onClick={() => void window.api.shell.openExternal(THREAT_MODEL_URL)}
                        >
                          Threat Model
                        </button>
                      </span>
                    </label>
                    <label className="flex cursor-pointer items-start gap-3">
                      <input
                        type="checkbox"
                        checked={trustPageAcked}
                        onChange={(e) => setTrustPageAcked(e.target.checked)}
                        className="mt-0.5 h-4 w-4 shrink-0 accent-accent"
                      />
                      <span className="text-sm text-text-secondary">
                        I have read the{' '}
                        <button
                          type="button"
                          className="text-accent underline underline-offset-2 hover:text-accent/80"
                          onClick={() => void window.api.shell.openExternal(TRUST_PAGE_URL)}
                        >
                          Trust &amp; Security Page
                        </button>
                      </span>
                    </label>
                  </div>

                  {/* Continue */}
                  <div className="flex justify-end pt-2">
                    <Button
                      size="lg"
                      className="h-11 px-8"
                      disabled={!threatModelAcked || !trustPageAcked || finishing}
                      onClick={() => {
                        localStorage.setItem('security_acknowledged', 'true')
                        void handleCompleteOnboarding()
                      }}
                    >
                      {finishing ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Opening chat...
                        </>
                      ) : (
                        'Continue →'
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
