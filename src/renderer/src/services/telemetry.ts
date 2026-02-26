/**
 * Anonymous telemetry service for Pinchr desktop app
 * No PII, no API keys, no user IDs — just usage patterns
 */

interface TelemetryEvent {
  event: string
  properties?: Record<string, unknown>
  timestamp: string
  sessionId: string
  version: string
  platform: string
}

type EventName = 'app_open' | 'page_view' | 'feature_use' | 'error'

class TelemetryService {
  private static instance: TelemetryService
  private sessionId: string
  private version: string = '0.3.0'
  private platform: string = 'unknown'
  private queue: TelemetryEvent[] = []
  private flushTimer: number | null = null
  private readonly BATCH_SIZE = 10
  private readonly FLUSH_INTERVAL = 30000 // 30s
  private readonly API_ENDPOINT = 'https://pinchr.app/api/telemetry'

  private constructor() {
    // Generate random session ID for this launch
    this.sessionId = this.generateSessionId()

    // Get platform info
    if (typeof window !== 'undefined') {
      this.platform = window.navigator?.platform || 'unknown'

      // Try to get app version from API
      this.initVersion()
    }

    // Flush on app close
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        this.flush()
      })
    }

    // Start periodic flush
    this.startFlushTimer()
  }

  private async initVersion(): Promise<void> {
    try {
      const result = await window.api?.app?.version()
      if (result?.ok && result.data) {
        this.version = result.data
      }
    } catch (error) {
      console.debug('Failed to get app version for telemetry:', error)
    }
  }

  private generateSessionId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }

  private isTelemetryEnabled(): boolean {
    try {
      const enabled = localStorage.getItem('pinchr_telemetry_enabled')
      return enabled !== 'false' // Default: true
    } catch {
      return true
    }
  }

  private startFlushTimer(): void {
    this.flushTimer = window.setInterval(() => {
      this.flush()
    }, this.FLUSH_INTERVAL)
  }

  public static getInstance(): TelemetryService {
    if (!TelemetryService.instance) {
      TelemetryService.instance = new TelemetryService()
    }
    return TelemetryService.instance
  }

  /**
   * Track an event (fire-and-forget, never blocks)
   */
  public track(event: EventName, properties?: Record<string, unknown>): void {
    if (!this.isTelemetryEnabled()) {
      return
    }

    try {
      const telemetryEvent: TelemetryEvent = {
        event,
        properties: properties || {},
        timestamp: new Date().toISOString(),
        sessionId: this.sessionId,
        version: this.version,
        platform: this.platform
      }

      this.queue.push(telemetryEvent)

      // Auto-flush if batch size reached
      if (this.queue.length >= this.BATCH_SIZE) {
        this.flush()
      }
    } catch (error) {
      // Silently fail — telemetry should never crash the app
      console.debug('Telemetry tracking error:', error)
    }
  }

  /**
   * Flush queued events to API
   */
  public flush(): void {
    if (this.queue.length === 0 || !this.isTelemetryEnabled()) {
      return
    }

    const events = [...this.queue]
    this.queue = []

    // Fire-and-forget POST
    fetch(this.API_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events }),
      keepalive: true // Important for beforeunload
    }).catch((error) => {
      // Silently fail
      console.debug('Telemetry flush error:', error)
    })
  }

  /**
   * Track app open event
   */
  public trackAppOpen(): void {
    this.track('app_open', {
      arch: window.navigator?.userAgent || 'unknown'
    })
  }

  /**
   * Track page view
   */
  public trackPageView(page: string): void {
    this.track('page_view', { page })
  }

  /**
   * Track feature usage
   */
  public trackFeatureUse(feature: string, metadata?: Record<string, unknown>): void {
    this.track('feature_use', { feature, ...metadata })
  }

  /**
   * Track error (sanitized, no PII)
   */
  public trackError(errorMessage: string, context?: Record<string, unknown>): void {
    // Sanitize error message (remove paths, tokens, etc.)
    const sanitized = this.sanitizeError(errorMessage)
    this.track('error', { message: sanitized, ...context })
  }

  private sanitizeError(message: string): string {
    // Remove file paths
    let sanitized = message.replace(/\/[^\s]+/g, '[PATH]')

    // Remove tokens/keys (common patterns)
    sanitized = sanitized.replace(/[a-zA-Z0-9_-]{20,}/g, '[TOKEN]')

    // Remove email addresses
    sanitized = sanitized.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL]')

    return sanitized
  }

  /**
   * Cleanup on shutdown
   */
  public shutdown(): void {
    if (this.flushTimer !== null) {
      window.clearInterval(this.flushTimer)
      this.flushTimer = null
    }
    this.flush()
  }
}

// Export singleton instance
export const telemetry = TelemetryService.getInstance()
