import { motion } from 'framer-motion'
import { TerminalSquare, Zap, Download, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmbeddedTerminal } from '@/components/EmbeddedTerminal'

interface InstallSystemCheck {
  cliInstalled: boolean
  cliVersion: string | null
  gatewayReachable: boolean
  gatewayStatus: string | null
}

interface InstallState {
  checking: boolean
  installing: boolean
  preparing: boolean
  terminalVisible: boolean
  terminalInstance: number
  systemCheck: InstallSystemCheck | null
  installOutput: string | null
  prepareOutput: string | null
  error: string | null
}

interface OnboardingInstallCardProps {
  state: InstallState
  installCommand: string
  onInstallOpenClaw: () => Promise<void>
  onInstallTerminalExit: (exitCode: number | null) => Promise<void>
  onInstallTerminalError: (message: string) => Promise<void>
}

/** Strip ANSI escape codes from terminal output */
function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '').replace(/\x1B\][^\x07]*\x07/g, '')
}

export function OnboardingInstallCard({
  state,
  installCommand,
  onInstallOpenClaw,
  onInstallTerminalExit,
  onInstallTerminalError
}: OnboardingInstallCardProps) {
  const busy = state.checking || state.installing || state.preparing
  const cliInstalled = state.systemCheck?.cliInstalled || false
  const gatewayReady = state.systemCheck?.gatewayReachable || false
  const runtimeReady = cliInstalled || gatewayReady
  const logs = [state.installOutput, state.prepareOutput, state.systemCheck?.gatewayStatus]
    .filter((entry): entry is string => Boolean(entry && entry.trim()))
    .join('\n\n')
  const statusLabel = gatewayReady
    ? 'Gateway ready'
    : state.preparing
      ? 'Starting OpenClaw gateway...'
      : state.installing
        ? 'Preparing OpenClaw...'
        : 'Waiting for setup...'

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      className="glass-card relative w-full max-w-xl rounded-2xl border border-border/50 p-6"
    >
      <div className="mb-4">
        <h3 className="mb-1 text-lg font-semibold text-text-primary">Set Up OpenClaw Gateway</h3>
        <p className="text-sm text-text-secondary">
          Pinchr connects to a separately installed OpenClaw runtime.
        </p>
      </div>

      {/* Status indicators */}
      <div className="mb-4 space-y-2">
        <div className="flex items-center justify-between rounded-lg border border-border bg-surface-2 px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-text-primary">
            {runtimeReady ? (
              <Check className="h-4 w-4 text-accent" />
            ) : (
              <TerminalSquare className="h-4 w-4 text-text-muted" />
            )}
            <span>OpenClaw runtime</span>
          </div>
          {runtimeReady ? (
            <span className="text-xs font-medium text-accent">Done</span>
          ) : (
            <span className="text-xs font-medium text-text-muted">Checking</span>
          )}
        </div>

        <div className="flex items-center justify-between rounded-lg border border-border bg-surface-2 px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-text-primary">
            {gatewayReady ? (
              <Check className="h-4 w-4 text-accent" />
            ) : (
              <Zap className="h-4 w-4 text-text-muted" />
            )}
            <span>Start gateway</span>
          </div>
          {gatewayReady ? (
            <span className="text-xs font-medium text-accent">Done</span>
          ) : (
            <span className="text-xs font-medium text-text-muted">Pending</span>
          )}
        </div>

        <div className="rounded-lg border border-border bg-surface-2 px-4 py-3 text-xs text-text-muted">
          {statusLabel}
        </div>
      </div>

      {/* Error display */}
      {state.error && (
        <div className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {stripAnsi(state.error)}
        </div>
      )}

      {/* Embedded terminal */}
      {state.terminalVisible && (
        <div className="mb-4 space-y-2">
          <div className="text-[11px] font-medium uppercase tracking-wider text-text-muted">
            Embedded Terminal
          </div>
          <EmbeddedTerminal
            key={`install-terminal-${state.terminalInstance}`}
            className="h-56"
            initialCommand={installCommand}
            onExit={(data) => {
              void onInstallTerminalExit(data.exitCode ?? null)
            }}
            onError={(message) => {
              void onInstallTerminalError(message)
            }}
          />
          <p className="text-xs text-text-muted">
            System check runs automatically when this terminal exits.
          </p>
        </div>
      )}

      {!busy && !gatewayReady && (
        <Button onClick={onInstallOpenClaw} variant="outline" className="mb-4 h-10 w-full">
          <Download className="mr-2 h-4 w-4" />
          Retry gateway setup
        </Button>
      )}

      {/* Logs */}
      {logs && !state.terminalVisible && (
        <div className="rounded-lg border border-border bg-[#111216] p-3">
          <div className="mb-2 text-[10px] font-medium uppercase tracking-wider text-text-muted">
            Logs
          </div>
          <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-words text-[11px] text-text-secondary">
            {stripAnsi(logs)}
          </pre>
        </div>
      )}
    </motion.div>
  )
}
