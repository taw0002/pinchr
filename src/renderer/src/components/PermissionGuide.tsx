import { useState, useEffect, useRef, useCallback } from 'react'
import {
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Loader2,
  Monitor,
  MousePointerClick
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

interface PermissionStatus {
  accessibility: boolean
  screenRecording: boolean
  peekabooInstalled: boolean
}

const POLL_INTERVAL_MS = 2000

export function PermissionGuide() {
  const [permissions, setPermissions] = useState<PermissionStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchPermissions = useCallback(async () => {
    try {
      const result = await window.api.computer.checkPermissions()
      if (result.ok && result.data) {
        setPermissions(result.data)
        setError(null)
      } else {
        setError(result.error || 'Failed to check permissions')
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchPermissions()

    pollRef.current = setInterval(() => {
      void fetchPermissions()
    }, POLL_INTERVAL_MS)

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }
  }, [fetchPermissions])

  const allGranted = permissions?.accessibility && permissions?.screenRecording

  const handleOpenAccessibility = async () => {
    await window.api.computer.openAccessibilityPrefs()
  }

  const handleOpenScreenRecording = async () => {
    await window.api.computer.openScreenRecordingPrefs()
  }

  if (loading && !permissions) {
    return (
      <div className="flex items-center gap-2 py-4 text-text-muted">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Checking permissions...</span>
      </div>
    )
  }

  if (error && !permissions) {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
        {error}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Overall status */}
      {allGranted ? (
        <div className="rounded-lg border border-green-500/20 bg-green-500/10 p-3 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0" />
          <p className="text-sm font-medium text-green-400">
            All permissions granted — Computer Use is ready.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/10 p-3 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-yellow-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-yellow-400">
              Permissions required for Computer Use
            </p>
            <p className="text-xs text-text-muted mt-1">
              Grant the permissions below in System Preferences, then come back — status updates automatically.
            </p>
          </div>
        </div>
      )}

      {/* Accessibility */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'h-2.5 w-2.5 rounded-full shrink-0',
              permissions?.accessibility ? 'bg-green-400' : 'bg-yellow-400 animate-pulse'
            )}
          />
          <div className="flex items-center gap-2">
            <MousePointerClick className="h-4 w-4 text-text-muted" />
            <div>
              <p className="text-sm font-medium text-text-primary">Accessibility</p>
              <p className="text-xs text-text-muted">Required for clicks, typing, and UI interaction</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={permissions?.accessibility ? 'success' : 'warning'}>
            {permissions?.accessibility ? 'Granted' : 'Required'}
          </Badge>
          {!permissions?.accessibility && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleOpenAccessibility}
              className="gap-1.5"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open
            </Button>
          )}
        </div>
      </div>

      <Separator />

      {/* Screen Recording */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'h-2.5 w-2.5 rounded-full shrink-0',
              permissions?.screenRecording ? 'bg-green-400' : 'bg-yellow-400 animate-pulse'
            )}
          />
          <div className="flex items-center gap-2">
            <Monitor className="h-4 w-4 text-text-muted" />
            <div>
              <p className="text-sm font-medium text-text-primary">Screen Recording</p>
              <p className="text-xs text-text-muted">Required for screenshots and screen analysis</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={permissions?.screenRecording ? 'success' : 'warning'}>
            {permissions?.screenRecording ? 'Granted' : 'Required'}
          </Badge>
          {!permissions?.screenRecording && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleOpenScreenRecording}
              className="gap-1.5"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open
            </Button>
          )}
        </div>
      </div>

      {/* Peekaboo status */}
      {permissions && !permissions.peekabooInstalled && (
        <>
          <Separator />
          <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/10 p-3 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-yellow-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-yellow-400">Peekaboo not found</p>
              <p className="text-xs text-text-muted mt-1">
                Computer Use automation requires peekaboo. Install it with:{' '}
                <code className="font-mono bg-surface-3 px-1 rounded">brew install peekaboo</code>
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
