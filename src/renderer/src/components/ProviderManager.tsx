import { useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, ExternalLink, Eye, EyeOff, KeyRound, Loader2, MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { PROVIDERS, type ProviderBadgeColor } from '@/data/providers'
import type { ProviderConnection, ProviderId } from '../../../shared/types'

interface ProviderManagerProps {
  statuses: ProviderConnection[]
  isLoading?: boolean
  gatewayRunning: boolean
  onProvidersChanged: () => void
  onNavigateToCommandCenter?: () => void
}

type ProviderFeedback = {
  providerId: ProviderId
  type: 'success' | 'error' | 'warning'
  message: string
}

const BADGE_COLOR_CLASSES: Record<ProviderBadgeColor, string> = {
  amber: 'bg-amber-500/15 text-amber-400',
  green: 'bg-emerald-500/15 text-emerald-400',
  blue: 'bg-blue-500/15 text-blue-400',
  purple: 'bg-purple-500/15 text-purple-400'
}

function validateKeyFormat(providerId: ProviderId, apiKey: string): string | null {
  const provider = PROVIDERS.find((entry) => entry.id === providerId)
  if (!provider) return 'Unsupported provider.'

  const trimmed = apiKey.trim()
  if (!trimmed) return 'API key is required.'

  if (provider.keyPrefix && !trimmed.startsWith(provider.keyPrefix)) {
    return `This key should start with "${provider.keyPrefix}".`
  }
  return null
}

export function ProviderManager({
  statuses,
  isLoading,
  gatewayRunning,
  onProvidersChanged,
  onNavigateToCommandCenter
}: ProviderManagerProps) {
  const [expandedProvider, setExpandedProvider] = useState<ProviderId | null>(null)
  const [draftKeys, setDraftKeys] = useState<Partial<Record<ProviderId, string>>>({})
  const [revealed, setRevealed] = useState<Partial<Record<ProviderId, boolean>>>({})
  const [feedback, setFeedback] = useState<ProviderFeedback | null>(null)

  const statusMap = useMemo(() => {
    const map = new Map<ProviderId, ProviderConnection>()
    for (const status of statuses) {
      map.set(status.id, status)
    }
    return map
  }, [statuses])

  const saveKeyMutation = useMutation({
    mutationFn: async ({ providerId, apiKey }: { providerId: ProviderId; apiKey: string }) => {
      const formatError = validateKeyFormat(providerId, apiKey)
      if (formatError) throw new Error(formatError)

      const result = await window.api.providers.setKey({ provider: providerId, apiKey: apiKey.trim() })
      if (!result.ok) throw new Error(result.error || 'Failed to save API key.')

      const restartResult = await window.api.gateway.restart()
      return {
        providerId,
        restartError: restartResult.ok ? null : restartResult.error || 'Gateway restart failed.'
      }
    },
    onSuccess: ({ providerId, restartError }) => {
      setDraftKeys((prev) => ({ ...prev, [providerId]: '' }))
      onProvidersChanged()
      setFeedback({
        providerId,
        type: restartError ? 'warning' : 'success',
        message: restartError
          ? `Key saved. ${restartError}`
          : 'Connected - you are ready to use this provider.'
      })
    },
    onError: (error, variables) => {
      setFeedback({
        providerId: variables.providerId,
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to save API key.'
      })
    }
  })

  const removeKeyMutation = useMutation({
    mutationFn: async ({ providerId }: { providerId: ProviderId }) => {
      const result = await window.api.providers.removeKey({ provider: providerId })
      if (!result.ok) throw new Error(result.error || 'Failed to remove API key.')

      const restartResult = await window.api.gateway.restart()
      return {
        providerId,
        restartError: restartResult.ok ? null : restartResult.error || 'Gateway restart failed.'
      }
    },
    onSuccess: ({ providerId, restartError }) => {
      onProvidersChanged()
      setFeedback({
        providerId,
        type: restartError ? 'warning' : 'success',
        message: restartError ? `Key removed. ${restartError}` : 'API key removed.'
      })
    },
    onError: (error, variables) => {
      setFeedback({
        providerId: variables.providerId,
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to remove API key.'
      })
    }
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRound className="h-4 w-4 text-accent" />
          AI Providers
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-text-muted">
          Connect your AI provider API keys. You need at least one to get started.
        </p>

        {onNavigateToCommandCenter && (
          <button
            type="button"
            onClick={onNavigateToCommandCenter}
            className="flex w-full items-center gap-2 rounded-lg border border-accent/20 bg-accent/10 px-3 py-2 text-left text-xs text-accent hover:bg-accent/15"
          >
            <MessageCircle className="h-3.5 w-3.5 shrink-0" />
            Need help? Ask your agent - it can walk you through any step.
          </button>
        )}

        {!gatewayRunning && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300">
            Gateway is not running. You can still manage API keys now.
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center gap-2 py-3 text-sm text-text-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading provider status...
          </div>
        ) : (
          <div className="space-y-2">
            {PROVIDERS.map((provider) => {
              const status = statusMap.get(provider.id)
              const connected = Boolean(status?.configured)
              const isExpanded = expandedProvider === provider.id
              const draftKey = draftKeys[provider.id] ?? ''
              const showKey = Boolean(revealed[provider.id])
              const isSaving =
                saveKeyMutation.isPending && saveKeyMutation.variables?.providerId === provider.id
              const isRemoving =
                removeKeyMutation.isPending && removeKeyMutation.variables?.providerId === provider.id
              const providerFeedback = feedback?.providerId === provider.id ? feedback : null

              return (
                <div key={provider.id} className="rounded-lg border border-border bg-surface-2 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-text-primary">{provider.name}</p>
                        {connected ? (
                          <Badge variant="success">Connected</Badge>
                        ) : (
                          <Badge variant="secondary">Not connected</Badge>
                        )}
                      </div>
                      <p className="text-xs text-text-muted">{provider.description}</p>
                    </div>
                    <Button
                      size="sm"
                      variant={connected ? 'secondary' : 'default'}
                      onClick={() =>
                        setExpandedProvider((current) => (current === provider.id ? null : provider.id))
                      }
                    >
                      {connected ? 'Manage' : 'Help me set up'}
                    </Button>
                  </div>

                  {isExpanded && (
                    <div className="mt-3 space-y-3 border-t border-border/70 pt-3">
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-text-secondary">API Key</p>
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <Input
                            type={showKey ? 'text' : 'password'}
                            value={draftKey}
                            onChange={(event) => {
                              const nextValue = event.target.value
                              setDraftKeys((prev) => ({ ...prev, [provider.id]: nextValue }))
                            }}
                            placeholder={connected ? '****************' : provider.keyPlaceholder}
                            autoComplete="off"
                          />
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                setRevealed((prev) => ({ ...prev, [provider.id]: !showKey }))
                              }
                            >
                              {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => saveKeyMutation.mutate({ providerId: provider.id, apiKey: draftKey })}
                              disabled={isSaving || draftKey.trim().length === 0}
                              className="gap-1.5"
                            >
                              {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                              Save
                            </Button>
                          </div>
                        </div>
                        {connected && draftKey.trim().length === 0 && (
                          <p className="text-xs text-text-muted">
                            A key is already saved. Enter a new key to replace it.
                          </p>
                        )}
                      </div>

                      {providerFeedback && (
                        <div
                          className={cn(
                            'rounded-lg border p-2.5 text-xs',
                            providerFeedback.type === 'success' && 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300',
                            providerFeedback.type === 'warning' && 'border-amber-500/30 bg-amber-500/10 text-amber-300',
                            providerFeedback.type === 'error' && 'border-red-500/30 bg-red-500/10 text-red-300'
                          )}
                        >
                          {providerFeedback.message}
                        </div>
                      )}

                      <div className="space-y-2">
                        {provider.instructions.map((step, index) => (
                          <div key={`${provider.id}-step-${index + 1}`} className="rounded-lg border border-border/60 bg-surface p-2.5">
                            <p className="text-[11px] font-medium text-text-secondary">Step {index + 1}</p>
                            <p className="text-xs text-text-muted">{step}</p>
                          </div>
                        ))}
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="gap-1.5"
                          onClick={() => window.api.shell.openExternal(provider.setupUrl)}
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          Open {provider.name} Console
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="gap-1.5"
                          onClick={() => window.api.shell.openExternal(provider.billingUrl)}
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          Billing Setup
                        </Button>
                      </div>

                      {provider.setupTip && (
                        <p className="text-xs text-text-muted">{provider.setupTip}</p>
                      )}

                      {provider.warning && (
                        <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 p-2.5 text-xs text-amber-300">
                          {provider.warning}
                        </div>
                      )}

                      {connected && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="gap-1.5 border-red-500/30 text-red-300 hover:bg-red-500/10 hover:text-red-200"
                          disabled={isRemoving}
                          onClick={() => {
                            const confirmed = window.confirm(`Remove ${provider.name} API key?`)
                            if (!confirmed) return
                            removeKeyMutation.mutate({ providerId: provider.id })
                          }}
                        >
                          {isRemoving ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <AlertTriangle className="h-3.5 w-3.5" />
                          )}
                          Remove Key
                        </Button>
                      )}

                      {onNavigateToCommandCenter && (
                        <button
                          type="button"
                          onClick={onNavigateToCommandCenter}
                          className="flex items-center gap-2 text-xs text-accent hover:underline"
                        >
                          <MessageCircle className="h-3.5 w-3.5" />
                          Need help? Ask your agent.
                        </button>
                      )}

                      {connected && (
                        <div className="flex items-center gap-2 text-xs text-emerald-300">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Connected - you are ready to use {provider.name} models.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
