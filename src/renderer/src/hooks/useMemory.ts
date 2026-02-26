import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useWorkspaceFiles } from '@/hooks/useGateway'

const DAILY_MEMORY_FILE_PATTERN = /^memory\/(\d{4}-\d{2}-\d{2})\.md$/i

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function readString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function readNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value.trim())
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

function normalizePath(path: string): string {
  const normalized = path.replace(/\\/g, '/').trim()
  const workspaceIndex = normalized.toLowerCase().lastIndexOf('/.openclaw/workspace/')
  if (workspaceIndex >= 0) {
    return normalized.slice(workspaceIndex + '/.openclaw/workspace/'.length)
  }
  return normalized.replace(/^\/+/, '')
}

function toByteLength(content: string): number {
  return new TextEncoder().encode(content).length
}

function pickString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = readString(record[key])
    if (value) return value
  }
  return undefined
}

function pickNumber(record: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = readNumber(record[key])
    if (value !== undefined) return value
  }
  return undefined
}

function parseDateString(value: string | undefined): string | undefined {
  if (!value) return undefined
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString()
}

function extractContentFromReadData(payload: unknown): { content: string; sizeBytes?: number; modifiedAt?: string } {
  if (typeof payload === 'string') {
    return { content: payload, sizeBytes: toByteLength(payload) }
  }

  const root = asRecord(payload)
  if (!root) {
    return { content: '' }
  }

  const nestedData = asRecord(root.data)
  const nestedFile = asRecord(root.file)
  const nestedMetadata = asRecord(root.metadata)

  const content =
    pickString(root, ['content', 'text', 'body', 'markdown', 'value']) ??
    (nestedData ? pickString(nestedData, ['content', 'text', 'body', 'markdown', 'value']) : undefined) ??
    (nestedFile ? pickString(nestedFile, ['content', 'text', 'body']) : undefined) ??
    ''

  const sizeBytes =
    pickNumber(root, ['sizeBytes', 'size', 'bytes', 'contentLength']) ??
    (nestedData ? pickNumber(nestedData, ['sizeBytes', 'size', 'bytes', 'contentLength']) : undefined) ??
    (nestedMetadata ? pickNumber(nestedMetadata, ['sizeBytes', 'size', 'bytes']) : undefined) ??
    (content ? toByteLength(content) : undefined)

  const modifiedAtRaw =
    pickString(root, ['modifiedAt', 'lastModified', 'updatedAt', 'mtime', 'timestamp']) ??
    (nestedData ? pickString(nestedData, ['modifiedAt', 'lastModified', 'updatedAt', 'mtime', 'timestamp']) : undefined) ??
    (nestedMetadata ? pickString(nestedMetadata, ['modifiedAt', 'lastModified', 'updatedAt', 'mtime', 'timestamp']) : undefined)

  return {
    content,
    sizeBytes,
    modifiedAt: parseDateString(modifiedAtRaw)
  }
}

async function invokeToolWithFallback(
  tool: string,
  primaryArgs: Record<string, unknown>,
  secondaryArgs?: Record<string, unknown>
): Promise<unknown> {
  const primaryResult = await window.api.gateway.toolsInvoke(tool, primaryArgs)
  if (primaryResult.ok) return primaryResult.data

  if (secondaryArgs) {
    const secondaryResult = await window.api.gateway.toolsInvoke(tool, secondaryArgs)
    if (secondaryResult.ok) return secondaryResult.data
    throw new Error(secondaryResult.error || primaryResult.error || `Failed to invoke ${tool}`)
  }

  throw new Error(primaryResult.error || `Failed to invoke ${tool}`)
}

export interface MemoryFileInfo {
  path: string
  content: string
  sizeBytes: number
  modifiedAt?: string
}

export interface MemoryCatalogEntry {
  path: string
  sizeBytes: number
  modifiedAt?: string
  preview: string
  dailyDate?: string
}

export interface MemoryCatalog {
  entries: MemoryCatalogEntry[]
  totalSizeBytes: number
  newestModifiedAt?: string
  oldestModifiedAt?: string
}

export interface MemorySearchHit {
  id: string
  path: string
  line?: number
  endLine?: number
  score?: number
  snippet: string
  raw: Record<string, unknown>
}

export function isDailyMemoryPath(path: string): boolean {
  return DAILY_MEMORY_FILE_PATTERN.test(path)
}

export function parseDailyMemoryDate(path: string): string | undefined {
  const match = path.match(DAILY_MEMORY_FILE_PATTERN)
  return match?.[1]
}

export function useMemoryFiles() {
  const filesQuery = useWorkspaceFiles()

  const memoryFiles = useMemo(() => {
    const files = filesQuery.data ?? []
    return files
      .filter((file) => file === 'MEMORY.md' || file.startsWith('memory/'))
      .sort((a, b) => a.localeCompare(b))
  }, [filesQuery.data])

  const dailyFiles = useMemo(() => {
    return memoryFiles
      .filter((file) => isDailyMemoryPath(file))
      .sort((a, b) => {
        const aDate = parseDailyMemoryDate(a) ?? ''
        const bDate = parseDailyMemoryDate(b) ?? ''
        return bDate.localeCompare(aDate)
      })
  }, [memoryFiles])

  return {
    ...filesQuery,
    memoryFiles,
    dailyFiles
  }
}

async function readMemoryFile(path: string): Promise<MemoryFileInfo> {
  const normalizedPath = normalizePath(path)

  try {
    const gatewayData = await invokeToolWithFallback(
      'read',
      { path: normalizedPath },
      { input: { path: normalizedPath } }
    )

    const parsed = extractContentFromReadData(gatewayData)
    if (!parsed.content && parsed.sizeBytes === undefined) {
      throw new Error(`Gateway read response did not include file content for ${normalizedPath}`)
    }
    return {
      path: normalizedPath,
      content: parsed.content,
      sizeBytes: parsed.sizeBytes ?? toByteLength(parsed.content),
      modifiedAt: parsed.modifiedAt
    }
  } catch {
    const fallback = await window.api.files.read(normalizedPath)
    if (!fallback.ok) throw new Error(fallback.error || `Failed to read ${normalizedPath}`)
    const content = fallback.data ?? ''
    return {
      path: normalizedPath,
      content,
      sizeBytes: toByteLength(content)
    }
  }
}

async function writeMemoryFile(path: string, content: string): Promise<void> {
  const normalizedPath = normalizePath(path)

  try {
    await invokeToolWithFallback(
      'write',
      { path: normalizedPath, content },
      { input: { path: normalizedPath, content } }
    )
  } catch {
    const fallback = await window.api.files.write(normalizedPath, content)
    if (!fallback.ok) throw new Error(fallback.error || `Failed to write ${normalizedPath}`)
  }
}

function extractSearchEntries(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload

  const record = asRecord(payload)
  if (!record) return []

  for (const key of ['results', 'matches', 'hits', 'items', 'entries', 'data']) {
    const candidate = record[key]
    if (Array.isArray(candidate)) return candidate
  }

  const nestedResult = asRecord(record.result)
  if (nestedResult) {
    for (const key of ['results', 'matches', 'hits', 'items', 'entries']) {
      const candidate = nestedResult[key]
      if (Array.isArray(candidate)) return candidate
    }
  }

  return []
}

function normalizeSearchHit(entry: unknown, index: number): MemorySearchHit | null {
  const record = asRecord(entry)

  if (!record) {
    if (typeof entry === 'string' && entry.trim()) {
      return {
        id: `memory-hit-${index}`,
        path: 'MEMORY.md',
        snippet: entry.trim(),
        raw: { snippet: entry }
      }
    }
    return null
  }

  const location = asRecord(record.location)
  const source = asRecord(record.source)

  const path = normalizePath(
    pickString(record, ['path', 'file', 'filename', 'filePath', 'sourcePath']) ??
      (location ? pickString(location, ['path', 'file']) : undefined) ??
      (source ? pickString(source, ['path', 'file']) : undefined) ??
      ''
  )

  const line =
    pickNumber(record, ['line', 'lineNumber', 'startLine', 'start_line', 'row']) ??
    (location ? pickNumber(location, ['line', 'lineNumber', 'startLine', 'start_line', 'row']) : undefined)

  const endLine =
    pickNumber(record, ['endLine', 'end_line', 'lineEnd']) ??
    (location ? pickNumber(location, ['endLine', 'end_line', 'lineEnd']) : undefined)

  const score = pickNumber(record, ['score', 'relevance', 'similarity'])
  const distance = pickNumber(record, ['distance'])
  const normalizedScore = score ?? (distance !== undefined && distance >= 0 ? Math.max(0, 1 - distance) : undefined)

  const snippet =
    pickString(record, ['snippet', 'preview', 'excerpt', 'text', 'content', 'match']) ??
    (source ? pickString(source, ['snippet', 'preview', 'text']) : undefined) ??
    ''

  if (!path || (!path.startsWith('memory/') && path !== 'MEMORY.md')) {
    return null
  }

  return {
    id: `${path}:${line ?? index}:${index}`,
    path,
    line,
    endLine,
    score: normalizedScore,
    snippet: snippet.trim() || '(No snippet returned)',
    raw: record
  }
}

function normalizeSearchResults(payload: unknown): MemorySearchHit[] {
  const entries = extractSearchEntries(payload)

  return entries
    .map((entry, index) => normalizeSearchHit(entry, index))
    .filter((entry): entry is MemorySearchHit => !!entry)
    .sort((a, b) => {
      const aScore = a.score ?? -1
      const bScore = b.score ?? -1
      if (aScore !== bScore) return bScore - aScore
      return a.path.localeCompare(b.path)
    })
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value)
    }, delayMs)
    return () => clearTimeout(timer)
  }, [delayMs, setDebouncedValue, value])

  return debouncedValue
}

export function useMemorySearch(query: string, options?: { enabled?: boolean }) {
  const enabled = options?.enabled ?? true
  const debouncedQuery = useDebouncedValue(query.trim(), 300)
  const shouldSearch = enabled && debouncedQuery.length > 0

  return useQuery({
    queryKey: ['memory', 'search', debouncedQuery],
    queryFn: async (): Promise<MemorySearchHit[]> => {
      const data = await invokeToolWithFallback(
        'memory_search',
        { query: debouncedQuery },
        { input: { query: debouncedQuery } }
      )
      return normalizeSearchResults(data)
    },
    enabled: shouldSearch
  })
}

export function useMemoryFileContent(path: string | null) {
  return useQuery({
    queryKey: ['memory', 'file', path],
    queryFn: async (): Promise<MemoryFileInfo> => {
      if (!path) throw new Error('No memory file selected')
      return readMemoryFile(path)
    },
    enabled: !!path
  })
}

export function useSaveMemoryFile() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ path, content }: { path: string; content: string }) => {
      await writeMemoryFile(path, content)
      return { path }
    },
    onSuccess: ({ path }) => {
      queryClient.invalidateQueries({ queryKey: ['memory', 'file', path] })
      queryClient.invalidateQueries({ queryKey: ['memory', 'catalog'] })
      queryClient.invalidateQueries({ queryKey: ['files', 'content', path] })
      queryClient.invalidateQueries({ queryKey: ['files', 'list'] })
    }
  })
}

export function useMemoryCatalog(memoryPaths: string[]) {
  return useQuery({
    queryKey: ['memory', 'catalog', memoryPaths],
    queryFn: async (): Promise<MemoryCatalog> => {
      if (memoryPaths.length === 0) {
        return { entries: [], totalSizeBytes: 0 }
      }

      const results = await Promise.allSettled(memoryPaths.map((path) => readMemoryFile(path)))

      const entries: MemoryCatalogEntry[] = []
      for (const result of results) {
        if (result.status !== 'fulfilled') continue

        const file = result.value
        const preview = file.content
          .split(/\r?\n/)
          .map((line) => line.trim())
          .find((line) => line.length > 0)

        entries.push({
          path: file.path,
          sizeBytes: file.sizeBytes,
          modifiedAt: file.modifiedAt,
          preview: preview ? preview.slice(0, 180) : '(Empty file)',
          dailyDate: parseDailyMemoryDate(file.path)
        })
      }

      let totalSizeBytes = 0
      let newestModifiedAt: string | undefined
      let oldestModifiedAt: string | undefined

      for (const entry of entries) {
        totalSizeBytes += entry.sizeBytes

        const modifiedAt = entry.modifiedAt ?? (entry.dailyDate ? new Date(`${entry.dailyDate}T12:00:00Z`).toISOString() : undefined)
        if (!modifiedAt) continue

        if (!newestModifiedAt || new Date(modifiedAt).getTime() > new Date(newestModifiedAt).getTime()) {
          newestModifiedAt = modifiedAt
        }

        if (!oldestModifiedAt || new Date(modifiedAt).getTime() < new Date(oldestModifiedAt).getTime()) {
          oldestModifiedAt = modifiedAt
        }
      }

      return {
        entries: entries.sort((a, b) => a.path.localeCompare(b.path)),
        totalSizeBytes,
        newestModifiedAt,
        oldestModifiedAt
      }
    },
    enabled: memoryPaths.length > 0
  })
}
