import { useCallback, useEffect, useMemo, useState } from 'react'
import Editor from '@monaco-editor/react'
import ReactMarkdown from 'react-markdown'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Brain as BrainIcon,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Code2,
  Columns2,
  Eye,
  FilePlus2,
  FileText,
  Folder,
  Loader2,
  Save,
  Search,
  Trash2
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useFileContent, useSaveFile, useWorkspaceFiles } from '@/hooks/useGateway'
import { cn } from '@/lib/utils'

type ViewerMode = 'edit' | 'preview' | 'split'

interface FolderNode {
  name: string
  fullPath: string
  folders: Map<string, FolderNode>
  files: string[]
}

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.04 } }
}

const item = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0 }
}

const FILE_DESCRIPTIONS: Record<string, string> = {
  'SOUL.md': "Your agent's personality",
  'MEMORY.md': 'Long-term memories',
  'AGENTS.md': 'Agent behavior rules',
  'TOOLS.md': 'Tool configuration',
  'IDENTITY.md': 'Name, avatar, identity',
  'HEARTBEAT.md': 'Periodic check instructions'
}

const QUICK_ACCESS_FILES = ['SOUL.md', 'MEMORY.md', 'AGENTS.md', 'TOOLS.md', 'IDENTITY.md', 'HEARTBEAT.md'] as const
const DIRECTORY_GROUPS = ['memory', 'specs', 'research', 'skills'] as const

function createNode(name: string, fullPath: string): FolderNode {
  return {
    name,
    fullPath,
    folders: new Map<string, FolderNode>(),
    files: []
  }
}

function getFilename(path: string): string {
  return path.split('/').pop() ?? path
}

function getFileDescription(path: string): string | null {
  const filename = getFilename(path).toUpperCase()
  return FILE_DESCRIPTIONS[filename] ?? null
}

function buildDirectoryTree(files: string[], rootDir: string): FolderNode {
  const root = createNode(rootDir, rootDir)

  for (const file of files) {
    if (!file.startsWith(`${rootDir}/`)) continue

    const segments = file.replace(`${rootDir}/`, '').split('/').filter(Boolean)
    let current = root
    let currentPath = rootDir

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

function formatBytes(content: string): string {
  const bytes = new TextEncoder().encode(content).length
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function countWords(content: string): number {
  const text = content.trim()
  if (!text) return 0
  return text.split(/\s+/).filter(Boolean).length
}

function normalizeNewFilePath(value: string): string {
  const trimmed = value.trim().replace(/\\/g, '/')
  const withoutLeadingSlash = trimmed.replace(/^\/+/, '')
  if (!withoutLeadingSlash) return ''
  return withoutLeadingSlash.toLowerCase().endsWith('.md') ? withoutLeadingSlash : `${withoutLeadingSlash}.md`
}

function validateNewFilePath(path: string, existingFiles: string[]): string | null {
  if (!path) return 'Enter a file path.'
  if (path.includes('..')) return 'Path cannot include "..".'
  if (!path.toLowerCase().endsWith('.md')) return 'File must end in .md.'

  const segments = path.split('/')
  if (segments.some((segment) => segment.length === 0)) return 'Path contains an empty folder segment.'

  if (existingFiles.includes(path)) return 'A file with this path already exists.'

  return null
}

function renderFolderTree(
  node: FolderNode,
  depth: number,
  selectedFile: string | null,
  onSelect: (path: string) => void,
  expandedFolders: Set<string>,
  onToggleFolder: (folderPath: string) => void
) {
  const isExpanded = expandedFolders.has(node.fullPath)
  const sortedFolders = Array.from(node.folders.values()).sort((a, b) => a.name.localeCompare(b.name))
  const sortedFiles = [...node.files].sort((a, b) => a.localeCompare(b))

  return (
    <div key={node.fullPath}>
      {depth > 0 && (
        <button
          onClick={() => onToggleFolder(node.fullPath)}
          className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-xs text-text-secondary hover:bg-surface-2 hover:text-text-primary"
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          <Folder className="h-3.5 w-3.5" />
          <span className="truncate">{node.name}</span>
        </button>
      )}

      {(depth === 0 || isExpanded) && (
        <div>
          {sortedFolders.map((child) =>
            renderFolderTree(child, depth + 1, selectedFile, onSelect, expandedFolders, onToggleFolder)
          )}
          {sortedFiles.map((filePath) => {
            const description = getFileDescription(filePath)

            return (
              <button
                key={filePath}
                onClick={() => onSelect(filePath)}
                className={cn(
                  'flex w-full items-start gap-1.5 rounded-md px-2 py-1.5 text-left text-xs transition-colors',
                  selectedFile === filePath
                    ? 'bg-accent/15 text-accent'
                    : 'text-text-secondary hover:bg-surface-2 hover:text-text-primary'
                )}
                style={{ paddingLeft: `${Math.max(depth, 1) * 12 + 22}px` }}
              >
                <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span className="min-w-0">
                  <span className="block truncate">{getFilename(filePath)}</span>
                  {description && <span className="block truncate text-[10px] text-text-muted">{description}</span>}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function Brain() {
  const queryClient = useQueryClient()
  const { data: workspaceFiles, isLoading: filesLoading } = useWorkspaceFiles()
  const saveFile = useSaveFile()

  const createFileMutation = useMutation({
    mutationFn: async (filename: string) => {
      const result = await window.api.files.write(filename, '')
      if (!result.ok) throw new Error(result.error || 'Failed to create file')
    },
    onSuccess: async (_, filename) => {
      await queryClient.invalidateQueries({ queryKey: ['files', 'list'] })
      await queryClient.invalidateQueries({ queryKey: ['files', 'content', filename] })
    }
  })

  const deleteFileMutation = useMutation({
    mutationFn: async (filename: string) => {
      const result = await window.api.files.delete(filename)
      if (!result.ok) throw new Error(result.error || 'Failed to delete file')
    },
    onSuccess: async (_, filename) => {
      await queryClient.invalidateQueries({ queryKey: ['files', 'list'] })
      queryClient.removeQueries({ queryKey: ['files', 'content', filename] })
    }
  })

  const files = useMemo(() => [...(workspaceFiles ?? [])].sort((a, b) => a.localeCompare(b)), [workspaceFiles])

  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [viewerMode, setViewerMode] = useState<ViewerMode>('split')
  const [editorContent, setEditorContent] = useState('')
  const [savedContent, setSavedContent] = useState('')
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    new Set(DIRECTORY_GROUPS as readonly string[])
  )
  const [pendingSelection, setPendingSelection] = useState<string | null>(null)
  const [newFileDialogOpen, setNewFileDialogOpen] = useState(false)
  const [newFilePath, setNewFilePath] = useState('')
  const [newFileError, setNewFileError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  const selectedPath = selectedFile && files.includes(selectedFile) ? selectedFile : null
  const selectedFileQuery = useFileContent(selectedPath)

  useEffect(() => {
    if (files.length === 0) {
      setSelectedFile(null)
      return
    }

    if (selectedFile && files.includes(selectedFile)) return

    const preferred = QUICK_ACCESS_FILES.find((path) => files.includes(path))
    setSelectedFile(preferred ?? files[0])
  }, [files, selectedFile])

  useEffect(() => {
    setEditorContent('')
    setSavedContent('')
    setSaveError(null)
  }, [selectedFile])

  useEffect(() => {
    if (selectedFileQuery.data === undefined) return
    setEditorContent(selectedFileQuery.data)
    setSavedContent(selectedFileQuery.data)
  }, [selectedFileQuery.data])

  const filteredFiles = useMemo(() => {
    const query = searchTerm.trim().toLowerCase()
    if (!query) return files

    return files.filter((file) => {
      const description = getFileDescription(file)
      return file.toLowerCase().includes(query) || description?.toLowerCase().includes(query)
    })
  }, [files, searchTerm])

  const rootFiles = useMemo(() => filteredFiles.filter((file) => !file.includes('/')), [filteredFiles])

  const topLevelDirectories = useMemo(() => {
    const discovered = new Set<string>()
    for (const file of filteredFiles) {
      const parts = file.split('/').filter(Boolean)
      if (parts.length > 1) discovered.add(parts[0])
    }

    const preferred = DIRECTORY_GROUPS.filter((name) => discovered.has(name))
    const remaining = [...discovered].filter((name) => !DIRECTORY_GROUPS.includes(name as never)).sort()
    return [...preferred, ...remaining]
  }, [filteredFiles])

  const groupedDirectoryFiles = useMemo(() => {
    return topLevelDirectories.reduce<Record<string, string[]>>((acc, directory) => {
      acc[directory] = filteredFiles.filter((file) => file.startsWith(`${directory}/`))
      return acc
    }, {})
  }, [filteredFiles, topLevelDirectories])

  const directoryTrees = useMemo(() => {
    return topLevelDirectories.reduce<Record<string, FolderNode>>((acc, directory) => {
      acc[directory] = buildDirectoryTree(groupedDirectoryFiles[directory] ?? [], directory)
      return acc
    }, {})
  }, [groupedDirectoryFiles, topLevelDirectories])

  const hasUnsavedChanges = editorContent !== savedContent
  const hasWorkspaceFiles = files.length > 0
  const hasFilteredResults = filteredFiles.length > 0
  const selectedFileDescription = selectedFile ? getFileDescription(selectedFile) : null
  const wordCount = useMemo(() => countWords(editorContent), [editorContent])
  const fileSizeLabel = useMemo(() => formatBytes(editorContent), [editorContent])

  const applySelection = useCallback((path: string) => {
    setSelectedFile(path)
    setViewerMode('split')
  }, [])

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

  const handleSave = useCallback(async (): Promise<boolean> => {
    if (!selectedFile || !hasUnsavedChanges) return true

    try {
      await saveFile.mutateAsync({ filename: selectedFile, content: editorContent })
      setSavedContent(editorContent)
      setSaveError(null)
      return true
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error))
      return false
    }
  }, [editorContent, hasUnsavedChanges, saveFile, selectedFile])

  const handleSelectFile = useCallback(
    (path: string) => {
      if (path === selectedFile) return

      if (hasUnsavedChanges) {
        setPendingSelection(path)
        return
      }

      applySelection(path)
    },
    [applySelection, hasUnsavedChanges, selectedFile]
  )

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const savePressed = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's'
      if (!savePressed) return

      event.preventDefault()
      void handleSave()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleSave])

  const handleCreateFile = async () => {
    const normalizedPath = normalizeNewFilePath(newFilePath)
    const validationError = validateNewFilePath(normalizedPath, files)
    if (validationError) {
      setNewFileError(validationError)
      return
    }

    try {
      await createFileMutation.mutateAsync(normalizedPath)
      setNewFileDialogOpen(false)
      setNewFilePath('')
      setNewFileError(null)
      handleSelectFile(normalizedPath)
      setViewerMode('edit')
    } catch (error) {
      setNewFileError(error instanceof Error ? error.message : String(error))
    }
  }

  const handleDeleteFile = async () => {
    if (!deleteTarget) return

    try {
      const target = deleteTarget
      await deleteFileMutation.mutateAsync(target)
      setDeleteTarget(null)
      setDeleteError(null)

      if (selectedFile === target) {
        const remaining = files.filter((file) => file !== target)
        const preferred = QUICK_ACCESS_FILES.find((path) => remaining.includes(path))
        setSelectedFile(preferred ?? remaining[0] ?? null)
      }
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : String(error))
    }
  }

  return (
    <>
      <motion.div variants={container} initial="hidden" animate="show" className="flex h-full min-h-0 flex-col pt-8 md:flex-row">
        <motion.aside
          variants={item}
          className="flex w-full min-h-0 flex-col border-b border-border bg-surface md:w-80 md:border-b-0 md:border-r lg:w-96"
        >
          <div className="border-b border-border px-4 py-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-text-primary">
              <BrainIcon className="h-4 w-4 text-accent" />
              Brain Workspace
            </h2>
            <p className="mt-1 text-xs text-text-muted">Shape your agent&apos;s voice, memory, and operating rules</p>
          </div>

          <div className="space-y-3 border-b border-border p-3">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">Quick Access</p>
              <Button
                size="sm"
                variant="secondary"
                className="h-7 gap-1.5 px-2"
                onClick={() => {
                  setNewFileDialogOpen(true)
                  setNewFilePath('')
                  setNewFileError(null)
                }}
              >
                <FilePlus2 className="h-3.5 w-3.5" />
                New .md
              </Button>
            </div>

            <div className="grid gap-1.5">
              {QUICK_ACCESS_FILES.map((filename) => {
                const exists = files.includes(filename)
                const isSelected = selectedFile === filename
                const description = FILE_DESCRIPTIONS[filename]

                return (
                  <Button
                    key={filename}
                    size="sm"
                    variant={isSelected ? 'secondary' : 'ghost'}
                    disabled={!exists}
                    onClick={() => handleSelectFile(filename)}
                    className={cn(
                      'h-auto justify-start px-2 py-2 text-left',
                      !exists && 'text-text-muted',
                      isSelected && 'text-text-primary'
                    )}
                  >
                    <FileText className="mr-2 mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span className="min-w-0">
                      <span className="block truncate text-[11px] font-medium">{filename}</span>
                      <span className="block truncate text-[10px] text-text-muted">{description}</span>
                    </span>
                  </Button>
                )
              })}
            </div>

            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2 h-4 w-4 text-text-muted" />
              <Input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search files and descriptions..."
                className="h-8 pl-8"
              />
            </div>
          </div>

          <ScrollArea className="min-h-0 flex-1">
            <div className="space-y-3 px-2 py-3">
              {filesLoading && (
                <div className="flex items-center gap-2 px-2 py-1 text-xs text-text-muted">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Loading workspace files...
                </div>
              )}

              {!filesLoading && !hasWorkspaceFiles && (
                <Card className="mx-2 border-border bg-surface-2">
                  <CardContent className="space-y-3 p-3">
                    <p className="text-xs text-text-muted">No workspace files yet.</p>
                    <Button
                      size="sm"
                      className="w-full gap-1.5"
                      onClick={() => {
                        setNewFileDialogOpen(true)
                        setNewFilePath('SOUL.md')
                        setNewFileError(null)
                      }}
                    >
                      <FilePlus2 className="h-3.5 w-3.5" />
                      Create First File
                    </Button>
                  </CardContent>
                </Card>
              )}

              {!filesLoading && hasWorkspaceFiles && !hasFilteredResults && (
                <Card className="mx-2 border-border bg-surface-2">
                  <CardContent className="space-y-2 p-3">
                    <p className="text-xs text-text-muted">No files match that search.</p>
                    <Button size="sm" variant="secondary" className="w-full" onClick={() => setSearchTerm('')}>
                      Clear Search
                    </Button>
                  </CardContent>
                </Card>
              )}

              {rootFiles.length > 0 && (
                <div>
                  <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-text-muted">Root</p>
                  {rootFiles.map((filePath) => {
                    const description = getFileDescription(filePath)

                    return (
                      <button
                        key={filePath}
                        onClick={() => handleSelectFile(filePath)}
                        className={cn(
                          'flex w-full items-start gap-1.5 rounded-md px-2 py-1.5 text-left text-xs transition-colors',
                          selectedFile === filePath
                            ? 'bg-accent/15 text-accent'
                            : 'text-text-secondary hover:bg-surface-2 hover:text-text-primary'
                        )}
                      >
                        <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span className="min-w-0">
                          <span className="block truncate">{filePath}</span>
                          {description && <span className="block truncate text-[10px] text-text-muted">{description}</span>}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}

              {topLevelDirectories.map((directory) => {
                const directoryFiles = groupedDirectoryFiles[directory] ?? []
                const isExpanded = expandedFolders.has(directory)
                if (directoryFiles.length === 0 && searchTerm.trim().length > 0) return null

                return (
                  <div key={directory}>
                    <button
                      onClick={() => handleToggleFolder(directory)}
                      className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-xs text-text-secondary hover:bg-surface-2 hover:text-text-primary"
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5" />
                      )}
                      <Folder className="h-3.5 w-3.5" />
                      <span className="font-medium">{directory}/</span>
                      <span className="ml-auto text-[10px] text-text-muted">{directoryFiles.length}</span>
                    </button>

                    {isExpanded && directoryFiles.length > 0 && (
                      <div className="pt-1">
                        {renderFolderTree(
                          directoryTrees[directory],
                          0,
                          selectedFile,
                          handleSelectFile,
                          expandedFolders,
                          handleToggleFolder
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </ScrollArea>
        </motion.aside>

        <motion.main variants={item} className="flex min-h-0 flex-1 flex-col">
          {!hasWorkspaceFiles && !filesLoading ? (
            <div className="flex flex-1 items-center justify-center p-6">
              <Card className="max-w-lg border-border bg-surface">
                <CardContent className="space-y-4 p-6 text-center">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10">
                    <BrainIcon className="h-7 w-7 text-accent" />
                  </div>
                  <h3 className="text-lg font-semibold text-text-primary">No brain files yet</h3>
                  <p className="text-sm text-text-secondary">
                    Start by creating `SOUL.md` and `MEMORY.md` so your agent has a clear personality and persistent
                    context.
                  </p>
                  <Button
                    className="gap-1.5"
                    onClick={() => {
                      setNewFileDialogOpen(true)
                      setNewFilePath('SOUL.md')
                      setNewFileError(null)
                    }}
                  >
                    <FilePlus2 className="h-4 w-4" />
                    Create `SOUL.md`
                  </Button>
                </CardContent>
              </Card>
            </div>
          ) : !selectedFile ? (
            <div className="flex flex-1 items-center justify-center p-6">
              <Card className="max-w-md border-border bg-surface">
                <CardContent className="space-y-3 p-6 text-center">
                  <FileText className="mx-auto h-10 w-10 text-text-muted" />
                  <h3 className="text-base font-semibold text-text-primary">Select a brain file</h3>
                  <p className="text-sm text-text-secondary">Pick a file from the sidebar to read, edit, or preview markdown.</p>
                </CardContent>
              </Card>
            </div>
          ) : (
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={selectedFile}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.16, ease: 'easeOut' }}
                className="flex min-h-0 flex-1 flex-col"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-text-primary">{selectedFile}</p>
                    <p className="truncate text-xs text-text-muted">
                      {selectedFileDescription ?? 'Workspace markdown file'} · {wordCount.toLocaleString()} words · {fileSizeLabel}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {hasUnsavedChanges && <Badge variant="warning">Unsaved</Badge>}
                    {saveError && (
                      <Badge variant="error" className="max-w-64 truncate">
                        {saveError}
                      </Badge>
                    )}

                    <div className="flex rounded-lg bg-surface-2 p-0.5">
                      <button
                        onClick={() => setViewerMode('edit')}
                        className={cn(
                          'rounded-md px-2 py-1 text-xs font-medium transition-colors',
                          viewerMode === 'edit' ? 'bg-surface-3 text-text-primary' : 'text-text-muted hover:text-text-secondary'
                        )}
                        title="Edit"
                      >
                        <Code2 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setViewerMode('split')}
                        className={cn(
                          'rounded-md px-2 py-1 text-xs font-medium transition-colors',
                          viewerMode === 'split'
                            ? 'bg-surface-3 text-text-primary'
                            : 'text-text-muted hover:text-text-secondary'
                        )}
                        title="Split"
                      >
                        <Columns2 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setViewerMode('preview')}
                        className={cn(
                          'rounded-md px-2 py-1 text-xs font-medium transition-colors',
                          viewerMode === 'preview'
                            ? 'bg-surface-3 text-text-primary'
                            : 'text-text-muted hover:text-text-secondary'
                        )}
                        title="Preview"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      onClick={() => {
                        setDeleteTarget(selectedFile)
                        setDeleteError(null)
                      }}
                      disabled={deleteFileMutation.isPending}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </Button>

                    <Button
                      size="sm"
                      className="gap-1.5"
                      onClick={() => void handleSave()}
                      disabled={!hasUnsavedChanges || saveFile.isPending}
                    >
                      {saveFile.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : hasUnsavedChanges ? (
                        <Save className="h-3.5 w-3.5" />
                      ) : (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      )}
                      Save (Cmd+S)
                    </Button>
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-hidden">
                  {selectedFileQuery.isLoading ? (
                    <div className="flex h-full items-center justify-center">
                      <Loader2 className="h-6 w-6 animate-spin text-text-muted" />
                    </div>
                  ) : selectedFileQuery.error ? (
                    <div className="p-4">
                      <Card className="border-border p-4">
                        <p className="text-sm text-red-300">Unable to read file content.</p>
                      </Card>
                    </div>
                  ) : (
                    <div className="flex h-full min-h-0 overflow-hidden">
                      {(viewerMode === 'edit' || viewerMode === 'split') && (
                        <div className={cn('min-w-0 flex-1', viewerMode === 'split' && 'border-r border-border')}>
                          <Editor
                            height="100%"
                            language="markdown"
                            theme="vs-dark"
                            value={editorContent}
                            onChange={(value) => setEditorContent(value ?? '')}
                            options={{
                              minimap: { enabled: false },
                              fontSize: 14,
                              fontFamily: "'JetBrains Mono', Menlo, Monaco, monospace",
                              lineNumbers: 'on',
                              wordWrap: 'on',
                              padding: { top: 16 },
                              scrollBeyondLastLine: false,
                              renderLineHighlight: 'gutter',
                              cursorBlinking: 'smooth',
                              smoothScrolling: true
                            }}
                          />
                        </div>
                      )}

                      {(viewerMode === 'preview' || viewerMode === 'split') && (
                        <div className={cn('min-w-0 flex-1 overflow-auto', viewerMode === 'split' && 'max-w-[50%]')}>
                          <ScrollArea className="h-full">
                            <div className="prose prose-invert prose-sm max-w-none p-6 select-text">
                              {editorContent.trim() ? (
                                <ReactMarkdown>{editorContent}</ReactMarkdown>
                              ) : (
                                <p className="text-sm text-text-muted">This file is empty.</p>
                              )}
                            </div>
                          </ScrollArea>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </motion.div>
            </AnimatePresence>
          )}
        </motion.main>
      </motion.div>

      <Dialog
        open={Boolean(pendingSelection)}
        onOpenChange={(open) => {
          if (!open) setPendingSelection(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unsaved changes</DialogTitle>
            <DialogDescription>
              You have unsaved edits in `{selectedFile}`. Save before switching to `{pendingSelection}`?
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setPendingSelection(null)}>
              Cancel
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                if (!pendingSelection) return
                const next = pendingSelection
                setPendingSelection(null)
                applySelection(next)
              }}
            >
              Discard & Switch
            </Button>
            <Button
              onClick={async () => {
                if (!pendingSelection) return
                const next = pendingSelection
                const didSave = await handleSave()
                if (!didSave) return
                setPendingSelection(null)
                applySelection(next)
              }}
              disabled={saveFile.isPending}
              className="gap-1.5"
            >
              {saveFile.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Save & Switch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={newFileDialogOpen}
        onOpenChange={(open) => {
          setNewFileDialogOpen(open)
          if (!open) {
            setNewFilePath('')
            setNewFileError(null)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Markdown File</DialogTitle>
            <DialogDescription>Create a new `.md` file anywhere in this workspace.</DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Input
              value={newFilePath}
              onChange={(event) => {
                setNewFilePath(event.target.value)
                setNewFileError(null)
              }}
              placeholder="Examples: SOUL.md or memory/2026-02-17.md"
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  void handleCreateFile()
                }
              }}
            />
            {newFileError && <p className="text-xs text-red-300">{newFileError}</p>}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setNewFileDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void handleCreateFile()} disabled={createFileMutation.isPending} className="gap-1.5">
              {createFileMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Create File
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null)
            setDeleteError(null)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete file?</DialogTitle>
            <DialogDescription>
              This permanently deletes `{deleteTarget}` from the workspace. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          {deleteError && <p className="text-xs text-red-300">{deleteError}</p>}

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setDeleteTarget(null)
                setDeleteError(null)
              }}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void handleDeleteFile()} disabled={deleteFileMutation.isPending}>
              {deleteFileMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
