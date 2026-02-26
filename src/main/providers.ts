import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { dirname, join } from 'path'
import type { ProviderId } from '../shared/types'

const OPENCLAW_HOME_PATH = join(homedir(), '.openclaw')
const OPENCLAW_CONFIG_PATH = join(OPENCLAW_HOME_PATH, 'openclaw.json')
const OPENCLAW_MAIN_AGENT_DIR = join(OPENCLAW_HOME_PATH, 'agents', 'main', 'agent')
const OPENCLAW_AUTH_PROFILES_PATH = join(OPENCLAW_MAIN_AGENT_DIR, 'auth-profiles.json')

type JsonRecord = Record<string, unknown>

export interface AuthProfile {
  key_type?: string
  type?: string
  key?: string
  provider?: string
  [key: string]: unknown
}

export interface ProviderStatus {
  id: ProviderId
  configured: boolean
  profileName: string | null
}

interface AuthProfilesFile {
  profiles?: Record<string, AuthProfile>
  lastGood?: Record<string, unknown>
  usageStats?: Record<string, unknown>
  [key: string]: unknown
}

function isPlainRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function readJsonFile(filePath: string): JsonRecord {
  try {
    if (!existsSync(filePath)) return {}
    const parsed = JSON.parse(readFileSync(filePath, 'utf-8')) as unknown
    if (isPlainRecord(parsed)) return parsed
  } catch {
    // Fall through to empty object on parse/read errors.
  }
  return {}
}

function writeJsonFile(filePath: string, payload: JsonRecord): void {
  const targetDir = dirname(filePath)
  if (!existsSync(targetDir)) {
    mkdirSync(targetDir, { recursive: true })
  }
  writeFileSync(filePath, JSON.stringify(payload, null, 2))
}

function readAuthProfilesFile(): AuthProfilesFile {
  return readJsonFile(OPENCLAW_AUTH_PROFILES_PATH)
}

function writeAuthProfilesFile(payload: AuthProfilesFile): void {
  writeJsonFile(OPENCLAW_AUTH_PROFILES_PATH, payload)
}

function readOpenClawConfig(): JsonRecord {
  return readJsonFile(OPENCLAW_CONFIG_PATH)
}

function writeOpenClawConfig(config: JsonRecord): void {
  writeJsonFile(OPENCLAW_CONFIG_PATH, config)
}

function profileNameForProvider(provider: ProviderId): string {
  return `${provider}:default`
}

export function getAuthProfiles(): Record<string, AuthProfile> {
  const file = readAuthProfilesFile()
  return isPlainRecord(file.profiles) ? (file.profiles as Record<string, AuthProfile>) : {}
}

export function listProviderStatuses(providerIds: ProviderId[]): ProviderStatus[] {
  const profiles = getAuthProfiles()

  return providerIds.map((providerId) => {
    const profileName = profileNameForProvider(providerId)
    const profile = profiles[profileName]
    const key = typeof profile?.key === 'string' ? profile.key.trim() : ''
    const configured = key.length > 0
    return {
      id: providerId,
      configured,
      profileName: configured ? profileName : null
    }
  })
}

export function setProviderKey(provider: ProviderId, apiKey: string): void {
  const trimmedKey = apiKey.trim()
  if (!trimmedKey) {
    throw new Error('API key is required.')
  }

  const profileName = profileNameForProvider(provider)
  const file = readAuthProfilesFile()
  const profiles = isPlainRecord(file.profiles)
    ? { ...(file.profiles as Record<string, AuthProfile>) }
    : {}

  profiles[profileName] = {
    ...(profiles[profileName] || {}),
    key_type: 'api_key',
    type: 'api_key',
    key: trimmedKey,
    provider
  }

  const lastGood = isPlainRecord(file.lastGood)
    ? { ...(file.lastGood as Record<string, unknown>) }
    : {}
  lastGood[provider] = profileName

  writeAuthProfilesFile({
    ...file,
    version: 1,
    profiles,
    lastGood,
    usageStats: isPlainRecord(file.usageStats)
      ? { ...(file.usageStats as Record<string, unknown>) }
      : {}
  })
}

function clearProviderFromConfig(config: JsonRecord, provider: ProviderId): JsonRecord {
  const nextConfig = { ...config }
  const agents = isPlainRecord(nextConfig.agents)
    ? { ...(nextConfig.agents as JsonRecord) }
    : null
  const defaults = agents && isPlainRecord(agents.defaults)
    ? { ...(agents.defaults as JsonRecord) }
    : null
  const model = defaults && isPlainRecord(defaults.model)
    ? { ...(defaults.model as JsonRecord) }
    : null
  const primary = typeof model?.primary === 'string' ? model.primary : null

  if (primary && primary.startsWith(`${provider}/`)) {
    if (model) {
      delete model.primary
      if (Object.keys(model).length === 0) {
        delete defaults?.model
      } else if (defaults) {
        defaults.model = model
      }
    }

    if (defaults && agents) {
      agents.defaults = defaults
      nextConfig.agents = agents
    }
  }

  return nextConfig
}

export function removeProviderKey(provider: ProviderId): void {
  const profileName = profileNameForProvider(provider)
  const file = readAuthProfilesFile()
  const profiles = isPlainRecord(file.profiles)
    ? { ...(file.profiles as Record<string, AuthProfile>) }
    : {}

  if (profileName in profiles) {
    delete profiles[profileName]
  }

  const lastGood = isPlainRecord(file.lastGood)
    ? { ...(file.lastGood as Record<string, unknown>) }
    : {}
  if (provider in lastGood) {
    delete lastGood[provider]
  }

  const usageStats = isPlainRecord(file.usageStats)
    ? { ...(file.usageStats as Record<string, unknown>) }
    : {}
  if (provider in usageStats) {
    delete usageStats[provider]
  }
  if (profileName in usageStats) {
    delete usageStats[profileName]
  }

  writeAuthProfilesFile({
    ...file,
    version: 1,
    profiles,
    lastGood,
    usageStats
  })

  if (existsSync(OPENCLAW_CONFIG_PATH)) {
    const config = readOpenClawConfig()
    const nextConfig = clearProviderFromConfig(config, provider)
    if (JSON.stringify(config) !== JSON.stringify(nextConfig)) {
      writeOpenClawConfig(nextConfig)
    }
  }
}
