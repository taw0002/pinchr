import { useCallback, useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react'
import { Paperclip, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import FilePreviewChips from '@/components/FilePreviewChips'
import type { SimpleAttachment } from '@/hooks/useSimpleChat'

interface SimpleChatInputProps {
  onSend: (message: string, attachments: SimpleAttachment[]) => Promise<boolean> | boolean
  disabled?: boolean
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`))
    reader.readAsDataURL(file)
  })
}

async function toAttachment(file: File): Promise<SimpleAttachment> {
  const withPath = file as File & { path?: string }
  const isImage = file.type.startsWith('image/')

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: file.name,
    size: file.size,
    type: file.type,
    path: typeof withPath.path === 'string' ? withPath.path : undefined,
    dataUrl: isImage ? await readAsDataUrl(file) : undefined
  }
}

export function SimpleChatInput({ onSend, disabled = false }: SimpleChatInputProps) {
  const [message, setMessage] = useState('')
  const [attachments, setAttachments] = useState<SimpleAttachment[]>([])
  const [isDragging, setIsDragging] = useState(false)

  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const growTextarea = useCallback(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 180)}px`
  }, [])

  useEffect(() => {
    growTextarea()
  }, [growTextarea, message])

  const addFiles = useCallback(async (files: File[]) => {
    if (files.length === 0) return
    const mapped = await Promise.all(files.map((file) => toAttachment(file)))
    setAttachments((prev) => [...prev, ...mapped])
  }, [])

  const handleFileInput = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files ? Array.from(event.target.files) : []
      await addFiles(files)
      event.currentTarget.value = ''
    },
    [addFiles]
  )

  const handleSend = useCallback(async () => {
    if (disabled) return

    const trimmed = message.trim()
    if (!trimmed && attachments.length === 0) return

    const sent = await onSend(trimmed, attachments)
    if (!sent) return

    setMessage('')
    setAttachments([])
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }, [attachments, disabled, message, onSend])

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault()
        void handleSend()
      }
    },
    [handleSend]
  )

  return (
    <div className="border-t border-border bg-surface-1 p-4">
      <div className="mx-auto max-w-4xl space-y-3">
        {attachments.length > 0 && (
          <FilePreviewChips
            files={attachments}
            onRemove={(id) => {
              setAttachments((prev) => prev.filter((file) => file.id !== id))
            }}
          />
        )}

        <div
          className={cn(
            'rounded-xl border p-2 transition-colors',
            isDragging ? 'border-accent bg-accent/5' : 'border-border bg-surface-2'
          )}
          onDragOver={(event) => {
            event.preventDefault()
            setIsDragging(true)
          }}
          onDragLeave={(event) => {
            if (event.currentTarget.contains(event.relatedTarget as Node)) return
            setIsDragging(false)
          }}
          onDrop={(event) => {
            event.preventDefault()
            setIsDragging(false)
            const files = Array.from(event.dataTransfer.files || [])
            void addFiles(files)
          }}
        >
          <div className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={disabled ? 'Agent is responding...' : 'Message your agent...'}
              rows={1}
              disabled={disabled}
              className="max-h-[180px] min-h-[44px] w-full resize-none rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent disabled:cursor-not-allowed disabled:opacity-70"
            />

            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-11 w-11 rounded-lg"
              disabled={disabled}
              onClick={() => fileInputRef.current?.click()}
              aria-label="Attach files"
              title="Attach files"
            >
              <Paperclip className="h-4 w-4" />
            </Button>

            <Button
              type="button"
              size="icon"
              className="h-11 w-11 rounded-lg"
              disabled={disabled || (!message.trim() && attachments.length === 0)}
              onClick={() => {
                void handleSend()
              }}
              aria-label="Send message"
              title="Send"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>

          {isDragging && <p className="mt-2 text-xs text-text-muted">Drop files to attach</p>}
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileInput}
      />
    </div>
  )
}

export default SimpleChatInput
