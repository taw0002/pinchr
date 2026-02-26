import { app } from 'electron'
import { homedir } from 'os'
import { release } from 'os'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'

const PINCHR_CONFIG_PATH = join(homedir(), '.pinchr', 'config.json')

interface TelemetryEvent {
  eventType: string
  eventData?: Record<string, unknown>
  timestamp: string
  deviceId: string
  appVersion: string
  osVersion: string
  platform: string
}

function readConfig(): Record<string, unknown> {
  try {
    if (existsSync(PINCHR_CONFIG_PATH)) {
      return JSON.parse(readFileSync(PINCHR_CONFIG_PATH, 'utf-8'))
    }
  } catch { /* ignore */ }
  return {}
}

function writeConfig(config: Record<string, unknown>): void {
  const configDir = join(homedir(), '.pinchr')
  if (!existsSync(configDir)) mkdirSync(configDir, { recursive: true })
  writeFileSync(PINCHR_CONFIG_PATH, JSON.stringify(config, null, 2))
}

class TelemetryClient {
  private endpoint = 'https://pinchr.app/api/telemetry'
  private deviceId: string
  private appVersion: string
  private osVersion: string
  private queue: TelemetryEvent[] = []
  private flushInterval: ReturnType<typeof setInterval> | null = null

  constructor() {
    this.appVersion = app.getVersion()
    this.osVersion = release()
    this.deviceId = this.getOrCreateDeviceId()
    this.flushInterval = setInterval(() => this.flush(), 30_000)
  }

  private getOrCreateDeviceId(): string {
    const config = readConfig()
    if (config.deviceId && typeof config.deviceId === 'string') {
      return config.deviceId
    }
    const id = randomUUID()
    config.deviceId = id
    writeConfig(config)
    return id
  }

  private isOptedOut(): boolean {
    const config = readConfig()
    return config.telemetryOptOut === true
  }

  track(eventType: string, eventData?: Record<string, unknown>): void {
    if (this.isOptedOut()) return

    this.queue.push({
      eventType,
      eventData,
      timestamp: new Date().toISOString(),
      deviceId: this.deviceId,
      appVersion: this.appVersion,
      osVersion: this.osVersion,
      platform: process.platform
    })
  }

  private async flush(): Promise<void> {
    if (this.queue.length === 0) return
    if (this.isOptedOut()) {
      this.queue = []
      return
    }

    const events = [...this.queue]
    this.queue = []

    for (const event of events) {
      try {
        await fetch(this.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(event)
        })
      } catch {
        // Silent fail — never crash the app over telemetry
      }
    }
  }

  async shutdown(): Promise<void> {
    if (this.flushInterval) {
      clearInterval(this.flushInterval)
      this.flushInterval = null
    }
    await this.flush()
  }
}

export const telemetry = new TelemetryClient()
