import { motion } from 'framer-motion'
import { Zap, Key } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { useAiProxy } from '@/hooks/useAiProxy'
import { type AiMode } from '@/services/aiProxy'

interface ModeOption {
  id: AiMode
  icon: typeof Zap
  title: string
  subtitle: string
  badge?: string
  comingSoon?: boolean
}

const MODE_OPTIONS: ModeOption[] = [
  {
    id: 'managed',
    icon: Zap,
    title: 'Pinchr AI',
    subtitle: 'Credits-based, no API key needed',
    comingSoon: true
  },
  {
    id: 'byok',
    icon: Key,
    title: 'Bring Your Own Key',
    subtitle: 'Use your own Anthropic/OpenAI API keys',
    badge: 'Active'
  }
]

export function ApiModeSelector() {
  const { mode, setMode } = useAiProxy()

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Zap className="h-4 w-4 text-accent" />
          AI Provider
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {MODE_OPTIONS.map((option) => {
          const Icon = option.icon
          const isSelected = mode === option.id
          const isDisabled = option.comingSoon === true

          return (
            <button
              key={option.id}
              onClick={() => {
                if (!isDisabled) setMode(option.id)
              }}
              disabled={isDisabled}
              className={cn(
                'w-full rounded-lg border p-3.5 text-left transition-all',
                isDisabled
                  ? 'border-border bg-surface-2 opacity-50 cursor-not-allowed'
                  : isSelected
                    ? 'border-accent bg-accent/5 ring-1 ring-accent'
                    : 'border-border bg-surface-2 hover:border-accent/50 hover:bg-surface-3'
              )}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      'flex h-9 w-9 items-center justify-center rounded-lg',
                      isSelected && !isDisabled ? 'bg-accent/15' : 'bg-surface-3'
                    )}
                  >
                    <Icon
                      className={cn(
                        'h-4 w-4',
                        isSelected && !isDisabled ? 'text-accent' : 'text-text-muted'
                      )}
                    />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-text-primary">{option.title}</span>
                      {option.comingSoon && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
                          Coming Soon
                        </span>
                      )}
                      {option.badge && (
                        <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent">
                          {option.badge}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-text-muted mt-0.5">{option.subtitle}</p>
                  </div>
                </div>
                <div
                  className={cn(
                    'h-4 w-4 rounded-full border-2 transition-colors',
                    isSelected && !isDisabled ? 'border-accent bg-accent' : 'border-border'
                  )}
                >
                  {isSelected && !isDisabled && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="h-full w-full rounded-full bg-white scale-[0.4]"
                    />
                  )}
                </div>
              </div>
            </button>
          )
        })}
      </CardContent>
    </Card>
  )
}
