/**
 * Hook for AI proxy state — credit balance, usage, settings.
 *
 * NOTE: Managed proxy is "Coming Soon". All proxy fetches are disabled.
 * The hook returns static empty/default values so components don't break.
 */

import { useState, useCallback, useEffect } from 'react'
import { useAuth } from './useAuth'
import {
  loadAiProxySettings,
  saveAiProxySettings,
  type AiMode,
  type AiProxySettings,
  type CreditBalance,
  type UsageSummary
} from '../services/aiProxy'

interface UseAiProxyReturn {
  /** Current AI mode */
  mode: AiMode
  /** Update AI mode */
  setMode: (mode: AiMode) => void
  /** Full settings object */
  settings: AiProxySettings
  /** Update settings */
  updateSettings: (patch: Partial<AiProxySettings>) => void
  /** Credit balance (null — managed proxy not yet available) */
  balance: CreditBalance | null
  /** Whether balance is loading */
  balanceLoading: boolean
  /** Full usage summary */
  usageSummary: UsageSummary | null
  /** Whether usage summary is loading */
  usageLoading: boolean
  /** Whether user is signed in */
  isSignedIn: boolean
  /** Refetch balance (no-op while managed proxy is disabled) */
  refetchBalance: () => void
  /** Refetch usage (no-op while managed proxy is disabled) */
  refetchUsage: () => void
}

export function useAiProxy(): UseAiProxyReturn {
  const { isSignedIn } = useAuth()
  const [settings, setSettings] = useState<AiProxySettings>(loadAiProxySettings)

  // Persist settings on change
  useEffect(() => {
    saveAiProxySettings(settings)
  }, [settings])

  const setMode = useCallback((mode: AiMode) => {
    setSettings((prev) => ({ ...prev, mode }))
  }, [])

  const updateSettings = useCallback((patch: Partial<AiProxySettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }))
  }, [])

  // Managed proxy is Coming Soon — no real fetches
  const noop = useCallback(() => {
    /* no-op */
  }, [])

  return {
    mode: settings.mode,
    setMode,
    settings,
    updateSettings,
    balance: null,
    balanceLoading: false,
    usageSummary: null,
    usageLoading: false,
    isSignedIn,
    refetchBalance: noop,
    refetchUsage: noop
  }
}
