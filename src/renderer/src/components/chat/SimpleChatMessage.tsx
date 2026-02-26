import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'
import type { SimpleMessage } from '@/hooks/useSimpleChat'
import { SimpleToolPill } from './SimpleToolPill'

interface SimpleChatMessageProps {
  message: SimpleMessage
}

function formatTime(timestamp: string): string {
  const parsed = Date.parse(timestamp)
  if (!Number.isFinite(parsed)) return ''

  return new Date(parsed).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  })
}

export function SimpleChatMessage({ message }: SimpleChatMessageProps) {
  const isUser = message.role === 'user'
  const hasContent = Boolean(message.content.trim())

  return (
    <div className={cn('flex w-full', isUser ? 'justify-end' : 'justify-start')}>
      <div className={cn('max-w-[85%] space-y-1.5', isUser ? 'items-end' : 'items-start')}>
        <div
          className={cn(
            'rounded-2xl px-4 py-2.5 text-sm',
            isUser
              ? 'bg-accent text-white'
              : 'border border-border bg-surface-2 text-text-primary'
          )}
        >
          {message.toolCalls.length > 0 && (
            <div className="mb-2 space-y-1.5">
              {message.toolCalls.map((tool) => (
                <SimpleToolPill key={tool.id} tool={tool} />
              ))}
            </div>
          )}

          {message.attachmentNames && message.attachmentNames.length > 0 && (
            <div className="mb-2 space-y-1">
              {message.attachmentNames.map((name) => (
                <div
                  key={`${message.id}-${name}`}
                  className={cn(
                    'rounded border px-2 py-1 text-xs',
                    isUser
                      ? 'border-white/30 bg-white/15 text-white/95'
                      : 'border-border bg-surface-1 text-text-secondary'
                  )}
                >
                  📎 {name}
                </div>
              ))}
            </div>
          )}

          {hasContent && (
            <div
              className={cn(
                'leading-relaxed markdown-content [&_a]:underline [&_code]:rounded [&_code]:px-1 [&_code]:py-0.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_pre]:overflow-auto [&_pre]:rounded-md [&_pre]:p-3 [&_ul]:list-disc [&_ul]:pl-5',
                isUser
                  ? '[&_a]:text-white [&_code]:bg-white/20 [&_pre]:bg-white/15'
                  : '[&_a]:text-accent [&_code]:bg-surface-1 [&_pre]:border [&_pre]:border-border [&_pre]:bg-surface-1'
              )}
            >
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  a: ({ href, children, ...props }) => (
                    <a
                      {...props}
                      href={href}
                      onClick={(event) => {
                        if (!href) return
                        event.preventDefault()
                        void window.api.shell.openExternal(href)
                      }}
                    >
                      {children}
                    </a>
                  )
                }}
              >
                {message.content}
              </ReactMarkdown>
            </div>
          )}

          {message.isThinking && (
            <p className={cn('text-xs', isUser ? 'text-white/90' : 'text-text-muted')}>
              Agent is thinking...
            </p>
          )}
        </div>

        <p className="px-1 text-xs text-text-muted">{formatTime(message.timestamp)}</p>
      </div>
    </div>
  )
}

export default SimpleChatMessage
