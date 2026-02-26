import { useCallback, useEffect, useRef, useState } from 'react'
import { ClipboardCopy, Download, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatAsMarkdown, formatAsText } from '@/utils/exportChat'
import type { Message } from '../../../shared/types'

interface ExportChatMenuProps {
  messages: Message[]
  sessionKey: string
  sessionName?: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function ExportChatMenu({
  messages,
  sessionKey,
  sessionName,
  open,
  onOpenChange
}: ExportChatMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [copyFeedback, setCopyFeedback] = useState(false)

  useEffect(() => {
    if (!open) return

    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onOpenChange(false)
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onOpenChange(false)
      }
    }

    window.addEventListener('mousedown', handleClickOutside)
    window.addEventListener('keydown', handleEscape)
    return () => {
      window.removeEventListener('mousedown', handleClickOutside)
      window.removeEventListener('keydown', handleEscape)
    }
  }, [open, onOpenChange])

  const exportOptions = { sessionKey, sessionName }

  const handleCopyClipboard = useCallback(async () => {
    const markdown = formatAsMarkdown(messages, exportOptions)
    await navigator.clipboard.writeText(markdown)
    setCopyFeedback(true)
    setTimeout(() => setCopyFeedback(false), 2000)
    onOpenChange(false)
  }, [messages, exportOptions, onOpenChange])

  const handleExportMarkdown = useCallback(async () => {
    const markdown = formatAsMarkdown(messages, exportOptions)
    const defaultName = sessionName
      ? `${sessionName.replace(/[^a-zA-Z0-9 _-]/g, '').trim()}.md`
      : 'chat-export.md'

    const result = await window.api.dialog.saveFile(markdown, {
      defaultPath: defaultName,
      filters: [
        { name: 'Markdown', extensions: ['md'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })

    if (result.ok) {
      onOpenChange(false)
    }
  }, [messages, exportOptions, sessionName, onOpenChange])

  const handleExportText = useCallback(async () => {
    const text = formatAsText(messages, exportOptions)
    const defaultName = sessionName
      ? `${sessionName.replace(/[^a-zA-Z0-9 _-]/g, '').trim()}.txt`
      : 'chat-export.txt'

    const result = await window.api.dialog.saveFile(text, {
      defaultPath: defaultName,
      filters: [
        { name: 'Text Files', extensions: ['txt'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })

    if (result.ok) {
      onOpenChange(false)
    }
  }, [messages, exportOptions, sessionName, onOpenChange])

  if (!open) return null

  return (
    <div
      ref={menuRef}
      className="absolute right-0 top-full mt-1 z-50 min-w-[200px] rounded-lg border border-border bg-surface shadow-lg py-1"
    >
      <button
        onClick={handleCopyClipboard}
        className="w-full flex items-center gap-3 px-3 py-2 text-sm text-text-secondary hover:bg-surface-2 hover:text-text-primary transition-colors"
      >
        <ClipboardCopy className="h-4 w-4" />
        {copyFeedback ? 'Copied!' : 'Copy to Clipboard'}
      </button>
      <button
        onClick={handleExportMarkdown}
        className="w-full flex items-center gap-3 px-3 py-2 text-sm text-text-secondary hover:bg-surface-2 hover:text-text-primary transition-colors"
      >
        <FileText className="h-4 w-4" />
        Export as Markdown
      </button>
      <button
        onClick={handleExportText}
        className="w-full flex items-center gap-3 px-3 py-2 text-sm text-text-secondary hover:bg-surface-2 hover:text-text-primary transition-colors"
      >
        <Download className="h-4 w-4" />
        Export as Text
      </button>
    </div>
  )
}
