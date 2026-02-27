import { app, safeStorage, BrowserWindow } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from 'fs'
import type { User } from '../shared/types'

const AUTH_FILE = join(app.getPath('userData'), 'auth.enc')
const API_BASE_URL = 'https://pinchr.app'

interface StoredTokens {
  accessToken: string
  refreshToken: string | null
}

interface AuthSession {
  user: User
  accessToken: string
  refreshToken: string | null
}

let currentSession: AuthSession | null = null

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function readString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

/**
 * Parse the pinchr:// protocol callback URL and extract tokens
 */
export function parseAuthCallbackUrl(url: string): { accessToken: string; refreshToken: string | null } | null {
  try {
    const parsed = new URL(url)

    // Handle both pinchr://auth/callback and pinchr://auth (flexible)
    if (parsed.protocol !== 'pinchr:') return null
    if (!parsed.pathname.includes('auth')) return null

    const accessToken = parsed.searchParams.get('access_token')
    const refreshToken = parsed.searchParams.get('refresh_token')

    if (!accessToken) return null

    return { accessToken, refreshToken }
  } catch (error) {
    console.error('[Auth] Failed to parse callback URL:', error)
    return null
  }
}

/**
 * Store tokens securely using Electron's safeStorage
 */
export function storeTokens(accessToken: string, refreshToken: string | null): void {
  try {
    const dataDir = app.getPath('userData')
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true })
    }

    const tokens: StoredTokens = { accessToken, refreshToken }
    const encrypted = safeStorage.encryptString(JSON.stringify(tokens))
    writeFileSync(AUTH_FILE, encrypted)

  } catch (error) {
    console.error('[Auth] Failed to store tokens:', error)
    throw error
  }
}

/**
 * Load tokens from secure storage
 */
export function loadTokens(): StoredTokens | null {
  try {
    if (!existsSync(AUTH_FILE)) return null

    const encrypted = readFileSync(AUTH_FILE)
    const decrypted = safeStorage.decryptString(encrypted)
    const tokens = JSON.parse(decrypted) as StoredTokens

    return tokens
  } catch (error) {
    console.error('[Auth] Failed to load tokens:', error)
    return null
  }
}

/**
 * Delete stored tokens
 */
export function clearTokens(): void {
  try {
    if (existsSync(AUTH_FILE)) {
      unlinkSync(AUTH_FILE)
    }
    currentSession = null
  } catch (error) {
    console.error('[Auth] Failed to clear tokens:', error)
    throw error
  }
}

/**
 * Fetch user profile from pinchr.app API
 */
export async function fetchUserProfile(accessToken: string): Promise<User> {
  const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch user profile: ${response.status} ${response.statusText}`)
  }

  const data = asRecord(await response.json())

  // Map API response to User type
  const user: User = {
    id: readString(data.id) ?? '',
    email: readString(data.email) ?? '',
    name: readString(data.name) ?? readString(data.email) ?? '',
    avatarUrl: readString(data.avatar_url) ?? readString(data.avatarUrl) ?? null,
    tier: readString(data.tier) ?? 'free',
    trialEndsAt: readString(data.trial_ends_at) ?? readString(data.trialEndsAt) ?? null,
    stripeCustomerId: readString(data.stripe_customer_id) ?? readString(data.stripeCustomerId) ?? null
  }

  if (!user.id || !user.email) {
    throw new Error('User profile response missing required fields')
  }

  return user
}

/**
 * Handle the auth callback from protocol URL
 * Returns the authenticated user or null if failed
 */
export async function handleAuthCallback(url: string, mainWindow: BrowserWindow | null): Promise<User | null> {
  const tokens = parseAuthCallbackUrl(url)
  if (!tokens) {
    console.error('[Auth] Invalid callback URL')
    return null
  }

  try {
    // Store tokens securely
    storeTokens(tokens.accessToken, tokens.refreshToken)

    // Fetch user profile
    const user = await fetchUserProfile(tokens.accessToken)

    // Update current session
    currentSession = {
      user,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken
    }

    // Notify renderer
    mainWindow?.webContents.send('auth:signed-in', user)

    return user
  } catch (error) {
    console.error('[Auth] Failed to complete sign-in:', error)
    clearTokens()
    return null
  }
}

/**
 * Get the current session (load from disk if needed)
 */
export async function getSession(): Promise<AuthSession | null> {
  // Return cached session if available
  if (currentSession) {
    return currentSession
  }

  // Try to load from disk
  const tokens = loadTokens()
  if (!tokens) return null

  try {
    // Verify tokens and fetch user profile
    const user = await fetchUserProfile(tokens.accessToken)

    currentSession = {
      user,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken
    }

    return currentSession
  } catch (error) {
    console.error('[Auth] Failed to restore session:', error)
    // Clear invalid tokens
    clearTokens()
    return null
  }
}

/**
 * Refresh access token using refresh token
 */
export async function refreshAccessToken(): Promise<string | null> {
  const tokens = loadTokens()
  if (!tokens?.refreshToken) return null

  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        refreshToken: tokens.refreshToken
      })
    })

    if (!response.ok) {
      throw new Error(`Failed to refresh token: ${response.status}`)
    }

    const data = asRecord(await response.json())
    const newAccessToken = readString(data.access_token) || readString(data.accessToken)

    if (!newAccessToken) {
      throw new Error('No access token in refresh response')
    }

    // Store updated tokens
    storeTokens(newAccessToken, tokens.refreshToken)

    // Update current session
    if (currentSession) {
      currentSession.accessToken = newAccessToken
    }

    return newAccessToken
  } catch (error) {
    console.error('[Auth] Failed to refresh token:', error)
    clearTokens()
    return null
  }
}

/**
 * Sign out the current user
 */
export function signOut(mainWindow: BrowserWindow | null): void {
  clearTokens()
  mainWindow?.webContents.send('auth:signed-out')
}
