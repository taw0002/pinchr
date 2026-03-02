import { useCallback, useEffect, useMemo, useState } from 'react'

const LICENSE_STORAGE_KEY = 'pinchr-license'
const LICENSE_VERIFY_ENDPOINT = 'https://pinchr.app/api/license/verify'
const UPGRADE_URL = 'https://pinchr.app/#pricing'
// 7-day trial without email signup, 30-day trial with email signup
const TRIAL_LENGTH_DAYS_DEFAULT = 7
const TRIAL_LENGTH_DAYS_EXTENDED = 30
const DAY_MS = 24 * 60 * 60 * 1000
const REVERIFY_INTERVAL_MS = 24 * 60 * 60 * 1000

type PaidTier = 'pinchr' | 'pro'
type Tier = 'trial' | PaidTier | null
type LegacyPlan = 'free' | 'basic' | 'pro'

type StoredLicense = {
  trial_started: number
  trial_extended: boolean
  license_key: string | null
  tier: Tier
  verified_at: number | null
}

type VerifyApiResponse = {
  valid: boolean
  tier: string
  email: string
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function normalizePaidTier(value: unknown): PaidTier | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  if (normalized === 'pro') return 'pro'
  if (normalized === 'pinchr' || normalized === 'basic') return 'pinchr'
  return null
}

function daysSinceTrialStarted(trialStarted: number, now = Date.now()): number {
  const elapsedMs = Math.max(0, now - trialStarted)
  return Math.floor(elapsedMs / DAY_MS)
}

function createDefaultLicense(now = Date.now()): StoredLicense {
  return {
    trial_started: now,
    trial_extended: false,
    license_key: null,
    tier: 'trial',
    verified_at: null
  }
}

function trialLengthDays(extended: boolean): number {
  return extended ? TRIAL_LENGTH_DAYS_EXTENDED : TRIAL_LENGTH_DAYS_DEFAULT
}

function inferredTrialTier(trialStarted: number, extended: boolean, now = Date.now()): 'trial' | null {
  const daysLeft = trialLengthDays(extended) - daysSinceTrialStarted(trialStarted, now)
  return daysLeft > 0 ? 'trial' : null
}

function sanitizeLicense(raw: unknown): StoredLicense {
  const fallback = createDefaultLicense()
  if (!isObject(raw)) return fallback

  const trialStarted = typeof raw.trial_started === 'number' && Number.isFinite(raw.trial_started)
    ? raw.trial_started
    : fallback.trial_started
  const trialExtended = raw.trial_extended === true
  const licenseKey = typeof raw.license_key === 'string' && raw.license_key.trim().length > 0
    ? raw.license_key.trim()
    : null
  const parsedTier = raw.tier === 'trial' || raw.tier === 'pinchr' || raw.tier === 'pro' || raw.tier === null
    ? raw.tier
    : null
  const verifiedAt = typeof raw.verified_at === 'number' && Number.isFinite(raw.verified_at)
    ? raw.verified_at
    : null

  const tier = licenseKey && (parsedTier === 'pinchr' || parsedTier === 'pro')
    ? parsedTier
    : inferredTrialTier(trialStarted, trialExtended)

  return {
    trial_started: trialStarted,
    trial_extended: trialExtended,
    license_key: licenseKey,
    tier,
    verified_at: licenseKey && (tier === 'pinchr' || tier === 'pro') ? verifiedAt : null
  }
}

function readStoredLicense(): StoredLicense {
  if (typeof window === 'undefined') return createDefaultLicense(0)

  try {
    const raw = window.localStorage.getItem(LICENSE_STORAGE_KEY)
    if (!raw) {
      const next = createDefaultLicense()
      window.localStorage.setItem(LICENSE_STORAGE_KEY, JSON.stringify(next))
      return next
    }

    const parsed: unknown = JSON.parse(raw)
    const sanitized = sanitizeLicense(parsed)
    if (raw !== JSON.stringify(sanitized)) {
      window.localStorage.setItem(LICENSE_STORAGE_KEY, JSON.stringify(sanitized))
    }
    return sanitized
  } catch {
    const next = createDefaultLicense()
    try {
      window.localStorage.setItem(LICENSE_STORAGE_KEY, JSON.stringify(next))
    } catch {
      // Ignore localStorage write failures.
    }
    return next
  }
}

function writeStoredLicense(license: StoredLicense): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(LICENSE_STORAGE_KEY, JSON.stringify(license))
  } catch {
    // Ignore localStorage write failures.
  }
}

async function verifyLicense(licenseKey: string): Promise<VerifyApiResponse> {
  const response = await fetch(LICENSE_VERIFY_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ license_key: licenseKey.trim() })
  })

  if (!response.ok) {
    throw new Error(`License verification failed (${response.status})`)
  }

  const data: unknown = await response.json()
  if (!isObject(data) || typeof data.valid !== 'boolean') {
    throw new Error('Unexpected response from license verification API')
  }

  return {
    valid: data.valid,
    tier: typeof data.tier === 'string' ? data.tier : '',
    email: typeof data.email === 'string' ? data.email : ''
  }
}

function toLegacyPlan(tier: Tier): LegacyPlan {
  if (tier === 'pro') return 'pro'
  if (tier === 'pinchr') return 'basic'
  return 'free'
}

/**
 * Trial + license management.
 * Local first: trial starts at first launch and paid tiers are verified via pinchr.app.
 */
export function useLicense() {
  const [licenseState, setLicenseState] = useState<StoredLicense>(() => readStoredLicense())
  const [isVerifying, setIsVerifying] = useState(false)
  const [isActivating, setIsActivating] = useState(false)
  const [activateError, setActivateError] = useState<Error | null>(null)
  const [deactivateError, setDeactivateError] = useState<Error | null>(null)

  const commitLicenseState = useCallback((next: StoredLicense) => {
    setLicenseState(next)
    writeStoredLicense(next)
  }, [])

  const setInvalidLicenseState = useCallback(() => {
    const current = readStoredLicense()
    const next: StoredLicense = {
      ...current,
      license_key: null,
      tier: inferredTrialTier(current.trial_started, current.trial_extended),
      verified_at: null
    }
    commitLicenseState(next)
    return next
  }, [commitLicenseState])

  const openUpgrade = useCallback(() => {
    void window.api.shell.openExternal(UPGRADE_URL)
  }, [])

  const reverifyStoredLicense = useCallback(async (licenseKey: string) => {
    const trimmedKey = licenseKey.trim()
    if (!trimmedKey) return false

    setIsVerifying(true)
    try {
      const result = await verifyLicense(trimmedKey)
      const nextTier = normalizePaidTier(result.tier)

      if (!result.valid || !nextTier) {
        setInvalidLicenseState()
        return false
      }

      const current = readStoredLicense()
      const next: StoredLicense = {
        ...current,
        license_key: trimmedKey,
        tier: nextTier,
        verified_at: Date.now()
      }
      commitLicenseState(next)
      return true
    } catch (error) {
      console.error('License re-verification failed:', error)
      return false
    } finally {
      setIsVerifying(false)
    }
  }, [commitLicenseState, setInvalidLicenseState])

  const activateLicense = useCallback(async (key: string): Promise<boolean> => {
    const trimmedKey = key.trim()
    if (!trimmedKey) {
      setActivateError(new Error('Please enter a license key'))
      return false
    }

    setActivateError(null)
    setIsActivating(true)
    setIsVerifying(true)

    try {
      const result = await verifyLicense(trimmedKey)
      const nextTier = normalizePaidTier(result.tier)

      if (!result.valid || !nextTier) {
        setInvalidLicenseState()
        setActivateError(new Error('License key is invalid'))
        return false
      }

      const current = readStoredLicense()
      const next: StoredLicense = {
        ...current,
        license_key: trimmedKey,
        tier: nextTier,
        verified_at: Date.now()
      }
      commitLicenseState(next)
      return true
    } catch (error) {
      const nextError = error instanceof Error ? error : new Error(String(error))
      setActivateError(nextError)
      return false
    } finally {
      setIsActivating(false)
      setIsVerifying(false)
    }
  }, [commitLicenseState, setInvalidLicenseState])

  const deactivate = useCallback(async () => {
    setDeactivateError(null)
    try {
      const current = readStoredLicense()
      const next: StoredLicense = {
        ...current,
        license_key: null,
        tier: inferredTrialTier(current.trial_started, current.trial_extended),
        verified_at: null
      }
      commitLicenseState(next)
    } catch (error) {
      const nextError = error instanceof Error ? error : new Error(String(error))
      setDeactivateError(nextError)
      throw nextError
    }
  }, [commitLicenseState])

  const activate = useCallback(async (key: string) => {
    const success = await activateLicense(key)
    if (!success) {
      throw activateError ?? new Error('License activation failed')
    }

    const current = readStoredLicense()
    return {
      valid: current.tier === 'pinchr' || current.tier === 'pro',
      plan: toLegacyPlan(current.tier)
    }
  }, [activateLicense, activateError])

  useEffect(() => {
    const current = readStoredLicense()
    setLicenseState(current)

    if (!current.license_key) return

    const hasPaidTier = current.tier === 'pinchr' || current.tier === 'pro'
    const needsReverify = !hasPaidTier || !current.verified_at || Date.now() - current.verified_at >= REVERIFY_INTERVAL_MS
    if (needsReverify) {
      void reverifyStoredLicense(current.license_key)
    }
  }, [reverifyStoredLicense])

  useEffect(() => {
    const syncFromStorage = (event: StorageEvent) => {
      if (event.key !== LICENSE_STORAGE_KEY) return
      setLicenseState(readStoredLicense())
    }

    window.addEventListener('storage', syncFromStorage)
    return () => window.removeEventListener('storage', syncFromStorage)
  }, [])

  const trialDaysLeft = useMemo(
    () => trialLengthDays(licenseState.trial_extended) - daysSinceTrialStarted(licenseState.trial_started),
    [licenseState.trial_started, licenseState.trial_extended]
  )

  const isTrialExpired = trialDaysLeft <= 0
  const isPaid = licenseState.tier === 'pinchr' || licenseState.tier === 'pro'
  const isTrialActive = !isTrialExpired && !isPaid
  const plan = toLegacyPlan(licenseState.tier)

  return {
    // Required API
    trialDaysLeft,
    isTrialExpired,
    tier: licenseState.tier,
    licenseKey: licenseState.license_key,
    isVerifying,
    activateLicense,
    openUpgrade,

    // Legacy compatibility for existing components/pages
    license: {
      valid: isPaid,
      plan,
      isTrialActive
    },
    isLoading: isVerifying,
    error: activateError,
    plan,
    isBasic: plan === 'basic',
    isPro: plan === 'pro',
    isPaid,
    isTrialActive,
    hasFeature: (_feature: string) => true,
    isProFeature: (_feature: string) => true,
    activate,
    deactivate,
    isActivating,
    isDeactivating: false,
    activateError,
    deactivateError
  }
}
