import React, { useState, useCallback, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Search,
  LayoutDashboard,
  MessageSquare,
  Brain,
  BookText,
  PlaySquare,
  CheckSquare,
  Sparkles,
  Package,
  Link,
  HelpCircle,
  Settings,
  RotateCcw,
  Plus,
  Compass,
  Hash,
  User,
  Clock,
  TerminalSquare,
  type LucideIcon
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from './ui/input'
import { useSessions, useRestartGateway, useSearchMessages } from '@/hooks/useGateway'
import { keyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import type { Page } from '@/types/navigation'

interface CommandItem {
  id: string
  title: string
  subtitle?: string
  icon: LucideIcon
  category: 'pages' | 'actions' | 'sessions' | 'messages'
  action: () => void
  shortcut?: string[]
  metadata?: {
    sessionKey?: string
  }
}

interface CommandPaletteProps {
  isOpen: boolean
  onClose: () => void
  onNavigate: (page: Page) => void
}

export function CommandPalette({ isOpen, onClose, onNavigate }: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  
  const { data: sessions = [] } = useSessions()
  const { mutate: restartGateway } = useRestartGateway()
  const { results: searchResults } = useSearchMessages(query, { enabled: isOpen })

  // Reset state when opening/closing
  useEffect(() => {
    if (isOpen) {
      setQuery('')
      setSelectedIndex(0)
      // Focus input after animation
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen])

  // Create command items
  const baseCommands: Omit<CommandItem, 'action'>[] = [
    // Pages
    { 
      id: 'dashboard', 
      title: 'Dashboard', 
      subtitle: 'Overview and status',
      icon: LayoutDashboard, 
      category: 'pages',
      shortcut: keyboardShortcuts.dashboard.keys
    },
    { 
      id: 'chat', 
      title: 'Chat', 
      subtitle: 'Conversation interface',
      icon: MessageSquare, 
      category: 'pages',
      shortcut: keyboardShortcuts.chat.keys
    },
    {
      id: 'sessions',
      title: 'Sessions',
      subtitle: 'Gateway sessions and process activity',
      icon: PlaySquare,
      category: 'pages',
      shortcut: keyboardShortcuts.sessions.keys
    },
    { 
      id: 'tasks', 
      title: 'Tasks', 
      subtitle: 'Prioritized task list for you and your agent',
      icon: CheckSquare,
      category: 'pages',
      shortcut: keyboardShortcuts.tasks.keys
    },
    {
      id: 'automations',
      title: 'Automations',
      subtitle: 'Schedules and recurring workflows',
      icon: Sparkles,
      category: 'pages',
      shortcut: keyboardShortcuts.automations.keys
    },
    {
      id: 'skills',
      title: 'Skills',
      subtitle: 'Workspace skills and marketplace discovery',
      icon: Package,
      category: 'pages'
    },
    { 
      id: 'connections', 
      title: 'Connections', 
      subtitle: 'Configure channels and integrations',
      icon: Link, 
      category: 'pages'
    },
    { 
      id: 'brain', 
      title: 'Brain', 
      subtitle: 'Knowledge and memories',
      icon: Brain, 
      category: 'pages',
      shortcut: keyboardShortcuts.brain.keys
    },
    {
      id: 'memory-explorer',
      title: 'Memory Explorer',
      subtitle: 'Semantic memory search and timeline editor',
      icon: BookText,
      category: 'pages',
      shortcut: keyboardShortcuts.memoryExplorer.keys
    },
    {
      id: 'terminal',
      title: 'Terminal',
      subtitle: 'Run OpenClaw CLI commands in-app',
      icon: TerminalSquare,
      category: 'pages'
    },
    {
      id: 'onboarding',
      title: 'Onboarding',
      subtitle: 'Setup and guided first-run flow',
      icon: Compass,
      category: 'pages'
    },
    { 
      id: 'support', 
      title: 'Support', 
      subtitle: 'Help and diagnostics',
      icon: HelpCircle, 
      category: 'pages'
    },
    { 
      id: 'settings', 
      title: 'Settings', 
      subtitle: 'Configure preferences',
      icon: Settings, 
      category: 'pages',
      shortcut: keyboardShortcuts.settings.keys
    },
    
    // Quick actions
    { 
      id: 'restart-gateway', 
      title: 'Restart Gateway', 
      subtitle: 'Restart the OpenClaw gateway',
      icon: RotateCcw, 
      category: 'actions' 
    },
    { 
      id: 'new-chat', 
      title: 'New Chat', 
      subtitle: 'Start a new conversation',
      icon: Plus, 
      category: 'actions',
      shortcut: keyboardShortcuts.newChat.keys
    },
    {
      id: 'add-task',
      title: 'Add Task',
      subtitle: 'Create a new task in your workspace',
      icon: CheckSquare,
      category: 'actions'
    }
  ]

  // Add session commands
  const sessionCommands: Omit<CommandItem, 'action'>[] = sessions.map(session => {
    // Generate a display name from the session key or channel
    const displayName = session.key.includes(':') 
      ? session.key.split(':').pop() || session.key 
      : session.key
    
    return {
      id: `session-${session.key}`,
      title: displayName,
      subtitle: `${session.channel || 'unknown'} session`,
      icon: session.channel === 'whatsapp' ? MessageSquare : Hash,
      category: 'sessions' as const,
      metadata: { sessionKey: session.key }
    }
  })

  // Add message search results
  const messageCommands: Omit<CommandItem, 'action'>[] = searchResults.map((result, index) => ({
    id: `message-${result.sessionKey}-${index}`,
    title: result.snippet,
    subtitle: `${result.sessionName} · ${result.channel}`,
    icon: result.message.role === 'user' ? User : MessageSquare,
    category: 'messages' as const,
    metadata: { sessionKey: result.sessionKey }
  }))

  // Combine all commands with actions
  const allCommands: CommandItem[] = [
    ...baseCommands.map(cmd => ({
      ...cmd,
      action: () => {
        switch (cmd.id) {
          case 'dashboard':
          case 'chat':
          case 'sessions':
          case 'tasks':
          case 'automations':
          case 'skills':
          case 'connections':
          case 'brain':
          case 'memory-explorer':
          case 'terminal':
          case 'onboarding':
          case 'support':
          case 'settings':
            onNavigate(cmd.id as Page)
            break
          case 'restart-gateway':
            restartGateway()
            break
          case 'new-chat':
            onNavigate('chat')
            window.dispatchEvent(new CustomEvent('pinchr:new-chat-request'))
            break
          case 'add-task':
            onNavigate('tasks')
            window.setTimeout(() => {
              window.dispatchEvent(new CustomEvent('pinchr:add-task-request'))
            }, 0)
            break
        }
        onClose()
      }
    })),
    ...sessionCommands.map(cmd => ({
      ...cmd,
      action: () => {
        if (cmd.metadata?.sessionKey) {
          window.dispatchEvent(
            new CustomEvent('pinchr:open-session', {
              detail: { sessionKey: cmd.metadata.sessionKey }
            })
          )
        }
        onNavigate('chat')
        onClose()
      }
    })),
    ...messageCommands.map(cmd => ({
      ...cmd,
      action: () => {
        if (cmd.metadata?.sessionKey) {
          window.dispatchEvent(
            new CustomEvent('pinchr:open-session', {
              detail: { sessionKey: cmd.metadata.sessionKey }
            })
          )
        }
        onNavigate('chat')
        onClose()
      }
    }))
  ]

  // Filter commands based on query
  const filteredCommands = allCommands.filter(cmd => 
    query === '' || 
    cmd.title.toLowerCase().includes(query.toLowerCase()) ||
    cmd.subtitle?.toLowerCase().includes(query.toLowerCase())
  )

  // Group commands by category
  const groupedCommands = filteredCommands.reduce((acc, cmd) => {
    if (!acc[cmd.category]) acc[cmd.category] = []
    acc[cmd.category].push(cmd)
    return acc
  }, {} as Record<string, CommandItem[]>)

  const categoryLabels = {
    pages: 'Pages',
    actions: 'Actions',
    sessions: 'Sessions',
    messages: 'Messages'
  }

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(prev => Math.min(prev + 1, filteredCommands.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(prev => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filteredCommands[selectedIndex]) {
        filteredCommands[selectedIndex].action()
      }
    }
  }, [filteredCommands, selectedIndex, onClose])

  // Reset selected index when filtered commands change
  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  const backdropVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1 }
  }

  const modalVariants = {
    hidden: { 
      opacity: 0, 
      scale: 0.95,
      y: -20
    },
    visible: { 
      opacity: 1, 
      scale: 1,
      y: 0,
      transition: {
        type: 'spring',
        stiffness: 300,
        damping: 25
      }
    },
    exit: {
      opacity: 0,
      scale: 0.95,
      y: -20,
      transition: {
        duration: 0.15
      }
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 backdrop-blur-sm"
          variants={backdropVariants}
          initial="hidden"
          animate="visible"
          exit="hidden"
          onClick={onClose}
        >
          <motion.div
            className="w-full max-w-lg mx-4 mt-20 bg-surface border border-border rounded-2xl shadow-xl overflow-hidden"
            variants={modalVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Search Input */}
            <div className="flex items-center gap-3 p-4 border-b border-border">
              <Search className="h-5 w-5 text-text-muted" />
              <Input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Search pages, settings, sessions, messages..."
                className="border-0 bg-transparent text-lg placeholder:text-text-muted focus:ring-0 focus:outline-none"
                autoComplete="off"
              />
            </div>

            {/* Results */}
            <div className="max-h-96 overflow-y-auto">
              {filteredCommands.length === 0 ? (
                <div className="p-4 text-center text-text-muted">
                  No results found
                </div>
              ) : (
                Object.entries(groupedCommands).map(([category, commands]) => (
                  <div key={category} className="py-2">
                    <div className="px-4 py-2 text-xs font-semibold text-text-muted uppercase tracking-wide">
                      {categoryLabels[category as keyof typeof categoryLabels]}
                    </div>
                    {commands.map((command, index) => {
                      const globalIndex = filteredCommands.indexOf(command)
                      const isSelected = globalIndex === selectedIndex
                      const Icon = command.icon
                      
                      return (
                        <button
                          key={command.id}
                          onClick={command.action}
                          className={cn(
                            'w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface-2 transition-colors',
                            isSelected && 'bg-accent/10 border-r-2 border-accent'
                          )}
                        >
                          <Icon className="h-5 w-5 text-text-muted shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-text-primary truncate">
                              {command.title}
                            </div>
                            {command.subtitle && (
                              <div className="text-sm text-text-muted truncate">
                                {command.subtitle}
                              </div>
                            )}
                          </div>
                          {command.shortcut && (
                            <div className="flex items-center gap-1 text-xs text-text-muted">
                              {command.shortcut.map((key, i) => (
                                <React.Fragment key={i}>
                                  <kbd className="px-1.5 py-0.5 bg-surface-2 rounded text-xs font-medium">
                                    {key}
                                  </kbd>
                                  {i < command.shortcut!.length - 1 && '+'}
                                </React.Fragment>
                              ))}
                            </div>
                          )}
                        </button>
                      )
                    })}
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            <div className="px-4 py-3 border-t border-border bg-surface-2/50 flex items-center justify-between text-xs text-text-muted">
              <div className="flex items-center gap-4">
                <span>↑↓ to navigate</span>
                <span>↵ to select</span>
                <span>esc to close</span>
              </div>
              <div className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                <span>{filteredCommands.length} results</span>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
