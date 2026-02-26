/**
 * AI Proxy Service — Fetches credit balance, usage logs, and model info
 * from the Pinchr managed AI proxy.
 *
 * All data comes from real API calls — no fake/random data.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CreditBalance {
  balanceCents: number
  lifetimeUsedCents: number
  updatedAt: string
}

export interface UsageLogEntry {
  id: string
  model: string
  provider: string
  inputTokens: number
  outputTokens: number
  costCents: number
  sessionKey: string | null
  createdAt: string
}

export interface DailySpend {
  date: string
  totalCents: number
}

export interface ModelInfo {
  id: string
  name: string
  provider: string
  costTier: '$' | '$$' | '$$$'
  inputPer1M: number
  outputPer1M: number
  /** Estimated cost per average message (~1k input, ~500 output tokens) */
  estimatedPerMessage: number
}

export interface UsageSummary {
  balance: CreditBalance
  recentUsage: UsageLogEntry[]
  dailySpend: DailySpend[]
  modelBreakdown: Array<{ model: string; totalCents: number; count: number }>
}

// ---------------------------------------------------------------------------
// Settings (localStorage)
// ---------------------------------------------------------------------------

const SETTINGS_KEY = 'pinchr_ai_proxy_settings'

export type AiMode = 'managed' | 'byok'

export interface AiProxySettings {
  mode: AiMode
  selectedModel: string
  dailySpendLimitCents: number
}

const DEFAULT_SETTINGS: AiProxySettings = {
  mode: 'byok',
  selectedModel: 'anthropic/claude-sonnet-4-5',
  dailySpendLimitCents: 500 // $5/day
}

export function loadAiProxySettings(): AiProxySettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return { ...DEFAULT_SETTINGS }
    const parsed = JSON.parse(raw) as Partial<AiProxySettings>
    return {
      mode: parsed.mode === 'byok' ? 'byok' : 'managed',
      selectedModel: parsed.selectedModel || DEFAULT_SETTINGS.selectedModel,
      dailySpendLimitCents:
        typeof parsed.dailySpendLimitCents === 'number'
          ? parsed.dailySpendLimitCents
          : DEFAULT_SETTINGS.dailySpendLimitCents
    }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveAiProxySettings(settings: AiProxySettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    // Ignore storage failures
  }
}

// ---------------------------------------------------------------------------
// Available Models
// ---------------------------------------------------------------------------

export const AVAILABLE_MODELS: ModelInfo[] = [
  {
    id: 'anthropic/claude-sonnet-4-5',
    name: 'Claude Sonnet 4.5',
    provider: 'anthropic',
    costTier: '$',
    inputPer1M: 300, // $3.00 in cents
    outputPer1M: 1500, // $15.00 in cents
    estimatedPerMessage: 2 // ~$0.02
  },
  {
    id: 'openai/gpt-5.2',
    name: 'GPT-5.2',
    provider: 'openai',
    costTier: '$',
    inputPer1M: 250,
    outputPer1M: 1000,
    estimatedPerMessage: 1 // ~$0.01
  },
  {
    id: 'anthropic/claude-opus-4-6',
    name: 'Claude Opus 4.6',
    provider: 'anthropic',
    costTier: '$$$',
    inputPer1M: 1500,
    outputPer1M: 7500,
    estimatedPerMessage: 5 // ~$0.05
  }
]

// ---------------------------------------------------------------------------
// Proxy URL
// ---------------------------------------------------------------------------

const PROXY_URL =
  (typeof import.meta !== 'undefined' &&
    (import.meta as Record<string, Record<string, string>>).env?.PINCHR_PROXY_URL) ||
  'https://proxy.pinchr.app'

// ---------------------------------------------------------------------------
// Auth helper — get JWT from current session
// ---------------------------------------------------------------------------

async function getAuthToken(): Promise<string | null> {
  try {
    const result = await window.api.auth.getSession()
    if (!result.ok || !result.data) return null
    // The session may contain a JWT token
    const session = result.data as Record<string, unknown>
    if (typeof session.accessToken === 'string') return session.accessToken
    if (typeof session.token === 'string') return session.token
    // Fallback: check for nested jwt
    const user = session.user as Record<string, unknown> | undefined
    if (user && typeof user.accessToken === 'string') return user.accessToken
    return null
  } catch {
    return null
  }
}

async function proxyFetch<T>(path: string): Promise<T | null> {
  try {
    const token = await getAuthToken()
    if (!token) return null

    const response = await fetch(`${PROXY_URL}${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) return null
    return (await response.json()) as T
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// API Functions
// ---------------------------------------------------------------------------

export async function fetchCreditBalance(): Promise<CreditBalance | null> {
  return proxyFetch<CreditBalance>('/v1/credits')
}

export async function fetchUsageSummary(): Promise<UsageSummary | null> {
  return proxyFetch<UsageSummary>('/v1/usage')
}

export async function fetchRecentUsage(limit = 20): Promise<UsageLogEntry[] | null> {
  return proxyFetch<UsageLogEntry[]>(`/v1/usage/recent?limit=${limit}`)
}

export function getRechargeUrl(amountCents: number): string {
  return `${PROXY_URL}/v1/credits/recharge?amount=${amountCents}`
}

export function formatCents(cents: number): string {
  const dollars = cents / 100
  if (dollars >= 1) return `$${dollars.toFixed(2)}`
  return `$${dollars.toFixed(2)}`
}

export function formatCentsShort(cents: number): string {
  const dollars = cents / 100
  if (dollars >= 100) return `$${Math.round(dollars)}`
  if (dollars >= 10) return `$${dollars.toFixed(1)}`
  return `$${dollars.toFixed(2)}`
}

export function balanceHealthColor(balanceCents: number): 'green' | 'yellow' | 'red' {
  if (balanceCents >= 500) return 'green'
  if (balanceCents >= 100) return 'yellow'
  return 'red'
}
