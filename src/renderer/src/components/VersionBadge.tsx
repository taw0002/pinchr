import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { BUILD_HASH } from '../buildInfo'

type UpdateInfo = {
  available: boolean
  version?: string
  downloaded?: boolean
  canDownload?: boolean
}

type ParsedVersion = {
  major: number
  minor: number
  patch: number
}

function parseVersion(value?: string): ParsedVersion | null {
  if (!value) return null
  const match = value.trim().match(/^v?(\d+)\.(\d+)\.(\d+)/)
  if (!match) return null
  return {
    major: Number(match[1] || 0),
    minor: Number(match[2] || 0),
    patch: Number(match[3] || 0)
  }
}

function versionGapSeverity(currentVersion: string, latestVersion?: string): 'none' | 'minor' | 'major' {
  const current = parseVersion(currentVersion)
  const latest = parseVersion(latestVersion)
  if (!current || !latest) return 'minor'

  const majorDiff = latest.major - current.major
  const minorDiff = latest.minor - current.minor
  const patchDiff = latest.patch - current.patch

  if (majorDiff > 1) return 'major'
  if (majorDiff === 1) {
    return latest.minor === 0 && latest.patch === 0 ? 'minor' : 'major'
  }
  if (majorDiff < 0) return 'none'

  if (minorDiff > 1) return 'major'
  if (minorDiff === 1) {
    return latest.patch === 0 ? 'minor' : 'major'
  }
  if (minorDiff < 0) return 'none'

  if (patchDiff > 1) return 'major'
  if (patchDiff === 1) return 'minor'

  return 'none'
}

interface VersionBadgeProps {
  mode?: 'fixed' | 'inline'
  className?: string
}

export function VersionBadge({ mode = 'fixed', className }: VersionBadgeProps) {
  const buildHash = BUILD_HASH as string
  const [version, setVersion] = useState<string>('0.0.0')
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [busy, setBusy] = useState(false)
  const [statusText, setStatusText] = useState<string | null>(null)

  const refreshUpdate = useCallback(async (): Promise<UpdateInfo | null> => {
    const response = await window.api.updater.check()
    if (!response.ok) {
      setStatusText('Check failed')
      return null
    }
    const next = response.data || { available: false }
    setUpdateInfo(next)
    return next
  }, [])

  useEffect(() => {
    const loadVersion = async () => {
      const response = await window.api.getAppVersion()
      if (response.ok && response.data) {
        setVersion(response.data)
      }
    }

    void loadVersion()
    void refreshUpdate()

    const interval = window.setInterval(() => {
      void refreshUpdate()
    }, 10 * 60 * 1000)

    return () => {
      window.clearInterval(interval)
    }
  }, [refreshUpdate])

  useEffect(() => {
    if (!statusText) return
    const timer = window.setTimeout(() => setStatusText(null), 4000)
    return () => window.clearTimeout(timer)
  }, [statusText])

  const updateLabel = useMemo(() => {
    if (busy) return 'Working'
    if (statusText) return statusText
    if (!updateInfo?.available) return 'Check'
    if (updateInfo.downloaded) return 'Restart'
    return 'Update'
  }, [busy, statusText, updateInfo])

  const severity = useMemo(() => {
    if (!updateInfo?.available || updateInfo.downloaded) return 'none'
    return versionGapSeverity(version, updateInfo.version)
  }, [updateInfo, version])

  const handleClick = async () => {
    if (busy) return

    setBusy(true)
    try {
      if (!updateInfo?.available) {
        const latest = await refreshUpdate()
        if (!latest?.available) {
          setStatusText('Up to date')
        } else {
          setStatusText(
            versionGapSeverity(version, latest.version) === 'major'
              ? 'Urgent update'
              : 'Update available'
          )
        }
        return
      }

      if (updateInfo.downloaded) {
        const restartResult = await window.api.updater.restart()
        if (!restartResult.ok) {
          setStatusText('Restart failed')
        }
      } else {
        const downloadResult = await window.api.updater.download()
        if (!downloadResult.ok) {
          setStatusText('Update failed')
        }
        await refreshUpdate()
      }
    } catch {
      setStatusText('Update failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      className={cn(
        'flex items-center gap-2 rounded-full border border-border/70 bg-surface/80 px-2.5 py-1.5 text-[11px] text-text-muted backdrop-blur-sm transition-colors cursor-pointer select-none',
        mode === 'fixed' ? 'fixed right-3 top-3 z-[60]' : 'relative z-10',
        severity === 'major' && 'border-red-500/55 bg-red-500/10 text-red-200 hover:border-red-400/75',
        severity === 'minor' && 'border-amber-500/55 bg-amber-500/10 text-amber-200 hover:border-amber-400/75',
        severity === 'none' && 'hover:border-border hover:text-text-secondary',
        busy ? 'opacity-80' : '',
        className
      )}
      style={{ WebkitAppRegion: 'no-drag', pointerEvents: 'auto' } as CSSProperties}
      aria-label="Check for Pinchr updates"
      title={
        updateInfo?.available
          ? updateInfo.downloaded
            ? 'Update downloaded. Click to restart and install.'
            : `Version ${updateInfo.version || ''} is available. Click to update.`
          : `Pinchr v${version}. Click to check for updates.`
      }
    >
      <span className="pointer-events-none">{`v${version}`}{buildHash !== 'dev' ? ` (${buildHash})` : ''}</span>
      {updateLabel && (
        <span
          className={cn(
            'pointer-events-none inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium',
            severity === 'major' && 'bg-red-500/20 text-red-300',
            severity === 'minor' && 'bg-amber-500/20 text-amber-300',
            severity === 'none' && 'bg-white/5 text-text-muted'
          )}
        >
          {busy ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : updateInfo?.available ? (
            <span
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                severity === 'major' && 'bg-red-300',
                severity === 'minor' && 'bg-amber-300'
              )}
            />
          ) : null}
          {updateLabel}
        </span>
      )}
    </button>
  )
}
