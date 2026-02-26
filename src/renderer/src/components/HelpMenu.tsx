import { useState, useRef, useEffect } from 'react'
import { HelpCircle, MessageCircle, ExternalLink, AlertCircle, Wifi, Key, Shield } from 'lucide-react'
import type { CSSProperties } from 'react'
import type { Page } from '@/types/navigation'

interface HelpMenuProps {
  onNavigate?: (page: Page) => void
}

const COMMON_ISSUES = [
  {
    icon: Wifi,
    title: 'Gateway won\'t connect',
    description: 'Try restarting from Settings → OpenClaw Gateway → Restart'
  },
  {
    icon: Key,
    title: 'Model errors or "no auth"',
    description: 'Check your API keys in Settings → AI Providers'
  },
  {
    icon: Shield,
    title: 'Permissions issues',
    description: 'Go to Settings → Computer Use Permissions and grant access'
  },
  {
    icon: AlertCircle,
    title: 'Messages not appearing',
    description: 'Check that your gateway is running and channels are connected'
  }
]

export function HelpMenu({ onNavigate }: HelpMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex h-7 w-7 items-center justify-center rounded-full text-text-muted hover:text-text-primary hover:bg-surface-3 transition-colors"
        title="Help & Support"
        style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
      >
        <HelpCircle className="h-4 w-4" />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-80 rounded-xl border border-border bg-surface shadow-2xl shadow-black/40 z-50 overflow-hidden">
          {/* Agent help prompt */}
          <button
            type="button"
            onClick={() => {
              onNavigate?.('chat')
              setIsOpen(false)
            }}
            className="flex w-full items-center gap-3 border-b border-border bg-accent/10 px-4 py-3 text-left hover:bg-accent/15 transition-colors"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/20">
              <MessageCircle className="h-4 w-4 text-accent" />
            </div>
            <div>
              <p className="text-sm font-medium text-accent">Ask your agent for help</p>
              <p className="text-xs text-text-muted">Your agent can walk you through anything</p>
            </div>
          </button>

          {/* Common issues */}
          <div className="p-3">
            <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-text-muted">
              Common Issues
            </p>
            <div className="space-y-1">
              {COMMON_ISSUES.map((issue) => (
                <div
                  key={issue.title}
                  className="flex items-start gap-2.5 rounded-lg p-2 hover:bg-surface-2 transition-colors"
                >
                  <issue.icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-text-muted" />
                  <div>
                    <p className="text-xs font-medium text-text-primary">{issue.title}</p>
                    <p className="text-[11px] text-text-muted">{issue.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Links */}
          <div className="border-t border-border p-2">
            <button
              type="button"
              onClick={() => {
                window.api.shell.openExternal('https://pinchr.app/docs')
                setIsOpen(false)
              }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-text-secondary hover:bg-surface-2 transition-colors"
            >
              <ExternalLink className="h-3 w-3" />
              Documentation
            </button>
            <button
              type="button"
              onClick={() => {
                window.api.shell.openExternal('https://discord.gg/pinchr')
                setIsOpen(false)
              }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-text-secondary hover:bg-surface-2 transition-colors"
            >
              <ExternalLink className="h-3 w-3" />
              Discord Community
            </button>
            <button
              type="button"
              onClick={() => {
                window.api.shell.openExternal('https://pinchr.app/contact')
                setIsOpen(false)
              }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-text-secondary hover:bg-surface-2 transition-colors"
            >
              <ExternalLink className="h-3 w-3" />
              Contact Support
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
