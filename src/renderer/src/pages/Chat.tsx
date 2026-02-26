import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { AlertTriangle, Loader2, Menu, X } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { useSimpleChat } from '@/hooks/useSimpleChat'
import { SimpleChatMessage } from '@/components/chat/SimpleChatMessage'
import { SimpleChatInput } from '@/components/chat/SimpleChatInput'
import { SessionSidebar } from '@/components/chat/SessionSidebar'
import { cn } from '@/lib/utils'
import type { Page } from '@/types/navigation'
import type { IpcResult } from '../../../shared/types'

const DEFAULT_MAIN_SESSION_KEY = 'agent:main:main'

interface BridgeApi {
  getMainSession?: () => Promise<unknown>
}

function toIpcResult<T>(value: unknown): IpcResult<T> {
  if (value && typeof value === 'object' && 'ok' in value) {
    return value as IpcResult<T>
  }

  return {
    ok: true,
    data: value as T
  }
}

function getBridgeApi(): BridgeApi {
  const api = window.api as unknown as {
    gateway?: {
      getMainSession?: () => Promise<unknown>
    }
    getMainSession?: () => Promise<unknown>
  }

  return {
    getMainSession: api.getMainSession ?? api.gateway?.getMainSession
  }
}

function getSessionFromHash(hash: string): string | null {
  const trimmed = hash.trim()
  if (!trimmed) return null

  const queryIndex = trimmed.indexOf('?')
  if (queryIndex < 0) return null

  const query = trimmed.slice(queryIndex + 1)
  const params = new URLSearchParams(query)
  const session = params.get('session')
  if (!session) return null

  const normalized = session.trim()
  return normalized.length > 0 ? normalized : null
}

interface ChatPageProps {
  onNavigate?: (page: Page) => void
}

export default function Chat(_props: ChatPageProps) {
  const [selectedSessionKey, setSelectedSessionKey] = useState<string | null>(null)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

  useEffect(() => {
    const syncSessionFromHash = () => {
      const sessionFromHash = getSessionFromHash(window.location.hash)
      if (!sessionFromHash) return
      setSelectedSessionKey(sessionFromHash)
    }

    syncSessionFromHash()
    window.addEventListener('hashchange', syncSessionFromHash)
    return () => window.removeEventListener('hashchange', syncSessionFromHash)
  }, [])

  useEffect(() => {
    let cancelled = false

    const resolveMainSession = async () => {
      const bridge = getBridgeApi()
      if (!bridge.getMainSession) {
        if (!cancelled) {
          setSelectedSessionKey((previous) => previous ?? DEFAULT_MAIN_SESSION_KEY)
        }
        return
      }

      try {
        const response = toIpcResult<string | null>(await bridge.getMainSession())
        const discovered = typeof response.data === 'string' ? response.data.trim() : ''
        const resolved = discovered || DEFAULT_MAIN_SESSION_KEY
        if (!cancelled) {
          setSelectedSessionKey((previous) => previous ?? resolved)
        }
      } catch {
        if (!cancelled) {
          setSelectedSessionKey((previous) => previous ?? DEFAULT_MAIN_SESSION_KEY)
        }
      }
    }

    void resolveMainSession()

    return () => {
      cancelled = true
    }
  }, [])

  const {
    entries,
    isLoadingHistory,
    isLoadingMoreHistory,
    hasMoreHistory,
    isStreaming,
    error,
    sendMessage,
    loadMoreHistory,
    reloadHistory
  } = useSimpleChat({ sessionKey: selectedSessionKey })

  const scrollAreaRef = useRef<HTMLDivElement | null>(null)
  const shouldStickToBottomRef = useRef(true)

  const handleSelectSession = useCallback((sessionKey: string) => {
    setSelectedSessionKey(sessionKey)
    setIsSidebarOpen(false)
  }, [])

  const getViewport = useCallback((): HTMLDivElement | null => {
    if (!scrollAreaRef.current) return null
    return scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]')
  }, [])

  useEffect(() => {
    const viewport = getViewport()
    if (!viewport) return

    const handleScroll = () => {
      const distanceFromBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight
      shouldStickToBottomRef.current = distanceFromBottom <= 120
    }

    handleScroll()
    viewport.addEventListener('scroll', handleScroll, { passive: true })
    return () => viewport.removeEventListener('scroll', handleScroll)
  }, [getViewport])

  useEffect(() => {
    if (!entries.length) return
    if (!shouldStickToBottomRef.current) return

    const viewport = getViewport()
    if (!viewport) return

    viewport.scrollTo({ top: viewport.scrollHeight, behavior: isStreaming ? 'auto' : 'smooth' })
  }, [entries, getViewport, isStreaming])

  return (
    <div className="flex h-full overflow-hidden bg-surface-1" style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}>
      <div
        className={cn(
          'fixed inset-y-0 left-0 z-30 transition-transform duration-200 md:relative md:z-auto md:translate-x-0',
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        )}
      >
        <SessionSidebar selectedSessionKey={selectedSessionKey} onSelectSession={handleSelectSession} />
      </div>

      {isSidebarOpen && (
        <button
          type="button"
          className="fixed inset-0 z-20 bg-black/40 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
          aria-label="Close session sidebar"
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-border px-4 py-3 md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setIsSidebarOpen((previous) => !previous)}
              aria-label={isSidebarOpen ? 'Hide sessions' : 'Show sessions'}
            >
              {isSidebarOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </Button>

            <div className="min-w-0">
              <h1 className="text-sm font-semibold text-text-primary">Chat</h1>
              <p className="truncate text-xs text-text-muted">
                {selectedSessionKey ? selectedSessionKey : 'Loading main session...'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button type="button" variant="outline" size="sm" onClick={() => void reloadHistory()} disabled={!selectedSessionKey}>
              Refresh
            </Button>
          </div>
        </div>

        {error && (
          <div className="mx-4 mt-4 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300 md:mx-6">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="min-h-0 flex-1 px-4 pb-4 pt-3">
          <ScrollArea ref={scrollAreaRef} className="h-full rounded-xl border border-border bg-surface-1">
            <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4">
              <div className="flex justify-center">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={loadMoreHistory}
                  disabled={!hasMoreHistory || isLoadingHistory || isLoadingMoreHistory}
                >
                  {isLoadingMoreHistory ? (
                    <>
                      <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                      Loading...
                    </>
                  ) : hasMoreHistory ? (
                    'Load more'
                  ) : (
                    'No more history'
                  )}
                </Button>
              </div>

              {isLoadingHistory && entries.length === 0 ? (
                <div className="flex items-center justify-center py-12 text-sm text-text-muted">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Loading messages...
                </div>
              ) : entries.length === 0 ? (
                <div className="py-12 text-center text-sm text-text-muted">
                  No messages yet. Start chatting below.
                </div>
              ) : (
                entries.map((entry) => {
                  if (entry.type === 'compaction') {
                    return (
                      <div key={entry.id} className="flex justify-center py-1">
                        <span className="rounded-full border border-border bg-surface-2 px-3 py-1 text-xs text-text-muted">
                          Context compacted
                        </span>
                      </div>
                    )
                  }

                  return <SimpleChatMessage key={entry.id} message={entry.message} />
                })
              )}
            </div>
          </ScrollArea>
        </div>

        <SimpleChatInput onSend={sendMessage} disabled={isStreaming || !selectedSessionKey} />
      </div>
    </div>
  )
}
