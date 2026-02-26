export type ActionType =
  | 'file_read'
  | 'file_write'
  | 'command_run'
  | 'clipboard_access'
  | 'browser_action'
  | 'api_call'
  | 'permission_change'
  | 'gateway_action'
  | 'mcp_tool_call'

export type ActionStatus = 'allowed' | 'blocked' | 'pending'

export interface ActivityEntry {
  id: string
  timestamp: string
  actionType: ActionType
  description: string
  status: ActionStatus
  metadata?: Record<string, unknown>
}

const MAX_ENTRIES = 1000

class ActivityLogger {
  private entries: ActivityEntry[] = []
  private networkCount = 0
  private startTime = Date.now()

  log(
    actionType: ActionType,
    description: string,
    status: ActionStatus = 'allowed',
    metadata?: Record<string, unknown>
  ): ActivityEntry {
    const entry: ActivityEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      actionType,
      description,
      status,
      metadata
    }

    this.entries.unshift(entry)
    if (this.entries.length > MAX_ENTRIES) {
      this.entries.pop()
    }

    if (actionType === 'api_call') {
      this.networkCount++
    }

    return entry
  }

  getRecent(limit = 100, filterType?: ActionType): ActivityEntry[] {
    if (filterType) {
      return this.entries.filter((e) => e.actionType === filterType).slice(0, limit)
    }
    return this.entries.slice(0, limit)
  }

  getAll(): ActivityEntry[] {
    return [...this.entries]
  }

  getNetworkCount(): number {
    return this.networkCount
  }

  getUptime(): number {
    return Date.now() - this.startTime
  }

  getBlockedCount(): number {
    return this.entries.filter((e) => e.status === 'blocked').length
  }

  getDaysRunning(): number {
    return Math.floor(this.getUptime() / (1000 * 60 * 60 * 24))
  }

  clear(): void {
    this.entries = []
    this.networkCount = 0
  }
}

export const activityLogger = new ActivityLogger()

// Log app startup
activityLogger.log('gateway_action', 'Pinchr started')
