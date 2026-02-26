import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, ArrowRight, ChevronDown, ChevronUp, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
// aiProxy imports removed — managed mode is Coming Soon

type AiProvider = 'anthropic' | 'openai' | 'google'

interface Model {
  id: string
  name: string
  badge: string | null
  description: string
}

const ANTHROPIC_MODELS: Model[] = [
  {
    id: 'anthropic/claude-sonnet-4-20250514',
    name: 'Claude Sonnet 4',
    badge: 'Recommended',
    description: 'Balanced capability and speed for daily work'
  },
  {
    id: 'anthropic/claude-opus-4-6',
    name: 'Claude Opus 4.6',
    badge: null,
    description: 'Most capable — deep reasoning, complex tasks'
  },
  {
    id: 'anthropic/claude-haiku-3-5',
    name: 'Claude Haiku 3.5',
    badge: null,
    description: 'Fastest and cheapest — quick tasks'
  }
]

const OPENAI_MODELS: Model[] = [
  {
    id: 'openai/gpt-5.2',
    name: 'GPT-5.2',
    badge: 'Recommended',
    description: 'Most capable — reasoning and code'
  },
  { id: 'openai/gpt-4.1', name: 'GPT-4.1', badge: null, description: 'Strong all-rounder' },
  { id: 'openai/gpt-4.1-mini', name: 'GPT-4.1 Mini', badge: null, description: 'Fast and affordable' }
]

const GOOGLE_MODELS: Model[] = [
  {
    id: 'google/gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    badge: 'Recommended',
    description: 'Top-tier reasoning and multimodal capability'
  },
  {
    id: 'google/gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    badge: null,
    description: 'Faster and cheaper for everyday tasks'
  }
]

const KEY_INSTRUCTIONS: Record<AiProvider, { steps: string[]; url: string }> = {
  anthropic: {
    steps: [
      'Go to console.anthropic.com',
      'Sign up or log in',
      'Click "API Keys" in the sidebar',
      'Click "Create Key" and copy it'
    ],
    url: 'https://console.anthropic.com/settings/keys'
  },
  openai: {
    steps: [
      'Go to platform.openai.com',
      'Sign up or log in',
      'Click your profile → "API Keys"',
      'Click "Create new secret key" and copy it'
    ],
    url: 'https://platform.openai.com/api-keys'
  },
  google: {
    steps: [
      'Go to ai.google.dev',
      'Open the API keys page',
      'Create a new key in your Google project',
      'Copy the generated API key'
    ],
    url: 'https://ai.google.dev/gemini-api/docs/api-key'
  }
}

interface OnboardingAiKeyCardProps {
  connected: { anthropic: boolean; openai: boolean; google: boolean }
  selectedProvider: AiProvider | null
  selectedModel: string | null
  onSelectProvider: (provider: AiProvider) => void
  onSelectModel: (model: string) => void
  onValidateAndSaveKey: (provider: AiProvider, key: string) => Promise<{ ok: boolean; error?: string }>
}

export function OnboardingAiKeyCard({
  connected,
  selectedProvider,
  selectedModel,
  onSelectProvider,
  onSelectModel,
  onValidateAndSaveKey
}: OnboardingAiKeyCardProps) {
  const [showInstructions, setShowInstructions] = useState(false)
  const [showKeyInput, setShowKeyInput] = useState<AiProvider | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [validating, setValidating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const providers = [
    {
      id: 'anthropic' as AiProvider,
      emoji: '🧠',
      title: 'Anthropic (Claude)',
      subtitle: 'Reliable all-rounder — Sonnet 4 default',
      badge: 'Recommended',
      connected: connected.anthropic,
      accentBg: 'bg-orange-500/10'
    },
    {
      id: 'openai' as AiProvider,
      emoji: '⚡',
      title: 'OpenAI (GPT)',
      subtitle: 'Fast and capable — GPT-4.1 default',
      connected: connected.openai,
      accentBg: 'bg-emerald-500/10'
    },
    {
      id: 'google' as AiProvider,
      emoji: '✨',
      title: 'Google (Gemini)',
      subtitle: 'Strong multimodal and high-context capability',
      connected: connected.google,
      accentBg: 'bg-blue-500/10'
    }
  ]

  const models =
    selectedProvider === 'anthropic'
      ? ANTHROPIC_MODELS
      : selectedProvider === 'openai'
        ? OPENAI_MODELS
        : selectedProvider === 'google'
          ? GOOGLE_MODELS
          : []

  const isConnected = selectedProvider
    ? connected[selectedProvider]
    : false

  const handleProviderClick = (provider: AiProvider) => {
    if (connected[provider]) {
      onSelectProvider(provider)
    } else {
      setShowKeyInput(provider)
      setApiKey('')
      setError(null)
      setSuccess(null)
    }
  }

  const handleSaveKey = async () => {
    if (!apiKey.trim() || !showKeyInput) return
    setError(null)
    setSuccess(null)
    setValidating(true)

    try {
      const result = await onValidateAndSaveKey(showKeyInput, apiKey)
      if (result.ok) {
        onSelectProvider(showKeyInput)
        // Auto-select recommended model
        if (showKeyInput === 'anthropic') {
          onSelectModel('anthropic/claude-sonnet-4-20250514')
        } else if (showKeyInput === 'openai') {
          onSelectModel('openai/gpt-4.1')
        } else if (showKeyInput === 'google') {
          onSelectModel('google/gemini-2.5-pro')
        }
        setSuccess('API key verified and saved!')
        await new Promise((resolve) => setTimeout(resolve, 800))
        setShowKeyInput(null)
        setApiKey('')
      } else {
        setError(result.error || 'Failed to save API key.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error validating API key.')
    } finally {
      setValidating(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      className="glass-card relative w-full max-w-xl rounded-2xl border border-border/50 p-6"
    >
      <div className="mb-4">
        <h3 className="mb-1 text-lg font-semibold text-text-primary">Connect Your AI</h3>
        <p className="text-sm text-text-secondary">
          Start chatting instantly with Pinchr AI, or bring your own API keys.
        </p>
      </div>

      {/* Managed AI option — Coming Soon */}
      <div
        className="w-full rounded-lg border border-border bg-surface-2 p-4 text-left mb-4 opacity-50 cursor-not-allowed"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/15">
              <Zap className="text-lg text-accent h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-text-primary">
                  Start chatting — no setup needed
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
                  Coming Soon
                </span>
              </div>
              <div className="text-xs text-text-muted">
                Use Pinchr AI credits. Included with your plan, recharge anytime.
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex-1 h-px bg-border" />
        <span className="text-[10px] font-medium text-text-muted uppercase tracking-wider">Or bring your own key</span>
        <div className="flex-1 h-px bg-border" />
      </div>

      {/* Provider selection */}
      <div className="mb-4 space-y-2">
        {providers.map((provider) => (
          <button
            key={provider.id}
            onClick={() => handleProviderClick(provider.id)}
            className={cn(
              'w-full rounded-lg border p-4 text-left transition-all',
              selectedProvider === provider.id && provider.connected
                ? 'border-accent bg-accent/5 ring-1 ring-accent'
                : 'border-border bg-surface-2 hover:border-accent/50 hover:bg-surface-3'
            )}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    'flex h-10 w-10 items-center justify-center rounded-lg',
                    provider.accentBg
                  )}
                >
                  <span className="text-lg">{provider.emoji}</span>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-text-primary">{provider.title}</span>
                    {provider.badge && (
                      <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent">
                        {provider.badge}
                      </span>
                    )}
                    {provider.connected && (
                      <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                        Verified
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-text-muted">{provider.subtitle}</div>
                </div>
              </div>
              {provider.connected ? (
                <Check className="h-5 w-5 text-accent" />
              ) : (
                <ArrowRight className="h-4 w-4 text-text-muted" />
              )}
            </div>
          </button>
        ))}
      </div>

      {/* "How do I get a key?" expandable */}
      <button
        onClick={() => setShowInstructions(!showInstructions)}
        className="mb-4 flex w-full items-center justify-between rounded-lg border border-border bg-surface-2 px-4 py-3 text-sm text-text-primary transition-colors hover:bg-surface-3"
      >
        <span>How do I get a key?</span>
        {showInstructions ? (
          <ChevronUp className="h-4 w-4 text-text-muted" />
        ) : (
          <ChevronDown className="h-4 w-4 text-text-muted" />
        )}
      </button>

      {/* Instructions expandable content */}
      <AnimatePresence>
        {showInstructions && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-4 overflow-hidden"
          >
            <div className="space-y-3 rounded-lg border border-border bg-surface-2 p-4 text-xs text-text-secondary">
              <div>
                <div className="mb-2 font-medium text-text-primary">Anthropic (Recommended)</div>
                <ol className="ml-4 list-decimal space-y-1">
                  {KEY_INSTRUCTIONS.anthropic.steps.map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>
              </div>
              <div>
                <div className="mb-2 font-medium text-text-primary">OpenAI</div>
                <ol className="ml-4 list-decimal space-y-1">
                  {KEY_INSTRUCTIONS.openai.steps.map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Model selection — shown after key is connected */}
      <AnimatePresence>
        {isConnected && selectedProvider && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mb-3 text-xs font-medium uppercase tracking-wider text-text-muted">
              Choose Model
            </div>
            <div className="space-y-2">
              {models.map((model) => (
                <button
                  key={model.id}
                  onClick={() => onSelectModel(model.id)}
                  className={cn(
                    'w-full rounded-lg border p-3 text-left transition-all',
                    selectedModel === model.id
                      ? 'border-accent bg-accent/5 ring-1 ring-accent'
                      : 'border-border bg-surface-2 hover:border-accent/50'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-text-primary">{model.name}</span>
                        {model.badge && (
                          <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent">
                            {model.badge}
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 text-xs text-text-muted">{model.description}</div>
                    </div>
                    {selectedModel === model.id && <Check className="h-4 w-4 text-accent" />}
                  </div>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* API Key Input Modal */}
      <AnimatePresence>
        {showKeyInput && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
            onClick={() => {
              if (!validating) {
                setShowKeyInput(null)
                setApiKey('')
                setError(null)
                setSuccess(null)
              }
            }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-md rounded-xl border border-border bg-surface-2 p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="mb-4 text-lg font-semibold text-text-primary">
                {showKeyInput === 'anthropic'
                  ? 'Anthropic'
                  : showKeyInput === 'openai'
                    ? 'OpenAI'
                    : 'Google Gemini'}{' '}
                API Key
              </h3>
              <div className="space-y-4">
                <Input
                  type="password"
                  placeholder={`Enter your ${
                    showKeyInput === 'anthropic'
                      ? 'Anthropic'
                      : showKeyInput === 'openai'
                        ? 'OpenAI'
                        : 'Google Gemini'
                  } API key`}
                  value={apiKey}
                  onChange={(e) => {
                    if (error) setError(null)
                    if (success) setSuccess(null)
                    setApiKey(e.target.value)
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveKey()}
                  className="w-full"
                  autoFocus
                />
                {error && (
                  <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                    {error}
                  </div>
                )}
                {success && (
                  <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
                    {success}
                  </div>
                )}
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowKeyInput(null)
                      setApiKey('')
                      setError(null)
                      setSuccess(null)
                    }}
                    disabled={validating}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSaveKey}
                    disabled={!apiKey.trim() || validating}
                    className="flex-1"
                  >
                    {validating ? (
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    ) : (
                      'Save'
                    )}
                  </Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
