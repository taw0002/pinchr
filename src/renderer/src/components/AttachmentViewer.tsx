import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, Download, ExternalLink, FileText, Loader2, X, ZoomIn } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

interface Attachment {
  id: string
  name: string
  path: string
  type: string
  size: number
  createdAt: string
}

interface AttachmentViewerProps {
  attachment: Attachment | null
  onClose: () => void
}

type FileCategory = 'markdown' | 'image' | 'code' | 'pdf' | 'other'

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg']
const CODE_EXTENSIONS = ['.txt', '.json', '.ts', '.tsx', '.js', '.jsx', '.css', '.html', '.py', '.sh', '.yml', '.yaml', '.toml', '.xml', '.sql', '.rb', '.go', '.rs', '.c', '.cpp', '.h', '.hpp', '.java', '.kt', '.swift', '.php', '.cs']

function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.')
  return lastDot >= 0 ? filename.slice(lastDot).toLowerCase() : ''
}

function categorizeFile(filename: string, mimeType: string): FileCategory {
  const ext = getFileExtension(filename)

  if (ext === '.md') return 'markdown'
  if (IMAGE_EXTENSIONS.includes(ext)) return 'image'
  if (ext === '.pdf') return 'pdf'
  if (CODE_EXTENSIONS.includes(ext)) return 'code'

  return 'other'
}

function getLanguageFromExtension(filename: string): string {
  const ext = getFileExtension(filename)
  const languageMap: Record<string, string> = {
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.py': 'python',
    '.rb': 'ruby',
    '.go': 'go',
    '.rs': 'rust',
    '.java': 'java',
    '.kt': 'kotlin',
    '.swift': 'swift',
    '.php': 'php',
    '.cs': 'csharp',
    '.c': 'c',
    '.cpp': 'cpp',
    '.h': 'c',
    '.hpp': 'cpp',
    '.sql': 'sql',
    '.sh': 'bash',
    '.yml': 'yaml',
    '.yaml': 'yaml',
    '.json': 'json',
    '.xml': 'xml',
    '.html': 'html',
    '.css': 'css',
    '.toml': 'toml'
  }

  return languageMap[ext] || 'text'
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

function MarkdownViewer({ path }: { path: string }) {
  const [content, setContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadMarkdown = async () => {
      try {
        setLoading(true)
        setError(null)
        const result = await window.api.files.read(path)
        if (!result.ok || !result.data) {
          throw new Error(result.error || 'Failed to read markdown file')
        }
        setContent(result.data)
      } catch (err) {
        setError(String(err))
      } finally {
        setLoading(false)
      }
    }

    loadMarkdown()
  }, [path])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-text-muted" />
      </div>
    )
  }

  if (error || content === null) {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
        {error || 'Failed to load markdown file'}
      </div>
    )
  }

  return (
    <div className="prose prose-invert prose-sm max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        className="space-y-4 text-sm leading-7 text-text-primary [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-text-secondary [&_code]:rounded [&_code]:bg-surface-2 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em] [&_h1]:mt-6 [&_h1]:text-2xl [&_h1]:font-semibold [&_h2]:mt-5 [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:mt-4 [&_h3]:text-lg [&_h3]:font-semibold [&_hr]:border-border [&_li]:ml-5 [&_li]:list-disc [&_ol]:space-y-1 [&_p]:text-text-primary [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:border [&_pre]:border-border [&_pre]:bg-surface-2 [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_table]:w-full [&_table]:border-collapse [&_table]:text-sm [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1.5 [&_th]:border [&_th]:border-border [&_th]:bg-surface-2 [&_th]:px-2 [&_th]:py-1.5 [&_th]:text-left [&_ul]:space-y-1"
        components={{
          a: ({ href, children, ...props }) => (
            <a
              {...props}
              href={href}
              className="text-accent underline-offset-2 hover:underline"
              onClick={(event) => {
                if (!href) return
                event.preventDefault()
                void window.api?.shell?.openExternal?.(href)
              }}
            >
              {children}
            </a>
          )
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

function ImageViewer({ path, name }: { path: string; name: string }) {
  const [imageData, setImageData] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [zoomed, setZoomed] = useState(false)

  useEffect(() => {
    const loadImage = async () => {
      try {
        setLoading(true)
        setError(null)
        const result = await window.api.files.readBinary(path)
        if (!result.ok || !result.data) {
          throw new Error(result.error || 'Failed to read image')
        }
        setImageData(`data:image;base64,${result.data}`)
      } catch (err) {
        setError(String(err))
      } finally {
        setLoading(false)
      }
    }

    loadImage()
  }, [path])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-text-muted" />
      </div>
    )
  }

  if (error || !imageData) {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
        {error || 'Failed to load image'}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => setZoomed(!zoomed)}
        className="group relative block w-full overflow-hidden rounded-lg border border-border bg-black/50"
      >
        <img
          src={imageData}
          alt={name}
          className={cn(
            'w-full transition-transform',
            zoomed ? 'scale-150 cursor-zoom-out' : 'cursor-zoom-in group-hover:scale-105'
          )}
        />
        {!zoomed && (
          <div className="absolute right-2 top-2 rounded-md bg-black/60 p-2 opacity-0 transition-opacity group-hover:opacity-100">
            <ZoomIn className="h-4 w-4 text-white" />
          </div>
        )}
      </button>
      {zoomed && (
        <p className="text-center text-xs text-text-muted">
          Click image to zoom out
        </p>
      )}
    </div>
  )
}

function CodeViewer({ path, filename }: { path: string; filename: string }) {
  const [content, setContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadCode = async () => {
      try {
        setLoading(true)
        setError(null)
        const result = await window.api.files.read(path)
        if (!result.ok || !result.data) {
          throw new Error(result.error || 'Failed to read file')
        }
        setContent(result.data)
      } catch (err) {
        setError(String(err))
      } finally {
        setLoading(false)
      }
    }

    loadCode()
  }, [path])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-text-muted" />
      </div>
    )
  }

  if (error || content === null) {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
        {error || 'Failed to load file'}
      </div>
    )
  }

  const lines = content.split('\n')
  const language = getLanguageFromExtension(filename)

  return (
    <div className="rounded-lg border border-border bg-black/50">
      <div className="border-b border-border bg-surface-2/50 px-3 py-2">
        <Badge variant="secondary" className="text-xs">
          {language}
        </Badge>
      </div>
      <ScrollArea className="max-h-[60vh]">
        <div className="overflow-x-auto">
          <table className="w-full font-mono text-xs">
            <tbody>
              {lines.map((line, index) => (
                <tr key={index} className="hover:bg-surface-2/30">
                  <td className="w-12 select-none border-r border-border px-3 py-0.5 text-right text-text-muted">
                    {index + 1}
                  </td>
                  <td className="px-3 py-0.5 text-green-400">
                    <pre className="inline">{line || ' '}</pre>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ScrollArea>
    </div>
  )
}

function PDFViewer({ path }: { path: string }) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadPDF = async () => {
      try {
        setLoading(true)
        setError(null)
        const result = await window.api.files.readBinary(path)
        if (!result.ok || !result.data) {
          throw new Error(result.error || 'Failed to read PDF')
        }
        setPdfUrl(`data:application/pdf;base64,${result.data}`)
      } catch (err) {
        setError(String(err))
      } finally {
        setLoading(false)
      }
    }

    loadPDF()
  }, [path])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-text-muted" />
      </div>
    )
  }

  if (error || !pdfUrl) {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
        {error || 'Failed to load PDF'}
      </div>
    )
  }

  return (
    <iframe
      src={pdfUrl}
      className="h-[70vh] w-full rounded-lg border border-border bg-surface-2"
      title="PDF Viewer"
    />
  )
}

function OtherFileViewer({ attachment }: { attachment: Attachment }) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-surface-2 p-6 text-center">
        <FileText className="mx-auto mb-3 h-12 w-12 text-text-muted" />
        <h3 className="mb-1 text-sm font-medium text-text-primary">{attachment.name}</h3>
        <p className="mb-3 text-xs text-text-muted">
          {attachment.type || 'Unknown type'} • {formatFileSize(attachment.size)}
        </p>
        <p className="text-xs text-text-secondary">
          This file type cannot be previewed inline.
        </p>
      </div>
    </div>
  )
}

export function AttachmentViewer({ attachment, onClose }: AttachmentViewerProps) {
  const [category, setCategory] = useState<FileCategory>('other')

  useEffect(() => {
    if (attachment) {
      setCategory(categorizeFile(attachment.name, attachment.type))
    }
  }, [attachment])

  const handleOpenExternal = async () => {
    if (!attachment) return
    const result = await window.api.shell.openPath(attachment.path)
    if (!result.ok) {
      console.error('Failed to open file:', result.error)
    }
  }

  return (
    <AnimatePresence>
      {attachment && (
        <motion.div
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          className="fixed inset-y-0 right-0 z-50 flex w-full max-w-3xl flex-col border-l border-border bg-background/95 backdrop-blur-sm"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border bg-surface-2/50 px-4 py-3">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onClose}
                className="h-8 w-8 p-0"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-sm font-medium text-text-primary">
                  {attachment.name}
                </h2>
                <p className="text-xs text-text-muted">
                  {formatFileSize(attachment.size)}
                </p>
              </div>
              <Badge variant="secondary" className="shrink-0 text-xs">
                {category}
              </Badge>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="ml-2 h-8 w-8 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Content */}
          <ScrollArea className="flex-1">
            <div className="p-6">
              {category === 'markdown' && (
                <MarkdownViewer path={attachment.path} />
              )}
              {category === 'image' && (
                <ImageViewer path={attachment.path} name={attachment.name} />
              )}
              {category === 'code' && (
                <CodeViewer path={attachment.path} filename={attachment.name} />
              )}
              {category === 'pdf' && (
                <PDFViewer path={attachment.path} />
              )}
              {category === 'other' && (
                <OtherFileViewer attachment={attachment} />
              )}
            </div>
          </ScrollArea>

          {/* Footer */}
          <div className="border-t border-border bg-surface-2/50 px-4 py-3">
            <Button
              type="button"
              variant="outline"
              className="w-full justify-center gap-2"
              onClick={handleOpenExternal}
            >
              <ExternalLink className="h-4 w-4" />
              Open Externally
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
