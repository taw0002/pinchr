import { useEffect, useMemo, useState, type DragEvent } from 'react'
import { Bot, CheckCircle2, ChevronDown, ChevronRight, ExternalLink, FileText, Loader2, Paperclip, Pencil, Play, Plus, Trash2, Upload, User, X } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import type {
  Project,
  SmartTask,
  TaskAssignee,
  TaskPriority,
  TaskStatus,
  UpdateTaskInput
} from '@/hooks/useTasks'
import { PRIORITY_BADGE_CLASS, STATUS_BADGE_CLASS, STATUS_LABEL, TASK_PRIORITY_ORDER, TASK_STATUS_ORDER } from './taskMeta'
import { AttachmentViewer } from '@/components/AttachmentViewer'
import { TaskChatPanel } from '@/components/tasks/TaskChatPanel'

interface TaskDetailPanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  task: SmartTask | null
  tasks: SmartTask[]
  projects: Project[]
  onUpdateTask: (taskId: string, patch: UpdateTaskInput) => void
  onDeleteTask: (taskId: string) => void
  onAddComment: (taskId: string, comment: { author: 'human' | 'agent'; text: string }) => void
  onEditComment?: (taskId: string, commentId: string, text: string) => void
  onDeleteComment?: (taskId: string, commentId: string) => void
  onAddAttachment: (
    taskId: string,
    attachment: { name: string; path: string; type: string; size: number; createdAt?: string }
  ) => void
  onRemoveAttachment: (taskId: string, attachmentId: string) => void
  onAddSubtask: (taskId: string, title: string) => void
  onToggleSubtask: (taskId: string, subtaskId: string, done?: boolean) => void
  onDeleteSubtask: (taskId: string, subtaskId: string) => void
}

function toDateTimeLocalInput(value?: string): string {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''

  const local = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

function formatFileSize(value: number): string {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`
  return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

function sanitizeFilename(value: string): string {
  return value.replace(/[/\\?%*:|"<>]/g, '-').trim() || 'attachment'
}

function inferFileName(path: string): string {
  const slashIndex = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  const segment = slashIndex >= 0 ? path.slice(slashIndex + 1) : path
  return sanitizeFilename(segment || 'attachment')
}

type ActivityFeedItem =
  | {
      id: string
      type: 'comment'
      createdAt: string
      author: 'human' | 'agent'
      text: string
    }
  | {
      id: string
      type: 'status-change'
      createdAt: string
      from: TaskStatus
      to: TaskStatus
    }

export function TaskDetailPanel({
  open,
  onOpenChange,
  task,
  tasks,
  projects,
  onUpdateTask,
  onDeleteTask,
  onAddComment,
  onEditComment,
  onDeleteComment,
  onAddAttachment,
  onRemoveAttachment,
  onAddSubtask,
  onToggleSubtask,
  onDeleteSubtask
}: TaskDetailPanelProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [newTag, setNewTag] = useState('')
  const [newSubtask, setNewSubtask] = useState('')
  const [newComment, setNewComment] = useState('')
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null)
  const [editingText, setEditingText] = useState('')
  const [subtasksExpanded, setSubtasksExpanded] = useState(true)
  const [blockedTaskId, setBlockedTaskId] = useState('__none__')
  const [isSendingToAgent, setIsSendingToAgent] = useState(false)
  const [sendNotice, setSendNotice] = useState<string | null>(null)
  const [sendError, setSendError] = useState<string | null>(null)
  const [isAttachDragOver, setIsAttachDragOver] = useState(false)
  const [isImportingAttachment, setIsImportingAttachment] = useState(false)
  const [attachmentNotice, setAttachmentNotice] = useState<string | null>(null)
  const [attachmentError, setAttachmentError] = useState<string | null>(null)
  const [activeMainTab, setActiveMainTab] = useState<'details' | 'spec' | 'chat'>('details')
  const [specMode, setSpecMode] = useState<'edit' | 'preview'>('edit')
  const [specDraft, setSpecDraft] = useState('')
  const [markDoneNote, setMarkDoneNote] = useState('')
  const [showMarkDoneNote, setShowMarkDoneNote] = useState(false)
  const [selectedAttachment, setSelectedAttachment] = useState<SmartTask['attachments'][0] | null>(null)

  useEffect(() => {
    setTitle(task?.title ?? '')
    setDescription(task?.description ?? '')
    setSpecDraft(task?.spec ?? '')
    setDueDate(toDateTimeLocalInput(task?.dueDate))
    setNewTag('')
    setNewSubtask('')
    setNewComment('')
    setBlockedTaskId('__none__')
    setIsSendingToAgent(false)
    setSendNotice(null)
    setSendError(null)
    setIsAttachDragOver(false)
    setIsImportingAttachment(false)
    setAttachmentNotice(null)
    setAttachmentError(null)
    setActiveMainTab('details')
    setSpecMode('edit')
    setMarkDoneNote('')
    setShowMarkDoneNote(false)
    setSelectedAttachment(null)
  }, [task])

  const activityFeed = useMemo<ActivityFeedItem[]>(() => {
    if (!task) return []

    const comments: ActivityFeedItem[] = task.comments.map((comment) => ({
      id: `comment-${comment.id}`,
      type: 'comment',
      createdAt: comment.createdAt,
      author: comment.author,
      text: comment.text
    }))

    const statusChanges: ActivityFeedItem[] = task.activity.map((event) => ({
      id: `activity-${event.id}`,
      type: 'status-change',
      createdAt: event.createdAt,
      from: event.from,
      to: event.to
    }))

    return [...comments, ...statusChanges].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
  }, [task])

  const blockedByChoices = useMemo(() => {
    if (!task) return []
    return tasks.filter((candidate) => candidate.id !== task.id && !task.blockedBy.includes(candidate.id))
  }, [task, tasks])

  const attachmentsNewestFirst = useMemo(() => {
    if (!task) return []
    return [...task.attachments].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }, [task])

  const sendTaskToAgent = async () => {
    if (!task) return

    setIsSendingToAgent(true)
    setSendNotice(null)
    setSendError(null)

    try {
      const due = task.dueDate ? new Date(task.dueDate).toLocaleString() : 'No due date'
      const descriptionText = task.description.trim() || 'No description'
      const message = `Work on this task: ${task.title}. Description: ${descriptionText}. Priority: ${task.priority}. Due: ${due}`
      const result = await window.api.gateway.toolsInvoke('sessions_send', {
        message,
        sessionKey: 'main'
      })

      if (!result.ok) {
        throw new Error(result.error || 'Failed to send task to agent')
      }

      setSendNotice('Task sent to agent')
      window.setTimeout(() => setSendNotice(null), 2200)
    } catch (error) {
      setSendError(String(error))
      window.setTimeout(() => setSendError(null), 3200)
    } finally {
      setIsSendingToAgent(false)
    }
  }

  const importAttachmentFromPath = async (sourcePath: string, preferredName?: string) => {
    if (!task) return

    const cleanName = sanitizeFilename(preferredName ?? inferFileName(sourcePath))
    const targetPath = `attachments/${task.id}/${Date.now()}-${cleanName}`

    setAttachmentError(null)
    setAttachmentNotice(null)
    setIsImportingAttachment(true)

    try {
      const result = await window.api.files.importFromPath(sourcePath, targetPath)
      if (!result.ok || !result.data) {
        throw new Error(result.error || 'Failed to import file')
      }

      onAddAttachment(task.id, result.data)
      setAttachmentNotice('Attachment added')
      window.setTimeout(() => setAttachmentNotice(null), 2200)
    } catch (error) {
      setAttachmentError(String(error))
      window.setTimeout(() => setAttachmentError(null), 3200)
    } finally {
      setIsImportingAttachment(false)
    }
  }

  const handleAttachmentPicker = async () => {
    const picked = await window.api.media.pickFile()
    if (!picked.ok || !picked.data) return
    await importAttachmentFromPath(picked.data)
  }

  const handleAttachmentDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsAttachDragOver(false)

    const droppedFiles = Array.from(event.dataTransfer.files)
    if (droppedFiles.length === 0) return

    const fileWithPath = droppedFiles.find((file) => {
      const droppedPath = (file as File & { path?: string }).path
      return typeof droppedPath === 'string' && droppedPath.length > 0
    })

    if (!fileWithPath) {
      setAttachmentError('Drag-and-drop did not expose a local file path. Use Attach file instead.')
      window.setTimeout(() => setAttachmentError(null), 3200)
      return
    }

    const droppedPath = (fileWithPath as File & { path: string }).path
    void importAttachmentFromPath(droppedPath, fileWithPath.name)
  }

  const openAttachment = (attachment: SmartTask['attachments'][0]) => {
    setSelectedAttachment(attachment)
  }

  const saveSpecIfChanged = () => {
    if (!task) return
    if (specDraft !== (task.spec ?? '')) {
      onUpdateTask(task.id, { spec: specDraft })
    }
  }

  const handleMarkDone = () => {
    if (!task) return
    onUpdateTask(task.id, { status: 'done', assignee: 'agent' })
    if (markDoneNote.trim()) {
      onAddComment(task.id, { author: 'human', text: markDoneNote.trim() })
    }
    setMarkDoneNote('')
    setShowMarkDoneNote(false)
  }

  if (!task) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Task details</DialogTitle>
            <DialogDescription>Select a task to view and edit details.</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid h-[90vh] max-h-[90vh] w-[96vw] max-w-6xl grid-rows-[auto,minmax(0,1fr)] gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-6 py-4 pr-12">
          <DialogTitle>Task Details</DialogTitle>
          <DialogDescription>Collaboration workspace for human + agent execution.</DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 grid-cols-1 md:grid-cols-[minmax(0,1fr)_320px]">
          <ScrollArea className="min-h-0 border-b border-border md:border-b-0 md:border-r">
            <div className="space-y-5 px-6 py-5">
              <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
                <div className="inline-flex rounded-lg border border-border bg-surface-2 p-1">
                  <button
                    type="button"
                    onClick={() => setActiveMainTab('details')}
                    className={cn(
                      'rounded-md px-3 py-1 text-sm font-medium transition-colors',
                      activeMainTab === 'details' ? 'bg-surface-3 text-text-primary' : 'text-text-secondary hover:text-text-primary'
                    )}
                  >
                    Details
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveMainTab('spec')}
                    className={cn(
                      'rounded-md px-3 py-1 text-sm font-medium transition-colors',
                      activeMainTab === 'spec' ? 'bg-surface-3 text-text-primary' : 'text-text-secondary hover:text-text-primary'
                    )}
                  >
                    Spec
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveMainTab('chat')}
                    className={cn(
                      'rounded-md px-3 py-1 text-sm font-medium transition-colors',
                      activeMainTab === 'chat' ? 'bg-surface-3 text-text-primary' : 'text-text-secondary hover:text-text-primary'
                    )}
                  >
                    Chat
                  </button>
                </div>
                {activeMainTab === 'spec' && (
                  <div className="inline-flex rounded-md border border-border bg-surface-2 p-0.5">
                    <button
                      type="button"
                      onClick={() => setSpecMode('edit')}
                      className={cn(
                        'rounded px-2.5 py-1 text-xs font-medium transition-colors',
                        specMode === 'edit' ? 'bg-surface-3 text-text-primary' : 'text-text-secondary hover:text-text-primary'
                      )}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => setSpecMode('preview')}
                      className={cn(
                        'rounded px-2.5 py-1 text-xs font-medium transition-colors',
                        specMode === 'preview' ? 'bg-surface-3 text-text-primary' : 'text-text-secondary hover:text-text-primary'
                      )}
                    >
                      Preview
                    </button>
                  </div>
                )}
              </div>

              {activeMainTab === 'details' && (
                <div className="space-y-6">
              <section className="space-y-2">
                <Label htmlFor="task-detail-title">Title</Label>
                <Input
                  id="task-detail-title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  onBlur={() => {
                    const trimmed = title.trim()
                    if (trimmed && trimmed !== task.title) {
                      onUpdateTask(task.id, { title: trimmed })
                    }
                  }}
                />
              </section>

              <section className="space-y-2">
                <Label htmlFor="task-detail-description">Description</Label>
                <Textarea
                  id="task-detail-description"
                  className="min-h-[140px]"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  onBlur={() => {
                    if (description !== task.description) {
                      onUpdateTask(task.id, { description })
                    }
                  }}
                />
              </section>

              {/* Links */}
              {task.links && task.links.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {task.links.map((link, i) => (
                    <a
                      key={i}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => {
                        e.preventDefault()
                        window.api?.shell?.openExternal?.(link.url)
                      }}
                      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-2 px-2.5 py-1 text-xs text-accent hover:bg-accent/10 transition-colors"
                    >
                      <ExternalLink className="h-3 w-3" />
                      {link.label}
                    </a>
                  ))}
                </div>
              )}

              {/* Subtasks — collapsible */}
              {(task.subtasks.length > 0 || true) && (
                <>
                  <Separator />
                  <section className="space-y-2">
                    <button
                      type="button"
                      onClick={() => setSubtasksExpanded(!subtasksExpanded)}
                      className="flex w-full items-center gap-2 text-sm font-medium text-text-primary hover:text-accent transition-colors"
                    >
                      {subtasksExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      Subtasks
                      {task.subtasks.length > 0 && (
                        <span className="text-xs text-text-muted">
                          {task.subtasks.filter((s) => s.done).length}/{task.subtasks.length}
                        </span>
                      )}
                    </button>

                    {/* Progress bar */}
                    {task.subtasks.length > 0 && (
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface">
                        <div
                          className="h-full rounded-full bg-accent transition-all"
                          style={{ width: `${(task.subtasks.filter((s) => s.done).length / task.subtasks.length) * 100}%` }}
                        />
                      </div>
                    )}

                    {subtasksExpanded && (
                      <div className="space-y-1">
                        {task.subtasks.map((subtask) => (
                          <div key={subtask.id} className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-surface-2">
                            <input
                              type="checkbox"
                              checked={subtask.done}
                              onChange={(event) => onToggleSubtask(task.id, subtask.id, event.target.checked)}
                              className="h-3.5 w-3.5 rounded border-border bg-surface"
                            />
                            <span className={cn('flex-1 text-sm text-text-primary', subtask.done && 'line-through text-text-muted')}>
                              {subtask.title}
                            </span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity text-text-muted hover:text-red-400"
                              onClick={() => onDeleteSubtask(task.id, subtask.id)}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                        <div className="flex gap-2 pt-1">
                          <Input
                            value={newSubtask}
                            onChange={(event) => setNewSubtask(event.target.value)}
                            placeholder="Add subtask…"
                            className="h-8 text-sm"
                            onKeyDown={(event) => {
                              if (event.key !== 'Enter') return
                              event.preventDefault()
                              const value = newSubtask.trim()
                              if (!value) return
                              onAddSubtask(task.id, value)
                              setNewSubtask('')
                            }}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8"
                            onClick={() => {
                              const value = newSubtask.trim()
                              if (!value) return
                              onAddSubtask(task.id, value)
                              setNewSubtask('')
                            }}
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </section>
                </>
              )}

              <Separator />

              <section className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <Label className="text-sm">Attachments</Label>
                  <Button type="button" variant="outline" size="sm" onClick={() => void handleAttachmentPicker()}>
                    <Paperclip className="mr-1.5 h-3.5 w-3.5" />
                    Attach file
                  </Button>
                </div>

                <div
                  className={cn(
                    'rounded-lg border border-dashed border-border bg-surface-2 px-4 py-5 text-center text-xs text-text-secondary transition-colors',
                    isAttachDragOver && 'border-accent bg-accent/10 text-text-primary'
                  )}
                  onDragOver={(event) => {
                    event.preventDefault()
                    setIsAttachDragOver(true)
                  }}
                  onDragLeave={() => setIsAttachDragOver(false)}
                  onDrop={handleAttachmentDrop}
                >
                  {isImportingAttachment ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Importing attachment...
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-2">
                      <Upload className="h-3.5 w-3.5" />
                      Drop a file here or click Attach file
                    </span>
                  )}
                </div>

                {attachmentNotice && <p className="text-xs text-emerald-300">{attachmentNotice}</p>}
                {attachmentError && <p className="text-xs text-red-300">{attachmentError}</p>}

                <div className="space-y-2">
                  {attachmentsNewestFirst.map((attachment) => (
                    <div
                      key={attachment.id}
                      className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2"
                    >
                      <button
                        type="button"
                        onClick={() => openAttachment(attachment)}
                        className="inline-flex min-w-0 flex-1 items-center gap-2 text-left hover:bg-surface-3/50 transition-colors rounded px-2 py-1 -mx-2 -my-1"
                      >
                        <FileText className="h-4 w-4 shrink-0 text-text-muted" />
                        <span className="min-w-0 truncate text-sm text-text-primary">{attachment.name}</span>
                        <span className="shrink-0 text-xs text-text-muted">{formatFileSize(attachment.size)}</span>
                      </button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => onRemoveAttachment(task.id, attachment.id)}
                        className="text-text-muted hover:text-text-primary"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                  {attachmentsNewestFirst.length === 0 && <p className="text-sm text-text-muted">No attachments yet.</p>}
                </div>
              </section>

              <Separator />

              <section className="space-y-3">
                <Label className="text-sm">Comments / Activity</Label>

                <div className="space-y-2">
                  {activityFeed.map((item) => {
                    if (item.type === 'comment') {
                      const isAgent = item.author === 'agent'
                      const isEditing = editingCommentId === item.id
                      return (
                        <div
                          key={item.id}
                          className={cn(
                            'group rounded-lg border px-3 py-2',
                            isAgent ? 'border-accent/30 bg-accent/5' : 'border-border bg-surface-2'
                          )}
                        >
                          <div className="mb-1 flex items-center justify-between">
                            <div className="flex items-center gap-2 text-xs text-text-muted">
                              {isAgent ? (
                                <span className="inline-flex items-center gap-1 rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-medium text-accent">
                                  <Bot className="h-3 w-3" /> Agent
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-text-muted">
                                  <User className="h-3 w-3" /> You
                                </span>
                              )}
                              <span>{new Date(item.createdAt).toLocaleString()}</span>
                            </div>
                            {!isAgent && !isEditing && (
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 w-6 p-0 text-text-muted hover:text-text-primary"
                                  onClick={() => {
                                    setEditingCommentId(item.id)
                                    setEditingText(item.text)
                                  }}
                                >
                                  <Pencil className="h-3 w-3" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 w-6 p-0 text-red-400 hover:text-red-300"
                                  onClick={() => onDeleteComment?.(task.id, item.id)}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            )}
                          </div>
                          {isEditing ? (
                            <div className="flex gap-2">
                              <Input
                                value={editingText}
                                onChange={(e) => setEditingText(e.target.value)}
                                className="text-sm"
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    const text = editingText.trim()
                                    if (text) onEditComment?.(task.id, item.id, text)
                                    setEditingCommentId(null)
                                    setEditingText('')
                                  }
                                  if (e.key === 'Escape') {
                                    setEditingCommentId(null)
                                    setEditingText('')
                                  }
                                }}
                              />
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  const text = editingText.trim()
                                  if (text) onEditComment?.(task.id, item.id, text)
                                  setEditingCommentId(null)
                                  setEditingText('')
                                }}
                              >
                                Save
                              </Button>
                            </div>
                          ) : (
                            <p className="text-sm text-text-primary">{item.text}</p>
                          )}
                        </div>
                      )
                    }

                    return (
                      <div key={item.id} className="flex items-center gap-2 px-3 py-1.5 text-xs text-text-muted">
                        <span className="h-1.5 w-1.5 rounded-full bg-text-muted/50" />
                        <span>
                          {STATUS_LABEL[item.from]} → {STATUS_LABEL[item.to]}
                        </span>
                        <span className="text-text-muted/60">{new Date(item.createdAt).toLocaleString()}</span>
                      </div>
                    )
                  })}
                  {activityFeed.length === 0 && <p className="text-sm text-text-muted">No activity yet.</p>}
                </div>

                <div className="flex gap-2">
                  <Input
                    value={newComment}
                    onChange={(event) => setNewComment(event.target.value)}
                    placeholder="Add a comment…"
                    className="flex-1"
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter') return
                      event.preventDefault()
                      const text = newComment.trim()
                      if (!text) return
                      onAddComment(task.id, { author: 'human', text })
                      setNewComment('')
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      const text = newComment.trim()
                      if (!text) return
                      onAddComment(task.id, { author: 'human', text })
                      setNewComment('')
                    }}
                  >
                    Comment
                  </Button>
                </div>
              </section>
                </div>
              )}

              {activeMainTab === 'spec' && (
                <section className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="task-detail-spec">Task Spec</Label>
                    <p className="text-xs text-text-muted">Markdown with GFM tables, checklists, and code blocks.</p>
                  </div>

                  {specMode === 'edit' ? (
                    <Textarea
                      id="task-detail-spec"
                      className="min-h-[56vh] resize-y border-border bg-surface-1 font-mono text-sm leading-6 text-text-primary"
                      value={specDraft}
                      onChange={(event) => setSpecDraft(event.target.value)}
                      onBlur={saveSpecIfChanged}
                      placeholder="# Task spec

Capture requirements, constraints, implementation notes, and decisions."
                    />
                  ) : (
                    <div className="min-h-[56vh] rounded-lg border border-border bg-surface-1 p-4">
                      {specDraft.trim().length === 0 ? (
                        <p className="text-sm text-text-muted">No spec yet. Switch to Edit and add markdown.</p>
                      ) : (
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
                          {specDraft}
                        </ReactMarkdown>
                      )}
                    </div>
                  )}
                </section>
              )}

              {activeMainTab === 'chat' && <TaskChatPanel task={task} />}
            </div>
          </ScrollArea>

          <ScrollArea className="min-h-0 bg-surface-2/40">
            <div className="space-y-5 px-5 py-5">
              <section className="space-y-2">
                <Label>Status</Label>
                <Select value={task.status} onValueChange={(value) => onUpdateTask(task.id, { status: value as TaskStatus })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TASK_STATUS_ORDER.map((status) => (
                      <SelectItem key={status} value={status}>
                        {STATUS_LABEL[status]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </section>

              <section className="space-y-2">
                <Label>Priority</Label>
                <Select
                  value={task.priority}
                  onValueChange={(value) => onUpdateTask(task.id, { priority: value as TaskPriority })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TASK_PRIORITY_ORDER.map((priority) => (
                      <SelectItem key={priority} value={priority}>
                        {priority}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </section>

              <section className="space-y-2">
                <Label>Assignee</Label>
                <Select
                  value={task.assignee}
                  onValueChange={(value) => onUpdateTask(task.id, { assignee: value as TaskAssignee })}
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
              </section>

              <section className="space-y-2">
                <Label>Project</Label>
                <Select
                  value={task.projectId ?? '__none__'}
                  onValueChange={(value) => onUpdateTask(task.id, { projectId: value === '__none__' ? undefined : value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Unassigned" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Unassigned</SelectItem>
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.emoji} {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </section>

              <section className="space-y-2">
                <Label htmlFor="task-detail-due-date">Due Date</Label>
                <Input
                  id="task-detail-due-date"
                  type="datetime-local"
                  value={dueDate}
                  onChange={(event) => setDueDate(event.target.value)}
                  onBlur={() => {
                    if (!dueDate) {
                      if (task.dueDate) onUpdateTask(task.id, { dueDate: undefined })
                      return
                    }

                    const parsed = new Date(dueDate)
                    if (!Number.isNaN(parsed.getTime())) {
                      onUpdateTask(task.id, { dueDate: parsed.toISOString() })
                    }
                  }}
                />
              </section>

              <section className="space-y-2">
                <Label>Tags</Label>
                <div className="flex flex-wrap gap-2">
                  {task.tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="inline-flex items-center gap-1">
                      <span>#{tag}</span>
                      <button
                        type="button"
                        onClick={() => onUpdateTask(task.id, { tags: task.tags.filter((item) => item !== tag) })}
                        className="rounded p-0.5 hover:bg-surface-3"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input
                    value={newTag}
                    onChange={(event) => setNewTag(event.target.value)}
                    placeholder="Add tag"
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter') return
                      event.preventDefault()
                      const tag = newTag.trim().toLowerCase()
                      if (!tag || task.tags.includes(tag)) return
                      onUpdateTask(task.id, { tags: [...task.tags, tag] })
                      setNewTag('')
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      const tag = newTag.trim().toLowerCase()
                      if (!tag || task.tags.includes(tag)) return
                      onUpdateTask(task.id, { tags: [...task.tags, tag] })
                      setNewTag('')
                    }}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </section>

              <section className="space-y-2">
                <Label>Blocked By</Label>
                <div className="flex flex-wrap gap-2">
                  {task.blockedBy.map((linkedTaskId) => {
                    const blockedTask = tasks.find((candidate) => candidate.id === linkedTaskId)
                    return (
                      <Badge key={linkedTaskId} variant="secondary" className="inline-flex items-center gap-1">
                        <span>{blockedTask?.title ?? linkedTaskId}</span>
                        <button
                          type="button"
                          onClick={() => onUpdateTask(task.id, { blockedBy: task.blockedBy.filter((id) => id !== linkedTaskId) })}
                          className="rounded p-0.5 hover:bg-surface-3"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    )
                  })}
                  {task.blockedBy.length === 0 && <p className="text-sm text-text-muted">No blockers.</p>}
                </div>

                <Select
                  value={blockedTaskId}
                  onValueChange={(value) => {
                    if (value === '__none__') {
                      setBlockedTaskId('__none__')
                      return
                    }
                    onUpdateTask(task.id, { blockedBy: [...task.blockedBy, value] })
                    setBlockedTaskId('__none__')
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Link blocking task" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Select task</SelectItem>
                    {blockedByChoices.map((candidate) => (
                      <SelectItem key={candidate.id} value={candidate.id}>
                        {candidate.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </section>

              <Separator />

              <section className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className={cn('border px-2 py-0.5', PRIORITY_BADGE_CLASS[task.priority])}>{task.priority}</Badge>
                  <Badge className={cn('border px-2 py-0.5', STATUS_BADGE_CLASS[task.status])}>{STATUS_LABEL[task.status]}</Badge>
                  {task.assignee === 'human' && (
                    <Badge className="border border-blue-500/30 bg-blue-500/15 px-2 py-0.5 text-blue-400">
                      <User className="mr-1 h-3 w-3" />
                      You
                    </Badge>
                  )}
                  {task.assignee === 'agent' && (
                    <Badge className="border border-accent/30 bg-accent/15 px-2 py-0.5 text-accent">
                      <Bot className="mr-1 h-3 w-3" />
                      Agent
                    </Badge>
                  )}
                </div>

                {task.assignee === 'human' && task.status !== 'done' && (
                  <>
                    {showMarkDoneNote && (
                      <Textarea
                        value={markDoneNote}
                        onChange={(e) => setMarkDoneNote(e.target.value)}
                        placeholder="Add a note (optional)…"
                        className="h-20 text-sm"
                      />
                    )}
                    <Button
                      type="button"
                      className="w-full justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                      onClick={handleMarkDone}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {showMarkDoneNote ? 'Submit as Done' : 'Mark Done'}
                    </Button>
                    {!showMarkDoneNote ? (
                      <Button
                        type="button"
                        variant="ghost"
                        className="w-full text-xs text-text-muted hover:text-text-primary"
                        onClick={() => setShowMarkDoneNote(true)}
                      >
                        Add note
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="ghost"
                        className="w-full text-xs text-text-muted hover:text-text-primary"
                        onClick={() => {
                          setMarkDoneNote('')
                          setShowMarkDoneNote(false)
                        }}
                      >
                        Cancel note
                      </Button>
                    )}
                    <Separator />
                  </>
                )}

                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-center gap-1.5"
                  onClick={() => {
                    void sendTaskToAgent()
                  }}
                  disabled={isSendingToAgent}
                >
                  {isSendingToAgent ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                  Work on This
                </Button>
                {sendNotice && <p className="text-xs text-emerald-300">{sendNotice}</p>}
                {sendError && <p className="text-xs text-red-300">{sendError}</p>}

                <Button
                  type="button"
                  variant="ghost"
                  className="w-full justify-center gap-1.5 text-red-300 hover:bg-red-500/10 hover:text-red-300"
                  onClick={() => {
                    onDeleteTask(task.id)
                    onOpenChange(false)
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete Task
                </Button>
              </section>
            </div>
          </ScrollArea>
        </div>

        <AttachmentViewer
          attachment={selectedAttachment}
          onClose={() => setSelectedAttachment(null)}
        />
      </DialogContent>
    </Dialog>
  )
}
