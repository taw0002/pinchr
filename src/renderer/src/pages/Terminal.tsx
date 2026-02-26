import { useMemo, useRef, useState } from 'react'
import { TerminalSquare, RotateCw, Play, MessageSquare, Activity, Bug, Download, ScrollText, Puzzle, Radio, LayoutDashboard } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { EmbeddedTerminal, type EmbeddedTerminalHandle } from '@/components/EmbeddedTerminal'

const QUICK_COMMANDS = [
  { id: 'tui', label: 'Chat TUI', command: 'openclaw tui', icon: MessageSquare },
  { id: 'status', label: 'Status', command: 'openclaw gateway status', icon: Activity },
  { id: 'logs', label: 'Live Logs', command: 'openclaw logs', icon: ScrollText },
  { id: 'channels', label: 'Channels', command: 'openclaw channels status', icon: Radio },
  { id: 'skills', label: 'Skills', command: 'openclaw skills list', icon: Puzzle },
  { id: 'dashboard', label: 'Web UI', command: 'openclaw dashboard', icon: LayoutDashboard },
  { id: 'doctor', label: 'Doctor', command: 'openclaw doctor', icon: Bug },
  { id: 'update', label: 'Updates', command: 'echo "OpenClaw is managed by Pinchr. Use Settings -> Pinchr App -> Check for Updates."', icon: Download }
] as const

export default function Terminal() {
  const [terminalInstance, setTerminalInstance] = useState(1)
  const [currentCommand, setCurrentCommand] = useState('openclaw tui')
  const [commandInput, setCommandInput] = useState('openclaw tui')
  const [terminalError, setTerminalError] = useState<string | null>(null)
  const terminalRef = useRef<EmbeddedTerminalHandle>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const terminalKey = useMemo(
    () => `terminal-page-${terminalInstance}-${currentCommand}`,
    [terminalInstance, currentCommand]
  )

  const launchCommand = (command: string) => {
    const trimmed = command.trim()
    if (!trimmed) return
    setTerminalError(null)
    setCurrentCommand(trimmed)
    setCommandInput(trimmed)
    setTerminalInstance((value) => value + 1)
    // Blur the input so Enter keystrokes go to the terminal, not re-submit
    inputRef.current?.blur()
  }

  const restartShell = () => {
    setTerminalError(null)
    setCurrentCommand('')
    setTerminalInstance((value) => value + 1)
    inputRef.current?.blur()
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 pt-4 pb-2 space-y-2 shrink-0">
        <div className="flex items-center gap-2">
          <TerminalSquare className="h-4 w-4 text-accent shrink-0" />
          <div className="flex flex-wrap items-center gap-2 flex-1">
                {QUICK_COMMANDS.map((item) => {
                  const Icon = item.icon
                  return (
                    <Button
                      key={item.id}
                      variant="secondary"
                      size="sm"
                      className="gap-1.5 h-7 text-xs"
                      onClick={() => launchCommand(item.command)}
                    >
                      <Icon className="h-3 w-3" />
                      {item.label}
                    </Button>
                  )
                })}
                <Button variant="outline" size="sm" className="gap-1.5 h-7 text-xs" onClick={restartShell}>
                  <RotateCw className="h-3 w-3" />
                  New Shell
                </Button>
              </div>
          </div>

        <div className="flex gap-2">
          <input
            ref={inputRef}
            value={commandInput}
            onChange={(event) => setCommandInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                launchCommand(commandInput)
              }
            }}
            placeholder="Run a command..."
            className="flex-1 h-8 rounded-lg border border-border bg-surface-2 px-3 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent font-mono"
          />
          <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => launchCommand(commandInput)}>
            <Play className="h-3 w-3" />
            Run
          </Button>
        </div>
      </div>

      <div className="flex-1 min-h-0 px-4 pb-4">
        <EmbeddedTerminal
          ref={terminalRef}
          key={terminalKey}
          className="h-full"
          initialCommand={currentCommand}
          onError={(message) => setTerminalError(message)}
        />
      </div>

      {terminalError && (
        <div className="px-4 pb-4">
          <Card className="border-red-500/30 bg-red-500/10">
            <CardContent className="py-2 text-sm text-red-300">{terminalError}</CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
