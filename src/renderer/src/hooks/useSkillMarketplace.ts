import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { IpcResult } from '../../../shared/types'
import { parseAgentSkillContent } from '../../../shared/agent-skill'
import { useWorkspaceFiles } from './useGateway'

export interface Skill {
  slug: string
  name: string
  description: string
  author: string
  version: string
  installed: boolean
  updateAvailable: boolean
  category?: string
  icon?: string
}

export interface WorkspaceSkill {
  slug: string
  name: string
  description: string
  status: 'active' | 'disabled'
  emoji: string
  path: string
}

interface ClawHubSearchResult {
  slug: string
  name: string
  description: string
  author: string
  version: string
  category?: string
}

interface ClawHubListResult {
  slug: string
  version: string
}

const WORKSPACE_SKILL_PATH_PATTERN = /^skills\/([^/]+)\/SKILL\.md$/i

function pickCollection(payload: unknown, keys: string[]): unknown[] {
  if (Array.isArray(payload)) return payload
  if (!payload || typeof payload !== 'object') return []

  const root = payload as Record<string, unknown>
  for (const key of keys) {
    const candidate = root[key]
    if (Array.isArray(candidate)) return candidate
  }

  return []
}

/**
 * Normalize clawhub search results to our Skill interface
 */
function normalizeSearchResults(
  searchResults: unknown,
  installedSkills: ClawHubListResult[]
): Skill[] {
  const rows = pickCollection(searchResults, ['skills', 'results', 'items', 'data', 'matches'])
  if (rows.length === 0) return []

  const installedMap = new Map(installedSkills.map((skill) => [skill.slug, skill.version]))

  return rows
    .map((result): Skill | null => {
      if (!result || typeof result !== 'object') return null

      const raw = result as Record<string, unknown>
      const slug = typeof raw.slug === 'string' ? raw.slug : ''
      const name = typeof raw.name === 'string' ? raw.name : ''
      const description = typeof raw.description === 'string' ? raw.description : ''
      const author = typeof raw.author === 'string' ? raw.author : 'Unknown'
      const version = typeof raw.version === 'string' ? raw.version : '1.0.0'
      const category = typeof raw.category === 'string' ? raw.category : undefined
      const icon =
        (typeof raw.icon === 'string' && raw.icon) ||
        (typeof raw.emoji === 'string' && raw.emoji) ||
        undefined

      if (!slug || !name) return null

      const installedVersion = installedMap.get(slug)
      const installed = Boolean(installedVersion)
      const updateAvailable = installed && installedVersion !== version

      return {
        slug,
        name,
        description,
        author,
        version,
        installed,
        updateAvailable,
        category,
        icon
      }
    })
    .filter((skill): skill is Skill => skill !== null)
}

/**
 * Normalize clawhub list results
 */
function normalizeInstalledSkills(listResults: unknown): ClawHubListResult[] {
  const rows = pickCollection(listResults, ['skills', 'installed', 'results', 'items', 'data'])
  if (rows.length === 0) return []

  return rows
    .map((result): ClawHubListResult | null => {
      if (!result || typeof result !== 'object') return null

      const raw = result as Record<string, unknown>
      const slug = typeof raw.slug === 'string' ? raw.slug : ''
      const version = typeof raw.version === 'string' ? raw.version : '1.0.0'

      if (!slug) return null

      return { slug, version }
    })
    .filter((skill): skill is ClawHubListResult => skill !== null)
}

/**
 * Hook to fetch all available skills from clawhub
 */
export function useAvailableSkills(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['clawhub', 'search', 'all'],
    queryFn: async (): Promise<Skill[]> => {
      const searchResult: IpcResult<unknown> = await window.api.gateway.toolsInvoke(
        'clawhub',
        { action: 'search', query: '' }
      )

      if (!searchResult.ok) {
        throw new Error(searchResult.error || 'Failed to fetch skills from ClawHub.')
      }

      const listResult: IpcResult<unknown> = await window.api.gateway.toolsInvoke('clawhub', {
        action: 'list'
      })

      const installedSkills = normalizeInstalledSkills(listResult.ok ? listResult.data : [])

      return normalizeSearchResults(searchResult.data, installedSkills)
    },
    enabled: options?.enabled ?? true,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    refetchInterval: false // Only refetch manually
  })
}

/**
 * Hook to read local workspace skills from the skills directory.
 */
export function useWorkspaceSkills() {
  const { data: files } = useWorkspaceFiles()

  return useQuery({
    queryKey: ['workspace', 'skills', files ?? []],
    queryFn: async (): Promise<WorkspaceSkill[]> => {
      const skillPaths = (files ?? []).filter((file) => WORKSPACE_SKILL_PATH_PATTERN.test(file))
      if (skillPaths.length === 0) return []

      const loaded = await Promise.all(
        skillPaths.map(async (path) => {
          const readResult = await window.api.files.read(path)
          if (!readResult.ok || typeof readResult.data !== 'string') {
            throw new Error(readResult.error || `Failed to read ${path}`)
          }

          const match = path.match(WORKSPACE_SKILL_PATH_PATTERN)
          const fallbackSlug = match?.[1] || 'skill'
          const parsed = parseAgentSkillContent(readResult.data, fallbackSlug)

          return {
            slug: fallbackSlug,
            name: parsed.name || fallbackSlug,
            description: parsed.description || '',
            status: parsed.status,
            emoji: parsed.emoji || '🤖',
            path
          } satisfies WorkspaceSkill
        })
      )

      return loaded.sort((a, b) => a.name.localeCompare(b.name))
    },
    enabled: !!files
  })
}

/**
 * Hook to fetch installed skills
 */
export function useInstalledSkills() {
  return useQuery({
    queryKey: ['clawhub', 'installed'],
    queryFn: async (): Promise<ClawHubListResult[]> => {
      try {
        const result: IpcResult<unknown> = await window.api.gateway.toolsInvoke('clawhub', {
          action: 'list'
        })

        if (!result.ok) {
          console.error('Failed to fetch installed skills:', result.error)
          return []
        }

        return normalizeInstalledSkills(result.data)
      } catch (error) {
        console.error('Error fetching installed skills:', error)
        return []
      }
    },
    refetchInterval: 10000 // Refetch every 10 seconds
  })
}

/**
 * Hook to install a skill
 */
export function useInstallSkill() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (slug: string) => {
      const result: IpcResult<unknown> = await window.api.gateway.toolsInvoke('clawhub', {
        action: 'install',
        slug
      })

      if (!result.ok) {
        throw new Error(result.error || `Failed to install skill: ${slug}`)
      }

      return result.data
    },
    onSuccess: () => {
      // Invalidate both queries to refresh the UI
      queryClient.invalidateQueries({ queryKey: ['clawhub', 'search'] })
      queryClient.invalidateQueries({ queryKey: ['clawhub', 'installed'] })
    }
  })
}

/**
 * Hook to uninstall a skill
 */
export function useUninstallSkill() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (slug: string) => {
      const result: IpcResult<unknown> = await window.api.gateway.toolsInvoke('clawhub', {
        action: 'uninstall',
        slug
      })

      if (!result.ok) {
        throw new Error(result.error || `Failed to uninstall skill: ${slug}`)
      }

      return result.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clawhub', 'search'] })
      queryClient.invalidateQueries({ queryKey: ['clawhub', 'installed'] })
    }
  })
}

/**
 * Hook to update a skill
 */
export function useUpdateSkill() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (slug: string) => {
      const result: IpcResult<unknown> = await window.api.gateway.toolsInvoke('clawhub', {
        action: 'update',
        slug
      })

      if (!result.ok) {
        throw new Error(result.error || `Failed to update skill: ${slug}`)
      }

      return result.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clawhub', 'search'] })
      queryClient.invalidateQueries({ queryKey: ['clawhub', 'installed'] })
    }
  })
}
