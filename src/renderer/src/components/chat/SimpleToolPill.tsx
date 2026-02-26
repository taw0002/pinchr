import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SimpleToolCall } from '@/hooks/useSimpleChat'

interface SimpleToolPillProps {
  tool: SimpleToolCall
}

const TOOL_LABELS: Record<string, { icon: string; label: string }> = {
  web_search: { icon: '🔍', label: 'Searching web' },
  web_fetch: { icon: '🌐', label: 'Reading web page' },
  read: { icon: '📄', label: 'Reading file' },
  write: { icon: '✏️', label: 'Writing file' },
  edit: { icon: '✏️', label: 'Editing file' },
  exec: { icon: '⚡', label: 'Running command' },
  topic_router: { icon: '🧭', label: 'Routing request' },
  sessions_send: { icon: '💼', label: 'Working in session' },
  sessions_spawn: { icon: '🚀', label: 'Opening focused session' },
  message: { icon: '💬', label: 'Sending message' }
}

function normalizeToolName(toolName: string): string {
  return toolName.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_')
}

function formatToolLabel(toolName: string): { icon: string; label: string } {
  const key = normalizeToolName(toolName)
  const mapped = TOOL_LABELS[key]
  if (mapped) return mapped
  return {
    icon: '🔧',
    label: toolName.replace(/[_-]+/g, ' ').trim() || 'Tool call'
  }
}

export function SimpleToolPill({ tool }: SimpleToolPillProps) {
  const [expanded, setExpanded] = useState(false)

  const display = useMemo(() => formatToolLabel(tool.toolName), [tool.toolName])
  const statusLabel = tool.status === 'running' ? 'Running' : 'Done'

  return (
    <div className="rounded-md border border-border bg-surface-1">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs text-text-primary hover:bg-surface-2"
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-text-muted" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-text-muted" />
        )}
        <span>{display.icon}</span>
        <span className="truncate">{display.label}</span>
        <span
          className={cn(
            'ml-auto rounded-full px-1.5 py-0.5 text-[10px]',
            tool.status === 'running' ? 'bg-accent/15 text-accent' : 'bg-surface-2 text-text-muted'
          )}
        >
          {statusLabel}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-border px-2.5 py-2">
          <p className="text-[11px] text-text-muted">Tool: {tool.toolName}</p>
          {tool.result && (
            <pre className="mt-1 max-h-44 overflow-auto rounded bg-surface-2 p-2 text-[11px] leading-relaxed text-text-secondary whitespace-pre-wrap">
              {tool.result}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}

export default SimpleToolPill
