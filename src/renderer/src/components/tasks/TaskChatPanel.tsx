import { useCallback, useEffect, useMemo, useRef, useState, type ComponentPropsWithoutRef, type ReactNode } from 'react'
import { Bot, Loader2, Send, User } from 'lucide-react'
import { Streamdown } from 'streamdown'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { SmartTask } from '@/hooks/useTasks'
import { useTaskSessionChat } from '@/hooks/useTaskSessionChat'

interface MarkdownCodeProps extends ComponentPropsWithoutRef<'code'> {
  node?: unknown
}

function flattenReactText(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map((child) => flattenReactText(child)).join('')
  if (!node || typeof node !== 'object') return ''

  if ('props' in node) {
    const element = node as { props?: { children?: ReactNode } }
    return flattenReactText(element.props?.children)
  }

  return ''
}

function formatTimestamp(timestamp?: string): string {
  if (!timestamp) return ''
  const parsed = new Date(timestamp)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function TaskChatMessage({
  role,
  content,
  timestamp,
  isStreaming
}: {
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp?: string
  isStreaming?: boolean
}) {
  const isUser = role === 'user'
  const isSystem = role === 'system'
  const safeContent = content.trim().length > 0 ? content : isStreaming ? 'Working...' : '(empty)'

  return (
    <div className={cn('flex gap-3', isUser && 'justify-end')}>
      <div
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
          isUser ? 'order-2 bg-green-700/20' : isSystem ? 'border border-border bg-surface-3' : 'bg-accent/15'
        )}
      >
        {isUser ? (
          <User className="h-4 w-4 text-green-400" />
        ) : (
          <Bot className={cn('h-4 w-4', isSystem ? 'text-text-muted' : 'text-accent')} />
        )}
      </div>

      <div
        className={cn(
          'max-w-[80%] rounded-2xl px-4 py-2.5',
          isUser
            ? 'order-1 bg-green-600 text-white'
            : isSystem
              ? 'border border-border bg-surface-3/70 text-text-muted'
              : 'bg-surface-2 text-text-primary'
        )}
      >
        <div className="text-sm leading-7 markdown-content space-y-2 [&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-text-secondary [&_li]:my-1 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_strong]:font-semibold [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-5">
          <Streamdown
            mode={isStreaming ? 'streaming' : 'static'}
            isAnimating={Boolean(isStreaming)}
            components={{
              p: ({ children }) => <p className="mb-3 whitespace-pre-wrap last:mb-0">{children}</p>,
              code: ({ children, className, ...props }: MarkdownCodeProps) => {
                const codeText = flattenReactText(children).replace(/\n$/, '')
                const isBlockCode = Boolean(className?.includes('language-')) || /\r?\n/.test(codeText)

                if (!isBlockCode) {
                  return (
                    <code
                      className={cn(
                        'px-1.5 py-0.5 rounded font-mono text-[0.82em]',
                        isUser ? 'bg-white/20 text-white' : 'bg-accent/10 text-accent'
                      )}
                      {...props}
                    >
                      {children}
                    </code>
                  )
                }

                return (
                  <div className={cn('my-3 overflow-hidden rounded-lg border', isUser ? 'border-white/20 bg-black/15' : 'border-border bg-surface-3')}>
                    <pre className="max-h-72 overflow-auto p-3 text-xs font-mono leading-relaxed">
                      <code className={className} {...props}>{children}</code>
                    </pre>
                  </div>
                )
              },
              a: ({ href, children }) => (
                <a
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  className={cn('underline hover:no-underline', isUser ? 'text-green-100' : 'text-accent')}
                >
                  {children}
                </a>
              )
            }}
          >
            {safeContent}
          </Streamdown>

          {isStreaming && (
            <span className="inline-block h-4 w-2 animate-pulse rounded-sm bg-accent align-middle" />
          )}
        </div>

        <div className="mt-1 text-[11px] text-text-muted">{formatTimestamp(timestamp)}</div>
      </div>
    </div>
  )
}

interface TaskChatPanelProps {
  task: SmartTask
}

export function TaskChatPanel({ task }: TaskChatPanelProps) {
  const [inputValue, setInputValue] = useState('')
  const composerRef = useRef<HTMLTextAreaElement | null>(null)
  const bottomRef = useRef<HTMLDivElement | null>(null)

  const { messages, isLoading, isStreaming, error, sendMessage, clearError } = useTaskSessionChat({
    task: {
      id: task.id,
      title: task.title,
      description: task.description,
      status: task.status
    }
  })

  const hasMessages = useMemo(() => messages.length > 0, [messages])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages])

  const handleSend = useCallback(() => {
    if (sendMessage(inputValue)) {
      setInputValue('')
      composerRef.current?.focus()
    }
  }, [inputValue, sendMessage])

  return (
    <section className="flex min-h-[68vh] flex-col overflow-hidden rounded-lg border border-border bg-surface-1">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <p className="text-sm font-medium text-text-primary">Task Chat</p>
          <p className="text-xs text-text-muted">Dedicated conversation for this task.</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {isLoading && !hasMessages ? (
          <div className="flex h-full items-center justify-center text-sm text-text-muted">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading chat history...
          </div>
        ) : !hasMessages ? (
          <div className="flex h-full items-center justify-center text-sm text-text-muted">
            Start working on this task...
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((message) => (
              <TaskChatMessage
                key={message.id}
                role={message.role}
                content={message.content}
                timestamp={message.timestamp}
                isStreaming={message.isStreaming}
              />
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <div className="border-t border-border bg-surface-2/40 p-3">
        {error && (
          <div className="mb-2 flex items-center justify-between rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            <span>{error}</span>
            <button type="button" onClick={clearError} className="underline underline-offset-2 hover:no-underline">
              Dismiss
            </button>
          </div>
        )}

        <div className="flex items-end gap-2">
          <textarea
            ref={composerRef}
            value={inputValue}
            onChange={(event) => setInputValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                handleSend()
              }
            }}
            rows={1}
            placeholder={isStreaming ? 'Agent is responding...' : 'Ask for help on this task...'}
            className="min-h-[44px] max-h-[140px] w-full resize-y rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <Button
            type="button"
            onClick={handleSend}
            disabled={!inputValue.trim() || isStreaming}
            className="h-11 w-11 shrink-0 rounded-xl"
            size="icon"
            title="Send message"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </section>
  )
}
