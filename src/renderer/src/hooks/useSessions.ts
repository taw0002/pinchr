import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { IpcResult } from '../../../shared/types'

const api = () => window.api

// ── Types ──────────────────────────────────────────────────────────────

export interface ProcessEntry {
  sessionId: string
  name: string
  command: string
  status: 'running' | 'completed' | 'failed'
  startedAt?: string
  completedAt?: string
  pid?: number
  exitCode?: number
  metadata?: Record<string, unknown>
}

// ── Normalizers ────────────────────────────────────────────────────────

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function readString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
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

function normalizeStatus(raw: string | undefined): ProcessEntry['status'] {
  if (!raw) return 'completed'
  const lower = raw.trim().toLowerCase()
  if (lower === 'running' || lower === 'active' || lower === 'busy') return 'running'
  if (lower === 'failed' || lower === 'error' || lower === 'crashed') return 'failed'
  return 'completed'
}

function normalizeProcessEntries(payload: unknown): ProcessEntry[] {
  const entries = getCollection(payload, ['processes', 'sessions', 'data', 'items'])

  return entries
    .map((entry): ProcessEntry | null => {
      const raw = asRecord(entry)
      if (!raw) return null

      const sessionId =
        readString(raw.sessionId) ??
        readString(raw.session_id) ??
        readString(raw.id) ??
        readString(raw.pid?.toString())
      if (!sessionId) return null

      const name =
        readString(raw.name) ??
        readString(raw.label) ??
        readString(raw.agent) ??
        sessionId

      const command =
        readString(raw.command) ??
        readString(raw.cmd) ??
        readString(raw.script) ??
        ''

      const status = normalizeStatus(readString(raw.status) ?? readString(raw.state))
      const startedAt = readString(raw.startedAt) ?? readString(raw.started_at) ?? readString(raw.createdAt) ?? readString(raw.created_at)
      const completedAt = readString(raw.completedAt) ?? readString(raw.completed_at) ?? readString(raw.finishedAt) ?? readString(raw.finished_at)
      const pid = typeof raw.pid === 'number' ? raw.pid : undefined
      const exitCode = typeof raw.exitCode === 'number' ? raw.exitCode : typeof raw.exit_code === 'number' ? (raw.exit_code as number) : undefined

      return { sessionId, name, command, status, startedAt, completedAt, pid, exitCode, metadata: raw }
    })
    .filter((entry): entry is ProcessEntry => !!entry)
}

function normalizeLogLines(payload: unknown): string[] {
  if (typeof payload === 'string') return payload.split('\n')
  if (Array.isArray(payload)) return payload.map((line) => (typeof line === 'string' ? line : JSON.stringify(line)))
  const record = asRecord(payload)
  if (!record) return []
  const lines = record.lines ?? record.output ?? record.log ?? record.data
  if (typeof lines === 'string') return lines.split('\n')
  if (Array.isArray(lines)) return lines.map((l) => (typeof l === 'string' ? l : JSON.stringify(l)))
  return []
}

// ── Hooks ──────────────────────────────────────────────────────────────

export function useProcessList(refetchIntervalMs = 5000) {
  return useQuery({
    queryKey: ['gateway', 'process', 'list'],
    queryFn: async (): Promise<ProcessEntry[]> => {
      const result: IpcResult<unknown> = await api().gateway.toolsInvoke('process', { action: 'list' })
      if (!result.ok) return []
      return normalizeProcessEntries(result.data)
    },
    refetchInterval: refetchIntervalMs
  })
}

export function useProcessLog(sessionId: string | null, isRunning: boolean, refetchIntervalMs = 3000) {
  return useQuery({
    queryKey: ['gateway', 'process', 'log', sessionId],
    queryFn: async (): Promise<string[]> => {
      if (!sessionId) return []
      const result: IpcResult<unknown> = await api().gateway.toolsInvoke('process', {
        action: 'log',
        sessionId,
        limit: 500
      })
      if (!result.ok) return []
      return normalizeLogLines(result.data)
    },
    enabled: !!sessionId,
    refetchInterval: sessionId && isRunning ? refetchIntervalMs : false
  })
}

export function useKillProcess() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (sessionId: string) => {
      const result: IpcResult<unknown> = await api().gateway.toolsInvoke('process', {
        action: 'kill',
        sessionId
      })
      if (!result.ok) throw new Error(result.error ?? 'Failed to kill process')
      return result.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gateway', 'process', 'list'] })
    }
  })
}

export function useClearCompletedProcesses() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      const result: IpcResult<unknown> = await api().gateway.toolsInvoke('process', {
        action: 'clear'
      })
      if (!result.ok) throw new Error(result.error ?? 'Failed to clear completed processes')
      return result.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gateway', 'process', 'list'] })
    }
  })
}
