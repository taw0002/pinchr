import { Check } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useAiProxy } from '@/hooks/useAiProxy'
import { AVAILABLE_MODELS, type ModelInfo } from '@/services/aiProxy'

const COST_TIER_COLORS = {
  $: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  $$: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
  $$$: 'bg-red-500/10 text-red-400 border-red-500/30'
} as const

function ModelRow({
  model,
  isSelected,
  onSelect
}: {
  model: ModelInfo
  isSelected: boolean
  onSelect: () => void
}) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        'w-full rounded-lg border p-3 text-left transition-all',
        isSelected
          ? 'border-accent bg-accent/5 ring-1 ring-accent'
          : 'border-border bg-surface-2 hover:border-accent/50 hover:bg-surface-3'
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-text-primary">{model.name}</span>
              <Badge
                variant="secondary"
                className={cn('text-[10px] px-1.5 py-0', COST_TIER_COLORS[model.costTier])}
              >
                {model.costTier}
              </Badge>
            </div>
            <p className="text-xs text-text-muted mt-0.5">{model.provider}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isSelected && <Check className="h-4 w-4 text-accent" />}
        </div>
      </div>
    </button>
  )
}

export function ModelPicker() {
  const { settings, updateSettings } = useAiProxy()

  const handleSelect = (modelId: string) => {
    updateSettings({ selectedModel: modelId })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          🤖 Model
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-xs text-text-muted mb-2">
          Select a default model. In BYOK mode, the model is configured in your gateway settings.
        </p>
        {AVAILABLE_MODELS.map((model) => (
          <ModelRow
            key={model.id}
            model={model}
            isSelected={settings.selectedModel === model.id}
            onSelect={() => handleSelect(model.id)}
          />
        ))}
      </CardContent>
    </Card>
  )
}
