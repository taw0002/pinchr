import { useState } from 'react'
import { CheckCircle2, ChevronDown, ChevronRight, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatToolDisplay, getToolVisibility } from './chatUtils'
import type { ToolCallBlock } from './chatTypes'

interface ToolCallCardProps {
  call: ToolCallBlock
}

export function ToolCallCard({ call }: ToolCallCardProps) {
  const [expanded, setExpanded] = useState(false)
  const isRunning = call.status === 'running'
  const hasResult = Boolean(call.result?.trim())

  // Check visibility — don't render hidden tools at all
  const visibility = getToolVisibility(call.name)
  if (visibility === 'hide') return null

  // Get smart display info
  const display = formatToolDisplay(call.name, call.result)
  const icon = display?.icon ?? '🔧'
  const label = isRunning
    ? display?.label ?? `Using ${call.name}...`
    : display?.label ?? `${call.name} complete`

  return (
    <div className="rounded-xl border border-border/80 bg-surface-3/60 px-3 py-2">
      <button
        type="button"
        disabled={!hasResult}
        onClick={() => {
          if (hasResult) setExpanded((prev) => !prev)
        }}
        className={cn('flex w-full items-center gap-2 text-left', hasResult && 'cursor-pointer')}
      >
        <span className="text-sm leading-none">{icon}</span>
        {isRunning ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-text-muted" />
        ) : (
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
        )}
        <span className="text-xs text-text-secondary truncate">
          {label}
        </span>
        {hasResult && (
          <span className="ml-auto text-text-muted shrink-0">
            {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </span>
        )}
      </button>

      {expanded && hasResult && (
        <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-background/30 px-2 py-2 text-xs text-text-primary">
          {call.result}
        </pre>
      )}
    </div>
  )
}
