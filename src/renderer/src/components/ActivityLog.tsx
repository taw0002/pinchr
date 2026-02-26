import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Wrench,
  FileText,
  Terminal,
  MessageSquare,
  Activity as ActivityIcon,
  ChevronDown,
  ChevronRight,
  Clock,
  RefreshCw,
  Search,
  Filter
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useActivityLog, type ActivityCategory, type ActivityItem } from '@/hooks/useActivityLog'

// ---------------------------------------------------------------------------
// Filter configuration
// ---------------------------------------------------------------------------

interface FilterOption {
  label: string
  value: ActivityCategory | 'all'
  icon: typeof Wrench
}

const FILTER_OPTIONS: FilterOption[] = [
  { label: 'All', value: 'all', icon: ActivityIcon },
  { label: 'Tools', value: 'tool', icon: Wrench },
  { label: 'Files', value: 'file', icon: FileText },
  { label: 'Commands', value: 'command', icon: Terminal },
  { label: 'Messages', value: 'message', icon: MessageSquare }
]

// ---------------------------------------------------------------------------
// Icon / color helpers
// ---------------------------------------------------------------------------

function getCategoryIcon(category: ActivityCategory) {
  switch (category) {
    case 'tool':
      return Wrench
    case 'file':
      return FileText
    case 'command':
      return Terminal
    case 'message':
      return MessageSquare
    default:
      return ActivityIcon
  }
}

function getCategoryColor(category: ActivityCategory): string {
  switch (category) {
    case 'tool':
      return 'bg-purple-500/15 text-purple-400'
    case 'file':
      return 'bg-blue-500/15 text-blue-400'
    case 'command':
      return 'bg-green-500/15 text-green-400'
    case 'message':
      return 'bg-orange-500/15 text-orange-400'
    default:
      return 'bg-gray-500/15 text-gray-400'
  }
}

function getCategoryBadgeColor(category: ActivityCategory): string {
  switch (category) {
    case 'tool':
      return 'bg-purple-500/15 text-purple-400 border-purple-500/30'
    case 'file':
      return 'bg-blue-500/15 text-blue-400 border-blue-500/30'
    case 'command':
      return 'bg-green-500/15 text-green-400 border-green-500/30'
    case 'message':
      return 'bg-orange-500/15 text-orange-400 border-orange-500/30'
    default:
      return 'bg-gray-500/15 text-gray-400 border-gray-500/30'
  }
}

// ---------------------------------------------------------------------------
// Time formatting
// ---------------------------------------------------------------------------

function formatTimeAgo(timestamp: string): string {
  const now = Date.now()
  const time = new Date(timestamp).getTime()
  if (isNaN(time)) return ''

  const diffMinutes = Math.floor((now - time) / (1000 * 60))
  if (diffMinutes < 1) return 'just now'
  if (diffMinutes < 60) return `${diffMinutes}m ago`
  if (diffMinutes < 1440) return `${Math.floor(diffMinutes / 60)}h ago`
  return `${Math.floor(diffMinutes / 1440)}d ago`
}

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp)
  if (isNaN(date.getTime())) return ''
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

// ---------------------------------------------------------------------------
// Single activity row
// ---------------------------------------------------------------------------

function ActivityRow({ activity }: { activity: ActivityItem }) {
  const [expanded, setExpanded] = useState(false)
  const Icon = getCategoryIcon(activity.category)
  const iconColor = getCategoryColor(activity.category)

  return (
    <div className="group">
      <button
        onClick={() => setExpanded((prev) => !prev)}
        className={cn(
          'w-full flex items-start gap-3 p-3 rounded-lg transition-all duration-150 text-left',
          'hover:bg-surface-2 hover:shadow-glow-sm',
          expanded && 'bg-surface-2'
        )}
      >
        {/* Timeline dot */}
        <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', iconColor)}>
          <Icon className="h-4 w-4" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <p className="text-sm font-medium text-text-primary truncate">
              {activity.summary}
            </p>
            {activity.toolName && (
              <Badge
                variant="secondary"
                className={cn('text-[10px] px-1.5 py-0 border shrink-0', getCategoryBadgeColor(activity.category))}
              >
                {activity.toolName}
              </Badge>
            )}
          </div>
          {activity.category === 'other' && (
            <p className="truncate font-mono text-[11px] text-text-muted">{activity.sessionKey}</p>
          )}
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <Clock className="h-3 w-3" />
            <span>{formatTimeAgo(activity.timestamp)}</span>
            <span className="opacity-50">·</span>
            <span>{formatTimestamp(activity.timestamp)}</span>
          </div>
        </div>

        {/* Expand indicator */}
        <div className="shrink-0 mt-1 text-text-muted opacity-0 group-hover:opacity-100 transition-opacity">
          {expanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </div>
      </button>

      {/* Expanded detail */}
      <AnimatePresence>
        {expanded && activity.detail && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="ml-11 mr-3 mb-2 rounded-lg bg-surface-2 border border-border p-3">
              <pre className="text-xs text-text-secondary whitespace-pre-wrap break-all font-mono max-h-48 overflow-y-auto">
                {activity.detail}
              </pre>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Compact variant (for dashboard card)
// ---------------------------------------------------------------------------

interface CompactActivityLogProps {
  limit?: number
  onViewAll?: () => void
}

export function CompactActivityLog({ limit = 10, onViewAll }: CompactActivityLogProps) {
  const { activities, isLoading } = useActivityLog({ limit })

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <ActivityIcon className="h-4 w-4 text-accent" />
            Agent Activity
          </CardTitle>
          {onViewAll && (
            <Button variant="ghost" size="sm" className="text-xs" onClick={onViewAll}>
              View All
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-5 w-5 animate-spin text-text-muted" />
          </div>
        ) : activities.length > 0 ? (
          <ScrollArea className="h-[300px]">
            <div className="space-y-1">
              {activities.map((activity) => (
                <ActivityRow key={activity.id} activity={activity} />
              ))}
            </div>
          </ScrollArea>
        ) : (
          <EmptyState />
        )}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Full activity log (for full page)
// ---------------------------------------------------------------------------

interface FullActivityLogProps {
  className?: string
}

export function FullActivityLog({ className }: FullActivityLogProps) {
  const [filter, setFilter] = useState<ActivityCategory | 'all'>('all')
  const [searchQuery, setSearchQuery] = useState('')

  const { activities, isLoading } = useActivityLog({
    limit: 200,
    sessionLimit: 15,
    category: filter,
    refetchInterval: 10000
  })

  // Client-side search filtering
  const filtered = searchQuery.trim()
    ? activities.filter(
        (a) =>
          a.summary.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (a.toolName?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false)
      )
    : activities

  return (
    <div className={cn('space-y-4', className)}>
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search activity..."
            className="pl-9"
          />
        </div>

        {/* Filter buttons */}
        <div className="flex items-center gap-1.5">
          <Filter className="h-4 w-4 text-text-muted mr-1" />
          {FILTER_OPTIONS.map((opt) => {
            const Icon = opt.icon
            const isActive = filter === opt.value
            return (
              <Button
                key={opt.value}
                variant={isActive ? 'default' : 'ghost'}
                size="sm"
                className={cn(
                  'text-xs gap-1.5',
                  isActive && 'bg-accent/15 text-accent hover:bg-accent/25'
                )}
                onClick={() => setFilter(opt.value)}
              >
                <Icon className="h-3.5 w-3.5" />
                {opt.label}
              </Button>
            )
          })}
        </div>
      </div>

      {/* Activity list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <RefreshCw className="h-6 w-6 animate-spin text-text-muted" />
        </div>
      ) : filtered.length > 0 ? (
        <div className="space-y-1">
          {filtered.map((activity) => (
            <ActivityRow key={activity.id} activity={activity} />
          ))}
        </div>
      ) : (
        <EmptyState />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState() {
  return (
    <div className="text-center py-12">
      <ActivityIcon className="h-12 w-12 mx-auto mb-3 opacity-20" />
      <p className="text-sm text-text-muted mb-1">No recent activity</p>
      <p className="text-xs text-text-muted max-w-xs mx-auto">
        When your agent reads files, runs commands, searches the web, or sends messages, those actions will appear here.
      </p>
    </div>
  )
}

// Default export is the full log
export default FullActivityLog
