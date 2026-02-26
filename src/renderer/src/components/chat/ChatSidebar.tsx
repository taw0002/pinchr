import { useEffect, useMemo, useState } from 'react'
import { Archive, ChevronDown, ChevronRight, MessageSquare, Plus, RotateCcw, Search, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { friendlySessionName, getChannelEmoji } from '@/utils/sessionUtils'
import type { PinchrSession, Session } from '../../../../shared/types'
import { formatSessionTimestamp, parseIsoTimestamp } from './chatUtils'

interface ContextMenuState {
  sessionId: string
  x: number
  y: number
  archived: boolean
}

interface ChatSidebarProps {
  viewMode: 'sessions' | 'timeline'
  onViewModeChange: (mode: 'sessions' | 'timeline') => void
  pinchrSessions: PinchrSession[]
  archivedPinchrSessions: PinchrSession[]
  channelSessions: Session[]
  selectedSession: string | null
  showArchived: boolean
  onToggleArchived: () => void
  onCreateNewChat: () => void
  onSelectSession: (sessionKey: string) => void
  onRenameSession: (sessionId: string) => void
  onArchiveSession: (sessionId: string) => void
  onDeleteSession: (sessionId: string) => void
  onRestoreSession: (sessionId: string) => void
  onClearArchived: () => void
}

function filterBySearch<T>(items: T[], query: string, getText: (item: T) => string): T[] {
  const q = query.trim().toLowerCase()
  if (!q) return items
  return items.filter((item) => getText(item).toLowerCase().includes(q))
}

export function ChatSidebar({
  viewMode,
  onViewModeChange,
  pinchrSessions,
  archivedPinchrSessions,
  channelSessions,
  selectedSession,
  showArchived,
  onToggleArchived,
  onCreateNewChat,
  onSelectSession,
  onRenameSession,
  onArchiveSession,
  onDeleteSession,
  onRestoreSession,
  onClearArchived
}: ChatSidebarProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)

  useEffect(() => {
    if (!contextMenu) return

    const close = () => setContextMenu(null)
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setContextMenu(null)
    }

    window.addEventListener('click', close)
    window.addEventListener('contextmenu', close)
    window.addEventListener('keydown', closeOnEscape)

    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('contextmenu', close)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [contextMenu])

  const filteredPinchr = useMemo(
    () => filterBySearch(pinchrSessions, searchQuery, (session) => session.name),
    [pinchrSessions, searchQuery]
  )
  const filteredArchived = useMemo(
    () => filterBySearch(archivedPinchrSessions, searchQuery, (session) => session.name),
    [archivedPinchrSessions, searchQuery]
  )
  const filteredChannels = useMemo(
    () => filterBySearch(channelSessions, searchQuery, (session) => friendlySessionName(session.key)),
    [channelSessions, searchQuery]
  )

  return (
    <div className="flex w-72 flex-col border-r border-border bg-surface">
      <div className="space-y-2 p-4 pb-2">
        <div className="flex items-center rounded-lg bg-surface-2 p-1">
          <button
            type="button"
            onClick={() => onViewModeChange('sessions')}
            className={cn(
              'rounded-md px-3 py-1 text-xs font-medium transition-all duration-200',
              viewMode === 'sessions'
                ? 'bg-gradient-accent text-white shadow-glow-sm'
                : 'text-text-muted hover:bg-surface-3 hover:text-text-primary'
            )}
          >
            Chats
          </button>
          <button
            type="button"
            onClick={() => onViewModeChange('timeline')}
            className={cn(
              'rounded-md px-3 py-1 text-xs font-medium transition-all duration-200',
              viewMode === 'timeline'
                ? 'bg-gradient-accent text-white shadow-glow-sm'
                : 'text-text-muted hover:bg-surface-3 hover:text-text-primary'
            )}
          >
            Timeline
          </button>
        </div>

        <Button type="button" variant="outline" className="w-full justify-start gap-2" onClick={onCreateNewChat}>
          <Plus className="h-4 w-4" />
          New Chat
        </Button>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search chats"
            className="h-9 w-full rounded-lg border border-border bg-surface-2 pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-4 px-2 pb-3">
          <section>
            <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-text-muted">Your Chats</p>
            <div className="space-y-1">
              {filteredPinchr.length === 0 ? (
                <p className="px-3 py-2 text-xs text-text-muted">No chats found.</p>
              ) : (
                filteredPinchr.map((session) => {
                  const isSelected = selectedSession === session.sessionKey
                  return (
                    <button
                      key={session.id}
                      type="button"
                      onClick={() => onSelectSession(session.sessionKey)}
                      onContextMenu={(event) => {
                        event.preventDefault()
                        setContextMenu({
                          sessionId: session.id,
                          x: event.clientX,
                          y: event.clientY,
                          archived: false
                        })
                      }}
                      className={cn(
                        'group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors',
                        isSelected ? 'bg-accent/15 text-accent' : 'text-text-secondary hover:bg-surface-2'
                      )}
                    >
                      <MessageSquare className="h-4 w-4 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{session.name}</p>
                        <p className="truncate text-xs text-text-muted">{formatSessionTimestamp(session.updatedAt)}</p>
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          </section>

          <section>
            <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-text-muted">Channels</p>
            <div className="space-y-1">
              {filteredChannels.length === 0 ? (
                <p className="px-3 py-2 text-xs text-text-muted">No channels found.</p>
              ) : (
                filteredChannels.map((session) => {
                  const isSelected = selectedSession === session.key
                  const activityTime = parseIsoTimestamp(session.lastActivity)

                  return (
                    <button
                      key={session.key}
                      type="button"
                      onClick={() => onSelectSession(session.key)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors',
                        isSelected ? 'bg-accent/15 text-accent' : 'text-text-secondary hover:bg-surface-2'
                      )}
                    >
                      <span className="shrink-0 text-sm">{getChannelEmoji(session.key)}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{friendlySessionName(session.key)}</p>
                        <p className="truncate text-xs text-text-muted">
                          {activityTime > 0 ? formatSessionTimestamp(activityTime) : session.channel || session.model || 'active'}
                        </p>
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          </section>

          {archivedPinchrSessions.length > 0 && (
            <section className="border-t border-border pt-3">
              <button
                type="button"
                onClick={onToggleArchived}
                className="flex w-full items-center justify-between px-3 py-1 text-xs font-semibold text-text-muted hover:text-text-primary"
              >
                <span className="flex items-center gap-2">
                  {showArchived ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  Archived ({archivedPinchrSessions.length})
                </span>
                {showArchived && (
                  <span
                    role="button"
                    tabIndex={-1}
                    onClick={(event) => {
                      event.stopPropagation()
                      onClearArchived()
                    }}
                    className="text-[10px] underline underline-offset-2 hover:text-red-400"
                  >
                    Clear all
                  </span>
                )}
              </button>

              {showArchived && (
                <div className="mt-1 space-y-1">
                  {filteredArchived.map((session) => (
                    <button
                      key={session.id}
                      type="button"
                      onClick={() => onSelectSession(session.sessionKey)}
                      onContextMenu={(event) => {
                        event.preventDefault()
                        setContextMenu({
                          sessionId: session.id,
                          x: event.clientX,
                          y: event.clientY,
                          archived: true
                        })
                      }}
                      className="group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-text-secondary opacity-70 transition-colors hover:bg-surface-2 hover:opacity-100"
                    >
                      <Archive className="h-4 w-4 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{session.name}</p>
                        <p className="truncate text-xs text-text-muted">{formatSessionTimestamp(session.updatedAt)}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      </ScrollArea>

      {contextMenu && (
        <div
          className="fixed z-50 w-44 rounded-lg border border-border bg-surface-2 p-1 shadow-lg"
          style={{
            left: Math.min(contextMenu.x, window.innerWidth - 180),
            top: Math.min(contextMenu.y, window.innerHeight - 120)
          }}
          onClick={(event) => event.stopPropagation()}
        >
          {!contextMenu.archived ? (
            <>
              <button
                type="button"
                className="w-full rounded-md px-3 py-2 text-left text-sm text-text-primary hover:bg-surface-3"
                onClick={() => onRenameSession(contextMenu.sessionId)}
              >
                Rename
              </button>
              <button
                type="button"
                className="w-full rounded-md px-3 py-2 text-left text-sm text-text-primary hover:bg-surface-3"
                onClick={() => onArchiveSession(contextMenu.sessionId)}
              >
                Archive
              </button>
              <button
                type="button"
                className="w-full rounded-md px-3 py-2 text-left text-sm text-red-400 hover:bg-red-500/10"
                onClick={() => onDeleteSession(contextMenu.sessionId)}
              >
                Delete
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="w-full rounded-md px-3 py-2 text-left text-sm text-text-primary hover:bg-surface-3"
                onClick={() => onRestoreSession(contextMenu.sessionId)}
              >
                <RotateCcw className="mr-1 inline h-3.5 w-3.5" />
                Restore
              </button>
              <button
                type="button"
                className="w-full rounded-md px-3 py-2 text-left text-sm text-red-400 hover:bg-red-500/10"
                onClick={() => onDeleteSession(contextMenu.sessionId)}
              >
                <Trash2 className="mr-1 inline h-3.5 w-3.5" />
                Delete
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
