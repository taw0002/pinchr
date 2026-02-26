import { useEffect, useMemo, useRef } from 'react'
import { RefreshCw } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import ChatEmptyState from '@/components/ChatEmptyState'
import type { SmartTask } from '@/hooks/useTasks'
import type { DisplayMessage } from './chatTypes'
import { getSystemMessageDisplay } from './chatUtils'
import { MessageBubble } from './MessageBubble'

interface MessageListProps {
  messages: DisplayMessage[]
  showChannelBadge?: boolean
  tasks?: SmartTask[]
  onNavigateToTasks?: () => void
  onPromptClick: (prompt: string) => void
  onRetryOptimisticMessage?: (optimisticId: string) => void
}

export function MessageList({
  messages,
  showChannelBadge,
  tasks,
  onNavigateToTasks,
  onPromptClick,
  onRetryOptimisticMessage
}: MessageListProps) {
  const endRef = useRef<HTMLDivElement | null>(null)

  // Filter system messages: hide noise, mark compaction as pills
  const processedMessages = useMemo(() => {
    const result: Array<{ message: DisplayMessage; mode: 'normal' | 'pill' }> = []
    for (const msg of messages) {
      const display = getSystemMessageDisplay(msg)
      if (display === 'hide') continue
      if (display === 'pill') {
        // Deduplicate adjacent pills
        const last = result[result.length - 1]
        if (last?.mode === 'pill') continue
        result.push({ message: msg, mode: 'pill' })
        continue
      }
      result.push({ message: msg, mode: 'normal' })
    }
    return result
  }, [messages])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [processedMessages])

  return (
    <ScrollArea className="flex-1 px-6">
      <div className="space-y-4 py-4 select-text">
        {processedMessages.length > 0 ? (
          processedMessages.map(({ message, mode }, index) => {
            if (mode === 'pill') {
              return (
                <div
                  key={`pill-${message.timestamp ?? index}`}
                  className="flex items-center justify-center gap-1.5 py-1"
                >
                  <RefreshCw className="h-3 w-3 text-text-muted/50" />
                  <span className="text-[10px] text-text-muted/50">Context refreshed</span>
                </div>
              )
            }
            return (
              <MessageBubble
                key={message.localId ?? `${message.timestamp ?? 'message'}-${index}`}
                message={message}
                showChannelBadge={showChannelBadge}
                sessionKey={message.sessionKey}
                tasks={tasks}
                onNavigateToTasks={onNavigateToTasks}
                onRetryOptimisticMessage={onRetryOptimisticMessage}
              />
            )
          })
        ) : (
          <ChatEmptyState onPromptClick={onPromptClick} />
        )}
        <div ref={endRef} />
      </div>
    </ScrollArea>
  )
}
