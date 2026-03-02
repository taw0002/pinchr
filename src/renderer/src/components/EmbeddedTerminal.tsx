import { AlertCircle, Copy, Loader2, RefreshCw, Terminal as TerminalIcon } from 'lucide-react'
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

interface EmbeddedTerminalProps {
  className?: string
  initialCommand?: string
  onExit?: (data: { exitCode?: number }) => void
  onError?: (message: string) => void
}

export interface EmbeddedTerminalHandle {
  focus: () => void
}

type CliAvailabilityState = 'checking' | 'missing' | 'installing' | 'ready'
type ManagedCommandPurpose = 'initial' | 'retry' | 'install'

const OPENCLAW_INSTALL_COMMAND = 'npm i -g openclaw'
const OPENCLAW_TUI_COMMAND = 'openclaw tui'
const COMMAND_RESULT_MARKER = '__PINCHR_CMD_EXIT__'

export const EmbeddedTerminal = forwardRef<EmbeddedTerminalHandle, EmbeddedTerminalProps>(
  function EmbeddedTerminal(
    { className, initialCommand, onExit, onError },
    ref
  ) {
    const containerRef = useRef<HTMLDivElement>(null)
    const terminalRef = useRef<Terminal | null>(null)
    const disposedRef = useRef(false)
    const sessionReadyRef = useRef(false)
    const commandCounterRef = useRef(0)
    const pendingCommandsRef = useRef(new Map<number, { command: string; purpose: ManagedCommandPurpose }>())
    const markerParseBufferRef = useRef('')

    const onExitRef = useRef(onExit)
    const onErrorRef = useRef(onError)
    const [cliState, setCliState] = useState<CliAvailabilityState>('checking')
    const [commandError, setCommandError] = useState<string | null>(null)
    const [installError, setInstallError] = useState<string | null>(null)
    const [copiedInstallCommand, setCopiedInstallCommand] = useState(false)
    const [retryCommand, setRetryCommand] = useState<string | null>(null)

    onExitRef.current = onExit
    onErrorRef.current = onError

    const runManagedCommand = useCallback(async (command: string, purpose: ManagedCommandPurpose) => {
      const trimmed = command.trim()
      if (!trimmed || !sessionReadyRef.current) {
        return
      }

      const commandId = commandCounterRef.current + 1
      commandCounterRef.current = commandId
      pendingCommandsRef.current.set(commandId, { command: trimmed, purpose })

      const runResult = await window.api.terminal.write(`${trimmed}\r`)
      if (!runResult.ok) {
        pendingCommandsRef.current.delete(commandId)
        throw new Error(runResult.error || `Failed to run command: ${trimmed}`)
      }

      const markerResult = await window.api.terminal.write(
        `printf "${COMMAND_RESULT_MARKER}${commandId}:%s__\\n" "$?"\r`
      )
      if (!markerResult.ok) {
        pendingCommandsRef.current.delete(commandId)
        throw new Error(markerResult.error || 'Failed to track command status.')
      }
    }, [])

    const checkOpenclawAvailability = useCallback(async () => {
      const result = await window.api.terminal.checkOpenclaw()
      if (!result.ok) {
        throw new Error(result.error || 'Failed to verify OpenClaw CLI availability.')
      }
      return result.data?.installed === true
    }, [])

    const runInstallAndOpenTui = useCallback(async () => {
      setCliState('installing')
      setInstallError(null)
      setCommandError(null)
      setRetryCommand(null)
      try {
        await runManagedCommand(OPENCLAW_INSTALL_COMMAND, 'install')
        terminalRef.current?.focus()
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        setCliState('missing')
        setInstallError(message)
        onErrorRef.current?.(message)
      }
    }, [runManagedCommand])

    const copyInstallCommand = useCallback(async () => {
      try {
        await navigator.clipboard.writeText(OPENCLAW_INSTALL_COMMAND)
        setCopiedInstallCommand(true)
        window.setTimeout(() => setCopiedInstallCommand(false), 1500)
      } catch {
        setInstallError('Could not copy command. Copy it manually.')
      }
    }, [])

    const handleRetry = useCallback(async () => {
      const failedCommand = retryCommand?.trim()
      if (!failedCommand) return
      setCommandError(null)
      setRetryCommand(null)
      try {
        await runManagedCommand(failedCommand, 'retry')
        terminalRef.current?.focus()
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        setCommandError(message)
        onErrorRef.current?.(message)
      }
    }, [retryCommand, runManagedCommand])

    const processCommandMarkers = useCallback(
      async (chunk: string) => {
        markerParseBufferRef.current = `${markerParseBufferRef.current}${chunk}`
        if (markerParseBufferRef.current.length > 4096) {
          markerParseBufferRef.current = markerParseBufferRef.current.slice(-4096)
        }

        const markerPattern = new RegExp(`${COMMAND_RESULT_MARKER}(\\d+):(-?\\d+)__`, 'g')
        let lastIndex = 0
        for (const match of markerParseBufferRef.current.matchAll(markerPattern)) {
          const commandId = Number(match[1])
          const exitCode = Number(match[2])
          if (!Number.isFinite(commandId) || !Number.isFinite(exitCode)) continue
          if (typeof match.index !== 'number') continue

          lastIndex = match.index + match[0].length
          const pending = pendingCommandsRef.current.get(commandId)
          if (!pending) continue
          pendingCommandsRef.current.delete(commandId)

          if (exitCode !== 0) {
            if (pending.purpose === 'install') {
              setCliState('missing')
              setInstallError(`Install failed with exit code ${exitCode}.`)
              onErrorRef.current?.(`OpenClaw install failed with exit code ${exitCode}.`)
            } else {
              const message = `Command failed (${exitCode}): ${pending.command}`
              setCommandError(message)
              setRetryCommand(pending.command)
              onErrorRef.current?.(message)
            }
            continue
          }

          if (pending.purpose === 'install') {
            const installed = await checkOpenclawAvailability()
            if (!installed) {
              setCliState('missing')
              setInstallError('Install completed but OpenClaw CLI is still not available in PATH.')
              return
            }

            setCliState('ready')
            setInstallError(null)
            setCommandError(null)
            setRetryCommand(null)
            await runManagedCommand(OPENCLAW_TUI_COMMAND, 'initial')
            terminalRef.current?.focus()
          }
        }

        if (lastIndex > 0) {
          markerParseBufferRef.current = markerParseBufferRef.current.slice(lastIndex)
        } else if (markerParseBufferRef.current.length > 1024) {
          markerParseBufferRef.current = markerParseBufferRef.current.slice(-1024)
        }
      },
      [checkOpenclawAvailability, runManagedCommand]
    )

    useImperativeHandle(ref, () => ({
      focus: () => {
        terminalRef.current?.focus()
      }
    }))

    useEffect(() => {
      const container = containerRef.current
      if (!container) return

      disposedRef.current = false
      sessionReadyRef.current = false
      commandCounterRef.current = 0
      pendingCommandsRef.current.clear()
      markerParseBufferRef.current = ''
      setCliState('checking')
      setCommandError(null)
      setInstallError(null)
      setRetryCommand(null)

      const terminal = new Terminal({
        cursorBlink: true,
        convertEol: true,
        scrollback: 5000,
        allowTransparency: true,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        fontSize: 13,
        theme: {
          background: '#101216',
          foreground: '#d4d7dd',
          cursor: '#d4d7dd',
          black: '#0a0d12',
          red: '#ff6b6b',
          green: '#70e000',
          yellow: '#ffd166',
          blue: '#4ea8de',
          magenta: '#b197fc',
          cyan: '#64dfdf',
          white: '#e9ecef',
          brightBlack: '#495057',
          brightRed: '#ff8787',
          brightGreen: '#8ce99a',
          brightYellow: '#ffe066',
          brightBlue: '#74c0fc',
          brightMagenta: '#d0bfff',
          brightCyan: '#99e9f2',
          brightWhite: '#f8f9fa'
        }
      })
      terminalRef.current = terminal
      const fitAddon = new FitAddon()
      const webLinksAddon = new WebLinksAddon()

      terminal.loadAddon(fitAddon)
      terminal.loadAddon(webLinksAddon)
      terminal.open(container)
      fitAddon.fit()

      const syncSize = () => {
        fitAddon.fit()
        if (!disposedRef.current) {
          void window.api.terminal.resize(terminal.cols, terminal.rows)
        }
      }

      const resizeObserver = new ResizeObserver(() => syncSize())
      resizeObserver.observe(container)

      const disposeInput = terminal.onData((data) => {
        void window.api.terminal.write(data)
      })

      let disposeOutput = () => {}
      let disposeExit = () => {}

      const init = async () => {
        const createResult = await window.api.terminal.create()
        if (!createResult.ok) {
          throw new Error(createResult.error || 'Failed to open embedded terminal.')
        }

        disposeOutput = window.api.terminal.onData((data) => {
          terminal.write(data)
          void processCommandMarkers(data)
        })

        disposeExit = window.api.terminal.onExit((data) => {
          if (disposedRef.current) return
          sessionReadyRef.current = false
          terminal.writeln('')
          terminal.writeln(`[process exited${typeof data.exitCode === 'number' ? ` with code ${data.exitCode}` : ''}]`)
          onExitRef.current?.(data)
        })

        sessionReadyRef.current = true
        syncSize()

        const cliInstalled = await checkOpenclawAvailability()
        if (!cliInstalled) {
          setCliState('missing')
          terminal.focus()
          return
        }

        setCliState('ready')

        if (initialCommand?.trim()) {
          await runManagedCommand(initialCommand.trim(), 'initial')
        }

        // Auto-focus terminal after command is sent
        terminal.focus()
      }

      init().catch((error) => {
        const message = error instanceof Error ? error.message : String(error)
        setCliState('missing')
        setInstallError(message)
        onErrorRef.current?.(message)
      })

      return () => {
        disposedRef.current = true
        terminalRef.current = null
        resizeObserver.disconnect()
        disposeInput.dispose()
        disposeOutput()
        disposeExit()
        terminal.dispose()
        void window.api.terminal.close()
      }
    }, [checkOpenclawAvailability, initialCommand, processCommandMarkers, runManagedCommand])

    return (
      <div className={cn('relative rounded-xl border border-border bg-[#101216] p-2', className)}>
        {cliState === 'missing' ? (
          <div className="absolute inset-2 z-10 flex items-center justify-center rounded-md border border-dashed border-border/80 bg-[#101216] p-4">
            <div className="w-full max-w-lg space-y-3 text-sm text-text-secondary">
              <div className="flex items-start gap-2 text-base text-text-primary">
                <TerminalIcon className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="font-medium">OpenClaw CLI is not installed.</p>
                  <p className="text-sm text-text-secondary">Run this command to install it:</p>
                </div>
              </div>

              <div className="rounded-md border border-border/80 bg-black/50 p-3 font-mono text-xs text-emerald-300">
                {OPENCLAW_INSTALL_COMMAND}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => void copyInstallCommand()}>
                  <Copy className="mr-2 h-3.5 w-3.5" />
                  {copiedInstallCommand ? 'Copied' : 'Copy Command'}
                </Button>
                <Button type="button" size="sm" onClick={() => void runInstallAndOpenTui()}>
                  <Loader2 className={cn('mr-2 h-3.5 w-3.5', cliState === 'installing' && 'animate-spin')} />
                  Install Now
                </Button>
              </div>

              {installError ? (
                <p className="flex items-start gap-2 text-amber-300">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{installError}</span>
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        {cliState === 'checking' ? (
          <div className="absolute inset-2 z-10 flex items-center justify-center rounded-md bg-[#101216]/90 text-sm text-text-secondary">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Checking OpenClaw CLI...
          </div>
        ) : null}

        <div
          ref={containerRef}
          className={cn(
            'h-full w-full overflow-hidden rounded-md',
            cliState === 'missing' ? 'invisible' : 'visible'
          )}
        />

        {commandError ? (
          <div className="pointer-events-auto absolute bottom-4 left-4 right-4 z-20 rounded-md border border-amber-500/40 bg-black/70 p-3 text-xs text-amber-200">
            <p className="mb-2">OpenClaw command failed. Retry?</p>
            <div className="flex items-center gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => void handleRetry()}>
                <RefreshCw className="mr-2 h-3.5 w-3.5" />
                Retry
              </Button>
              <span className="truncate font-mono text-[11px] opacity-80">{retryCommand}</span>
            </div>
          </div>
        ) : null}
      </div>
    )
  }
)
