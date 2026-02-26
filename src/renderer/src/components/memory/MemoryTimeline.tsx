import { Clock3 } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

interface TimelineItem {
  path: string
  dateLabel: string
  preview: string
}

interface MemoryTimelineProps {
  items: TimelineItem[]
  selectedFile: string | null
  onSelect: (path: string) => void
}

export default function MemoryTimeline({ items, selectedFile, onSelect }: MemoryTimelineProps) {
  if (items.length === 0) {
    return (
      <div className="px-3 py-8 text-center text-xs text-text-muted">
        No daily memory files found.
      </div>
    )
  }

  return (
    <ScrollArea className="flex-1">
      <div className="space-y-2 px-2 pb-3">
        {items.map((item) => (
          <button
            key={item.path}
            onClick={() => onSelect(item.path)}
            className={cn(
              'w-full rounded-lg border px-3 py-2 text-left transition-colors',
              selectedFile === item.path
                ? 'border-accent/40 bg-accent/10'
                : 'border-border bg-surface-2 hover:bg-surface-3'
            )}
          >
            <div className="flex items-center gap-1.5 text-xs text-text-muted">
              <Clock3 className="h-3.5 w-3.5" />
              <span>{item.dateLabel}</span>
            </div>
            <p className="mt-1 text-xs font-semibold text-text-primary">{item.path.replace('memory/', '')}</p>
            <p className="mt-1 max-h-9 overflow-hidden text-xs text-text-secondary">{item.preview}</p>
          </button>
        ))}
      </div>
    </ScrollArea>
  )
}
