import { Bot, CheckCircle2, Rocket } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SubAgentEvent } from './chatTypes'

interface SubAgentCardProps {
  event: SubAgentEvent
}

export function SubAgentCard({ event }: SubAgentCardProps) {
  const isRunning = event.status === 'running'

  return (
    <div
      className={cn(
        'rounded-xl border px-3 py-2 text-xs',
        isRunning
          ? 'border-blue-500/30 bg-blue-500/10 text-blue-200'
          : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
      )}
    >
      <div className="flex items-center gap-2">
        {isRunning ? <Rocket className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
        <Bot className="h-3.5 w-3.5" />
        <span className="font-medium">
          {isRunning ? `Spawned: ${event.description}` : `Done: ${event.summary || event.description}`}
        </span>
      </div>
    </div>
  )
}
