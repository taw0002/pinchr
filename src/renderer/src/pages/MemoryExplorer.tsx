import { useEffect, useMemo, useRef, useState } from 'react'
import Editor from '@monaco-editor/react'
import ReactMarkdown from 'react-markdown'
import {
  Brain,
  CheckCircle2,
  Code,
  Eye,
  Loader2,
  Save,
  Search,
  Sparkles,
  Target
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import MemoryFileTree, { type MemoryFileFilter } from '@/components/memory/MemoryFileTree'
import MemoryHealthDashboard, { type MemoryFreshness } from '@/components/memory/MemoryHealthDashboard'
import MemoryTimeline from '@/components/memory/MemoryTimeline'
import {
  parseDailyMemoryDate,
  useMemoryCatalog,
  useMemoryFileContent,
  useMemoryFiles,
  useMemorySearch,
  useSaveMemoryFile,
  type MemorySearchHit
} from '@/hooks/useMemory'

type EditorViewMode = 'edit' | 'preview' | 'split'

type SidebarMode = 'files' | 'timeline'

type EditorHandle = {
  revealLineInCenter: (lineNumber: number) => void
  setPosition: (position: { lineNumber: number; column: number }) => void
  focus: () => void
}

function formatRelativeAge(value?: string): { days?: number; label: string } {
  if (!value) return { label: 'Unknown' }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return { label: 'Unknown' }

  const ms = Date.now() - date.getTime()
  const days = Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)))
  if (days === 0) return { days, label: 'Updated today' }
  if (days === 1) return { days, label: 'Updated 1 day ago' }
  return { days, label: `Updated ${days} days ago` }
}

function deriveFreshness(latestUpdate?: string): { freshness: MemoryFreshness; staleDays?: number } {
  const age = formatRelativeAge(latestUpdate)
  if (age.days === undefined) return { freshness: 'unknown' }
  if (age.days > 7) return { freshness: 'very-stale', staleDays: age.days }
  if (age.days > 3) return { freshness: 'stale', staleDays: age.days }
  return { freshness: 'healthy', staleDays: age.days }
}

function formatSaveTime(value: string | null): string {
  if (!value) return 'Not saved yet'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Not saved yet'
  return `Saved ${date.toLocaleTimeString()}`
}

export default function MemoryExplorer() {
  const { memoryFiles, dailyFiles, isLoading: filesLoading } = useMemoryFiles()
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>('files')
  const [treeFilter, setTreeFilter] = useState<MemoryFileFilter>('all')
  const [treeSearch, setTreeSearch] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState<EditorViewMode>('split')
  const [editorContent, setEditorContent] = useState('')
  const [savedContent, setSavedContent] = useState('')
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [jumpTarget, setJumpTarget] = useState<{ path: string; line: number } | null>(null)
  const editorRef = useRef<EditorHandle | null>(null)
  const selectedFileRef = useRef<string | null>(null)

  const memoryCatalogQuery = useMemoryCatalog(memoryFiles)
  const saveMutation = useSaveMemoryFile()
  const selectedFileQuery = useMemoryFileContent(selectedFile)
  const memorySearchQuery = useMemorySearch(searchQuery, { enabled: searchQuery.trim().length > 0 })

  useEffect(() => {
    if (selectedFile || memoryFiles.length === 0) return

    const memoryRootFile = memoryFiles.find((file) => file === 'MEMORY.md')
    const latestDaily = [...dailyFiles].sort((a, b) => {
      const aDate = parseDailyMemoryDate(a) ?? ''
      const bDate = parseDailyMemoryDate(b) ?? ''
      return bDate.localeCompare(aDate)
    })[0]

    setSelectedFile(memoryRootFile ?? latestDaily ?? memoryFiles[0])
  }, [dailyFiles, memoryFiles, selectedFile])

  useEffect(() => {
    if (!selectedFileQuery.data || !selectedFile) return

    if (selectedFileRef.current !== selectedFile) {
      setEditorContent(selectedFileQuery.data.content)
      setSavedContent(selectedFileQuery.data.content)
      setHasUnsavedChanges(false)
      selectedFileRef.current = selectedFile
    }
  }, [selectedFile, selectedFileQuery.data])

  useEffect(() => {
    if (!selectedFile || !hasUnsavedChanges || saveMutation.isPending) return

    const timer = setTimeout(async () => {
      try {
        await saveMutation.mutateAsync({ path: selectedFile, content: editorContent })
        setSavedContent(editorContent)
        setHasUnsavedChanges(false)
        setLastSavedAt(new Date().toISOString())
        setSaveError(null)
      } catch (error) {
        setSaveError(String(error))
      }
    }, 800)

    return () => clearTimeout(timer)
  }, [editorContent, hasUnsavedChanges, saveMutation, selectedFile])

  useEffect(() => {
    if (!jumpTarget || !editorRef.current || selectedFile !== jumpTarget.path || selectedFileQuery.isLoading) return

    const lineNumber = Math.max(1, jumpTarget.line)
    editorRef.current.revealLineInCenter(lineNumber)
    editorRef.current.setPosition({ lineNumber, column: 1 })
    editorRef.current.focus()
    setJumpTarget(null)
  }, [jumpTarget, selectedFile, selectedFileQuery.isLoading, selectedFileQuery.data])

  const handleEditorChange = (value: string | undefined) => {
    if (value === undefined) return
    setEditorContent(value)
    setHasUnsavedChanges(value !== savedContent)
  }

  const handleManualSave = async () => {
    if (!selectedFile || !hasUnsavedChanges) return

    try {
      await saveMutation.mutateAsync({ path: selectedFile, content: editorContent })
      setSavedContent(editorContent)
      setHasUnsavedChanges(false)
      setLastSavedAt(new Date().toISOString())
      setSaveError(null)
    } catch (error) {
      setSaveError(String(error))
    }
  }

  const handleOpenSearchHit = (hit: MemorySearchHit) => {
    const line = hit.line ?? 1
    setSelectedFile(hit.path)
    setJumpTarget({ path: hit.path, line })
  }

  const timelineItems = useMemo(() => {
    const entries = memoryCatalogQuery.data?.entries ?? []

    return dailyFiles.map((path) => {
      const entry = entries.find((item) => item.path === path)
      const date = parseDailyMemoryDate(path)
      return {
        path,
        dateLabel: date ?? path.replace('memory/', ''),
        preview: entry?.preview ?? 'Loading preview…'
      }
    })
  }, [dailyFiles, memoryCatalogQuery.data?.entries])

  const latestUpdate = memoryCatalogQuery.data?.newestModifiedAt
  const freshness = deriveFreshness(latestUpdate)
  const freshnessText = formatRelativeAge(latestUpdate).label

  return (
    <div className="flex h-full overflow-hidden pt-8">
      <aside className="flex w-72 flex-col border-r border-border bg-surface">
        <div className="border-b border-border px-4 py-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-text-primary">
            <Brain className="h-4 w-4 text-accent" />
            Memory Explorer
          </h2>
          <p className="mt-1 text-xs text-text-muted">Browse and edit workspace memory files</p>
        </div>

        <Tabs
          value={sidebarMode}
          onValueChange={(value) => setSidebarMode(value as SidebarMode)}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="px-3 pt-3">
            <TabsList className="w-full">
              <TabsTrigger value="files" className="flex-1 text-xs">
                Files
              </TabsTrigger>
              <TabsTrigger value="timeline" className="flex-1 text-xs">
                Timeline
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="files" className="mt-2 min-h-0 flex-1">
            <MemoryFileTree
              files={memoryFiles}
              selectedFile={selectedFile}
              onSelect={setSelectedFile}
              searchTerm={treeSearch}
              onSearchTermChange={setTreeSearch}
              filter={treeFilter}
              onFilterChange={setTreeFilter}
            />
          </TabsContent>

          <TabsContent value="timeline" className="mt-2 min-h-0 flex-1">
            <MemoryTimeline items={timelineItems} selectedFile={selectedFile} onSelect={setSelectedFile} />
          </TabsContent>
        </Tabs>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="space-y-3 border-b border-border px-4 py-3">
          <MemoryHealthDashboard
            totalFiles={memoryFiles.length}
            totalSizeKb={(memoryCatalogQuery.data?.totalSizeBytes ?? 0) / 1024}
            newestUpdateAt={memoryCatalogQuery.data?.newestModifiedAt}
            oldestUpdateAt={memoryCatalogQuery.data?.oldestModifiedAt}
            freshness={freshness.freshness}
            staleDays={freshness.staleDays}
            isLoading={filesLoading || memoryCatalogQuery.isLoading}
          />

          <Card className="p-3">
            <CardContent className="space-y-3 p-0">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-text-muted" />
                  <Input
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Semantic memory search…"
                    className="pl-9"
                  />
                </div>
                <Badge variant="secondary" className="gap-1">
                  <Sparkles className="h-3.5 w-3.5" />
                  {memorySearchQuery.data?.length ?? 0} results
                </Badge>
              </div>

              {searchQuery.trim().length > 0 && (
                <div className="rounded-lg border border-border bg-surface-2">
                  <ScrollArea className="h-40">
                    <div className="space-y-2 p-2">
                      {memorySearchQuery.isFetching && (
                        <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-text-muted">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Searching memory index…
                        </div>
                      )}

                      {!memorySearchQuery.isFetching && (memorySearchQuery.data?.length ?? 0) === 0 && (
                        <p className="px-2 py-1.5 text-xs text-text-muted">No matching memory results found.</p>
                      )}

                      {(memorySearchQuery.data ?? []).map((hit) => (
                        <button
                          key={hit.id}
                          onClick={() => handleOpenSearchHit(hit)}
                          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-left hover:bg-surface-3"
                        >
                          <div className="flex items-center gap-2 text-[11px] text-text-muted">
                            <Target className="h-3.5 w-3.5" />
                            <span>{hit.path}</span>
                            <span>line {hit.line ?? 1}</span>
                            <span className="ml-auto">score {(hit.score ?? 0).toFixed(3)}</span>
                          </div>
                          <p className="mt-1 text-xs text-text-secondary">{hit.snippet}</p>
                        </button>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          {selectedFile ? (
            <>
              <div className="flex items-center justify-between border-b border-border px-4 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-text-primary">{selectedFile}</p>
                  <p className="text-xs text-text-muted">{freshnessText}</p>
                </div>

                <div className="flex items-center gap-2">
                  {hasUnsavedChanges && <Badge variant="warning">Unsaved</Badge>}
                  {saveError && (
                    <Badge variant="error" className="max-w-56 truncate">
                      Save failed
                    </Badge>
                  )}
                  {!saveError && !hasUnsavedChanges && !saveMutation.isPending && (
                    <Badge variant="success">{formatSaveTime(lastSavedAt)}</Badge>
                  )}

                  <div className="flex rounded-lg bg-surface-2 p-0.5">
                    <button
                      onClick={() => setViewMode('edit')}
                      className={cn(
                        'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                        viewMode === 'edit'
                          ? 'bg-surface-3 text-text-primary'
                          : 'text-text-muted hover:text-text-secondary'
                      )}
                    >
                      <Code className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => setViewMode('split')}
                      className={cn(
                        'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                        viewMode === 'split'
                          ? 'bg-surface-3 text-text-primary'
                          : 'text-text-muted hover:text-text-secondary'
                      )}
                    >
                      Split
                    </button>
                    <button
                      onClick={() => setViewMode('preview')}
                      className={cn(
                        'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                        viewMode === 'preview'
                          ? 'bg-surface-3 text-text-primary'
                          : 'text-text-muted hover:text-text-secondary'
                      )}
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <Button
                    size="sm"
                    className="gap-1.5"
                    onClick={handleManualSave}
                    disabled={!hasUnsavedChanges || saveMutation.isPending}
                  >
                    {saveMutation.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : !hasUnsavedChanges ? (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    ) : (
                      <Save className="h-3.5 w-3.5" />
                    )}
                    Save
                  </Button>
                </div>
              </div>

              <div className="flex min-h-0 flex-1 overflow-hidden">
                {(viewMode === 'edit' || viewMode === 'split') && (
                  <div className={cn('min-w-0 flex-1', viewMode === 'split' && 'border-r border-border')}>
                    {selectedFileQuery.isLoading ? (
                      <div className="flex h-full items-center justify-center">
                        <Loader2 className="h-6 w-6 animate-spin text-text-muted" />
                      </div>
                    ) : (
                      <Editor
                        height="100%"
                        language="markdown"
                        theme="vs-dark"
                        value={editorContent}
                        onChange={handleEditorChange}
                        onMount={(editor) => {
                          editorRef.current = editor
                        }}
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
                    )}
                  </div>
                )}

                {(viewMode === 'preview' || viewMode === 'split') && (
                  <div className={cn('min-w-0 flex-1 overflow-auto', viewMode === 'split' && 'max-w-[50%]')}>
                    <div className="prose prose-invert prose-sm max-w-none p-6 select-text">
                      <ReactMarkdown>{editorContent}</ReactMarkdown>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : memoryFiles.length === 0 && !filesLoading ? (
            <div className="flex flex-1 items-center justify-center text-text-muted">
              <div className="text-center max-w-md">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/10 mx-auto mb-4">
                  <Brain className="h-8 w-8 text-accent" />
                </div>
                <h3 className="text-lg font-semibold text-text-primary mb-2">No memory files yet</h3>
                <p className="text-sm text-text-muted">
                  Memory builds over time as we work together. Start chatting and I'll automatically save important context here.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center text-text-muted">
              <div className="text-center">
                <Brain className="mx-auto mb-3 h-12 w-12 opacity-25" />
                <p className="text-sm">Select a memory file to begin.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
