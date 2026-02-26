import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState, useMemo } from 'react'
import type {
  IpcResult,
  GatewayHealth,
  Session,
  Message,
  GatewayConfig,
  MessageContentPart,
  StreamChunk,
  AgentSessionSummary,
  ToolsSessionStatus,
  CronJobSummary,
  CronRunSummary,
  TopicRouteContext
} from '../../../shared/types'

const api = () => window.api

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function readString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function readBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (normalized === 'true' || normalized === 'enabled' || normalized === 'on' || normalized === 'running' || normalized === 'active') return true
    if (normalized === 'false' || normalized === 'disabled' || normalized === 'off' || normalized === 'idle') return false
  }
  return undefined
}

function readNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const normalized = value.replace(/[,]/g, '').trim()
    if (!normalized) return undefined
    const parsed = Number(normalized)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

function deriveAgentFromSessionKey(sessionKey: string): string {
  const parts = sessionKey.split(':').map((part) => part.trim()).filter(Boolean)
  if (parts.length === 0) return sessionKey
  return parts[parts.length - 1]
}

function toArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function getCollection(payload: unknown, keys: string[]): unknown[] {
  if (Array.isArray(payload)) return payload
  const root = asRecord(payload)
  if (!root) return []

  for (const key of keys) {
    const candidate = root[key]
    if (Array.isArray(candidate)) return candidate
  }

  return []
}

function normalizeAgentSessions(payload: unknown): AgentSessionSummary[] {
  const entries = getCollection(payload, ['sessions', 'data', 'items'])

  return entries
    .map((entry): AgentSessionSummary | null => {
      const raw = asRecord(entry)
      if (!raw) return null

      const key =
        readString(raw.key) ??
        readString(raw.sessionKey) ??
        readString(raw.session_id) ??
        readString(raw.id)

      if (!key) return null

      const status =
        readString(raw.status) ??
        readString(raw.state) ??
        (raw.running === true ? 'running' : 'idle')

      const sessionKey = readString(raw.sessionKey) ?? readString(raw.session_id) ?? key
      const agent =
        readString(raw.agent) ??
        readString(raw.agentName) ??
        deriveAgentFromSessionKey(sessionKey)

      const model = readString(raw.model)
      const createdAt = readString(raw.createdAt) ?? readString(raw.created_at)
      const lastActivity = readString(raw.lastActivity) ?? readString(raw.last_activity) ?? readString(raw.updatedAt) ?? readString(raw.updated_at)

      return {
        key,
        sessionKey,
        agent,
        status,
        model,
        createdAt,
        lastActivity,
        metadata: raw
      }
    })
    .filter((session): session is AgentSessionSummary => !!session)
}

function extractTokenValue(text: string, patterns: RegExp[]): number | undefined {
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (!match?.[1]) continue
    const value = readNumber(match[1])
    if (value !== undefined) return value
  }
  return undefined
}

function parseSessionStatusText(text: string): Partial<ToolsSessionStatus> {
  const inputTokens = extractTokenValue(text, [/input(?:\s+tokens?)?[:=]\s*([\d,.]+)/i, /in[:=]\s*([\d,.]+)/i])
  const outputTokens = extractTokenValue(text, [/output(?:\s+tokens?)?[:=]\s*([\d,.]+)/i, /out[:=]\s*([\d,.]+)/i])
  const totalTokens = extractTokenValue(text, [/total(?:\s+tokens?)?[:=]\s*([\d,.]+)/i, /tokens?[:=]\s*([\d,.]+)/i])
  const activeSessions = extractTokenValue(text, [/active(?:\s+sessions?)?[:=]\s*(\d+)/i])
  const costUsd = extractTokenValue(text, [/\$([\d,.]+)/i, /cost(?:_usd)?[:=]\s*([\d,.]+)/i])
  const modelMatch = text.match(/model[:=]\s*(.+)/i)
  const thinkingMatch = text.match(/thinking[:=]\s*(.+)/i)

  return {
    inputTokens,
    outputTokens,
    totalTokens,
    costUsd,
    activeSessions,
    model: modelMatch?.[1]?.trim(),
    thinking: thinkingMatch?.[1]?.trim()
  }
}

function normalizeToolsSessionStatus(payload: unknown): ToolsSessionStatus {
  if (typeof payload === 'string') {
    return {
      raw: payload,
      statusText: payload,
      ...parseSessionStatusText(payload)
    }
  }

  const raw = asRecord(payload)
  if (!raw) {
    return { raw: '' }
  }

  const statusText = readString(raw.statusText) ?? readString(raw.raw) ?? ''
  const tokenUsage = asRecord(raw.tokenUsage) ?? asRecord(raw.token_usage)
  const fallbackTokens = parseSessionStatusText(statusText)

  return {
    raw: statusText,
    statusText: readString(raw.statusText) ?? statusText,
    model: readString(raw.model) ?? fallbackTokens.model,
    thinking: readString(raw.thinking) ?? fallbackTokens.thinking,
    inputTokens: readNumber(raw.inputTokens) ?? readNumber(tokenUsage?.input) ?? fallbackTokens.inputTokens,
    outputTokens: readNumber(raw.outputTokens) ?? readNumber(tokenUsage?.output) ?? fallbackTokens.outputTokens,
    totalTokens: readNumber(raw.totalTokens) ?? readNumber(tokenUsage?.total) ?? fallbackTokens.totalTokens,
    costUsd: readNumber(raw.costUsd) ?? readNumber(raw.cost) ?? readNumber(tokenUsage?.costUsd) ?? fallbackTokens.costUsd,
    activeSessions: readNumber(raw.activeSessions) ?? fallbackTokens.activeSessions,
    timestamp: readString(raw.timestamp),
    details: raw
  }
}

function normalizeCronSchedule(rawSchedule: unknown, rawJob: Record<string, unknown>): CronJobSummary['schedule'] {
  const scheduleRecord = asRecord(rawSchedule)
  const kind = readString(scheduleRecord?.kind)?.toLowerCase()

  const cronExpr =
    readString(scheduleRecord?.expr) ??
    readString(scheduleRecord?.cron) ??
    readString(rawJob.cron) ??
    readString(rawJob.expression)
  const cronTz =
    readString(scheduleRecord?.tz) ??
    readString(scheduleRecord?.timezone) ??
    readString(rawJob.tz) ??
    readString(rawJob.timezone)

  const everyMs =
    readNumber(scheduleRecord?.everyMs) ??
    readNumber(scheduleRecord?.every_ms) ??
    readNumber(scheduleRecord?.ms) ??
    readNumber(rawJob.everyMs) ??
    readNumber(rawJob.every_ms)

  const at =
    readString(scheduleRecord?.at) ??
    readString(scheduleRecord?.time) ??
    readString(rawJob.at)

  if (kind === 'cron' && cronExpr) {
    return { kind: 'cron', expr: cronExpr, ...(cronTz ? { tz: cronTz } : {}) }
  }

  if (kind === 'every' && everyMs && everyMs > 0) {
    return { kind: 'every', everyMs }
  }

  if (kind === 'at' && at) {
    return { kind: 'at', at }
  }

  if (cronExpr) {
    return { kind: 'cron', expr: cronExpr, ...(cronTz ? { tz: cronTz } : {}) }
  }

  if (everyMs && everyMs > 0) {
    return { kind: 'every', everyMs }
  }

  if (at) {
    return { kind: 'at', at }
  }

  const scheduleText = readString(rawSchedule)
  if (scheduleText) return scheduleText

  return 'custom'
}

function normalizeCronJobs(payload: unknown): CronJobSummary[] {
  const entries = getCollection(payload, ['jobs', 'schedules', 'data', 'items'])

  return entries
    .map((entry): CronJobSummary | null => {
      const raw = asRecord(entry)
      if (!raw) return null

      const id = readString(raw.id) ?? readString(raw.jobId) ?? readString(raw.job_id) ?? readString(raw.name)
      if (!id) return null

      const name = readString(raw.name) ?? id
      const schedule = normalizeCronSchedule(raw.schedule, raw)
      const paused = readBoolean(raw.paused)
      const enabled = readBoolean(raw.enabled) ?? readBoolean(raw.active) ?? (paused !== undefined ? !paused : true)
      // OpenClaw stores run timestamps in state.nextRunAtMs / state.lastRunAtMs (epoch ms)
      const state = raw.state && typeof raw.state === 'object' ? (raw.state as Record<string, unknown>) : null
      const nextRunMs = state ? readNumber(state.nextRunAtMs) : undefined
      const lastRunMs = state ? readNumber(state.lastRunAtMs) : undefined
      const nextRun = readString(raw.nextRun) ?? readString(raw.next_run) ?? (nextRunMs ? new Date(nextRunMs).toISOString() : undefined)
      const lastRun = readString(raw.lastRun) ?? readString(raw.last_run) ?? (lastRunMs ? new Date(lastRunMs).toISOString() : undefined)
      const agent = readString(raw.agent)
      const workflow = readString(raw.workflow) ?? readString(raw.command)

      return {
        id,
        name,
        schedule,
        enabled,
        nextRun,
        lastRun,
        agent,
        workflow,
        metadata: raw
      }
    })
    .filter((job): job is CronJobSummary => !!job)
}

function normalizeCronRuns(payload: unknown, fallbackJobId: string): CronRunSummary[] {
  const entries = getCollection(payload, ['runs', 'data', 'items'])

  return entries
    .map((entry): CronRunSummary | null => {
      const raw = asRecord(entry)
      if (!raw) return null

      const id = readString(raw.id) ?? readString(raw.runId) ?? readString(raw.run_id) ?? readString(raw.sessionId) ?? readString(raw.sessionKey)
      if (!id) return null

      const jobId = readString(raw.jobId) ?? readString(raw.job_id) ?? readString(raw.job) ?? fallbackJobId
      const status = readString(raw.status) ?? readString(raw.result) ?? readString(raw.action) ?? 'unknown'

      // OpenClaw stores timestamps as epoch ms (runAtMs, ts) — convert to ISO strings
      const runAtMs = readNumber(raw.runAtMs) ?? readNumber(raw.ts)
      const startedAt = readString(raw.startedAt) ?? readString(raw.started_at) ?? readString(raw.createdAt) ?? readString(raw.created_at) ?? (runAtMs ? new Date(runAtMs).toISOString() : undefined)
      const endMs = readNumber(raw.ts) // 'finished' action ts is the end time
      const completedAt = readString(raw.completedAt) ?? readString(raw.completed_at) ?? readString(raw.finishedAt) ?? readString(raw.finished_at) ?? (endMs && raw.action === 'finished' ? new Date(endMs).toISOString() : undefined)
      const durationMs = readNumber(raw.durationMs) ?? readNumber(raw.duration_ms)

      const tokenUsage = asRecord(raw.tokenUsage) ?? asRecord(raw.token_usage)
      const tokens = readNumber(raw.tokens) ?? readNumber(tokenUsage?.total)
      const costUsd = readNumber(raw.costUsd) ?? readNumber(raw.cost) ?? readNumber(tokenUsage?.costUsd)
      const summary = readString(raw.summary) ?? readString(raw.outputSummary) ?? readString(raw.output)

      return {
        id,
        jobId,
        status,
        startedAt,
        completedAt,
        durationMs,
        tokens,
        costUsd,
        summary,
        metadata: raw
      }
    })
    .filter((run): run is CronRunSummary => !!run)
}

function isSessionActive(status: string): boolean {
  const normalized = status.trim().toLowerCase()
  return normalized.includes('running') || normalized.includes('active') || normalized.includes('busy')
}

function normalizeRole(role: unknown): Message['role'] {
  const normalized = typeof role === 'string' ? role.trim().toLowerCase() : ''

  if (normalized === 'user' || normalized === 'human') return 'user'
  if (normalized === 'assistant' || normalized === 'ai' || normalized === 'model' || normalized === 'bot') return 'assistant'
  return 'system'
}

function normalizeMessage(message: Message): Message {
  const normalizedParts = normalizeParts((message as Message & { parts?: unknown }).parts)
  const normalizedContent = typeof message.content === 'string' ? message.content : String(message.content ?? '')

  return {
    ...message,
    role: normalizeRole((message as { role?: unknown }).role),
    content: normalizedContent,
    parts: normalizedParts.length > 0 ? normalizedParts : normalizedContent.trim() ? [{ type: 'text', text: normalizedContent }] : []
  }
}

function normalizeParts(parts: unknown): MessageContentPart[] {
  if (!Array.isArray(parts)) return []

  const normalized: MessageContentPart[] = []
  for (const rawPart of parts) {
    const part = rawPart as {
      type?: unknown
      text?: unknown
      image_url?: unknown
    }

    if (part.type === 'text' && typeof part.text === 'string') {
      normalized.push({ type: 'text', text: part.text })
      continue
    }

    if (part.type === 'image_url') {
      const image = part.image_url as { url?: unknown } | string | undefined
      const url =
        typeof image === 'string'
          ? image
          : typeof image?.url === 'string'
            ? image.url
            : ''

      if (url) {
        normalized.push({
          type: 'image_url',
          image_url: { url }
        })
      }
    }
  }

  return normalized
}

export function useGatewayHealth() {
  return useQuery({
    queryKey: ['gateway', 'health'],
    queryFn: async (): Promise<GatewayHealth | null> => {
      const result: IpcResult<GatewayHealth> = await api().gateway.health()
      if (!result.ok) return null
      return result.data ?? null
    },
    refetchInterval: 10000
  })
}

export function useSessions() {
  return useQuery({
    queryKey: ['gateway', 'sessions'],
    queryFn: async (): Promise<Session[]> => {
      const result: IpcResult<Session[]> = await api().gateway.getSessions()
      if (!result.ok) return []
      return result.data ?? []
    },
    refetchInterval: 5000
  })
}

/**
 * Discover the main agent session key (e.g. `agent:main:direct:drew`).
 * This is the unified session where Slack/WhatsApp/Pinchr messages should all land.
 * Returns null if discovery fails (falls back to Pinchr-specific sessions).
 */
export function useMainSession() {
  return useQuery({
    queryKey: ['gateway', 'main-session'],
    queryFn: async (): Promise<string | null> => {
      const result: IpcResult<string | null> = await api().gateway.getMainSession()
      if (!result.ok) return null
      return result.data ?? null
    },
    staleTime: 60_000, // Cache for 1 minute
    refetchInterval: 120_000, // Re-check every 2 minutes
    retry: 2
  })
}

interface SessionHistoryOptions {
  limit?: number
  refetchIntervalMs?: number
}

export function useSessionHistory(
  sessionKey: string | null,
  optionsOrInterval: number | SessionHistoryOptions = 5000
) {
  const options =
    typeof optionsOrInterval === 'number'
      ? { refetchIntervalMs: optionsOrInterval }
      : optionsOrInterval
  const limit = Math.min(Math.max(options.limit ?? 50, 10), 5000)
  const refetchIntervalMs = options.refetchIntervalMs ?? 5000

  return useQuery({
    queryKey: ['gateway', 'session-history', sessionKey, limit],
    queryFn: async (): Promise<Message[]> => {
      if (!sessionKey) return []
      const result: IpcResult<Message[]> = await api().gateway.getSessionHistory(sessionKey, limit)
      if (!result.ok) return []
      return (result.data ?? []).map(normalizeMessage)
    },
    enabled: !!sessionKey,
    refetchInterval: sessionKey ? refetchIntervalMs : false
  })
}

export function useToolsSessionsList(parameters?: Record<string, unknown>, refetchIntervalMs = 10000) {
  return useQuery({
    queryKey: ['gateway', 'tools', 'sessions-list', parameters ?? {}],
    queryFn: async (): Promise<AgentSessionSummary[]> => {
      const result: IpcResult<unknown> = await api().gateway.toolsSessionsList(parameters)
      if (!result.ok) return []
      return normalizeAgentSessions(result.data)
    },
    refetchInterval: refetchIntervalMs
  })
}

export function useToolsSessionStatus(parameters?: Record<string, unknown>, refetchIntervalMs = 10000) {
  return useQuery({
    queryKey: ['gateway', 'tools', 'session-status', parameters ?? {}],
    queryFn: async (): Promise<ToolsSessionStatus> => {
      const result: IpcResult<unknown> = await api().gateway.toolsSessionStatus(parameters)
      if (!result.ok) return { raw: '' }
      return normalizeToolsSessionStatus(result.data)
    },
    refetchInterval: refetchIntervalMs
  })
}

export function useCronList(refetchIntervalMs = 30000) {
  return useQuery({
    queryKey: ['gateway', 'tools', 'cron-list'],
    queryFn: async (): Promise<CronJobSummary[]> => {
      const result: IpcResult<unknown> = await api().gateway.toolsCronList()
      if (!result.ok) return []
      return normalizeCronJobs(result.data)
    },
    refetchInterval: refetchIntervalMs
  })
}

export function useCronRuns(jobId: string | null, limit = 20, refetchIntervalMs = 30000) {
  return useQuery({
    queryKey: ['gateway', 'tools', 'cron-runs', jobId, limit],
    queryFn: async (): Promise<CronRunSummary[]> => {
      if (!jobId) return []
      const result: IpcResult<unknown> = await api().gateway.toolsCronRuns(jobId, limit)
      if (!result.ok) return []
      return normalizeCronRuns(result.data, jobId)
    },
    enabled: !!jobId,
    refetchInterval: jobId ? refetchIntervalMs : false
  })
}

export function useCronRunsForJobs(jobs: CronJobSummary[] | undefined, limit = 20, refetchIntervalMs = 30000) {
  const jobIds = useMemo(() => (jobs ?? []).map((job) => job.id), [jobs])

  return useQuery({
    queryKey: ['gateway', 'tools', 'cron-runs-by-job', jobIds, limit],
    queryFn: async (): Promise<Record<string, CronRunSummary[]>> => {
      if (jobIds.length === 0) return {}

      const runsByJob: Record<string, CronRunSummary[]> = {}
      await Promise.all(
        jobIds.map(async (jobId) => {
          const result: IpcResult<unknown> = await api().gateway.toolsCronRuns(jobId, limit)
          runsByJob[jobId] = result.ok ? normalizeCronRuns(result.data, jobId) : []
        })
      )

      return runsByJob
    },
    enabled: jobIds.length > 0,
    refetchInterval: jobIds.length > 0 ? refetchIntervalMs : false
  })
}

export function useSetCronJobEnabled() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ jobId, enabled }: { jobId: string; enabled: boolean }) => {
      const result: IpcResult<unknown> = await api().gateway.toolsCronSetEnabled(jobId, enabled)
      if (!result.ok) throw new Error(result.error)
      return result.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gateway', 'tools', 'cron-list'] })
      queryClient.invalidateQueries({ queryKey: ['gateway', 'tools', 'cron-runs-by-job'] })
      queryClient.invalidateQueries({ queryKey: ['gateway', 'tools', 'cron-runs'] })
    }
  })
}

export function useRunCronJob() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (jobId: string) => {
      const result: IpcResult<unknown> = await api().gateway.toolsCronRun(jobId)
      if (!result.ok) throw new Error(result.error ?? 'Failed to run cron job')
      return result.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gateway', 'tools', 'cron-list'] })
      queryClient.invalidateQueries({ queryKey: ['gateway', 'tools', 'cron-runs-by-job'] })
      queryClient.invalidateQueries({ queryKey: ['gateway', 'tools', 'cron-runs'] })
    }
  })
}

export function useRemoveCronJob() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (jobId: string) => {
      const result: IpcResult<unknown> = await api().gateway.toolsCronRemove(jobId)
      if (!result.ok) throw new Error(result.error ?? 'Failed to remove cron job')
      return result.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gateway', 'tools', 'cron-list'] })
      queryClient.invalidateQueries({ queryKey: ['gateway', 'tools', 'cron-runs-by-job'] })
      queryClient.invalidateQueries({ queryKey: ['gateway', 'tools', 'cron-runs'] })
    }
  })
}

export function useActiveSessionHistories(
  sessions: AgentSessionSummary[] | undefined,
  options?: {
    refetchIntervalMs?: number
    paused?: boolean
    limit?: number
  }
) {
  const refetchIntervalMs = options?.refetchIntervalMs ?? 4000
  const paused = options?.paused ?? false

  const activeSessionKeys = useMemo(
    () => (sessions ?? []).filter((session) => isSessionActive(session.status)).map((session) => session.sessionKey),
    [sessions]
  )

  return useQuery({
    queryKey: ['gateway', 'active-session-histories', activeSessionKeys, options?.limit ?? 50],
    queryFn: async (): Promise<Record<string, Message[]>> => {
      if (activeSessionKeys.length === 0) return {}

      const histories: Record<string, Message[]> = {}
      await Promise.all(
        activeSessionKeys.map(async (sessionKey) => {
          const result: IpcResult<Message[]> = await api().gateway.getSessionHistory(sessionKey)
          histories[sessionKey] = result.ok ? (result.data ?? []).map(normalizeMessage) : []
        })
      )

      return histories
    },
    enabled: activeSessionKeys.length > 0,
    refetchInterval: activeSessionKeys.length > 0 && !paused ? refetchIntervalMs : false
  })
}

export function useSendMessage() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ sessionKey, message }: { sessionKey: string; message: string }) => {
      const result = await api().gateway.sendMessage(sessionKey, message)
      if (!result.ok) throw new Error(result.error)
      return result.data
    },
    onMutate: async ({ sessionKey, message }) => {
      // Optimistic update - add user message immediately
      await queryClient.cancelQueries({ queryKey: ['gateway', 'session-history', sessionKey] })
      
      const previousMessages = queryClient.getQueryData(['gateway', 'session-history', sessionKey]) as Message[] || []
      const optimisticUserMessage: Message = {
        role: 'user',
        content: message,
        timestamp: new Date().toISOString()
      }
      
      queryClient.setQueryData(['gateway', 'session-history', sessionKey], [...previousMessages, optimisticUserMessage])
      
      return { previousMessages }
    },
    onError: (_, variables, context) => {
      // Revert optimistic update on error
      if (context) {
        queryClient.setQueryData(['gateway', 'session-history', variables.sessionKey], context.previousMessages)
      }
    },
    onSettled: (_, __, variables) => {
      // Only refresh after a short delay, not immediately
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['gateway', 'session-history', variables.sessionKey] })
      }, 2000)
    }
  })
}

export function useGatewayConfig() {
  return useQuery({
    queryKey: ['gateway', 'config'],
    queryFn: async (): Promise<GatewayConfig | null> => {
      const result: IpcResult<GatewayConfig> = await api().gateway.getConfig()
      if (!result.ok) return null
      return result.data ?? null
    },
    refetchInterval: 30000
  })
}

export function useUpdateConfig() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (config: Record<string, unknown>) => {
      const result = await api().gateway.updateConfig(config)
      if (!result.ok) throw new Error(result.error)
      return result.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gateway', 'config'] })
    }
  })
}

export function useRestartGateway() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const result = await api().gateway.restart()
      if (!result.ok) throw new Error(result.error)
      return result.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gateway'] })
    }
  })
}

export function useStartGateway() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const result = await api().gateway.startShell()
      if (!result.ok) throw new Error(result.error || 'Failed to start gateway')
      return result.data
    },
    onSuccess: () => {
      // Poll until gateway comes back online
      const pollInterval = setInterval(async () => {
        try {
          const health = await api().gateway.health()
          if (health.ok && health.data) {
            clearInterval(pollInterval)
            queryClient.invalidateQueries({ queryKey: ['gateway'] })
          }
        } catch { /* still starting */ }
      }, 2000)
      // Timeout after 30s
      setTimeout(() => clearInterval(pollInterval), 30000)
    }
  })
}

export function useWorkspaceFiles() {
  return useQuery({
    queryKey: ['files', 'list'],
    queryFn: async (): Promise<string[]> => {
      const result: IpcResult<string[]> = await api().files.list()
      if (!result.ok) return []
      return result.data ?? []
    }
  })
}

export function useFileContent(filename: string | null) {
  return useQuery({
    queryKey: ['files', 'content', filename],
    queryFn: async (): Promise<string> => {
      if (!filename) return ''
      const result: IpcResult<string> = await api().files.read(filename)
      if (!result.ok) throw new Error(result.error)
      return result.data ?? ''
    },
    enabled: !!filename
  })
}

export function useSaveFile() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ filename, content }: { filename: string; content: string }) => {
      const result = await api().files.write(filename, content)
      if (!result.ok) throw new Error(result.error)
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['files', 'content', variables.filename] })
    }
  })
}

export function useAllSessionHistories(sessions: { key: string }[] | undefined) {
  return useQuery({
    queryKey: ['gateway', 'all-session-histories', sessions?.map(s => s.key)],
    queryFn: async (): Promise<Record<string, Message[]>> => {
      if (!sessions) return {}
      
      const allHistories: Record<string, Message[]> = {}
      
      await Promise.all(
        sessions.map(async (session) => {
          const result: IpcResult<Message[]> = await api().gateway.getSessionHistory(session.key)
          allHistories[session.key] = result.ok ? (result.data ?? []).map(normalizeMessage) : []
        })
      )
      
      return allHistories
    },
    enabled: !!sessions && sessions.length > 0,
    refetchInterval: 10000
  })
}

export function useStreamMessage() {
  const cleanupFunctionsRef = useRef<Array<() => void>>([])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupFunctionsRef.current.forEach(cleanup => cleanup())
    }
  }, [])

  return useMutation({
    mutationFn: async ({
      sessionKey,
      message,
      onChunk,
      workspaceContext,
      sessionUser,
      mainSessionKey
    }: {
      sessionKey: string
      message: string | MessageContentPart[]
      onChunk: (payload: StreamChunk) => void
      workspaceContext?: { name: string; systemPromptAddition: string }
      sessionUser?: string
      /** When set, routes to the main agent session instead of the Pinchr-specific session */
      mainSessionKey?: string
    }) => {
      const result = await api().gateway.streamMessage(sessionKey, message, workspaceContext, sessionUser, mainSessionKey)
      if (!result.ok) throw new Error(result.error)
      
      const streamId = result.data!
      
      // Setup chunk handler
      const chunkCleanup = api().gateway.onStreamChunk(streamId, (data) => {
        onChunk(data)
      })
      
      // Setup error handler
      const errorCleanup = api().gateway.onStreamError(streamId, (data) => {
        console.error('Stream error:', data.error)
        onChunk({ streamId, content: '', done: true, error: data.error || 'Stream error' }) // Mark as done on error
      })
      
      cleanupFunctionsRef.current.push(chunkCleanup, errorCleanup)
      
      return streamId
    }
  })
}

export function useRouteMessage() {
  const cleanupFunctionsRef = useRef<Array<() => void>>([])

  useEffect(() => {
    return () => {
      cleanupFunctionsRef.current.forEach((cleanup) => cleanup())
    }
  }, [])

  return useMutation({
    mutationFn: async ({
      mainSessionKey,
      message,
      onChunk,
      routeContext
    }: {
      mainSessionKey: string
      message: string
      onChunk: (payload: StreamChunk) => void
      routeContext?: TopicRouteContext
    }) => {
      const result = await api().gateway.routeMessage(mainSessionKey, message, routeContext)
      if (!result.ok) throw new Error(result.error)

      const streamId = result.data!

      const chunkCleanup = api().gateway.onStreamChunk(streamId, (data) => {
        onChunk(data)
      })

      const errorCleanup = api().gateway.onStreamError(streamId, (data) => {
        console.error('Route stream error:', data.error)
        onChunk({ streamId, content: '', done: true, error: data.error || 'Stream error' })
      })

      cleanupFunctionsRef.current.push(chunkCleanup, errorCleanup)

      return streamId
    }
  })
}

// Debounce hook
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    return () => {
      clearTimeout(handler)
    }
  }, [value, delay])

  return debouncedValue
}

export interface SearchResult {
  sessionKey: string
  sessionName: string
  channel: string
  message: Message
  snippet: string
}

export function useSearchMessages(query: string, options?: { enabled?: boolean }) {
  const enabled = options?.enabled ?? true
  const { data: sessions } = useSessions()
  const debouncedQuery = useDebounce(query.trim(), 300)
  const shouldSearch = enabled && debouncedQuery.length > 0
  const { data: allHistories } = useAllSessionHistories(shouldSearch ? sessions : undefined)

  const results = useMemo((): SearchResult[] => {
    if (!shouldSearch || !sessions || !allHistories) return []

    const searchResults: SearchResult[] = []
    const searchTerm = debouncedQuery.toLowerCase()

    sessions.forEach(session => {
      const messages = allHistories[session.key] || []
      messages.forEach(message => {
        if (message.content.toLowerCase().includes(searchTerm)) {
          const content = message.content
          const index = content.toLowerCase().indexOf(searchTerm)
          
          // Create a snippet around the match
          const start = Math.max(0, index - 50)
          const end = Math.min(content.length, index + searchTerm.length + 50)
          const snippet = (start > 0 ? '...' : '') + 
                         content.slice(start, end) + 
                         (end < content.length ? '...' : '')

          const displayName = session.key.includes(':') 
            ? session.key.split(':').pop() || session.key 
            : session.key
          
          searchResults.push({
            sessionKey: session.key,
            sessionName: displayName,
            channel: session.channel || 'unknown',
            message,
            snippet
          })
        }
      })
    })

    // Sort by timestamp (most recent first)
    return searchResults.sort((a, b) => 
      new Date(b.message.timestamp || 0).getTime() - new Date(a.message.timestamp || 0).getTime()
    ).slice(0, 20) // Limit to 20 results for performance
  }, [allHistories, debouncedQuery, sessions, shouldSearch])

  return { results, isLoading: shouldSearch && (!sessions || !allHistories) }
}
