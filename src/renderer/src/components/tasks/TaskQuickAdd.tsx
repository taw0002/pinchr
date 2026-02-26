import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PRIORITY_BADGE_CLASS } from '@/components/tasks/taskMeta'
import type { CreateTaskInput, Project, TaskPriority } from '@/hooks/useTasks'

interface TaskQuickAddProps {
  projects: Project[]
  existingTags: string[]
  isSaving?: boolean
  focusSignal?: number
  onAddTask: (task: CreateTaskInput) => void
}

interface ParsedTaskPayload {
  title?: unknown
  subtitle?: unknown
  description?: unknown
  priority?: unknown
  projectId?: unknown
  subtasks?: unknown
  tags?: unknown
}

type ConversationRole = 'user' | 'assistant'
type FlowState = 'idle' | 'parsing' | 'preview' | 'clarifying' | 'creating'

interface ConversationMessage {
  role: ConversationRole
  content: string
}

type GatewayResult = { type: 'task'; task: CreateTaskInput } | { type: 'message'; message: string }

type FeedbackTone = 'success' | 'error'

const DEFAULT_GATEWAY_PORT = 18789
const MAX_CLARIFICATION_TURNS = 3
const SUCCESS_FEEDBACK_MS = 1500
const ERROR_FEEDBACK_MS = 900

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function readNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return `${text.slice(0, Math.max(1, maxLength - 1)).trimEnd()}…`
}

function normalizePriority(value: unknown): TaskPriority {
  const normalized = readNonEmptyString(value)?.toLowerCase()
  if (normalized === 'urgent' || normalized === 'high' || normalized === 'medium' || normalized === 'low') {
    return normalized
  }
  return 'medium'
}

function normalizeList(values: unknown): string[] {
  if (!Array.isArray(values)) return []

  const seen = new Set<string>()
  const result: string[] = []

  for (const entry of values) {
    const text = readNonEmptyString(entry)
    if (!text) continue
    const key = text.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(text)
  }

  return result
}

function isVeryShortInput(input: string): boolean {
  const words = input.trim().split(/\s+/).filter(Boolean)
  return words.length <= 2 && input.length <= 20
}

function extractText(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map((entry) => extractText(entry)).join('')
  if (!value || typeof value !== 'object') return ''

  const record = value as Record<string, unknown>
  if (typeof record.text === 'string') return record.text
  if (typeof record.content === 'string') return record.content
  if (Array.isArray(record.content)) return record.content.map((entry) => extractText(entry)).join('')
  if (Array.isArray(record.parts)) return record.parts.map((entry) => extractText(entry)).join('')
  return ''
}

function extractAssistantMessageContent(payload: unknown): string {
  const root = asRecord(payload)
  if (!root) return ''

  const choices = Array.isArray(root.choices) ? root.choices : []
  const firstChoice = asRecord(choices[0])
  if (!firstChoice) return ''

  const message = asRecord(firstChoice.message)
  if (message && Object.prototype.hasOwnProperty.call(message, 'content')) {
    return extractText(message.content)
  }

  return extractText(firstChoice)
}

function extractJsonObject(raw: string): ParsedTaskPayload | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()

  const candidates = [withoutFence]
  const firstBrace = withoutFence.indexOf('{')
  const lastBrace = withoutFence.lastIndexOf('}')
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(withoutFence.slice(firstBrace, lastBrace + 1))
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown
      const record = asRecord(parsed)
      if (record) return record as ParsedTaskPayload
    } catch {
      // Try next candidate.
    }
  }

  return null
}

function resolveProjectId(rawProjectId: unknown, projects: Project[]): string | undefined {
  const value = readNonEmptyString(rawProjectId)
  if (!value || value.toLowerCase() === 'null') return undefined

  const byId = projects.find((project) => project.id === value)
  if (byId) return byId.id

  const normalized = value.toLowerCase()
  const byName = projects.find((project) => project.name.toLowerCase() === normalized)
  if (byName) return byName.id

  return undefined
}

function buildTaskParserPrompt(projects: Project[], existingTags: string[], forceJson = false): string {
  const projectList =
    projects.length > 0
      ? projects.map((project) => `- ${project.id}: ${project.name}`).join('\n')
      : '- none'

  const tagList = existingTags.length > 0 ? existingTags.join(', ') : 'none'

  return `You are a task creation assistant. The user will describe a task they want to create.

Your job:
1. If the task is clear enough, respond with a JSON task object wrapped in \`\`\`json fences.
2. If clarification is needed, ask exactly ONE short follow-up question in plain text.
3. Never ask more than one question at a time.
4. Keep the same task JSON shape.
${forceJson ? '5. You must output best-guess JSON now. Do not ask a question.' : ''}

Response format:
- For a complete task: \`\`\`json { ... } \`\`\`
- For a question: plain text only, no JSON and no markdown fences

Task JSON shape:
{
  "title": "string (concise, under 80 chars)",
  "subtitle": "string (one-line summary, under 100 chars)",
  "description": "string (full description with context)",
  "priority": "urgent|high|medium|low",
  "projectId": "string|null",
  "subtasks": ["string"],
  "tags": ["string"]
}

Rules:
- Use priority medium when not clearly specified.
- projectId must be one of the listed project IDs or null.
- Match projects by name intent, but return the project ID.
- Return subtasks only when the request clearly implies multiple steps.
- Prefer tags consistent with existing tags when relevant.

Available projects:
${projectList}

Existing tags:
${tagList}`
}

function getFirstUserMessage(messages: ConversationMessage[]): string | null {
  for (const message of messages) {
    if (message.role !== 'user') continue
    const text = message.content.trim()
    if (text) return text
  }
  return null
}

function countAssistantMessages(messages: ConversationMessage[]): number {
  let total = 0
  for (const message of messages) {
    if (message.role === 'assistant') total += 1
  }
  return total
}

async function parseTaskWithGateway(
  messages: ConversationMessage[],
  projects: Project[],
  existingTags: string[],
  options?: { forceJson?: boolean }
): Promise<GatewayResult> {
  let port = DEFAULT_GATEWAY_PORT
  let token: string | undefined

  try {
    const configResult = await window.api.gateway.getConfig()
    const data = configResult?.ok ? asRecord(configResult.data) : null
    const gateway = asRecord(data?.gateway)
    const auth = asRecord(gateway?.auth)

    if (typeof gateway?.port === 'number' && Number.isFinite(gateway.port)) {
      port = gateway.port
    }

    token = readNonEmptyString(auth?.token)
  } catch {
    // Fall back to defaults when config is unavailable.
  }

  const response = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify({
      messages: [
        { role: 'system', content: buildTaskParserPrompt(projects, existingTags, Boolean(options?.forceJson)) },
        ...messages
      ],
      stream: false
    })
  })

  if (!response.ok) {
    throw new Error(`Gateway request failed (${response.status})`)
  }

  const payload = await response.json()
  const rawContent = extractAssistantMessageContent(payload).trim()
  const parsed = extractJsonObject(rawContent)

  if (parsed) {
    const fallbackTitle = getFirstUserMessage(messages) ?? 'New task'
    const title = truncate(readNonEmptyString(parsed.title) ?? fallbackTitle, 80)
    const subtitle = truncate(readNonEmptyString(parsed.subtitle) ?? '', 100)
    const description = readNonEmptyString(parsed.description) ?? subtitle
    const priority = normalizePriority(parsed.priority)
    const projectId = resolveProjectId(parsed.projectId, projects)
    const subtasks = normalizeList(parsed.subtasks).slice(0, 20).map((subtaskTitle) => ({ title: subtaskTitle }))
    const tags = normalizeList(parsed.tags).slice(0, 20)

    return {
      type: 'task',
      task: {
        title,
        description,
        priority,
        projectId,
        subtasks,
        tags,
        source: 'manual'
      }
    }
  }

  return {
    type: 'message',
    message: rawContent || 'Could you share one more detail so I can create this task?'
  }
}

function toSimpleTaskInput(title: string): CreateTaskInput {
  return {
    title,
    priority: 'medium',
    source: 'manual'
  }
}

export function TaskQuickAdd({
  projects,
  existingTags,
  isSaving = false,
  focusSignal = 0,
  onAddTask
}: TaskQuickAddProps) {
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<ConversationMessage[]>([])
  const [flowState, setFlowState] = useState<FlowState>('idle')
  const [parsedTask, setParsedTask] = useState<CreateTaskInput | null>(null)
  const [feedback, setFeedback] = useState<{ tone: FeedbackTone; content: string } | null>(null)

  const inputRef = useRef<HTMLInputElement | null>(null)
  const conversationRef = useRef<HTMLDivElement | null>(null)
  const resetTimerRef = useRef<number | null>(null)

  useEffect(() => {
    if (focusSignal === 0) return
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [focusSignal])

  useEffect(() => {
    const container = conversationRef.current
    if (!container) return
    container.scrollTop = container.scrollHeight
  }, [messages, flowState, parsedTask, feedback])

  useEffect(() => {
    return () => {
      if (resetTimerRef.current !== null) {
        window.clearTimeout(resetTimerRef.current)
      }
    }
  }, [])

  const clearResetTimer = () => {
    if (resetTimerRef.current === null) return
    window.clearTimeout(resetTimerRef.current)
    resetTimerRef.current = null
  }

  const resetConversation = () => {
    clearResetTimer()
    setMessages([])
    setParsedTask(null)
    setFeedback(null)
    setFlowState('idle')
    setInput('')
  }

  const queueReset = (delayMs = SUCCESS_FEEDBACK_MS) => {
    clearResetTimer()
    resetTimerRef.current = window.setTimeout(() => {
      setMessages([])
      setParsedTask(null)
      setFeedback(null)
      setFlowState('idle')
      setInput('')
      inputRef.current?.focus()
    }, delayMs)
  }

  const finalizeCreation = (task: CreateTaskInput, errorMessage?: string) => {
    setFlowState('creating')
    setParsedTask(null)
    onAddTask(task)

    if (errorMessage) {
      setFeedback({ tone: 'error', content: errorMessage })
      clearResetTimer()
      resetTimerRef.current = window.setTimeout(() => {
        setFeedback({ tone: 'success', content: `✅ Task created: ${task.title}` })
        queueReset(SUCCESS_FEEDBACK_MS)
      }, ERROR_FEEDBACK_MS)
      return
    }

    setFeedback({ tone: 'success', content: `✅ Task created: ${task.title}` })
    queueReset(SUCCESS_FEEDBACK_MS)
  }

  const forceCreateWithBestGuess = async (conversation: ConversationMessage[], fallbackInput: string) => {
    const fallbackTitle = getFirstUserMessage(conversation) ?? fallbackInput

    try {
      const forcedResult = await parseTaskWithGateway(conversation, projects, existingTags, { forceJson: true })
      if (forcedResult.type === 'task') {
        finalizeCreation(forcedResult.task)
        return
      }
    } catch (error) {
      console.error('Failed to force-create task from conversation:', error)
      finalizeCreation(
        toSimpleTaskInput(fallbackTitle),
        "⚠️ Couldn't reach your AI. Creating as a simple task."
      )
      return
    }

    finalizeCreation(toSimpleTaskInput(fallbackTitle))
  }

  const submit = async () => {
    const trimmed = input.trim()
    if (!trimmed || isSaving || flowState === 'parsing' || flowState === 'creating') return

    setInput('')
    setFeedback(null)
    setParsedTask(null)

    if (isVeryShortInput(trimmed) && messages.length === 0) {
      finalizeCreation(toSimpleTaskInput(trimmed))
      return
    }

    const nextMessages: ConversationMessage[] = [...messages, { role: 'user', content: trimmed }]
    setMessages(nextMessages)
    setFlowState('parsing')

    try {
      const result = await parseTaskWithGateway(nextMessages, projects, existingTags)

      if (result.type === 'task') {
        setParsedTask(result.task)
        setFlowState('preview')
        return
      }

      const assistantTurns = countAssistantMessages(nextMessages)
      if (assistantTurns >= MAX_CLARIFICATION_TURNS) {
        const forceMessage: ConversationMessage = { role: 'assistant', content: 'Let me create this with what I have.' }
        const forcedConversation = [...nextMessages, forceMessage]
        setMessages(forcedConversation)
        await forceCreateWithBestGuess(forcedConversation, trimmed)
        return
      }

      setMessages([...nextMessages, { role: 'assistant', content: result.message }])
      setFlowState('clarifying')
    } catch (error) {
      console.error('Failed to parse task from natural language input:', error)
      finalizeCreation(
        toSimpleTaskInput(trimmed),
        "⚠️ Couldn't reach your AI. Creating as a simple task."
      )
    }
  }

  const handleCreateFromPreview = () => {
    if (!parsedTask) return
    finalizeCreation(parsedTask)
  }

  const handleEditFromPreview = () => {
    if (!parsedTask) return
    finalizeCreation(parsedTask)
  }

  const parsedProject = parsedTask?.projectId
    ? projects.find((project) => project.id === parsedTask.projectId) ?? null
    : null

  const parsedSubtaskCount = parsedTask?.subtasks?.length ?? 0
  const parsedTags = parsedTask?.tags ?? []
  const previewDescription = parsedTask?.description ? truncate(parsedTask.description, 160) : ''

  const isInputDisabled = isSaving || flowState === 'parsing' || flowState === 'creating'
  const showConversation = messages.length > 0 || flowState === 'parsing' || parsedTask !== null || feedback !== null

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="relative">
        <Input
          ref={inputRef}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault()
              void submit()
              return
            }

            if (event.key === 'Escape') {
              event.preventDefault()
              resetConversation()
            }
          }}
          placeholder="Describe a task... e.g. 'High priority: redesign the login page for Pinchr with dark theme support'"
          className="h-11 pr-10"
          disabled={isInputDisabled}
        />
        {(flowState === 'parsing' || flowState === 'creating') && (
          <Loader2 className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-text-muted" />
        )}
      </div>

      {showConversation && (
        <div ref={conversationRef} className="mt-3 max-h-[22rem] space-y-2 overflow-y-auto pr-1">
          {messages.map((message, index) => (
            <div key={`${message.role}-${index}`} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                  message.role === 'user' ? 'bg-accent/20 text-text-primary' : 'bg-surface-2 text-text-primary'
                }`}
              >
                {message.content}
              </div>
            </div>
          ))}

          {flowState === 'parsing' && (
            <div className="flex justify-start">
              <div className="max-w-[80%] rounded-2xl bg-surface-2 px-3 py-2 text-sm text-text-muted">
                <span className="inline-flex items-center gap-2">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
                  Let me break that down...
                </span>
              </div>
            </div>
          )}

          {feedback && (
            <div className="flex justify-start">
              <div
                className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                  feedback.tone === 'success'
                    ? 'border border-emerald-500/30 bg-emerald-500/15 text-emerald-200'
                    : 'border border-orange-500/30 bg-orange-500/15 text-orange-200'
                }`}
              >
                {feedback.content}
              </div>
            </div>
          )}

          {parsedTask && (
            <div className="rounded-xl border border-border bg-surface-2 p-3">
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-text-primary">{parsedTask.title}</p>
                  <Badge className={`border capitalize ${PRIORITY_BADGE_CLASS[parsedTask.priority ?? 'medium']}`}>
                    {parsedTask.priority ?? 'medium'}
                  </Badge>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
                  <span>Project: {parsedProject?.name ?? 'Unassigned'}</span>
                  <span>•</span>
                  <span>Subtasks: {parsedSubtaskCount}</span>
                </div>

                {previewDescription && <p className="text-xs text-text-secondary">{previewDescription}</p>}

                {parsedTags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {parsedTags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-[11px]">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}

                <div className="flex flex-wrap gap-2 pt-1">
                  <Button size="sm" onClick={handleCreateFromPreview} disabled={isSaving || flowState === 'creating'}>
                    Create Task
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleEditFromPreview}
                    disabled={isSaving || flowState === 'creating'}
                  >
                    Edit
                  </Button>
                  <Button size="sm" variant="ghost" onClick={resetConversation} disabled={flowState === 'creating'}>
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
