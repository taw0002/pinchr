import { AlertTriangle, CheckCircle2, Cpu } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { PROVIDERS, type ProviderBadgeColor } from '@/data/providers'
import type { LocalModelStatus, ProviderConnection } from '../../../shared/types'

interface ModelSelectorProps {
  selectedModel: string
  onSelectModel: (modelId: string) => void
  providerStatuses: ProviderConnection[]
  localModels: LocalModelStatus
  isLoading?: boolean
}

const BADGE_COLOR_CLASSES: Record<ProviderBadgeColor, string> = {
  amber: 'bg-amber-500/15 text-amber-300',
  green: 'bg-emerald-500/15 text-emerald-300',
  blue: 'bg-blue-500/15 text-blue-300',
  purple: 'bg-purple-500/15 text-purple-300'
}

const COST_TIER_CLASSES: Record<'$' | '$$' | '$$$', string> = {
  $: 'bg-emerald-500/15 text-emerald-300',
  $$: 'bg-amber-500/15 text-amber-300',
  $$$: 'bg-red-500/15 text-red-300'
}

function localModelSelectionId(rawId: string): string {
  return rawId.replace(/^([^:]+):/, '$1/')
}

function localProviderName(provider: 'lmstudio' | 'ollama'): string {
  return provider === 'lmstudio' ? 'LM Studio' : 'Ollama'
}

export function ModelSelector({
  selectedModel,
  onSelectModel,
  providerStatuses,
  localModels,
  isLoading
}: ModelSelectorProps) {
  const connectedIds = new Set(
    providerStatuses.filter((status) => status.configured).map((status) => status.id)
  )

  const cloudProviders = PROVIDERS.filter((provider) => connectedIds.has(provider.id))
  const hasCloudModels = cloudProviders.some((provider) => provider.models.length > 0)
  const hasLocalModels = localModels.models.length > 0

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Cpu className="h-4 w-4 text-accent" />
          Default Model
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <p className="text-sm text-text-muted">Loading models...</p>
        ) : (
          <>
            {!hasCloudModels && !hasLocalModels && (
              <div className="rounded-lg border border-accent/30 bg-accent/10 p-3 text-sm text-accent">
                Connect a provider above to choose a default model.
              </div>
            )}

            {cloudProviders.map((provider) => (
              <div key={provider.id} className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
                  {provider.name}
                </p>
                {provider.models.map((model) => {
                  const selected = selectedModel === model.id
                  return (
                    <button
                      key={model.id}
                      type="button"
                      onClick={() => onSelectModel(model.id)}
                      className={cn(
                        'w-full rounded-lg border p-3 text-left transition-colors',
                        selected
                          ? 'border-accent bg-accent/10'
                          : 'border-border bg-surface-2 hover:border-accent/40'
                      )}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-text-primary">{model.name}</span>
                          <Badge className={cn('text-[10px]', COST_TIER_CLASSES[model.costTier])}>
                            {model.costTier}
                          </Badge>
                          {model.badge && (
                            <Badge
                              className={cn(
                                'text-[10px]',
                                model.badgeColor ? BADGE_COLOR_CLASSES[model.badgeColor] : 'bg-surface-3 text-text-secondary'
                              )}
                            >
                              {model.badge}
                            </Badge>
                          )}
                        </div>
                        {selected && <CheckCircle2 className="h-4 w-4 text-accent" />}
                      </div>
                      <p className="mt-1 text-xs text-text-muted">
                        {provider.name} - {model.description}
                      </p>
                    </button>
                  )
                })}
              </div>
            ))}

            {hasLocalModels && (
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
                  Local Models ({localModels.models.length})
                </p>
                {localModels.models.map((model) => {
                  const normalizedId = localModelSelectionId(model.id)
                  const selected = selectedModel === normalizedId
                  return (
                    <button
                      key={model.id}
                      type="button"
                      onClick={() => onSelectModel(normalizedId)}
                      className={cn(
                        'w-full rounded-lg border p-3 text-left transition-colors',
                        selected
                          ? 'border-accent bg-accent/10'
                          : 'border-border bg-surface-2 hover:border-accent/40'
                      )}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-text-primary">{model.name}</span>
                          <Badge className="bg-slate-500/15 text-slate-300 text-[10px]">Free</Badge>
                        </div>
                        {selected && <CheckCircle2 className="h-4 w-4 text-accent" />}
                      </div>
                      <p className="mt-1 text-xs text-text-muted">
                        {localProviderName(model.provider)} - Runs on your machine
                      </p>
                    </button>
                  )
                })}
                <p className="text-xs text-amber-300">
                  Local models may not support all features like tool use or thinking.
                </p>
              </div>
            )}

            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
              <p className="font-medium text-amber-100">
                We recommend Claude Opus or Sonnet for the best experience.
              </p>
              <div className="mt-1 flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" />
                <p>
                  Non-frontier and open-source models may produce lower quality results and may not support
                  features like tool use or thinking.
                </p>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
