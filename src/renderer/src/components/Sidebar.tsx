import React from 'react'
import { motion } from 'framer-motion'
import {
  LayoutDashboard,
  MessageSquare,
  PlaySquare,
  CheckSquare,
  Sparkles,
  Package,
  Link,
  Brain,
  Loader2,
  Play,
  RotateCw,
  TerminalSquare,
  Settings,
  type LucideIcon
} from 'lucide-react'
import type { Page } from '@/types/navigation'
import { cn } from '@/lib/utils'
import { useGatewayHealth, useStartGateway, useRestartGateway } from '@/hooks/useGateway'
import { useTasks } from '@/hooks/useTasks'
import { useQuery } from '@tanstack/react-query'
import { NotificationBell } from './NotificationBell'
import iconPng from '../assets/icon.png'

interface NavItem {
  id: Page
  label: string
  icon: LucideIcon
}

interface NavSection {
  label: string
  items: NavItem[]
}

const sections: NavSection[] = [
  {
    label: 'YOUR AGENT',
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { id: 'chat', label: 'Chat', icon: MessageSquare },
      { id: 'sessions', label: 'Sessions', icon: PlaySquare },
      { id: 'tasks', label: 'Tasks', icon: CheckSquare }
    ]
  },
  {
    label: 'TOOLS',
    items: [
      { id: 'automations', label: 'Automations', icon: Sparkles },
      { id: 'skills', label: 'Skills', icon: Package },
      { id: 'connections', label: 'Connections', icon: Link }
    ]
  },
  {
    label: 'CONFIGURE',
    items: [
      { id: 'brain', label: 'Brain', icon: Brain },
      { id: 'terminal', label: 'Terminal', icon: TerminalSquare },
      { id: 'settings', label: 'Settings', icon: Settings }
    ]
  }
]

interface SidebarProps {
  currentPage: Page
  onNavigate: (page: Page) => void
  onReportIssue?: () => void
}

export function Sidebar({ currentPage, onNavigate, onReportIssue }: SidebarProps) {
  const { data: health } = useGatewayHealth()
  const startGateway = useStartGateway()
  const restartGateway = useRestartGateway()
  const { tasks } = useTasks()

  const isOnline = !!health
  const isActing = startGateway.isPending || restartGateway.isPending

  const { data: sessionStatus } = useQuery({
    queryKey: ['sidebar', 'session-status'],
    queryFn: async () => {
      const result = await window.api.gateway.getSessionStatus()
      if (!result.ok || !result.data) return null
      return result.data as { openclawVersion?: string } | null
    },
    enabled: isOnline,
    refetchInterval: 15_000
  })

  const displayOpenclawVersion = sessionStatus?.openclawVersion || 'Unknown'

  // Count in-progress tasks for badge
  const inProgressCount = tasks.filter(task => task.status === 'in-progress').length

  const handleReportIssue = () => {
    if (onReportIssue) {
      onReportIssue()
    } else {
      // Fallback: navigate to support page
      onNavigate('support')
    }
  }

  return (
    <aside className="relative z-40 flex h-full w-56 flex-col border-r border-border bg-surface px-3 py-4 pt-10">
      <div className="mb-5 flex items-center gap-3 px-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl overflow-hidden">
          <img src={iconPng} alt="Pinchr" className="h-9 w-9" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-text-primary">Pinchr</p>
          <p className="text-xs text-text-muted">OpenClaw Desktop</p>
        </div>
        <NotificationBell onNavigate={onNavigate} />
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto pr-1">
        {sections.map((section) => (
          <div key={section.label}>
            <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
              {section.label}
            </p>
            <div className="space-y-1">
              {section.items.map((item) => {
                const isActive = currentPage === item.id
                const Icon = item.icon
                return (
                  <button
                    key={item.id}
                    onClick={() => onNavigate(item.id)}
                    className={cn(
                      'relative w-full rounded-xl px-3 py-2.5 transition-all duration-150',
                      isActive
                        ? 'bg-accent/12 text-accent'
                        : 'text-text-secondary hover:bg-surface-2 hover:text-text-primary'
                    )}
                    style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                  >
                    {isActive && (
                      <motion.div
                        layoutId="sidebar-indicator"
                        className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full bg-gradient-accent"
                        transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                      />
                    )}
                    <div className="flex items-center gap-2.5">
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="text-sm font-medium">{item.label}</span>
                      {item.id === 'tasks' && inProgressCount > 0 && (
                        <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-coral-500/20 px-1.5 text-[10px] font-semibold text-coral-400">
                          {inProgressCount}
                        </span>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Gateway status + actions */}
      <div className="mt-3 space-y-2" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <div className="rounded-lg border border-border bg-surface-2 px-3 py-2.5 space-y-2">
          <div className="flex items-center gap-2">
            <div className={cn('h-2 w-2 rounded-full', isOnline ? 'bg-accent animate-pulse' : 'bg-red-500')} />
            <p className="text-xs text-text-muted flex-1">
              Gateway {isActing ? (isOnline ? 'restarting…' : 'starting…') : isOnline ? 'online' : 'offline'}
            </p>
          </div>
          <div className="flex gap-1.5">
            {isOnline ? (
              <button
                onClick={() => restartGateway.mutate()}
                disabled={isActing}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-md bg-surface-3 px-2 py-1.5 text-[11px] font-medium text-text-secondary hover:text-text-primary hover:bg-surface-2 transition-colors disabled:opacity-50"
              >
                {restartGateway.isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <RotateCw className="h-3 w-3" />
                )}
                Restart
              </button>
            ) : (
              <button
                onClick={() => startGateway.mutate()}
                disabled={isActing}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-md bg-accent/15 px-2 py-1.5 text-[11px] font-medium text-accent hover:bg-accent/25 transition-colors disabled:opacity-50"
              >
                {startGateway.isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Play className="h-3 w-3" />
                )}
                Start
              </button>
            )}
            <button
              onClick={() => onNavigate('settings')}
              className="flex items-center justify-center rounded-md bg-surface-3 px-2 py-1.5 text-text-secondary hover:text-text-primary hover:bg-surface-2 transition-colors"
              title="Settings"
            >
              <Settings className="h-3 w-3" />
            </button>
          </div>

          {isOnline && (
            <div className="rounded-md border border-border/80 bg-surface-3/50 px-2 py-2 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[10px] text-text-muted">OpenClaw version</p>
                <p className="text-[10px] font-mono text-text-secondary">{displayOpenclawVersion}</p>
              </div>
              <p className="text-[10px] text-text-muted">OpenClaw runs separately and Pinchr connects over localhost.</p>
            </div>
          )}
        </div>

        {/* Report Issue Link */}
        <button
          onClick={handleReportIssue}
          className="w-full text-center text-[11px] text-text-muted hover:text-text-secondary transition-colors py-1"
        >
          Report Issue
        </button>
      </div>
    </aside>
  )
}
