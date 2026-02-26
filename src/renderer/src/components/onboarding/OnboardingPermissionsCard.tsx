import { motion } from 'framer-motion'
import { Eye, MousePointer, Check, ExternalLink, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface PermissionStatus {
  screenRecording: boolean | null
  accessibility: boolean | null
  peekabooInstalled: boolean | null
  checking: boolean
}

interface OnboardingPermissionsCardProps {
  permissions: PermissionStatus
  onOpenSettings: (pane?: string) => void
  onInstallHelper: () => void
  onRunSelfTest: () => void
  installingHelper: boolean
  selfTesting: boolean
  selfTestPassed: boolean
  selfTestError: string | null
  relaunching: boolean
  onSkip: () => void
}

function PermissionRow({
  icon,
  label,
  description,
  granted,
  checking
}: {
  icon: React.ReactNode
  label: string
  description: string
  granted: boolean | null
  checking: boolean
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-surface-2 p-4">
      <div className="flex items-center gap-3">
        <div className="text-text-secondary">{icon}</div>
        <div>
          <div className="text-sm font-medium text-text-primary">{label}</div>
          <div className="text-xs text-text-muted">{description}</div>
        </div>
      </div>
      <div>
        {checking ? (
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        ) : granted ? (
          <Check className="h-5 w-5 text-accent" />
        ) : (
          <AlertCircle className="h-5 w-5 text-text-muted" />
        )}
      </div>
    </div>
  )
}

export function OnboardingPermissionsCard({
  permissions,
  onOpenSettings,
  onInstallHelper,
  onRunSelfTest,
  installingHelper,
  selfTesting,
  selfTestPassed,
  selfTestError,
  relaunching,
  onSkip
}: OnboardingPermissionsCardProps) {
  const hasPermissions = permissions.screenRecording && permissions.accessibility
  const helperReady = permissions.peekabooInstalled === true
  const canProceed = hasPermissions && helperReady && selfTestPassed
  const missingComputerHelper = permissions.peekabooInstalled === false

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      className="glass-card relative w-full max-w-xl rounded-2xl border border-border/50 p-6"
    >
      <div className="mb-4">
        <h3 className="mb-1 text-lg font-semibold text-text-primary">System Permissions</h3>
        <p className="text-sm text-text-secondary">
          Two quick permissions and you're golden. Screen Recording lets me see your screen to help, and Accessibility lets me interact with apps for you. Everything stays on your Mac.
        </p>
      </div>

      {/* Permission rows */}
      <div className="mb-4 space-y-2">
        <PermissionRow
          icon={<Eye className="h-5 w-5" />}
          label="Screen Recording"
          description="See what's on your screen"
          granted={permissions.screenRecording}
          checking={permissions.checking}
        />
        <PermissionRow
          icon={<MousePointer className="h-5 w-5" />}
          label="Accessibility"
          description="Interact with apps on your behalf"
          granted={permissions.accessibility}
          checking={permissions.checking}
        />
      </div>

      {/* Action buttons */}
      {!canProceed && (
        <div className="mb-4 space-y-2">
          {!permissions.screenRecording && (
            <Button
              onClick={() => onOpenSettings('screenRecording')}
              variant="outline"
              className="h-10 w-full"
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              Grant Screen Recording
            </Button>
          )}
          {!permissions.accessibility && (
            <Button
              onClick={() => onOpenSettings('accessibility')}
              variant="outline"
              className="h-10 w-full"
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              Grant Accessibility
            </Button>
          )}
          {missingComputerHelper && (
            <Button
              onClick={onInstallHelper}
              variant="outline"
              className="h-10 w-full"
              disabled={installingHelper}
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              {installingHelper ? 'Installing Computer Helper…' : 'Install Computer Helper'}
            </Button>
          )}
          {hasPermissions && helperReady && !selfTestPassed && (
            <Button
              onClick={onRunSelfTest}
              variant="outline"
              className="h-10 w-full"
              disabled={selfTesting}
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              {selfTesting ? 'Running Self-Test…' : 'Run Computer Self-Test'}
            </Button>
          )}
          {selfTestError && (
            <p className="text-center text-xs text-red-300">{selfTestError}</p>
          )}
          {relaunching && (
            <p className="text-center text-xs text-text-muted">
              Screen Recording changed. Pinchr is relaunching to finish setup…
            </p>
          )}
          <p className="text-center text-xs text-text-muted">
            Toggle permissions on — they'll auto-detect here within a couple seconds.
          </p>
        </div>
      )}

      {/* Skip option */}
      {!canProceed && (
        <button
          onClick={onSkip}
          className="w-full text-sm text-text-muted transition-colors hover:text-text-secondary"
        >
          Skip for now
        </button>
      )}

      {/* Success state */}
      {canProceed && (
        <div className="space-y-2">
          <div className="flex items-center justify-center gap-2 rounded-lg border border-accent/20 bg-accent/5 py-3 text-sm font-medium text-accent">
            <Check className="h-4 w-4" />
            Permissions and self-test complete
          </div>
        </div>
      )}
    </motion.div>
  )
}
