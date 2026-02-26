import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckSquare, Settings as SettingsIcon, Search, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { TaskBoard } from '@/components/tasks/TaskBoard'
import { TaskDetailPanel } from '@/components/tasks/TaskDetailPanel'
import { TaskList } from '@/components/tasks/TaskList'
import { ProjectSidebar } from '@/components/tasks/ProjectSidebar'
import { TaskQuickAdd } from '@/components/tasks/TaskQuickAdd'
import { TaskTimeline } from '@/components/tasks/TaskTimeline'
import { useTasks, type SmartTask, type TaskAssignee, type TaskCheckFrequency, type TaskStatus } from '@/hooks/useTasks'

const CHECK_FREQUENCY_OPTIONS: Array<{ value: TaskCheckFrequency; label: string }> = [
  { value: '15m', label: 'Every 15 min' },
  { value: '30m', label: 'Every 30 min' },
  { value: '1h', label: 'Every hour' },
  { value: '4h', label: 'Every 4 hours' },
  { value: 'manual', label: 'Manual only' }
]

async function getGatewayHeaders(): Promise<Record<string, string>> {
  try {
    const configResult = await window.api.gateway.getConfig()
    if (!configResult?.ok || !configResult.data) return {}
    const data = configResult.data as Record<string, unknown>
    const gateway = data.gateway as Record<string, unknown> | undefined
    const auth = gateway?.auth as Record<string, unknown> | undefined
    const token = typeof auth?.token === 'string' ? auth.token.trim() : ''
    if (!token) return {}
    return { Authorization: `Bearer ${token}` }
  } catch {
    return {}
  }
}

export default function Tasks() {
  const {
    tasks,
    projects,
    isLoading,
    isError,
    error,
    isSaving,
    addTask,
    updateTask,
    bulkUpdateTasks,
    deleteTask,
    toggleTaskDone,
    cycleTaskStatus,
    moveTask,
    addProject,
    settings,
    updateTaskSettings,
    addComment,
    editComment,
    deleteComment,
    addAttachment,
    removeAttachment,
    addSubtask,
    toggleSubtask,
    deleteSubtask
  } = useTasks()

  const [activeTab, setActiveTab] = useState<'board' | 'list' | 'timeline'>('board')
  const [projectFilter, setProjectFilter] = useState<string | 'all'>('all')
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [isDetailOpen, setIsDetailOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [quickAddFocusSignal, setQuickAddFocusSignal] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | TaskStatus>('all')
  const [assigneeFilter, setAssigneeFilter] = useState<'all' | TaskAssignee>('all')
  const [showArchived, setShowArchived] = useState(false)

  const selectedTask = useMemo(() => {
    if (!selectedTaskId || !tasks) return null
    return tasks.find((task) => task.id === selectedTaskId) ?? null
  }, [selectedTaskId, tasks])

  const existingTags = useMemo(
    () => Array.from(new Set((tasks ?? []).flatMap((task) => task?.tags ?? []))).sort((a, b) => a.localeCompare(b)),
    [tasks]
  )

  const filteredTasks = useMemo(() => {
    if (!tasks) return []

    return tasks.filter((task) => {
      // Filter out archived tasks unless showArchived is enabled
      if (task.status === 'archived' && !showArchived) return false

      // Search filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase()
        const matchesTitle = task.title.toLowerCase().includes(query)
        const matchesDescription = task.description.toLowerCase().includes(query)
        const matchesTags = task.tags.some((tag) => tag.toLowerCase().includes(query))

        if (!matchesTitle && !matchesDescription && !matchesTags) return false
      }

      // Status filter
      if (statusFilter !== 'all' && task.status !== statusFilter) return false

      // Assignee filter
      if (assigneeFilter !== 'all' && task.assignee !== assigneeFilter) return false

      return true
    })
  }, [tasks, searchQuery, statusFilter, assigneeFilter, showArchived])

  useEffect(() => {
    if (!selectedTaskId) return
    const stillExists = tasks.some((task) => task.id === selectedTaskId)
    if (!stillExists) {
      setSelectedTaskId(null)
      setIsDetailOpen(false)
    }
  }, [selectedTaskId, tasks])

  useEffect(() => {
    const handleCommandPaletteAddTask = () => {
      setActiveTab('board')
      setQuickAddFocusSignal((value) => value + 1)
    }

    window.addEventListener('pinchr:add-task-request', handleCommandPaletteAddTask)
    return () => window.removeEventListener('pinchr:add-task-request', handleCommandPaletteAddTask)
  }, [])

  const handleWorkOnTask = useCallback(
    async (task: SmartTask): Promise<boolean> => {
      const message = `Work on this task: ${task.title}. Description: ${task.description || 'No description provided'}. Priority: ${task.priority}.`

      try {
        const headers = await getGatewayHeaders()
        const response = await fetch('http://127.0.0.1:18789/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...headers
          },
          body: JSON.stringify({
            messages: [{ role: 'user', content: message }],
            stream: false
          }),
          signal: AbortSignal.timeout(30000) // 30 second timeout
        })

        if (!response.ok) {
          const errorText = await response.text().catch(() => 'Unknown error')
          throw new Error(`Gateway request failed (${response.status}): ${errorText}`)
        }

        updateTask(task.id, { status: 'in-progress' })
        return true
      } catch (requestError) {
        console.error('Failed to send task to agent:', requestError)
        // Don't expose the full error to console in production
        if (requestError instanceof Error) {
          console.error('Error details:', requestError.message)
        }
        return false
      }
    },
    [updateTask]
  )

  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      <ProjectSidebar
        projects={projects}
        tasks={tasks}
        projectFilter={projectFilter}
        onProjectFilterChange={setProjectFilter}
        onAddProject={addProject}
      />

      <main className="min-w-0 flex-1 overflow-hidden">
        <div className="h-full min-h-0 overflow-y-auto px-6 py-6">
          <div className="mb-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold text-text-primary">Tasks</h1>
                <p className="mt-1 text-sm text-text-secondary">
                  Shared priority layer for human and agent work in <code>tasks.json</code>.
                </p>
              </div>
              <Button variant="outline" size="sm" className="gap-2" onClick={() => setIsSettingsOpen(true)}>
                <SettingsIcon className="h-4 w-4" />
                Task settings
              </Button>
            </div>
          </div>

          <div className="mb-4">
            <TaskQuickAdd
              projects={projects}
              existingTags={existingTags}
              isSaving={isSaving}
              focusSignal={quickAddFocusSignal}
              onAddTask={addTask}
            />
          </div>

          <div className="mb-4 space-y-3">
            {/* Search bar */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
              <Input
                type="text"
                placeholder="Search tasks by title, description, or tags..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-9"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Filter chips */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-text-muted">Filter:</span>

              {/* Status filters */}
              <Badge
                variant={statusFilter === 'all' ? 'default' : 'secondary'}
                className="cursor-pointer"
                onClick={() => setStatusFilter('all')}
              >
                All
              </Badge>
              <Badge
                variant={statusFilter === 'todo' ? 'default' : 'secondary'}
                className="cursor-pointer"
                onClick={() => setStatusFilter('todo')}
              >
                Todo
              </Badge>
              <Badge
                variant={statusFilter === 'in-progress' ? 'default' : 'secondary'}
                className="cursor-pointer"
                onClick={() => setStatusFilter('in-progress')}
              >
                In Progress
              </Badge>
              <Badge
                variant={statusFilter === 'blocked' ? 'default' : 'secondary'}
                className="cursor-pointer"
                onClick={() => setStatusFilter('blocked')}
              >
                Blocked
              </Badge>
              <Badge
                variant={statusFilter === 'done' ? 'default' : 'secondary'}
                className="cursor-pointer"
                onClick={() => setStatusFilter('done')}
              >
                Done
              </Badge>

              <span className="mx-1 text-xs text-text-muted/50">|</span>

              {/* Assignee filters */}
              <Badge
                variant={assigneeFilter === 'all' ? 'default' : 'secondary'}
                className="cursor-pointer"
                onClick={() => setAssigneeFilter('all')}
              >
                All
              </Badge>
              <Badge
                variant={assigneeFilter === 'human' ? 'default' : 'secondary'}
                className="cursor-pointer"
                onClick={() => setAssigneeFilter('human')}
              >
                Human
              </Badge>
              <Badge
                variant={assigneeFilter === 'agent' ? 'default' : 'secondary'}
                className="cursor-pointer"
                onClick={() => setAssigneeFilter('agent')}
              >
                Agent
              </Badge>

              {projects.length > 0 && (
                <>
                  <span className="mx-1 text-xs text-text-muted/50">|</span>
                  {/* Project filter (using existing projectFilter state) */}
                  <span className="text-xs text-text-muted">Project in sidebar</span>
                </>
              )}
            </div>
          </div>

          {isError && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
              <p className="font-semibold mb-1">Failed to load tasks</p>
              <p className="text-xs text-red-300">{error instanceof Error ? error.message : String(error)}</p>
            </div>
          )}

          {isLoading && (
            <div className="flex items-center justify-center py-16">
              <div className="flex flex-col items-center gap-3">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                <p className="text-sm text-text-muted">Loading tasks...</p>
              </div>
            </div>
          )}

          {!isError && !isLoading && (
            <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'board' | 'list' | 'timeline')}>
              <TabsList>
                <TabsTrigger value="board">Board</TabsTrigger>
                <TabsTrigger value="list">List</TabsTrigger>
                <TabsTrigger value="timeline">Timeline</TabsTrigger>
              </TabsList>

              <TabsContent value="board" className="mt-4">
                {(tasks ?? []).length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/10 mb-4">
                      <CheckSquare className="h-8 w-8 text-accent" />
                    </div>
                    <h3 className="text-lg font-semibold text-text-primary mb-2">No tasks yet</h3>
                    <p className="text-sm text-text-muted max-w-md">
                      Start chatting and I'll track everything here. Tasks are created automatically when you ask me to work on something.
                    </p>
                  </div>
                ) : filteredTasks.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-3 mb-4">
                      <Search className="h-8 w-8 text-text-muted" />
                    </div>
                    <h3 className="text-lg font-semibold text-text-primary mb-2">No matching tasks</h3>
                    <p className="text-sm text-text-muted max-w-md">
                      Try adjusting your search or filters to find what you're looking for.
                    </p>
                  </div>
                ) : (
                  <TaskBoard
                    tasks={filteredTasks}
                    projects={projects}
                    projectFilter={projectFilter}
                    highlightedTaskId={selectedTaskId}
                    onSelectTask={(taskId) => {
                      setSelectedTaskId(taskId)
                      setIsDetailOpen(true)
                    }}
                    onMoveTask={moveTask}
                    onToggleDone={toggleTaskDone}
                    onCycleStatus={cycleTaskStatus}
                    onDeleteTask={deleteTask}
                    onWorkOnTask={handleWorkOnTask}
                    onMarkDone={(taskId) => {
                      updateTask(taskId, { status: 'done', assignee: 'agent' })
                    }}
                    onAddComment={addComment}
                  />
                )}
              </TabsContent>

              <TabsContent value="list" className="mt-4">
                {(tasks ?? []).length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/10 mb-4">
                      <CheckSquare className="h-8 w-8 text-accent" />
                    </div>
                    <h3 className="text-lg font-semibold text-text-primary mb-2">No tasks yet</h3>
                    <p className="text-sm text-text-muted max-w-md">
                      Start chatting and I'll track everything here. Tasks are created automatically when you ask me to work on something.
                    </p>
                  </div>
                ) : filteredTasks.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-3 mb-4">
                      <Search className="h-8 w-8 text-text-muted" />
                    </div>
                    <h3 className="text-lg font-semibold text-text-primary mb-2">No matching tasks</h3>
                    <p className="text-sm text-text-muted max-w-md">
                      Try adjusting your search or filters to find what you're looking for.
                    </p>
                  </div>
                ) : (
                  <TaskList
                    tasks={filteredTasks}
                    projects={projects}
                    projectFilter={projectFilter}
                    onSelectTask={(taskId) => {
                      setSelectedTaskId(taskId)
                      setIsDetailOpen(true)
                    }}
                    onUpdateTask={updateTask}
                    onBulkUpdateTasks={bulkUpdateTasks}
                  />
                )}
              </TabsContent>

              <TabsContent value="timeline" className="mt-4">
                {(tasks ?? []).length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/10 mb-4">
                      <CheckSquare className="h-8 w-8 text-accent" />
                    </div>
                    <h3 className="text-lg font-semibold text-text-primary mb-2">No tasks yet</h3>
                    <p className="text-sm text-text-muted max-w-md">
                      Start chatting and I'll track everything here. Tasks are created automatically when you ask me to work on something.
                    </p>
                  </div>
                ) : filteredTasks.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-3 mb-4">
                      <Search className="h-8 w-8 text-text-muted" />
                    </div>
                    <h3 className="text-lg font-semibold text-text-primary mb-2">No matching tasks</h3>
                    <p className="text-sm text-text-muted max-w-md">
                      Try adjusting your search or filters to find what you're looking for.
                    </p>
                  </div>
                ) : (
                  <TaskTimeline
                    tasks={filteredTasks}
                    projects={projects}
                    projectFilter={projectFilter}
                    onSelectTask={(taskId) => {
                      setSelectedTaskId(taskId)
                      setIsDetailOpen(true)
                    }}
                    onToggleDone={toggleTaskDone}
                  />
                )}
              </TabsContent>
            </Tabs>
          )}

          {!isError && !isLoading && tasks.some((task) => task.status === 'archived') && (
            <div className="mt-4 flex items-center justify-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowArchived(!showArchived)}
                className="text-text-muted hover:text-text-primary"
              >
                {showArchived ? 'Hide archived tasks' : 'Show archived tasks'}
              </Button>
            </div>
          )}
        </div>
      </main>

      <TaskDetailPanel
        open={isDetailOpen}
        onOpenChange={setIsDetailOpen}
        task={selectedTask}
        tasks={tasks}
        projects={projects}
        onUpdateTask={updateTask}
        onDeleteTask={deleteTask}
        onAddComment={addComment}
        onEditComment={editComment}
        onDeleteComment={deleteComment}
        onAddAttachment={addAttachment}
        onRemoveAttachment={removeAttachment}
        onAddSubtask={addSubtask}
        onToggleSubtask={toggleSubtask}
        onDeleteSubtask={deleteSubtask}
      />

      <Sheet open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
        <SheetContent className="p-0">
          <div className="flex h-full flex-col">
            <SheetHeader className="border-b border-border px-6 py-4">
              <SheetTitle>Task Settings</SheetTitle>
              <SheetDescription>Saved in tasks.json under the top-level settings key.</SheetDescription>
            </SheetHeader>

            <div className="space-y-5 px-6 py-5">
              <div className="space-y-2">
                <Label>Task check frequency</Label>
                <Select
                  value={settings.checkFrequency}
                  onValueChange={(value) => updateTaskSettings({ checkFrequency: value as TaskCheckFrequency })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CHECK_FREQUENCY_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-border bg-surface-2 px-3 py-3">
                <div>
                  <p className="text-sm font-medium text-text-primary">Default task handling</p>
                  <p className="text-xs text-text-muted">
                    {settings.defaultTaskHandling === 'automatic'
                      ? 'Automatic: agent works on tasks as they come in'
                      : 'Manual: agent only works when you click Work on this'}
                  </p>
                </div>
                <Switch
                  checked={settings.defaultTaskHandling === 'automatic'}
                  onCheckedChange={(checked) =>
                    updateTaskSettings({ defaultTaskHandling: checked ? 'automatic' : 'manual' })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label>Default assignee</Label>
                <Select
                  value={settings.defaultAssignee}
                  onValueChange={(value) => updateTaskSettings({ defaultAssignee: value as TaskAssignee })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="human">Me</SelectItem>
                    <SelectItem value="agent">Agent</SelectItem>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-border bg-surface-2 px-3 py-3">
                <div>
                  <p className="text-sm font-medium text-text-primary">Auto-prioritize</p>
                  <p className="text-xs text-text-muted">Let the agent suggest priority levels for new tasks.</p>
                </div>
                <Switch
                  checked={settings.autoPrioritize}
                  onCheckedChange={(checked) => updateTaskSettings({ autoPrioritize: checked })}
                />
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
