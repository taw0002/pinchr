import { FileCode, FileImage, FileText, File as FileIcon, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface AttachedFile {
  id: string
  name: string
  size: number
  type: string
  /** Data URL for thumbnails (images only) */
  dataUrl?: string
}

interface FilePreviewChipsProps {
  files: AttachedFile[]
  onRemove: (id: string) => void
}

const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp'])
const CODE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.py', '.json'])
const DOC_EXTENSIONS = new Set(['.pdf', '.md', '.txt'])

function getFileExtension(filename: string): string {
  const dot = filename.lastIndexOf('.')
  return dot >= 0 ? filename.slice(dot).toLowerCase() : ''
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function FileTypeIcon({ file }: { file: AttachedFile }): React.ReactElement {
  const ext = getFileExtension(file.name)

  if (IMAGE_TYPES.has(file.type)) return <FileImage className="h-3.5 w-3.5 text-blue-400 shrink-0" />
  if (CODE_EXTENSIONS.has(ext)) return <FileCode className="h-3.5 w-3.5 text-green-400 shrink-0" />
  if (DOC_EXTENSIONS.has(ext)) return <FileText className="h-3.5 w-3.5 text-orange-400 shrink-0" />
  return <FileIcon className="h-3.5 w-3.5 text-text-muted shrink-0" />
}

function truncateFilename(name: string, maxLen = 24): string {
  if (name.length <= maxLen) return name
  const ext = getFileExtension(name)
  const base = name.slice(0, name.length - ext.length)
  const keep = maxLen - ext.length - 1 // 1 for the ellipsis
  if (keep <= 3) return `${name.slice(0, maxLen - 1)}…`
  return `${base.slice(0, keep)}…${ext}`
}

export default function FilePreviewChips({ files, onRemove }: FilePreviewChipsProps): React.ReactElement | null {
  if (files.length === 0) return null

  return (
    <div className="flex flex-wrap gap-2">
      {files.map((file) => {
        const isImage = IMAGE_TYPES.has(file.type) && !!file.dataUrl
        return (
          <div
            key={file.id}
            className={cn(
              'group relative flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5',
              'text-xs text-text-secondary hover:bg-surface-3 transition-colors'
            )}
          >
            {isImage ? (
              <img
                src={file.dataUrl}
                alt={file.name}
                className="h-6 w-6 rounded object-cover shrink-0"
              />
            ) : (
              <FileTypeIcon file={file} />
            )}

            <span className="truncate max-w-[140px]" title={file.name}>
              {truncateFilename(file.name)}
            </span>

            <span className="text-text-muted shrink-0">{formatFileSize(file.size)}</span>

            <button
              type="button"
              onClick={() => onRemove(file.id)}
              className="ml-0.5 rounded-full p-0.5 text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors"
              aria-label={`Remove ${file.name}`}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
