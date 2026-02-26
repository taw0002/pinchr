import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

const PINCHR_CONFIG_PATH = join(homedir(), '.pinchr', 'config.json')

/**
 * Pricing tiers:
 *  - free: 7-day trial, full access
 *  - basic ($20/yr): Core desktop app — chat, multi-session, image upload, voice, omnichannel
 *  - pro ($200/yr): Everything + Agent Builder + Workflow Builder
 */
export type PlanTier = 'free' | 'basic' | 'pro'

export interface LicenseStatus {
  valid: boolean
  plan: PlanTier
  trialEndsAt?: string
  expiresAt?: string
  isTrialActive?: boolean
}

interface PinchrConfig {
  licenseKey?: string
  planTier?: PlanTier
  onboardingCompleted?: boolean
  installedAt?: string
  trialExtended?: boolean
  [key: string]: unknown
}

const TRIAL_DAYS_DEFAULT = 7
const TRIAL_DAYS_EXTENDED = 30

/**
 * Validates a license key format
 * Pattern: PNCHR-XXXX-XXXX-XXXX-XXXX
 */
function isValidLicenseKeyFormat(key: string): boolean {
  const pattern = /^PNCHR-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/
  return pattern.test(key.toUpperCase())
}

/**
 * Reads the Pinchr configuration file
 */
function readPinchrConfig(): PinchrConfig {
  try {
    if (!existsSync(PINCHR_CONFIG_PATH)) {
      return {}
    }
    return JSON.parse(readFileSync(PINCHR_CONFIG_PATH, 'utf-8'))
  } catch (error) {
    console.error('Failed to read Pinchr config:', error)
    return {}
  }
}

/**
 * Writes the Pinchr configuration file
 */
function writePinchrConfig(config: PinchrConfig): void {
  try {
    const configDir = join(homedir(), '.pinchr')
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true })
    }
    writeFileSync(PINCHR_CONFIG_PATH, JSON.stringify(config, null, 2))
  } catch (error) {
    console.error('Failed to write Pinchr config:', error)
    throw error
  }
}

/**
 * Ensures installedAt is recorded for trial tracking
 */
function ensureInstalledAt(config: PinchrConfig): PinchrConfig {
  if (!config.installedAt) {
    config.installedAt = new Date().toISOString()
    writePinchrConfig(config)
  }
  return config
}

/**
 * Check if trial period is still active
 */
function getTrialDays(config: PinchrConfig): number {
  return config.trialExtended ? TRIAL_DAYS_EXTENDED : TRIAL_DAYS_DEFAULT
}

function isTrialActive(config: PinchrConfig): boolean {
  if (!config.installedAt) return true // First launch, trial starts now
  const installed = new Date(config.installedAt).getTime()
  const trialEnd = installed + getTrialDays(config) * 24 * 60 * 60 * 1000
  return Date.now() < trialEnd
}

function getTrialEndDate(config: PinchrConfig): string | undefined {
  if (!config.installedAt) return undefined
  const installed = new Date(config.installedAt).getTime()
  return new Date(installed + getTrialDays(config) * 24 * 60 * 60 * 1000).toISOString()
}

/**
 * Determine plan tier from license key prefix
 * PNCHR-B... = basic, PNCHR-P... = pro, else pro (legacy)
 */
function planFromKey(key: string): PlanTier {
  const upper = key.toUpperCase()
  if (upper.startsWith('PNCHR-B')) return 'basic'
  if (upper.startsWith('PNCHR-P')) return 'pro'
  // Legacy keys default to pro
  return 'pro'
}

/**
 * Gets the current license status
 */
export function getLicenseStatus(): LicenseStatus {
  const config = ensureInstalledAt(readPinchrConfig())
  const licenseKey = config.licenseKey
  const trialActive = isTrialActive(config)
  const trialEndsAt = getTrialEndDate(config)

  // No license key — check trial
  if (!licenseKey) {
    return {
      valid: trialActive,
      plan: 'free',
      trialEndsAt,
      isTrialActive: trialActive
    }
  }

  // Valid license key
  if (isValidLicenseKeyFormat(licenseKey)) {
    const plan = config.planTier || planFromKey(licenseKey)
    return {
      valid: true,
      plan,
      trialEndsAt,
      isTrialActive: false,
      // TODO: Add actual expiration from server validation
      expiresAt: undefined
    }
  }

  // Invalid key format
  return {
    valid: trialActive,
    plan: 'free',
    trialEndsAt,
    isTrialActive: trialActive
  }
}

/**
 * Activates a license key
 */
export function activateLicense(key: string): { success: boolean; error?: string } {
  try {
    const trimmedKey = key.trim().toUpperCase()

    if (!isValidLicenseKeyFormat(trimmedKey)) {
      return {
        success: false,
        error: 'Invalid license key format. Expected format: PNCHR-XXXX-XXXX-XXXX-XXXX'
      }
    }

    // TODO: Add server-side validation via Stripe/Supabase
    const plan = planFromKey(trimmedKey)

    const config = readPinchrConfig()
    config.licenseKey = trimmedKey
    config.planTier = plan
    writePinchrConfig(config)

    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: `Failed to activate license: ${String(error)}`
    }
  }
}

/**
 * Deactivates the current license key
 */
export function deactivateLicense(): { success: boolean; error?: string } {
  try {
    const config = readPinchrConfig()
    delete config.licenseKey
    delete config.planTier
    writePinchrConfig(config)

    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: `Failed to deactivate license: ${String(error)}`
    }
  }
}

/**
 * Gets the raw license key (for display purposes)
 */
export function getLicenseKey(): string | null {
  const config = readPinchrConfig()
  return config.licenseKey || null
}

/**
 * Check if a feature is available on the current plan
 */
export function hasFeature(feature: 'chat' | 'agents' | 'workflows'): boolean {
  const status = getLicenseStatus()

  // Trial gets everything
  if (status.isTrialActive) return true

  switch (feature) {
    case 'chat':
      // All paid plans get chat
      return status.valid
    case 'agents':
    case 'workflows':
      // Only Pro gets agents and workflows
      return status.plan === 'pro'
    default:
      return false
  }
}
