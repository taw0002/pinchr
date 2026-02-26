import { Activity, CalendarClock, FileText, HardDrive } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'

export type MemoryFreshness = 'healthy' | 'stale' | 'very-stale' | 'unknown'

interface MemoryHealthDashboardProps {
  totalFiles: number
  totalSizeKb: number
  newestUpdateAt?: string
  oldestUpdateAt?: string
  freshness: MemoryFreshness
  staleDays?: number
  isLoading?: boolean
}

function formatDate(value?: string): string {
  if (!value) return 'Unknown'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return 'Unknown'
  return parsed.toLocaleString()
}

function freshnessLabel(freshness: MemoryFreshness, staleDays?: number): string {
  if (freshness === 'healthy') return 'Healthy'
  if (freshness === 'stale') return `Stale${staleDays !== undefined ? ` (${staleDays}d)` : ''}`
  if (freshness === 'very-stale') return `Very stale${staleDays !== undefined ? ` (${staleDays}d)` : ''}`
  return 'Unknown'
}

function freshnessVariant(freshness: MemoryFreshness): 'success' | 'warning' | 'error' | 'secondary' {
  if (freshness === 'healthy') return 'success'
  if (freshness === 'stale') return 'warning'
  if (freshness === 'very-stale') return 'error'
  return 'secondary'
}

export default function MemoryHealthDashboard({
  totalFiles,
  totalSizeKb,
  newestUpdateAt,
  oldestUpdateAt,
  freshness,
  staleDays,
  isLoading
}: MemoryHealthDashboardProps) {
  return (
    <Card className="p-4">
      <CardContent className="space-y-3 p-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-text-primary">
            <Activity className="h-4 w-4 text-accent" />
            Memory Health
          </div>
          <Badge variant={freshnessVariant(freshness)}>{freshnessLabel(freshness, staleDays)}</Badge>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-lg border border-border bg-surface-2 px-3 py-2">
            <div className="flex items-center gap-1.5 text-xs text-text-muted">
              <FileText className="h-3.5 w-3.5" />
              Files
            </div>
            <p className="mt-1 text-sm font-semibold text-text-primary">{isLoading ? 'Loading…' : totalFiles}</p>
          </div>

          <div className="rounded-lg border border-border bg-surface-2 px-3 py-2">
            <div className="flex items-center gap-1.5 text-xs text-text-muted">
              <HardDrive className="h-3.5 w-3.5" />
              Total Size
            </div>
            <p className="mt-1 text-sm font-semibold text-text-primary">
              {isLoading ? 'Loading…' : `${totalSizeKb.toFixed(1)} KB`}
            </p>
          </div>

          <div className="rounded-lg border border-border bg-surface-2 px-3 py-2">
            <div className="flex items-center gap-1.5 text-xs text-text-muted">
              <CalendarClock className="h-3.5 w-3.5" />
              Last Updated
            </div>
            <p className="mt-1 truncate text-sm text-text-secondary">{isLoading ? 'Loading…' : formatDate(newestUpdateAt)}</p>
          </div>

          <div className="rounded-lg border border-border bg-surface-2 px-3 py-2">
            <div className="flex items-center gap-1.5 text-xs text-text-muted">
              <CalendarClock className="h-3.5 w-3.5" />
              Oldest File
            </div>
            <p className="mt-1 truncate text-sm text-text-secondary">{isLoading ? 'Loading…' : formatDate(oldestUpdateAt)}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
