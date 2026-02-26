import { useState, type ClipboardEvent, type KeyboardEvent, type RefObject } from 'react'
import { Loader2, Mic, Paperclip, Send, Square, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import FilePreviewChips from '@/components/FilePreviewChips'
import type { AttachedFile } from '@/components/FilePreviewChips'
import type { ComposerImage } from './chatTypes'

interface ChatComposerProps {
  inputRef: RefObject<HTMLTextAreaElement>
  fileInputRef: RefObject<HTMLInputElement>
  inputValue: string
  onInputChange: (value: string) => void
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void
  onPaste: (event: ClipboardEvent<HTMLTextAreaElement>) => void
  onSend: () => void
  onInterrupt: () => void
  onToggleRecording: () => void
  onImageFiles: (files: File[]) => Promise<void>
  onRemoveFile: (id: string) => void
  onRemoveImage: (id: string) => void
  onFileInputChange: (files: File[]) => Promise<void>
  isStreaming: boolean
  isRecording: boolean
  isTranscribing: boolean
  messageQueueLength: number
  onClearQueue: () => void
  attachedFiles: AttachedFile[]
  attachedImages: ComposerImage[]
}

export function ChatComposer({
  inputRef,
  fileInputRef,
  inputValue,
  onInputChange,
  onKeyDown,
  onPaste,
  onSend,
  onInterrupt,
  onToggleRecording,
  onImageFiles,
  onRemoveFile,
  onRemoveImage,
  onFileInputChange,
  isStreaming,
  isRecording,
  isTranscribing,
  messageQueueLength,
  onClearQueue,
  attachedFiles,
  attachedImages
}: ChatComposerProps) {
  const [isDraggingOverInput, setIsDraggingOverInput] = useState(false)

  return (
    <div className="border-t border-border p-4">
      <div className="mx-auto max-w-3xl space-y-3">
        {messageQueueLength > 0 && (
          <div className="flex items-center gap-2 px-1 text-xs text-text-muted">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>
              {messageQueueLength} message{messageQueueLength !== 1 ? 's' : ''} queued
            </span>
            <button
              type="button"
              onClick={onClearQueue}
              className="ml-auto inline-flex items-center gap-1 text-red-400 hover:text-red-300"
            >
              <X className="h-3 w-3" />
              Clear
            </button>
          </div>
        )}

        {attachedFiles.length > 0 && <FilePreviewChips files={attachedFiles} onRemove={onRemoveFile} />}

        {attachedImages.length > 0 && attachedFiles.length === 0 && (
          <div className="flex flex-wrap gap-2">
            {attachedImages.map((image) => (
              <div key={image.id} className="relative rounded-lg border border-border bg-surface-2 p-1">
                <img src={image.dataUrl} alt={image.name} className="h-20 w-20 rounded object-cover" />
                <button
                  type="button"
                  onClick={() => onRemoveImage(image.id)}
                  className="absolute -right-2 -top-2 rounded-full bg-black/80 p-1 text-white"
                  aria-label={`Remove ${image.name}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div
          className={cn(
            'flex items-end gap-2 rounded-xl border border-transparent p-1 transition-colors',
            isDraggingOverInput && 'border-accent bg-accent/5'
          )}
          onDragOver={(event) => {
            event.preventDefault()
            const hasImages = Array.from(event.dataTransfer.items).some((item) => item.type.startsWith('image/'))
            if (hasImages) setIsDraggingOverInput(true)
          }}
          onDragLeave={(event) => {
            if (event.currentTarget.contains(event.relatedTarget as Node)) return
            setIsDraggingOverInput(false)
          }}
          onDrop={async (event) => {
            event.preventDefault()
            setIsDraggingOverInput(false)
            await onImageFiles(Array.from(event.dataTransfer.files))
          }}
        >
          <div className="relative flex-1">
            <textarea
              ref={inputRef}
              value={inputValue}
              onChange={(event) => onInputChange(event.target.value)}
              onKeyDown={onKeyDown}
              onPaste={onPaste}
              placeholder={isStreaming ? 'Pinchr is responding...' : isRecording ? 'Recording voice...' : 'Message your agent...'}
              rows={1}
              className="w-full resize-none rounded-xl border border-border bg-surface-2 px-4 py-3 pr-12 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
              style={{ minHeight: '44px', maxHeight: '120px' }}
            />
          </div>

          <Button
            type="button"
            variant="outline"
            className="h-11 w-11 shrink-0 rounded-xl"
            onClick={() => fileInputRef.current?.click()}
            disabled={isRecording || isTranscribing}
            size="icon"
            aria-label="Attach files"
            title="Attach files"
          >
            <Paperclip className="h-4 w-4" />
          </Button>

          <Button
            type="button"
            variant={isRecording ? 'destructive' : 'outline'}
            className={cn('h-11 w-11 shrink-0 rounded-xl', isRecording && 'animate-pulse')}
            onClick={onToggleRecording}
            disabled={isStreaming || isTranscribing}
            size="icon"
            aria-label={isRecording ? 'Stop recording' : 'Record voice message'}
          >
            {isTranscribing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : isRecording ? (
              <Square className="h-4 w-4" />
            ) : (
              <Mic className="h-4 w-4" />
            )}
          </Button>

          <Button
            onClick={onSend}
            disabled={(!inputValue.trim() && attachedFiles.length === 0 && attachedImages.length === 0) || isTranscribing || isRecording}
            className="h-11 w-11 shrink-0 rounded-xl"
            size="icon"
            title={isStreaming ? 'Queue message' : 'Send message'}
          >
            <Send className="h-4 w-4" />
          </Button>

          {isStreaming && (
            <Button
              type="button"
              variant="ghost"
              onClick={onInterrupt}
              className="h-11 w-11 shrink-0 rounded-xl"
              size="icon"
              title="Stop & send now"
            >
              <Square className="h-4 w-4" />
            </Button>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp,.pdf,.md,.txt,.ts,.tsx,.js,.py,.json"
            multiple
            className="hidden"
            onChange={async (event) => {
              const files = event.target.files ? Array.from(event.target.files) : []
              await onFileInputChange(files)
              event.currentTarget.value = ''
            }}
          />
        </div>

        {(isRecording || isTranscribing) && (
          <p className="px-1 text-xs text-text-muted">
            {isRecording ? 'Recording... tap the mic again to stop and transcribe.' : 'Transcribing with Whisper...'}
          </p>
        )}
      </div>

    </div>
  )
}
