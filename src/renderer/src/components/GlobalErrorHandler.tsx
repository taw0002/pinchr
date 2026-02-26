import { useEffect } from 'react'
import { telemetry } from '@/services/telemetry'

/**
 * GlobalErrorHandler - Catches unhandled errors and promise rejections
 *
 * This component sets up global error handlers to catch:
 * - Unhandled promise rejections (async errors)
 * - window.onerror events (synchronous errors)
 *
 * All errors are logged to console and sent to telemetry service.
 */
export function GlobalErrorHandler() {
  useEffect(() => {
    // Handle unhandled promise rejections
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.error('Unhandled promise rejection:', event.reason)

      // Extract error message
      const errorMessage =
        event.reason instanceof Error
          ? event.reason.message
          : typeof event.reason === 'string'
            ? event.reason
            : 'Unknown promise rejection'

      // Track in telemetry
      telemetry.trackError(errorMessage, {
        type: 'unhandled_promise_rejection',
        stack: event.reason instanceof Error ? event.reason.stack?.substring(0, 500) : undefined
      })

      // Prevent default browser behavior (showing error in console)
      event.preventDefault()
    }

    // Handle window.onerror events
    const handleWindowError = (
      event: Event | string,
      source?: string,
      lineno?: number,
      colno?: number,
      error?: Error
    ) => {
      const errorMessage = error?.message || (typeof event === 'string' ? event : 'Unknown error')

      console.error('Global error:', {
        message: errorMessage,
        source,
        lineno,
        colno,
        error
      })

      // Track in telemetry
      telemetry.trackError(errorMessage, {
        type: 'window_error',
        source,
        line: lineno,
        column: colno,
        stack: error?.stack?.substring(0, 500)
      })

      // Return true to prevent default browser error handling
      return true
    }

    // Attach event listeners
    window.addEventListener('unhandledrejection', handleUnhandledRejection)
    window.addEventListener('error', handleWindowError as EventListener)

    // Cleanup on unmount
    return () => {
      window.removeEventListener('unhandledrejection', handleUnhandledRejection)
      window.removeEventListener('error', handleWindowError as EventListener)
    }
  }, [])

  // This component doesn't render anything
  return null
}
