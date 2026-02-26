import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import { cn } from '@/lib/utils'

interface EmbeddedTerminalProps {
  className?: string
  initialCommand?: string
  onExit?: (data: { exitCode?: number }) => void
  onError?: (message: string) => void
}

export interface EmbeddedTerminalHandle {
  focus: () => void
}

export const EmbeddedTerminal = forwardRef<EmbeddedTerminalHandle, EmbeddedTerminalProps>(
  function EmbeddedTerminal(
    { className, initialCommand, onExit, onError },
    ref
  ) {
    const containerRef = useRef<HTMLDivElement>(null)
    const terminalRef = useRef<Terminal | null>(null)
    const disposedRef = useRef(false)
    const onExitRef = useRef(onExit)
    const onErrorRef = useRef(onError)

    onExitRef.current = onExit
    onErrorRef.current = onError

    useImperativeHandle(ref, () => ({
      focus: () => {
        terminalRef.current?.focus()
      }
    }))

    useEffect(() => {
      const container = containerRef.current
      if (!container) return

      disposedRef.current = false

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
        })

        disposeExit = window.api.terminal.onExit((data) => {
          if (disposedRef.current) return
          terminal.writeln('')
          terminal.writeln(`[process exited${typeof data.exitCode === 'number' ? ` with code ${data.exitCode}` : ''}]`)
          onExitRef.current?.(data)
        })

        syncSize()

        if (initialCommand?.trim()) {
          await window.api.terminal.write(`${initialCommand.trim()}\r`)
        }

        // Auto-focus terminal after command is sent
        terminal.focus()
      }

      init().catch((error) => {
        onErrorRef.current?.(error instanceof Error ? error.message : String(error))
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
    }, [initialCommand])

    return (
      <div className={cn('rounded-xl border border-border bg-[#101216] p-2', className)}>
        <div ref={containerRef} className="h-full w-full overflow-hidden rounded-md" />
      </div>
    )
  }
)
