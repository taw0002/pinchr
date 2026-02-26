import { useState, useEffect } from 'react'
import type { User } from '../../../shared/types'

interface UseAuthReturn {
  user: User | null
  loading: boolean
  isSignedIn: boolean
  signIn: () => Promise<void>
  signOut: () => Promise<void>
}

/**
 * Hook for managing user authentication state
 * Integrates with pinchr.app sign-in via protocol handler
 */
export function useAuth(): UseAuthReturn {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Load initial session
    window.api.auth
      .getSession()
      .then((result) => {
        if (result.ok && result.data) {
          setUser(result.data.user)
        }
        setLoading(false)
      })
      .catch((error) => {
        console.error('[useAuth] Failed to load session:', error)
        setLoading(false)
      })

    // Listen for sign-in events from protocol handler
    const cleanupSignedIn = window.api.auth.onSignedIn((signedInUser) => {
      setUser(signedInUser)
      setLoading(false)
    })

    // Listen for sign-out events
    const cleanupSignedOut = window.api.auth.onSignedOut(() => {
      setUser(null)
    })

    return () => {
      cleanupSignedIn()
      cleanupSignedOut()
    }
  }, [])

  const signIn = async (): Promise<void> => {
    const result = await window.api.auth.signIn()
    if (!result.ok) {
      throw new Error(result.error || 'Failed to open sign-in page')
    }
  }

  const signOut = async (): Promise<void> => {
    const result = await window.api.auth.signOut()
    if (!result.ok) {
      throw new Error(result.error || 'Failed to sign out')
    }
    setUser(null)
  }

  return {
    user,
    loading,
    isSignedIn: !!user,
    signIn,
    signOut
  }
}
