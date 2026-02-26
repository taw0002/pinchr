import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, FileText, Folder, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type MemoryFileFilter = 'all' | 'root' | 'daily'

interface MemoryFileTreeProps {
  files: string[]
  selectedFile: string | null
  onSelect: (path: string) => void
  searchTerm: string
  onSearchTermChange: (value: string) => void
  filter: MemoryFileFilter
  onFilterChange: (filter: MemoryFileFilter) => void
}

interface TreeNode {
  name: string
  fullPath: string
  folders: Map<string, TreeNode>
  files: string[]
}

const FILTER_OPTIONS: Array<{ id: MemoryFileFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'root', label: 'Root' },
  { id: 'daily', label: 'Daily' }
]

function isDailyMemoryPath(path: string): boolean {
  return /^memory\/\d{4}-\d{2}-\d{2}\.md$/i.test(path)
}

function createNode(name: string, fullPath: string): TreeNode {
  return {
    name,
    fullPath,
    folders: new Map<string, TreeNode>(),
    files: []
  }
}

function buildMemoryTree(files: string[]): TreeNode {
  const root = createNode('memory', 'memory')

  for (const file of files) {
    if (!file.startsWith('memory/')) continue

    const segments = file.replace(/^memory\//, '').split('/').filter(Boolean)
    let current = root
    let currentPath = 'memory'

    for (let index = 0; index < segments.length; index += 1) {
      const segment = segments[index]
      const isFile = index === segments.length - 1

      if (isFile) {
        current.files.push(file)
      } else {
        currentPath = `${currentPath}/${segment}`
        if (!current.folders.has(segment)) {
          current.folders.set(segment, createNode(segment, currentPath))
        }
        current = current.folders.get(segment)!
      }
    }
  }

  return root
}

function renderNode(
  node: TreeNode,
  depth: number,
  selectedFile: string | null,
  onSelect: (path: string) => void,
  expandedFolders: Set<string>,
  onToggleFolder: (folderPath: string) => void
) {
  const isExpanded = expandedFolders.has(node.fullPath)
  const folderEntries = Array.from(node.folders.values()).sort((a, b) => a.name.localeCompare(b.name))
  const fileEntries = [...node.files].sort((a, b) => a.localeCompare(b))

  return (
    <div key={node.fullPath}>
      {depth > 0 && (
        <button
          onClick={() => onToggleFolder(node.fullPath)}
          className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-xs text-text-secondary hover:bg-surface-2 hover:text-text-primary"
          style={{ paddingLeft: `${depth * 10 + 8}px` }}
        >
          {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          <Folder className="h-3.5 w-3.5" />
          <span>{node.name}</span>
        </button>
      )}

      {(depth === 0 || isExpanded) && (
        <div>
          {folderEntries.map((child) =>
            renderNode(child, depth + 1, selectedFile, onSelect, expandedFolders, onToggleFolder)
          )}

          {fileEntries.map((filePath) => {
            const label = filePath.replace(/^memory\//, '')
            return (
              <button
                key={filePath}
                onClick={() => onSelect(filePath)}
                className={cn(
                  'flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-xs transition-colors',
                  selectedFile === filePath
                    ? 'bg-accent/15 text-accent'
                    : 'text-text-secondary hover:bg-surface-2 hover:text-text-primary'
                )}
                style={{ paddingLeft: `${Math.max(1, depth) * 10 + 20}px` }}
              >
                <FileText className="h-3.5 w-3.5" />
                <span className="truncate">{label}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function MemoryFileTree({
  files,
  selectedFile,
  onSelect,
  searchTerm,
  onSearchTermChange,
  filter,
  onFilterChange
}: MemoryFileTreeProps) {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['memory']))

  const filteredFiles = useMemo(() => {
    const query = searchTerm.trim().toLowerCase()

    return files.filter((file) => {
      if (filter === 'root' && file !== 'MEMORY.md') return false
      if (filter === 'daily' && !isDailyMemoryPath(file)) return false

      if (!query) return true
      return file.toLowerCase().includes(query)
    })
  }, [files, filter, searchTerm])

  const memoryRootFiles = filteredFiles.filter((file) => file === 'MEMORY.md')
  const memoryFolderFiles = filteredFiles.filter((file) => file.startsWith('memory/'))
  const tree = useMemo(() => buildMemoryTree(memoryFolderFiles), [memoryFolderFiles])

  const handleToggleFolder = (folderPath: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev)
      if (next.has(folderPath)) {
        next.delete(folderPath)
      } else {
        next.add(folderPath)
      }
      return next
    })
  }

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2 p-3 pb-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2 h-4 w-4 text-text-muted" />
          <Input
            value={searchTerm}
            onChange={(event) => onSearchTermChange(event.target.value)}
            placeholder="Search memory files"
            className="h-8 pl-8"
          />
        </div>

        <div className="flex gap-1">
          {FILTER_OPTIONS.map((option) => (
            <Button
              key={option.id}
              size="sm"
              variant={filter === option.id ? 'secondary' : 'ghost'}
              onClick={() => onFilterChange(option.id)}
              className="h-7 px-2 text-[11px]"
            >
              {option.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {memoryRootFiles.length > 0 && (
          <div className="mb-2">
            <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-text-muted">Root</p>
            {memoryRootFiles.map((filePath) => (
              <button
                key={filePath}
                onClick={() => onSelect(filePath)}
                className={cn(
                  'flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-xs transition-colors',
                  selectedFile === filePath
                    ? 'bg-accent/15 text-accent'
                    : 'text-text-secondary hover:bg-surface-2 hover:text-text-primary'
                )}
              >
                <FileText className="h-3.5 w-3.5" />
                <span>{filePath}</span>
              </button>
            ))}
          </div>
        )}

        {memoryFolderFiles.length > 0 && (
          <div>
            <button
              onClick={() => handleToggleFolder('memory')}
              className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-xs text-text-secondary hover:bg-surface-2 hover:text-text-primary"
            >
              {expandedFolders.has('memory') ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
              <Folder className="h-3.5 w-3.5" />
              <span className="font-medium">memory/</span>
            </button>

            {expandedFolders.has('memory') && (
              <div>{Array.from(tree.folders.values()).sort((a, b) => a.name.localeCompare(b.name)).map((node) => renderNode(node, 1, selectedFile, onSelect, expandedFolders, handleToggleFolder))}
              {tree.files.sort((a, b) => a.localeCompare(b)).map((filePath) => (
                <button
                  key={filePath}
                  onClick={() => onSelect(filePath)}
                  className={cn(
                    'flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-xs transition-colors',
                    selectedFile === filePath
                      ? 'bg-accent/15 text-accent'
                      : 'text-text-secondary hover:bg-surface-2 hover:text-text-primary'
                  )}
                  style={{ paddingLeft: '30px' }}
                >
                  <FileText className="h-3.5 w-3.5" />
                  <span className="truncate">{filePath.replace(/^memory\//, '')}</span>
                </button>
              ))}</div>
            )}
          </div>
        )}

        {filteredFiles.length === 0 && (
          <div className="px-2 py-6 text-center text-xs text-text-muted">No memory files match the current filters.</div>
        )}
      </div>
    </div>
  )
}
