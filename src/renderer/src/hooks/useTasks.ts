import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

export type TaskPriority = 'urgent' | 'high' | 'medium' | 'low'
export type TaskStatus = 'backlog' | 'todo' | 'in-progress' | 'blocked' | 'done' | 'cancelled' | 'archived'
export type TaskAssignee = 'human' | 'agent' | 'unassigned'
export type TaskSource = 'manual' | 'github' | 'linear'
export type TaskCheckFrequency = '15m' | '30m' | '1h' | '4h' | 'manual'
export type DefaultTaskHandling = 'automatic' | 'manual'

export interface TaskSettings {
  checkFrequency: TaskCheckFrequency
  defaultTaskHandling: DefaultTaskHandling
  defaultAssignee: TaskAssignee
  autoPrioritize: boolean
}

export interface Project {
  id: string
  name: string
  emoji: string
  color: string
  description: string
  createdAt: string
}

export interface TaskLink {
  label: string
  url: string
}

export interface TaskSubtask {
  id: string
  title: string
  done: boolean
}

export interface TaskComment {
  id: string
  author: 'human' | 'agent'
  text: string
  createdAt: string
}

export interface TaskAttachment {
  id: string
  name: string
  path: string
  type: string
  size: number
  createdAt: string
}

export interface TaskStatusActivity {
  id: string
  type: 'status-change'
  from: TaskStatus
  to: TaskStatus
  createdAt: string
}

export interface SmartTask {
  id: string
  title: string
  description: string
  spec?: string
  priority: TaskPriority
  status: TaskStatus
  projectId?: string
  dueDate?: string
  tags: string[]
  createdAt: string
  updatedAt: string
  completedAt?: string
  assignee: TaskAssignee
  source?: TaskSource
  sourceUrl?: string
  links: TaskLink[]
  subtasks: TaskSubtask[]
  comments: TaskComment[]
  attachments: TaskAttachment[]
  activity: TaskStatusActivity[]
  blockedBy: string[]
}

interface TaskDocument {
  version: 1
  projects: Project[]
  tasks: SmartTask[]
  settings: TaskSettings
}

export interface UpdateTaskSettingsInput extends Partial<TaskSettings> {}

export interface CreateTaskInput {
  title: string
  description?: string
  spec?: string
  priority?: TaskPriority
  status?: TaskStatus
  projectId?: string
  dueDate?: string
  tags?: string[]
  assignee?: TaskAssignee
  source?: TaskSource
  sourceUrl?: string
  links?: TaskLink[]
  subtasks?: Array<Pick<TaskSubtask, 'title'> | TaskSubtask>
  blockedBy?: string[]
}

export interface UpdateTaskInput extends Partial<Omit<SmartTask, 'id' | 'createdAt' | 'updatedAt'>> {
  dueDate?: string
}

export interface CreateProjectInput {
  name: string
  emoji?: string
  color?: string
  description?: string
}

export interface UpdateProjectInput {
  name?: string
  emoji?: string
  color?: string
  description?: string
}

const TASKS_FILE_PATH = 'tasks.json'
const TASKS_QUERY_KEY = ['gateway', 'tasks', TASKS_FILE_PATH] as const
const TASKS_RELOAD_DEBOUNCE_MS = 200
const DEFAULT_TASK_SETTINGS: TaskSettings = {
  checkFrequency: '30m',
  defaultTaskHandling: 'automatic',
  defaultAssignee: 'human',
  autoPrioritize: true
}

function isSameTaskDocument(current: TaskDocument | undefined, next: TaskDocument): boolean {
  if (!current) return false
  return JSON.stringify(current) === JSON.stringify(next)
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function readString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function readText(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function readBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on') return true
    if (normalized === 'false' || normalized === '0' || normalized === 'no' || normalized === 'off') return false
  }
  return undefined
}

function toArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key)
}

function generateId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${prefix}-${Math.random().toString(36).slice(2, 11)}`
}

function normalizeIsoDate(value: unknown): string | undefined {
  const raw = readString(value)
  if (!raw) return undefined
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return undefined
  return parsed.toISOString()
}

function normalizeDueDate(value: unknown): string | undefined {
  return normalizeIsoDate(value)
}

function normalizePriority(value: unknown): TaskPriority {
  const raw = readString(value)?.toLowerCase()
  if (raw === 'urgent' || raw === 'high' || raw === 'medium' || raw === 'low') return raw
  return 'medium'
}

function normalizeStatus(value: unknown): TaskStatus {
  const raw = readString(value)?.toLowerCase()
  if (
    raw === 'backlog' ||
    raw === 'todo' ||
    raw === 'in-progress' ||
    raw === 'blocked' ||
    raw === 'done' ||
    raw === 'cancelled' ||
    raw === 'archived'
  ) {
    return raw
  }
  return 'todo'
}

function normalizeAssignee(value: unknown): TaskAssignee {
  const raw = readString(value)?.toLowerCase()
  if (raw === 'human' || raw === 'agent' || raw === 'unassigned') return raw
  return 'human'
}

function normalizeSource(value: unknown): TaskSource | undefined {
  const raw = readString(value)?.toLowerCase()
  if (raw === 'manual' || raw === 'github' || raw === 'linear') return raw
  return undefined
}

function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const tags = value
    .map((tag) => readString(tag))
    .filter((tag): tag is string => !!tag)
    .map((tag) => tag.toLowerCase())

  return Array.from(new Set(tags))
}

function normalizeBlockedBy(value: unknown, selfId?: string): string[] {
  if (!Array.isArray(value)) return []
  const linkedTasks = value.map((item) => readString(item)).filter((id): id is string => !!id)
  return Array.from(new Set(linkedTasks)).filter((id) => id !== selfId)
}

function normalizeSubtask(entry: unknown): TaskSubtask | null {
  const raw = asRecord(entry)
  if (!raw) return null

  const title = readString(raw.title)
  if (!title) return null

  return {
    id: readString(raw.id) ?? generateId('subtask'),
    title,
    done: Boolean(raw.done)
  }
}

function normalizeLinks(value: unknown): TaskLink[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map((item) => ({
      label: readString(item.label) || 'Link',
      url: readString(item.url) || ''
    }))
    .filter((link) => link.url.length > 0)
}

function normalizeSubtasks(value: unknown): TaskSubtask[] {
  return toArray(value)
    .map(normalizeSubtask)
    .filter((subtask): subtask is TaskSubtask => !!subtask)
}

function normalizeCommentAuthor(value: unknown): 'human' | 'agent' {
  return readString(value)?.toLowerCase() === 'agent' ? 'agent' : 'human'
}

function normalizeComment(entry: unknown): TaskComment | null {
  const raw = asRecord(entry)
  if (!raw) return null

  const text = readString(raw.text)
  if (!text) return null

  const createdAt = normalizeIsoDate(raw.createdAt) ?? new Date().toISOString()

  return {
    id: readString(raw.id) ?? generateId('comment'),
    author: normalizeCommentAuthor(raw.author),
    text,
    createdAt
  }
}

function normalizeComments(value: unknown, legacyNotes?: unknown): TaskComment[] {
  const parsed = toArray(value)
    .map(normalizeComment)
    .filter((comment): comment is TaskComment => !!comment)

  if (parsed.length > 0) return parsed

  const legacyArray = toArray(legacyNotes)
    .map(normalizeComment)
    .filter((comment): comment is TaskComment => !!comment)
  if (legacyArray.length > 0) return legacyArray

  const legacy = readString(legacyNotes)
  if (!legacy) return []
  return [
    {
      id: generateId('comment'),
      author: 'human',
      text: legacy,
      createdAt: new Date().toISOString()
    }
  ]
}

function normalizeAttachment(entry: unknown): TaskAttachment | null {
  const raw = asRecord(entry)
  if (!raw) return null

  const name = readString(raw.name)
  const path = readString(raw.path)
  if (!name || !path) return null

  const createdAt = normalizeIsoDate(raw.createdAt) ?? new Date().toISOString()
  const size = typeof raw.size === 'number' && Number.isFinite(raw.size) && raw.size >= 0 ? raw.size : 0

  return {
    id: readString(raw.id) ?? generateId('attachment'),
    name,
    path,
    type: readString(raw.type) ?? 'application/octet-stream',
    size,
    createdAt
  }
}

function normalizeAttachments(value: unknown): TaskAttachment[] {
  return toArray(value)
    .map(normalizeAttachment)
    .filter((attachment): attachment is TaskAttachment => !!attachment)
}

function normalizeStatusActivity(entry: unknown): TaskStatusActivity | null {
  const raw = asRecord(entry)
  if (!raw) return null

  const from = normalizeStatus(raw.from)
  const to = normalizeStatus(raw.to)
  const type = readString(raw.type)
  if (type !== 'status-change') return null

  return {
    id: readString(raw.id) ?? generateId('activity'),
    type: 'status-change',
    from,
    to,
    createdAt: normalizeIsoDate(raw.createdAt) ?? new Date().toISOString()
  }
}

function normalizeTaskActivity(value: unknown): TaskStatusActivity[] {
  return toArray(value)
    .map(normalizeStatusActivity)
    .filter((activity): activity is TaskStatusActivity => !!activity)
}

function normalizeProject(entry: unknown): Project | null {
  const raw = asRecord(entry)
  if (!raw) return null

  const name = readString(raw.name)
  if (!name) return null

  return {
    id: readString(raw.id) ?? generateId('project'),
    name,
    emoji: readString(raw.emoji) ?? '📁',
    color: readString(raw.color) ?? '#64748b',
    description: readString(raw.description) ?? '',
    createdAt: normalizeIsoDate(raw.createdAt) ?? new Date().toISOString()
  }
}

function normalizeTask(entry: unknown): SmartTask | null {
  const raw = asRecord(entry)
  if (!raw) return null

  const now = new Date().toISOString()
  const id = readString(raw.id) ?? generateId('task')
  const title = readString(raw.title)
  if (!title) return null

  const createdAt = normalizeIsoDate(raw.createdAt) ?? now
  const updatedAt = normalizeIsoDate(raw.updatedAt) ?? now
  const completedAt = normalizeIsoDate(raw.completedAt)

  return {
    id,
    title,
    description: readString(raw.description) ?? '',
    spec: readText(raw.spec),
    priority: normalizePriority(raw.priority),
    status: normalizeStatus(raw.status),
    projectId: readString(raw.projectId),
    dueDate: normalizeDueDate(raw.dueDate),
    tags: normalizeTags(raw.tags),
    createdAt,
    updatedAt,
    completedAt,
    assignee: normalizeAssignee(raw.assignee),
    source: normalizeSource(raw.source),
    sourceUrl: readString(raw.sourceUrl),
    links: normalizeLinks(raw.links),
    subtasks: normalizeSubtasks(raw.subtasks),
    comments: normalizeComments(raw.comments, raw.notes),
    attachments: normalizeAttachments(raw.attachments),
    activity: normalizeTaskActivity(raw.activity),
    blockedBy: normalizeBlockedBy(raw.blockedBy, id)
  }
}

function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>()
  const result: T[] = []

  items.forEach((item) => {
    if (seen.has(item.id)) return
    seen.add(item.id)
    result.push(item)
  })

  return result
}

function normalizeCheckFrequency(value: unknown): TaskCheckFrequency {
  const raw = readString(value)?.toLowerCase()
  if (raw === '15m' || raw === '30m' || raw === '1h' || raw === '4h' || raw === 'manual') return raw
  return DEFAULT_TASK_SETTINGS.checkFrequency
}

function normalizeTaskHandling(value: unknown): DefaultTaskHandling {
  const raw = readString(value)?.toLowerCase()
  if (raw === 'automatic' || raw === 'manual') return raw
  return DEFAULT_TASK_SETTINGS.defaultTaskHandling
}

function normalizeTaskSettings(value: unknown): TaskSettings {
  const record = asRecord(value)
  if (!record) return { ...DEFAULT_TASK_SETTINGS }

  const legacyAutoWorkMode = readBoolean(record.autoWorkMode)
  const taskHandlingFromLegacy =
    legacyAutoWorkMode === undefined ? undefined : legacyAutoWorkMode ? 'automatic' : 'manual'

  return {
    checkFrequency: normalizeCheckFrequency(record.checkFrequency),
    defaultTaskHandling: normalizeTaskHandling(
      record.defaultTaskHandling ?? record.default_task_handling ?? taskHandlingFromLegacy
    ),
    defaultAssignee: normalizeAssignee(record.defaultAssignee ?? record.default_assignee),
    autoPrioritize:
      readBoolean(record.autoPrioritize ?? record.auto_prioritize) ??
      readBoolean(record.notifications) ??
      DEFAULT_TASK_SETTINGS.autoPrioritize
  }
}

function emptyTaskDocument(): TaskDocument {
  return {
    version: 1,
    projects: [],
    tasks: [],
    settings: { ...DEFAULT_TASK_SETTINGS }
  }
}

function isFileMissingError(error: unknown): boolean {
  const message = String(error).toLowerCase()
  return message.includes('enoent') || message.includes('not found') || message.includes('no such file')
}

async function readTasksFile(): Promise<TaskDocument> {
  try {
    const result = await window.api.files.read(TASKS_FILE_PATH)
    if (!result.ok || !result.data) return emptyTaskDocument()

    const content = (typeof result.data === 'string' ? result.data : '').trim()
    if (!content) return emptyTaskDocument()

    const parsed = JSON.parse(content) as unknown

    if (Array.isArray(parsed)) {
      const tasks = parsed.map(normalizeTask).filter((task): task is SmartTask => !!task)
      return {
        version: 1,
        projects: [],
        tasks: dedupeById(tasks),
        settings: { ...DEFAULT_TASK_SETTINGS }
      }
    }

    const root = asRecord(parsed)
    if (!root) return emptyTaskDocument()

    const tasks = toArray(root.tasks).map(normalizeTask).filter((task): task is SmartTask => !!task)
    const projects = toArray(root.projects)
      .map(normalizeProject)
      .filter((project): project is Project => !!project)

    return {
      version: 1,
      projects: dedupeById(projects),
      tasks: dedupeById(tasks),
      settings: normalizeTaskSettings(root.settings)
    }
  } catch (error) {
    if (isFileMissingError(error)) {
      return emptyTaskDocument()
    }
    throw error
  }
}

async function writeTasksFile(document: TaskDocument): Promise<void> {
  const content = JSON.stringify(document, null, 2)
  const result = await window.api.files.write(TASKS_FILE_PATH, content)
  if (!result.ok) {
    throw new Error(result.error || 'Failed to save tasks')
  }
}

function autoArchiveTasks(tasks: SmartTask[]): SmartTask[] {
  const now = new Date()
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

  return tasks.map((task) => {
    // Only auto-archive tasks that are 'done' and completed more than 7 days ago
    if (task.status === 'done' && task.updatedAt) {
      const updatedDate = new Date(task.updatedAt)
      if (updatedDate < sevenDaysAgo) {
        // Find the last status change to 'done' from activity
        const lastDoneActivity = [...task.activity]
          .reverse()
          .find((activity) => activity.to === 'done')

        if (lastDoneActivity) {
          const doneDate = new Date(lastDoneActivity.createdAt)
          if (doneDate < sevenDaysAgo) {
            return {
              ...task,
              status: 'archived' as TaskStatus,
              updatedAt: now.toISOString()
            }
          }
        }
      }
    }
    return task
  })
}

function cycleStatus(status: TaskStatus): TaskStatus {
  switch (status) {
    case 'backlog':
      return 'todo'
    case 'todo':
      return 'in-progress'
    case 'in-progress':
      return 'blocked'
    case 'blocked':
      return 'done'
    case 'done':
      return 'cancelled'
    case 'archived':
      return 'todo'
    default:
      return 'backlog'
  }
}

function reorderTaskWithinPriorityList(tasks: SmartTask[], sourceTaskId: string, targetTaskId: string | null): SmartTask[] {
  const sourceTask = tasks.find((task) => task.id === sourceTaskId)
  if (!sourceTask) return tasks

  const candidateIds = tasks.filter((task) => task.priority === sourceTask.priority).map((task) => task.id)
  const sourceGroupIndex = candidateIds.indexOf(sourceTaskId)
  if (sourceGroupIndex < 0) return tasks

  const normalizedTargetId = targetTaskId && candidateIds.includes(targetTaskId) ? targetTaskId : null
  const targetGroupIndex = normalizedTargetId ? candidateIds.indexOf(normalizedTargetId) : candidateIds.length - 1
  if (targetGroupIndex < 0 || targetGroupIndex === sourceGroupIndex) return tasks

  const nextGroupOrder = [...candidateIds]
  const [moved] = nextGroupOrder.splice(sourceGroupIndex, 1)
  const insertionIndex = normalizedTargetId ? nextGroupOrder.indexOf(normalizedTargetId) : nextGroupOrder.length
  nextGroupOrder.splice(insertionIndex, 0, moved)

  const queue = [...nextGroupOrder]
  return tasks.map((task) => {
    if (task.priority !== sourceTask.priority) return task
    const nextId = queue.shift()
    const replacement = tasks.find((candidate) => candidate.id === nextId)
    return replacement ?? task
  })
}

function applyTaskPatch(task: SmartTask, patch: UpdateTaskInput, now: string): SmartTask {
  const nextTask: SmartTask = { ...task }
  const previousStatus = task.status

  if (hasOwn(patch, 'title')) {
    const title = readString(patch.title)
    if (title) nextTask.title = title
  }

  if (hasOwn(patch, 'description')) {
    nextTask.description = readString(patch.description) ?? ''
  }

  if (hasOwn(patch, 'spec')) {
    nextTask.spec = readText(patch.spec)
  }

  if (hasOwn(patch, 'priority')) {
    nextTask.priority = normalizePriority(patch.priority)
  }

  if (hasOwn(patch, 'status')) {
    const nextStatus = normalizeStatus(patch.status)
    nextTask.status = nextStatus
    if (nextStatus !== previousStatus) {
      nextTask.activity = [
        ...nextTask.activity,
        {
          id: generateId('activity'),
          type: 'status-change',
          from: previousStatus,
          to: nextStatus,
          createdAt: now
        }
      ]
      // Set completedAt when status changes to 'done'
      if (nextStatus === 'done') {
        nextTask.completedAt = now
      } else if (previousStatus === 'done') {
        // Clear completedAt if moving away from done
        nextTask.completedAt = undefined
      }
    }
  }

  if (hasOwn(patch, 'projectId')) {
    nextTask.projectId = readString(patch.projectId)
  }

  if (hasOwn(patch, 'dueDate')) {
    nextTask.dueDate = normalizeDueDate(patch.dueDate)
  }

  if (hasOwn(patch, 'tags')) {
    nextTask.tags = normalizeTags(patch.tags)
  }

  if (hasOwn(patch, 'assignee')) {
    nextTask.assignee = normalizeAssignee(patch.assignee)
  }

  if (hasOwn(patch, 'source')) {
    nextTask.source = normalizeSource(patch.source)
  }

  if (hasOwn(patch, 'sourceUrl')) {
    nextTask.sourceUrl = readString(patch.sourceUrl)
  }

  if (hasOwn(patch, 'subtasks')) {
    nextTask.subtasks = normalizeSubtasks(patch.subtasks)
  }

  if (hasOwn(patch, 'comments')) {
    nextTask.comments = normalizeComments(patch.comments)
  }

  if (hasOwn(patch, 'attachments')) {
    nextTask.attachments = normalizeAttachments(patch.attachments)
  }

  if (hasOwn(patch, 'activity')) {
    nextTask.activity = normalizeTaskActivity(patch.activity)
  }

  if (hasOwn(patch, 'blockedBy')) {
    nextTask.blockedBy = normalizeBlockedBy(patch.blockedBy, task.id)
  }

  nextTask.updatedAt = now
  return nextTask
}

export function useTasks() {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: TASKS_QUERY_KEY,
    queryFn: async () => {
      const document = await readTasksFile()
      // Auto-archive old completed tasks
      const archivedTasks = autoArchiveTasks(document.tasks)
      // Check if any tasks were archived
      const hasChanges = archivedTasks.some((task, index) => task.status !== document.tasks[index].status)

      if (hasChanges) {
        const updatedDocument = { ...document, tasks: archivedTasks }
        // Persist the changes
        await writeTasksFile(updatedDocument)
        return updatedDocument
      }

      return document
    }
  })

  useEffect(() => {
    let disposed = false
    let reloadTimer: ReturnType<typeof setTimeout> | null = null

    const reloadTasksFromDisk = async () => {
      try {
        const nextDocument = await readTasksFile()
        if (disposed) return

        const currentDocument = queryClient.getQueryData<TaskDocument>(TASKS_QUERY_KEY)
        if (isSameTaskDocument(currentDocument, nextDocument)) return

        queryClient.setQueryData<TaskDocument>(TASKS_QUERY_KEY, nextDocument)
      } catch (error) {
        console.error('Failed to reload tasks after workspace file change:', error)
      }
    }

    const removeFileChangedListener = window.api.workspace.onFileChanged(({ file }) => {
      if (file !== TASKS_FILE_PATH) return

      if (reloadTimer) clearTimeout(reloadTimer)
      reloadTimer = setTimeout(() => {
        void reloadTasksFromDisk()
      }, TASKS_RELOAD_DEBOUNCE_MS)
    })

    return () => {
      disposed = true
      if (reloadTimer) clearTimeout(reloadTimer)
      removeFileChangedListener()
    }
  }, [queryClient])

  const saveMutation = useMutation({
    mutationFn: async (nextDocument: TaskDocument) => {
      await writeTasksFile(nextDocument)
      return nextDocument
    },
    onMutate: async (nextDocument) => {
      await queryClient.cancelQueries({ queryKey: TASKS_QUERY_KEY })
      const previous = queryClient.getQueryData<TaskDocument>(TASKS_QUERY_KEY) ?? emptyTaskDocument()
      queryClient.setQueryData<TaskDocument>(TASKS_QUERY_KEY, nextDocument)
      return { previous }
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData<TaskDocument>(TASKS_QUERY_KEY, context.previous)
      }
    }
  })

  const getCurrentDocument = (): TaskDocument => {
    return queryClient.getQueryData<TaskDocument>(TASKS_QUERY_KEY) ?? query.data ?? emptyTaskDocument()
  }

  const persistDocument = (nextDocument: TaskDocument) => {
    saveMutation.mutate(nextDocument)
  }

  const persistTasks = (nextTasks: SmartTask[]) => {
    const current = getCurrentDocument()
    persistDocument({
      ...current,
      version: 1,
      tasks: nextTasks
    })
  }

  const updateTaskSettings = (patch: UpdateTaskSettingsInput) => {
    const current = getCurrentDocument()
    const nextSettings: TaskSettings = {
      checkFrequency: hasOwn(patch, 'checkFrequency')
        ? normalizeCheckFrequency(patch.checkFrequency)
        : current.settings.checkFrequency,
      defaultTaskHandling: hasOwn(patch, 'defaultTaskHandling')
        ? normalizeTaskHandling(patch.defaultTaskHandling)
        : current.settings.defaultTaskHandling,
      defaultAssignee: hasOwn(patch, 'defaultAssignee')
        ? normalizeAssignee(patch.defaultAssignee)
        : current.settings.defaultAssignee,
      autoPrioritize: hasOwn(patch, 'autoPrioritize')
        ? readBoolean(patch.autoPrioritize) ?? current.settings.autoPrioritize
        : current.settings.autoPrioritize
    }

    persistDocument({
      ...current,
      version: 1,
      settings: nextSettings
    })
  }

  const addTask = (input: CreateTaskInput) => {
    const now = new Date().toISOString()
    const title = input.title.trim()
    if (!title) return

    const current = getCurrentDocument()
    const projectId = readString(input.projectId)
    const hasProject = projectId ? current.projects.some((project) => project.id === projectId) : false

    const nextTask: SmartTask = {
      id: generateId('task'),
      title,
      description: input.description?.trim() ?? '',
      spec: readText(input.spec),
      priority: input.priority ?? 'medium',
      status: input.status ?? 'todo',
      projectId: hasProject ? projectId : undefined,
      dueDate: normalizeDueDate(input.dueDate),
      tags: normalizeTags(input.tags ?? []),
      createdAt: now,
      updatedAt: now,
      assignee: input.assignee ?? current.settings.defaultAssignee,
      source: input.source,
      sourceUrl: readString(input.sourceUrl),
      links: normalizeLinks(input.links ?? []),
      subtasks: normalizeSubtasks(input.subtasks ?? []),
      comments: [],
      attachments: [],
      activity: [],
      blockedBy: normalizeBlockedBy(input.blockedBy ?? [])
    }

    persistTasks([...current.tasks, nextTask])
  }

  const updateTask = (taskId: string, patch: UpdateTaskInput) => {
    const now = new Date().toISOString()
    let nextTasks = getCurrentDocument().tasks.map((task) => {
      if (task.id !== taskId) return task
      return applyTaskPatch(task, patch, now)
    })

    // Auto-unblock: when a task is marked done, unblock tasks that depend on it
    const unblockedTasks: string[] = []
    if (patch.status === 'done') {
      nextTasks = nextTasks.map((task) => {
        if (!task.blockedBy.includes(taskId)) return task
        const updatedBlockedBy = task.blockedBy.filter((id) => id !== taskId)
        const shouldUnblock = updatedBlockedBy.length === 0 && task.status === 'blocked'
        if (shouldUnblock) {
          unblockedTasks.push(task.id)
        }
        return {
          ...task,
          blockedBy: updatedBlockedBy,
          status: shouldUnblock ? ('todo' as const) : task.status,
          updatedAt: now
        }
      })

      // Notify the agent about unblocked tasks so it can pick them up
      if (unblockedTasks.length > 0) {
        const unblockedNames = unblockedTasks
          .map((id) => nextTasks.find((t) => t.id === id))
          .filter(Boolean)
          .map((t) => `${t!.id}: ${t!.title}`)
          .join(', ')
        const completedTask = nextTasks.find((t) => t.id === taskId)
        const agentMessage = `Task "${completedTask?.title || taskId}" was marked done. The following tasks are now unblocked and ready to work on: ${unblockedNames}. Pick up the highest priority one.`
        void window.api.gateway.sendMessage('agent:main:direct', agentMessage).catch(() => {
          // Best-effort notification — don't block the UI
        })
      }
    }

    persistTasks(nextTasks)
  }

  const bulkUpdateTasks = (taskIds: string[], patch: UpdateTaskInput) => {
    if (taskIds.length === 0) return

    const selected = new Set(taskIds)
    const now = new Date().toISOString()

    const nextTasks = getCurrentDocument().tasks.map((task) => {
      if (!selected.has(task.id)) return task
      return applyTaskPatch(task, patch, now)
    })

    persistTasks(nextTasks)
  }

  const deleteTask = (taskId: string) => {
    const current = getCurrentDocument()
    const nextTasks = current.tasks
      .filter((task) => task.id !== taskId)
      .map((task) => {
        if (!task.blockedBy.includes(taskId)) return task
        return {
          ...task,
          blockedBy: task.blockedBy.filter((blockedId) => blockedId !== taskId),
          updatedAt: new Date().toISOString()
        }
      })

    persistTasks(nextTasks)
  }

  const toggleTaskDone = (taskId: string, done: boolean) => {
    updateTask(taskId, { status: done ? 'done' : 'todo' })
  }

  const cycleTaskStatus = (taskId: string) => {
    const target = getCurrentDocument().tasks.find((task) => task.id === taskId)
    if (!target) return
    updateTask(taskId, { status: cycleStatus(target.status) })
  }

  const moveTask = (taskId: string, status: TaskStatus) => {
    updateTask(taskId, { status })
  }

  const reorderTaskWithinPriority = (sourceTaskId: string, targetTaskId: string | null) => {
    const nextTasks = reorderTaskWithinPriorityList(getCurrentDocument().tasks, sourceTaskId, targetTaskId).map((task) => ({
      ...task,
      updatedAt: new Date().toISOString()
    }))
    persistTasks(nextTasks)
  }

  const addProject = (input: CreateProjectInput): Project | null => {
    const name = input.name.trim()
    if (!name) return null

    const current = getCurrentDocument()
    const project: Project = {
      id: generateId('project'),
      name,
      emoji: input.emoji?.trim() || '📁',
      color: input.color?.trim() || '#64748b',
      description: input.description?.trim() || '',
      createdAt: new Date().toISOString()
    }

    persistDocument({
      ...current,
      version: 1,
      projects: [...current.projects, project]
    })

    return project
  }

  const updateProject = (projectId: string, patch: UpdateProjectInput) => {
    const current = getCurrentDocument()

    const nextProjects = current.projects.map((project) => {
      if (project.id !== projectId) return project

      const nextName = hasOwn(patch, 'name') ? readString(patch.name) ?? project.name : project.name
      return {
        ...project,
        name: nextName,
        emoji: hasOwn(patch, 'emoji') ? readString(patch.emoji) ?? '📁' : project.emoji,
        color: hasOwn(patch, 'color') ? readString(patch.color) ?? '#64748b' : project.color,
        description: hasOwn(patch, 'description') ? readString(patch.description) ?? '' : project.description
      }
    })

    persistDocument({
      ...current,
      version: 1,
      projects: nextProjects
    })
  }

  const deleteProject = (projectId: string): boolean => {
    const current = getCurrentDocument()
    const isUsed = current.tasks.some((task) => task.projectId === projectId)
    if (isUsed) return false

    const nextProjects = current.projects.filter((project) => project.id !== projectId)
    persistDocument({
      ...current,
      version: 1,
      projects: nextProjects
    })

    return true
  }

  const addComment = (taskId: string, input: { author: 'human' | 'agent'; text: string }) => {
    const text = input.text.trim()
    if (!text) return

    const now = new Date().toISOString()
    const comment: TaskComment = {
      id: generateId('comment'),
      author: input.author === 'agent' ? 'agent' : 'human',
      text,
      createdAt: now
    }

    const nextTasks = getCurrentDocument().tasks.map((task) => {
      if (task.id !== taskId) return task
      return {
        ...task,
        comments: [...task.comments, comment],
        updatedAt: now
      }
    })

    persistTasks(nextTasks)
  }

  const editComment = (taskId: string, commentId: string, text: string) => {
    const trimmed = text.trim()
    if (!trimmed) return

    const nextTasks = getCurrentDocument().tasks.map((task) => {
      if (task.id !== taskId) return task
      return {
        ...task,
        comments: task.comments.map((c) =>
          c.id === commentId ? { ...c, text: trimmed } : c
        ),
        updatedAt: new Date().toISOString()
      }
    })

    persistTasks(nextTasks)
  }

  const deleteComment = (taskId: string, commentId: string) => {
    const nextTasks = getCurrentDocument().tasks.map((task) => {
      if (task.id !== taskId) return task
      return {
        ...task,
        comments: task.comments.filter((c) => c.id !== commentId),
        updatedAt: new Date().toISOString()
      }
    })

    persistTasks(nextTasks)
  }

  const addAttachment = (
    taskId: string,
    input: { name: string; path: string; type: string; size: number; createdAt?: string }
  ) => {
    const name = readString(input.name)
    const path = readString(input.path)
    if (!name || !path) return

    const now = new Date().toISOString()
    const createdAt = normalizeIsoDate(input.createdAt) ?? now
    const attachment: TaskAttachment = {
      id: generateId('attachment'),
      name,
      path,
      type: readString(input.type) ?? 'application/octet-stream',
      size: Number.isFinite(input.size) && input.size >= 0 ? input.size : 0,
      createdAt
    }

    const nextTasks = getCurrentDocument().tasks.map((task) => {
      if (task.id !== taskId) return task
      return {
        ...task,
        attachments: [...task.attachments, attachment],
        updatedAt: now
      }
    })

    persistTasks(nextTasks)
  }

  const removeAttachment = (taskId: string, attachmentId: string) => {
    const now = new Date().toISOString()

    const nextTasks = getCurrentDocument().tasks.map((task) => {
      if (task.id !== taskId) return task
      return {
        ...task,
        attachments: task.attachments.filter((attachment) => attachment.id !== attachmentId),
        updatedAt: now
      }
    })

    persistTasks(nextTasks)
  }

  const addSubtask = (taskId: string, title: string) => {
    const trimmed = title.trim()
    if (!trimmed) return

    const now = new Date().toISOString()
    const subtask: TaskSubtask = {
      id: generateId('subtask'),
      title: trimmed,
      done: false
    }

    const nextTasks = getCurrentDocument().tasks.map((task) => {
      if (task.id !== taskId) return task
      return {
        ...task,
        subtasks: [...task.subtasks, subtask],
        updatedAt: now
      }
    })

    persistTasks(nextTasks)
  }

  const toggleSubtask = (taskId: string, subtaskId: string, done?: boolean) => {
    const now = new Date().toISOString()

    const nextTasks = getCurrentDocument().tasks.map((task) => {
      if (task.id !== taskId) return task

      return {
        ...task,
        subtasks: task.subtasks.map((subtask) => {
          if (subtask.id !== subtaskId) return subtask
          return {
            ...subtask,
            done: typeof done === 'boolean' ? done : !subtask.done
          }
        }),
        updatedAt: now
      }
    })

    persistTasks(nextTasks)
  }

  const deleteSubtask = (taskId: string, subtaskId: string) => {
    const now = new Date().toISOString()

    const nextTasks = getCurrentDocument().tasks.map((task) => {
      if (task.id !== taskId) return task
      return {
        ...task,
        subtasks: task.subtasks.filter((subtask) => subtask.id !== subtaskId),
        updatedAt: now
      }
    })

    persistTasks(nextTasks)
  }

  return {
    tasks: query.data?.tasks ?? [],
    projects: query.data?.projects ?? [],
    settings: query.data?.settings ?? { ...DEFAULT_TASK_SETTINGS },
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    isSaving: saveMutation.isPending,
    refetch: query.refetch,
    addTask,
    updateTask,
    bulkUpdateTasks,
    deleteTask,
    toggleTaskDone,
    cycleTaskStatus,
    moveTask,
    reorderTaskWithinPriority,
    addProject,
    updateProject,
    deleteProject,
    updateTaskSettings,
    addComment,
    editComment,
    deleteComment,
    addNote: addComment,
    addAttachment,
    removeAttachment,
    addSubtask,
    toggleSubtask,
    deleteSubtask
  }
}
