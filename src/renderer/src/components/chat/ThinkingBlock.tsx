import { useEffect, useMemo, useState } from 'react'
import { Brain, ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ThinkingBlockProps {
  content: string
  isStreaming: boolean
  startedAt?: string
}

function toSeconds(startedAt?: string): number {
  if (!startedAt) return 0
  const start = new Date(startedAt).getTime()
  if (!Number.isFinite(start)) return 0
  return Math.max(0, Math.floor((Date.now() - start) / 1000))
}

export function ThinkingBlock({ content, isStreaming, startedAt }: ThinkingBlockProps) {
  const [expanded, setExpanded] = useState(isStreaming)
  const [elapsedSeconds, setElapsedSeconds] = useState(() => toSeconds(startedAt))
  const [dotCount, setDotCount] = useState(1)

  useEffect(() => {
    if (isStreaming) {
      setExpanded(true)
    }
  }, [isStreaming])

  useEffect(() => {
    if (!isStreaming) return

    const timer = window.setInterval(() => {
      setElapsedSeconds(toSeconds(startedAt))
      setDotCount((prev) => ((prev % 3) + 1))
    }, 500)

    return () => window.clearInterval(timer)
  }, [isStreaming, startedAt])

  const title = useMemo(() => {
    if (isStreaming) return `Thinking${'.'.repeat(dotCount)}`
    return `Thought for ${Math.max(1, elapsedSeconds)}s`
  }, [dotCount, elapsedSeconds, isStreaming])

  if (!content.trim()) return null

  return (
    <div className="mb-2 rounded-xl border border-violet-400/25 bg-violet-500/10 px-3 py-2">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="flex w-full items-center gap-2 text-left"
      >
        <Brain className="h-3.5 w-3.5 text-violet-300" />
        <span className="text-xs font-medium text-violet-100">{title}</span>
        <span className="ml-auto text-violet-200">
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </span>
      </button>
      {expanded && (
        <p className={cn('mt-2 whitespace-pre-wrap text-xs leading-relaxed text-violet-100/90')}>
          {content}
        </p>
      )}
    </div>
  )
}
