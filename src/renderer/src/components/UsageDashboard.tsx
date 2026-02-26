import {
  BarChart3,
  Wallet,
  ExternalLink,
  Zap
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { useAiProxy } from '@/hooks/useAiProxy'

// ---------------------------------------------------------------------------
// Health color maps (kept for visual preview)
// ---------------------------------------------------------------------------

const HEALTH_TEXT = {
  green: 'text-emerald-400'
} as const

const HEALTH_BG = {
  green: 'bg-emerald-500/15'
} as const

// ---------------------------------------------------------------------------
// Main Dashboard Component — Coming Soon preview
// ---------------------------------------------------------------------------

export default function UsageDashboard() {
  const { mode } = useAiProxy()

  // If user is in BYOK mode, show prompt to switch
  if (mode === 'byok') {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart3 className="h-4 w-4 text-accent" />
            Usage
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10">
              <Zap className="h-6 w-6 text-accent" />
            </div>
            <div>
              <p className="text-sm font-medium text-text-primary">
                Usage tracking available with Pinchr AI
              </p>
              <p className="text-xs text-text-muted mt-1">
                Switch to managed mode in Settings → AI Provider to see credit balance, spending, and usage analytics.
              </p>
              <span className="inline-block mt-2 text-xs px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
                Coming Soon
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Managed mode — show Coming Soon preview with placeholder zeros
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart3 className="h-4 w-4 text-accent" />
            Usage
          </CardTitle>
          <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
            Coming Soon
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 opacity-50">
        {/* Credit Balance — Big Number (placeholder zeros) */}
        <div className="flex items-center gap-4">
          <div
            className={cn(
              'flex h-14 w-14 items-center justify-center rounded-2xl',
              HEALTH_BG.green
            )}
          >
            <Wallet className={cn('h-7 w-7', HEALTH_TEXT.green)} />
          </div>
          <div>
            <p className="text-xs text-text-muted">Credit Balance</p>
            <p className={cn('text-2xl font-bold', HEALTH_TEXT.green)}>$0.00</p>
          </div>
        </div>

        {/* Recharge Buttons (disabled) */}
        <div className="flex gap-2">
          {['$10.00', '$25.00', '$50.00'].map((label) => (
            <Button
              key={label}
              variant="outline"
              size="sm"
              disabled
              className="flex-1 gap-1 text-xs cursor-not-allowed"
            >
              <ExternalLink className="h-3 w-3" />
              {label}
            </Button>
          ))}
        </div>

        <Separator />

        {/* Empty model breakdown */}
        <div>
          <p className="text-xs font-medium text-text-muted mb-2">Usage by Model</p>
          <div className="text-center py-3">
            <p className="text-xs text-text-muted">
              No usage data yet. Start chatting to see your usage breakdown.
            </p>
          </div>
        </div>

        <Separator />

        {/* Empty daily spend */}
        <div>
          <p className="text-xs font-medium text-text-muted mb-2">Last 7 Days</p>
          <div className="flex items-end gap-1.5 h-20">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
              <div key={day} className="flex flex-col items-center gap-1 flex-1 min-w-0">
                <div className="w-full flex items-end justify-center" style={{ height: '60px' }}>
                  <div
                    className="w-full max-w-[24px] rounded-t bg-accent/30"
                    style={{ height: '4%' }}
                  />
                </div>
                <span className="text-[9px] text-text-muted truncate">{day}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="text-[10px] text-text-muted/50 px-1">Lifetime spent: $0.00</p>
      </CardContent>
    </Card>
  )
}
