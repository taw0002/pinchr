import { useMemo, useState, type ComponentPropsWithoutRef, type ReactNode } from 'react'
import { AlertCircle, ArrowRight, Bot, Clock3, User } from 'lucide-react'
import { Streamdown } from 'streamdown'
import { cn } from '@/lib/utils'
import { getChannelEmoji, getChannelName } from '@/utils/sessionUtils'
import { InlineTaskCard } from '@/components/chat/InlineTaskCard'
import type { SmartTask } from '@/hooks/useTasks'
import type { MessageContentPart } from '../../../../shared/types'
import { detectChannelBadge, getRenderableParts, normalizeMessageRole, parseToolArtifact } from './chatUtils'
import type { DisplayMessage, SubAgentEvent, ToolCallBlock } from './chatTypes'
import { ThinkingBlock } from './ThinkingBlock'
import { ToolCallCard } from './ToolCallCard'
import { SubAgentCard } from './SubAgentCard'
import { StreamingCursor } from './StreamingCursor'

interface MessageBubbleProps {
  message: DisplayMessage
  showChannelBadge?: boolean
  sessionKey?: string
  tasks?: SmartTask[]
  onNavigateToTasks?: () => void
  onRetryOptimisticMessage?: (optimisticId: string) => void
}

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

function mergeTextSegments(parts: Array<Extract<MessageContentPart, { type: 'text' }>>): string {
  return parts.map((part) => part.text).join('')
}

function hashText(value: string): string {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash).toString(36)
}

function extractTextFromParts(parts: MessageContentPart[]): string {
  return parts
    .filter((part): part is Extract<MessageContentPart, { type: 'text' }> => part.type === 'text')
    .map((part) => part.text)
    .join('\n\n')
    .trim()
}

function ThinkingDots() {
  return (
    <span aria-hidden="true" className="inline-flex">
      {[0, 1, 2].map((dot) => (
        <span
          key={dot}
          className="animate-[pulse_1.2s_ease-in-out_infinite]"
          style={{ animationDelay: `${dot * 0.2}s` }}
        >
          .
        </span>
      ))}
    </span>
  )
}

export function MessageBubble({
  message,
  showChannelBadge,
  sessionKey,
  tasks,
  onNavigateToTasks,
  onRetryOptimisticMessage
}: MessageBubbleProps) {
  const role = normalizeMessageRole(message.role)
  const isUser = role === 'user'
  const isQueued = message.isQueued === true
  const isStreaming = message.isStreaming === true
  const isOptimistic = message._optimistic === true
  const optimisticState = message._optimisticState
  const isOptimisticQueued = optimisticState === 'queued'
  const isOptimisticSending = optimisticState === 'sending'
  const isOptimisticThinking = optimisticState === 'thinking' || optimisticState === 'pending'
  const isOptimisticFailed = message._optimisticState === 'failed'
  const isOptimisticPending =
    isOptimistic && (isOptimisticQueued || isOptimisticSending || isOptimisticThinking)
  const optimisticId = message._optimisticId
  const [copiedCode, setCopiedCode] = useState('')

  const baseParts = getRenderableParts(message)

  const parsed = useMemo(() => {
    const toolCalls: ToolCallBlock[] = [...(message.toolCalls ?? [])]
    const subAgents: SubAgentEvent[] = [...(message.subAgentEvents ?? [])]
    const textParts: Array<Extract<MessageContentPart, { type: 'text' }>> = []
    const imageParts: Array<Extract<MessageContentPart, { type: 'image_url' }>> = []

    baseParts.forEach((part, index) => {
      if (part.type === 'image_url') {
        imageParts.push(part)
        return
      }

      const artifact = parseToolArtifact(part.text)
      if (!artifact.hideText) {
        textParts.push(part)
        return
      }

      if (artifact.subAgentEvent) {
        const stableId = `sub-agent-${hashText(`${message.timestamp || message.localId || 'message'}-${index}-${part.text.slice(0, 120)}`)}`
        subAgents.push({
          id: stableId,
          ...artifact.subAgentEvent
        })
      }

      if (artifact.toolName || artifact.toolResult) {
        const stableId = `tool-${hashText(`${message.timestamp || message.localId || 'message'}-${index}-${artifact.toolName || ''}-${artifact.toolResult || part.text.slice(0, 120)}`)}`
        toolCalls.push({
          id: stableId,
          name: artifact.toolName || 'tool',
          status: artifact.toolResult ? 'completed' : 'running',
          result: artifact.toolResult
        })
      }
    })

    const thinkingContent = message.thinkingContent || (message.isThinking ? extractTextFromParts(baseParts) : '')

    return {
      textContent: mergeTextSegments(textParts),
      imageParts,
      toolCalls,
      subAgents,
      thinkingContent
    }
  }, [baseParts, message.isThinking, message.subAgentEvents, message.thinkingContent, message.toolCalls])

  // Disabled: heuristic task matching was too aggressive — showed random task
  // cards on messages based on loose timestamp/title matching. Task cards should
  // only appear when the agent explicitly references them (future: agent-driven).
  const recentlyUpdatedTasks: typeof tasks = []

  const timestampText = message.timestamp
    ? new Date(message.timestamp).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit'
      })
    : null

  return (
    <div
      className={cn(
        'flex gap-3',
        isUser && 'justify-end',
        isQueued && 'opacity-60',
        isOptimisticPending && 'opacity-90'
      )}
    >
      <div
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
          isUser ? 'order-2 bg-green-700/20' : 'bg-accent/15'
        )}
      >
        {isUser ? <User className="h-4 w-4 text-green-300" /> : <Bot className="h-4 w-4 text-accent" />}
      </div>

      <div
        className={cn(
          'max-w-[78%] rounded-2xl px-4 py-2.5',
          isUser ? 'order-1 bg-green-600 text-white' : 'bg-surface-2 text-text-primary'
        )}
      >
        {!isUser && message.routeInfo && (
          <div className="mb-2 flex items-center gap-1.5 rounded-lg bg-accent/10 px-2 py-1">
            <ArrowRight className="h-3 w-3 text-accent" />
            <span className="text-xs text-accent">
              {message.routeInfo.created ? 'New topic' : 'Routed to'}: {message.routeInfo.topicLabel}
            </span>
          </div>
        )}

        {!isUser && parsed.thinkingContent.trim() && (
          <ThinkingBlock
            content={parsed.thinkingContent}
            isStreaming={isStreaming}
            startedAt={message.timestamp}
          />
        )}

        {parsed.toolCalls.length > 0 && (
          <div className="mb-2 space-y-2">
            {parsed.toolCalls.map((toolCall) => (
              <ToolCallCard key={toolCall.id} call={toolCall} />
            ))}
          </div>
        )}

        {parsed.subAgents.length > 0 && (
          <div className="mb-2 space-y-2">
            {parsed.subAgents.map((event) => (
              <SubAgentCard key={event.id} event={event} />
            ))}
          </div>
        )}

        <div className="space-y-2 text-sm leading-relaxed markdown-content [&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-text-secondary [&_li]:my-1 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_strong]:font-semibold [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-5 [&_h1]:text-lg [&_h1]:font-bold [&_h1]:mt-4 [&_h1]:mb-2 [&_h2]:text-base [&_h2]:font-bold [&_h2]:mt-3 [&_h2]:mb-1.5 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mt-2 [&_h3]:mb-1 [&_hr]:my-4 [&_hr]:border-border">
          {parsed.imageParts.map((part, index) => (
            <img
              key={`image-${index}`}
              src={part.image_url.url}
              alt={`Attachment ${index + 1}`}
              className={cn(
                'max-h-72 rounded-lg border',
                isUser ? 'border-white/20 bg-black/10' : 'border-border bg-surface-3'
              )}
            />
          ))}

          {parsed.textContent.trim() && (
            <Streamdown
              mode={isStreaming ? 'streaming' : 'static'}
              isAnimating={isStreaming}
              components={{
                p: ({ children }) => <p className="mb-4 whitespace-pre-wrap last:mb-0">{children}</p>,
                code: ({ className, children, ...props }: MarkdownCodeProps) => {
                  const codeText = flattenReactText(children).replace(/\n$/, '')
                  const language = className?.match(/language-([\w-]+)/)?.[1] || 'code'
                  // Block code requires BOTH a language class AND multiple lines (or substantial content).
                  // Single-word inline code like `process` should never render as a block card,
                  // even if Streamdown adds a language- class to it.
                  const hasLanguageClass = Boolean(className?.includes('language-'))
                  const isMultiLine = /\r?\n/.test(codeText)
                  const isBlockCode = hasLanguageClass && (isMultiLine || codeText.length > 80)

                  if (!isBlockCode) {
                    return (
                      <code
                        className={cn(
                          'inline-block rounded px-1.5 py-0.5 font-mono text-[0.85em] leading-normal',
                          isUser ? 'bg-white/25 text-white' : 'bg-accent/15 text-accent'
                        )}
                        {...props}
                      >
                        {children}
                      </code>
                    )
                  }

                  return (
                    <div className={cn('my-4 overflow-hidden rounded-lg border', isUser ? 'border-white/20 bg-black/15' : 'border-border bg-surface-3')}>
                      <div className="flex items-center justify-between border-b border-inherit px-3 py-1.5">
                        <span className="text-[10px] uppercase tracking-wide text-text-muted">{language}</span>
                        <button
                          type="button"
                          onClick={async () => {
                            await navigator.clipboard.writeText(codeText)
                            setCopiedCode(codeText)
                            window.setTimeout(() => setCopiedCode(''), 1200)
                          }}
                          className="text-[10px] text-text-muted hover:text-text-primary transition-colors"
                        >
                          {copiedCode === codeText ? 'Copied' : 'Copy'}
                        </button>
                      </div>
                      <pre className="max-h-96 overflow-auto p-4 text-xs font-mono leading-relaxed">
                        <code className={className} {...props}>
                          {children}
                        </code>
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
              {parsed.textContent}
            </Streamdown>
          )}

          {isStreaming && !parsed.textContent.trim() && parsed.toolCalls.length === 0 && !parsed.thinkingContent.trim() && (
            <p className={cn('text-xs', isUser ? 'text-white/80' : 'text-text-muted')}>
              Agent is thinking<ThinkingDots />
            </p>
          )}

          {isStreaming && <StreamingCursor />}
        </div>

        {!isUser && recentlyUpdatedTasks.length > 0 && (
          <div className="mt-3 space-y-2">
            {recentlyUpdatedTasks.map((task) => (
              <InlineTaskCard
                key={task.id}
                task={task}
                onNavigate={onNavigateToTasks}
              />
            ))}
          </div>
        )}

        <div className="mt-2 flex items-center gap-2">
          {(isQueued || isOptimisticQueued) && (
            <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', isUser ? 'bg-white/20 text-white/85' : 'bg-surface-3 text-text-muted')}>
              Queued - agent is busy
            </span>
          )}

          {isOptimisticSending && (
            <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium', isUser ? 'bg-white/20 text-white/85' : 'bg-surface-3 text-text-muted')}>
              <Clock3 className="h-3 w-3" />
              Sending...
            </span>
          )}

          {isOptimisticThinking && (
            <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium', isUser ? 'bg-white/20 text-white/85' : 'bg-surface-3 text-text-muted')}>
              <Clock3 className="h-3 w-3" />
              Agent is thinking<ThinkingDots />
            </span>
          )}

          {isOptimisticFailed && (
            <>
              <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium', isUser ? 'bg-red-500/20 text-red-100' : 'bg-red-500/10 text-red-300')}>
                <AlertCircle className="h-3 w-3" />
                Failed
              </span>
              {optimisticId && onRetryOptimisticMessage && (
                <button
                  type="button"
                  className={cn(
                    'text-[10px] font-medium underline decoration-dotted underline-offset-2 transition-colors',
                    isUser ? 'text-white/90 hover:text-white' : 'text-accent hover:text-accent/80'
                  )}
                  onClick={() => onRetryOptimisticMessage(optimisticId)}
                >
                  Retry
                </button>
              )}
            </>
          )}

          {showChannelBadge && (() => {
            // Try message-level channel detection first (for unified session view)
            const messageBadge = detectChannelBadge(message)
            if (messageBadge) {
              return (
                <div className="flex items-center gap-1">
                  <span className="text-[10px]">{messageBadge.emoji}</span>
                  <span className={cn('text-[10px] font-medium', isUser ? 'text-white/70' : 'text-text-muted')}>
                    {messageBadge.label}
                  </span>
                </div>
              )
            }
            // Fall back to session key-based detection
            if (sessionKey) {
              return (
                <div className="flex items-center gap-1">
                  <span className="text-[10px]">{getChannelEmoji(sessionKey)}</span>
                  <span className={cn('text-[10px] font-medium', isUser ? 'text-white/70' : 'text-text-muted')}>
                    {getChannelName(sessionKey)}
                  </span>
                </div>
              )
            }
            return null
          })()}

          {timestampText && (
            <p className={cn('text-[10px]', isUser ? 'text-white/70' : 'text-text-muted')}>
              {timestampText}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
