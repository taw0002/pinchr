import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

/**
 * Session state file: stores archive and delete status for chat sessions
 * Following the same pattern as useTasks.ts
 */

interface SessionStateDocument {
  version: 1
  archived: string[] // Session IDs that are archived
  deleted: string[] // Session IDs that are deleted
}

const SESSION_STATE_FILE_PATH = 'session-state.json'
const SESSION_STATE_QUERY_KEY = ['session-state', SESSION_STATE_FILE_PATH] as const
const SESSION_STATE_RELOAD_DEBOUNCE_MS = 200

function emptySessionState(): SessionStateDocument {
  return {
    version: 1,
    archived: [],
    deleted: []
  }
}

function isFileMissingError(error: unknown): boolean {
  const message = String(error).toLowerCase()
  return message.includes('enoent') || message.includes('not found') || message.includes('no such file')
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((str) => str.trim())
    .filter(Boolean)
}

async function readSessionStateFile(): Promise<SessionStateDocument> {
  try {
    const result = await window.api.files.read(SESSION_STATE_FILE_PATH)
    if (!result.ok || !result.data) return emptySessionState()

    const content = (typeof result.data === 'string' ? result.data : '').trim()
    if (!content) return emptySessionState()

    const parsed = JSON.parse(content) as unknown
    const root = asRecord(parsed)
    if (!root) return emptySessionState()

    return {
      version: 1,
      archived: Array.from(new Set(toStringArray(root.archived))),
      deleted: Array.from(new Set(toStringArray(root.deleted)))
    }
  } catch (error) {
    if (isFileMissingError(error)) {
      return emptySessionState()
    }
    throw error
  }
}

async function writeSessionStateFile(document: SessionStateDocument): Promise<void> {
  const content = JSON.stringify(document, null, 2)
  const result = await window.api.files.write(SESSION_STATE_FILE_PATH, content)
  if (!result.ok) {
    throw new Error(result.error || 'Failed to save session state')
  }
}

function isSameSessionStateDocument(current: SessionStateDocument | undefined, next: SessionStateDocument): boolean {
  if (!current) return false
  return JSON.stringify(current) === JSON.stringify(next)
}

export function useSessionState() {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: SESSION_STATE_QUERY_KEY,
    queryFn: readSessionStateFile
  })

  useEffect(() => {
    let disposed = false
    let reloadTimer: ReturnType<typeof setTimeout> | null = null

    const reloadStateFromDisk = async () => {
      try {
        const nextDocument = await readSessionStateFile()
        if (disposed) return

        const currentDocument = queryClient.getQueryData<SessionStateDocument>(SESSION_STATE_QUERY_KEY)
        if (isSameSessionStateDocument(currentDocument, nextDocument)) return

        queryClient.setQueryData<SessionStateDocument>(SESSION_STATE_QUERY_KEY, nextDocument)
      } catch (error) {
        console.error('Failed to reload session state after workspace file change:', error)
      }
    }

    const removeFileChangedListener = window.api.workspace.onFileChanged(({ file }) => {
      if (file !== SESSION_STATE_FILE_PATH) return

      if (reloadTimer) clearTimeout(reloadTimer)
      reloadTimer = setTimeout(() => {
        void reloadStateFromDisk()
      }, SESSION_STATE_RELOAD_DEBOUNCE_MS)
    })

    return () => {
      disposed = true
      if (reloadTimer) clearTimeout(reloadTimer)
      removeFileChangedListener()
    }
  }, [queryClient])

  const saveMutation = useMutation({
    mutationFn: async (nextDocument: SessionStateDocument) => {
      await writeSessionStateFile(nextDocument)
      return nextDocument
    },
    onMutate: async (nextDocument) => {
      await queryClient.cancelQueries({ queryKey: SESSION_STATE_QUERY_KEY })
      const previous = queryClient.getQueryData<SessionStateDocument>(SESSION_STATE_QUERY_KEY) ?? emptySessionState()
      queryClient.setQueryData<SessionStateDocument>(SESSION_STATE_QUERY_KEY, nextDocument)
      return { previous }
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData<SessionStateDocument>(SESSION_STATE_QUERY_KEY, context.previous)
      }
    }
  })

  const getCurrentDocument = (): SessionStateDocument => {
    return queryClient.getQueryData<SessionStateDocument>(SESSION_STATE_QUERY_KEY) ?? query.data ?? emptySessionState()
  }

  const persistDocument = (nextDocument: SessionStateDocument) => {
    saveMutation.mutate(nextDocument)
  }

  const archiveSession = (sessionId: string) => {
    const current = getCurrentDocument()
    if (current.archived.includes(sessionId)) return

    persistDocument({
      ...current,
      archived: [...current.archived, sessionId],
      deleted: current.deleted.filter((id) => id !== sessionId)
    })
  }

  const restoreSession = (sessionId: string) => {
    const current = getCurrentDocument()
    persistDocument({
      ...current,
      archived: current.archived.filter((id) => id !== sessionId)
    })
  }

  const deleteSession = (sessionId: string) => {
    const current = getCurrentDocument()
    persistDocument({
      ...current,
      archived: current.archived.filter((id) => id !== sessionId),
      deleted: [...current.deleted, sessionId]
    })
  }

  const archiveAll = (sessionIds: string[]) => {
    const current = getCurrentDocument()
    const newArchived = Array.from(new Set([...current.archived, ...sessionIds]))
    persistDocument({
      ...current,
      archived: newArchived,
      deleted: current.deleted.filter((id) => !sessionIds.includes(id))
    })
  }

  const clearArchived = () => {
    const current = getCurrentDocument()
    persistDocument({
      ...current,
      archived: []
    })
  }

  const isArchived = (sessionId: string): boolean => {
    const current = getCurrentDocument()
    return current.archived.includes(sessionId)
  }

  const isDeleted = (sessionId: string): boolean => {
    const current = getCurrentDocument()
    return current.deleted.includes(sessionId)
  }

  return {
    archived: query.data?.archived ?? [],
    deleted: query.data?.deleted ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    isSaving: saveMutation.isPending,
    archiveSession,
    restoreSession,
    deleteSession,
    archiveAll,
    clearArchived,
    isArchived,
    isDeleted
  }
}
