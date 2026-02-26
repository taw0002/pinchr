import { useMemo, useState } from 'react'
import { Activity, AlertTriangle, CheckCircle2, Clock3, ListTodo, Loader2, Orbit, Play, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import {
  useCronList,
  useCronRunsForJobs,
  useRemoveCronJob,
  useRunCronJob,
  useSetCronJobEnabled
} from '@/hooks/useGateway'
import type { CronJobSummary, CronRunSummary } from '../../../shared/types'

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function readString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function truncate(value: string, maxLength = 64): string {
  if (value.length <= maxLength) return value
  return `${value.slice(0, maxLength - 3)}...`
}

function derivePayloadText(job: CronJobSummary): string | null {
  const metadata = asRecord(job.metadata)
  if (!metadata) return null

  const payload = asRecord(metadata.payload)
  const text =
    readString(payload?.text) ??
    readString(payload?.message) ??
    readString(payload?.prompt) ??
    readString(metadata.text) ??
    readString(metadata.message) ??
    readString(metadata.prompt) ??
    readString(metadata.workflow) ??
    readString(metadata.command)

  return text ? truncate(text) : null
}

function formatJobName(job: CronJobSummary): string {
  const explicitName = job.name.trim()
  const fallbackPayload = derivePayloadText(job)

  if (explicitName && explicitName !== job.id) return explicitName
  if (fallbackPayload) return fallbackPayload
  if (explicitName) return explicitName
  return job.id
}

function formatUnit(value: number, unit: string): string {
  const rounded = Number.isInteger(value) ? value : Number(value.toFixed(1))
  return `${rounded} ${unit}${rounded === 1 ? '' : 's'}`
}

function formatHourMinute(hour: number, minute: number): string {
  const sampleDate = new Date(2000, 0, 1, hour, minute)
  return sampleDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function describeCronExpression(expr: string): string | null {
  const parts = expr.trim().split(/\s+/)
  if (parts.length < 5) return null

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts

  if (dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    const everyMinutesMatch = minute.match(/^\*\/(\d+)$/)
    if (everyMinutesMatch && hour === '*') {
      const minutes = Number(everyMinutesMatch[1])
      return Number.isFinite(minutes) && minutes > 0 ? `Every ${formatUnit(minutes, 'minute')}` : null
    }

    const everyHoursMatch = hour.match(/^\*\/(\d+)$/)
    if (everyHoursMatch && minute === '0') {
      const hours = Number(everyHoursMatch[1])
      return Number.isFinite(hours) && hours > 0 ? `Every ${formatUnit(hours, 'hour')}` : null
    }

    if (/^\d+$/.test(minute) && /^\d+$/.test(hour)) {
      return `Daily at ${formatHourMinute(Number(hour), Number(minute))}`
    }
  }

  if (dayOfMonth === '*' && month === '*' && dayOfWeek === '1-5' && /^\d+$/.test(minute) && /^\d+$/.test(hour)) {
    return `Weekdays at ${formatHourMinute(Number(hour), Number(minute))}`
  }

  if (dayOfMonth === '*' && month === '*' && /^\d+$/.test(dayOfWeek) && /^\d+$/.test(minute) && /^\d+$/.test(hour)) {
    const weekdayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    const weekday = Number(dayOfWeek) === 7 ? 0 : Number(dayOfWeek)
    const weekdayName = weekdayNames[weekday]
    if (weekdayName) return `${weekdayName} at ${formatHourMinute(Number(hour), Number(minute))}`
  }

  return null
}

function formatSchedule(schedule: CronJobSummary['schedule']): string {
  if (typeof schedule === 'string') return schedule

  if (schedule.kind === 'every' && schedule.everyMs) {
    const everyMs = schedule.everyMs
    if (everyMs < 60_000) {
      return `Every ${formatUnit(everyMs / 1000, 'second')}`
    }

    if (everyMs < 3_600_000) {
      return `Every ${formatUnit(everyMs / 60_000, 'minute')}`
    }

    if (everyMs < 86_400_000) {
      return `Every ${formatUnit(everyMs / 3_600_000, 'hour')}`
    }

    return `Every ${formatUnit(everyMs / 86_400_000, 'day')}`
  }

  if (schedule.kind === 'cron' && schedule.expr) {
    const friendly = describeCronExpression(schedule.expr)
    if (friendly) {
      return schedule.tz ? `${friendly} (${schedule.tz})` : friendly
    }

    return `Cron: ${schedule.expr}${schedule.tz ? ` (${schedule.tz})` : ''}`
  }

  if (schedule.kind === 'at' && schedule.at) {
    const atDate = new Date(schedule.at)
    if (Number.isNaN(atDate.getTime())) return `One-time: ${schedule.at}`
    return `One-time: ${atDate.toLocaleString()}`
  }

  return 'Custom schedule'
}

function normalizeStatus(status: string | undefined): string {
  return (status ?? '').trim().toLowerCase()
}

function isFailureStatus(status: string | undefined): boolean {
  const normalized = normalizeStatus(status)
  return normalized.includes('error') || normalized.includes('fail')
}

function isSuccessStatus(status: string | undefined): boolean {
  const normalized = normalizeStatus(status)
  return normalized === 'success' || normalized === 'completed' || normalized === 'ok'
}

function isPendingStatus(status: string | undefined): boolean {
  const normalized = normalizeStatus(status)
  return normalized === '' || normalized.includes('pending') || normalized.includes('running') || normalized.includes('queue')
}

function toStatusLabel(status: string | undefined): string {
  if (isSuccessStatus(status)) return 'Success'
  if (isFailureStatus(status)) return 'Error'
  if (isPendingStatus(status)) return 'Pending'

  const normalized = normalizeStatus(status)
  if (!normalized) return 'Pending'
  return normalized.charAt(0).toUpperCase() + normalized.slice(1)
}

function toStatusVariant(status: string | undefined): 'success' | 'error' | 'warning' | 'secondary' {
  if (isSuccessStatus(status)) return 'success'
  if (isFailureStatus(status)) return 'error'
  if (isPendingStatus(status)) return 'warning'
  return 'secondary'
}

function toStatusDotClass(status: string | undefined): string {
  if (isSuccessStatus(status)) return 'bg-emerald-400'
  if (isFailureStatus(status)) return 'bg-red-400'
  if (isPendingStatus(status)) return 'bg-amber-400'
  return 'bg-text-muted'
}

function getRunTimestamp(run: CronRunSummary | undefined): string | undefined {
  if (!run) return undefined
  return run.startedAt ?? run.completedAt
}

function runSortTimestamp(run: CronRunSummary): number {
  const stamp = getRunTimestamp(run)
  if (!stamp) return 0

  const timestamp = new Date(stamp).getTime()
  return Number.isFinite(timestamp) ? timestamp : 0
}

function formatDateTime(dateStr: string | undefined): string {
  if (!dateStr) return 'Never'
  const date = new Date(dateStr)
  if (Number.isNaN(date.getTime())) return dateStr
  return date.toLocaleString()
}

function formatRelativeTime(dateStr: string | undefined): string | null {
  if (!dateStr) return null

  const target = new Date(dateStr)
  if (Number.isNaN(target.getTime())) return null

  const diffMs = target.getTime() - Date.now()
  const absMs = Math.abs(diffMs)
  const absMinutes = Math.floor(absMs / 60_000)
  const absHours = Math.floor(absMinutes / 60)
  const absDays = Math.floor(absHours / 24)

  if (absMinutes < 1) return diffMs >= 0 ? 'in moments' : 'just now'

  if (absMinutes < 60) {
    return diffMs >= 0 ? `in ${absMinutes}m` : `${absMinutes}m ago`
  }

  if (absHours < 24) {
    return diffMs >= 0 ? `in ${absHours}h` : `${absHours}h ago`
  }

  return diffMs >= 0 ? `in ${absDays}d` : `${absDays}d ago`
}

export default function AutomationsHub() {
  const { data: jobs, isLoading: statsLoading, isFetching: jobsFetching } = useCronList(10000)
  const { data: runsByJob, isFetching: runsFetching } = useCronRunsForJobs(jobs, 3, 15000)
  const setEnabledMutation = useSetCronJobEnabled()
  const runJobMutation = useRunCronJob()
  const removeJobMutation = useRemoveCronJob()

  const [togglingJobId, setTogglingJobId] = useState<string | null>(null)
  const [runningJobId, setRunningJobId] = useState<string | null>(null)
  const [deletingJobId, setDeletingJobId] = useState<string | null>(null)

  const jobList = jobs ?? []

  const sortedRunsByJob = useMemo(() => {
    const sorted: Record<string, CronRunSummary[]> = {}

    for (const job of jobList) {
      const runs = runsByJob?.[job.id] ?? []
      sorted[job.id] = [...runs].sort((a, b) => runSortTimestamp(b) - runSortTimestamp(a))
    }

    return sorted
  }, [jobList, runsByJob])

  const activeCount = useMemo(() => jobList.filter((job) => job.enabled).length, [jobList])

  const latestRuns = useMemo(
    () =>
      jobList
        .map((job) => sortedRunsByJob[job.id]?.[0])
        .filter((run): run is CronRunSummary => !!run),
    [jobList, sortedRunsByJob]
  )

  const successRuns = useMemo(() => latestRuns.filter((run) => isSuccessStatus(run.status)).length, [latestRuns])
  const failedRuns = useMemo(() => latestRuns.filter((run) => isFailureStatus(run.status)).length, [latestRuns])

  const latestRunTimestamp = useMemo(() => {
    const stamps = latestRuns
      .map((run) => getRunTimestamp(run))
      .filter((stamp): stamp is string => typeof stamp === 'string' && stamp.length > 0)

    if (stamps.length === 0) return null

    return stamps.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0]
  }, [latestRuns])

  const handleSetEnabled = async (jobId: string, enabled: boolean) => {
    setTogglingJobId(jobId)
    try {
      await setEnabledMutation.mutateAsync({ jobId, enabled })
    } catch (error) {
      console.error('Failed to update cron job state:', error)
    } finally {
      setTogglingJobId(null)
    }
  }

  const handleRunNow = async (jobId: string) => {
    setRunningJobId(jobId)
    try {
      await runJobMutation.mutateAsync(jobId)
    } catch (error) {
      console.error('Failed to run cron job:', error)
    } finally {
      setRunningJobId(null)
    }
  }

  const handleDelete = async (job: CronJobSummary) => {
    const confirmed = window.confirm(`Delete automation "${formatJobName(job)}"? This cannot be undone.`)
    if (!confirmed) return

    setDeletingJobId(job.id)
    try {
      await removeJobMutation.mutateAsync(job.id)
    } catch (error) {
      console.error('Failed to delete cron job:', error)
    } finally {
      setDeletingJobId(null)
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-border bg-surface px-6 py-4">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">Automation Studio</p>
              <Badge variant="default">Live</Badge>
            </div>
            <h1 className="text-xl font-semibold text-text-primary">Automations</h1>
            <p className="text-sm text-text-secondary">Manage recurring cron jobs for your workspace.</p>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="rounded-xl border border-border bg-surface-2 px-4 py-3">
              <div className="mb-1 flex items-center gap-2 text-xs text-text-muted">
                <ListTodo className="h-3.5 w-3.5" />
                Total automations
              </div>
              <p className="text-xl font-semibold text-text-primary">
                {statsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : jobList.length}
              </p>
            </div>

            <div className="rounded-xl border border-border bg-surface-2 px-4 py-3">
              <div className="mb-1 flex items-center gap-2 text-xs text-text-muted">
                <Activity className="h-3.5 w-3.5" />
                Active now
              </div>
              <p className="text-xl font-semibold text-emerald-400">
                {statsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : activeCount}
              </p>
            </div>

            <div className="rounded-xl border border-border bg-surface-2 px-4 py-3">
              <div className="mb-1 flex items-center gap-2 text-xs text-text-muted">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Last-run health
              </div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-text-primary">
                  {latestRuns.length === 0 ? 'No runs yet' : `${successRuns} healthy`}
                </p>
                {failedRuns > 0 && (
                  <span className="inline-flex items-center gap-1 text-xs text-amber-400">
                    <AlertTriangle className="h-3 w-3" />
                    {failedRuns} issues
                  </span>
                )}
              </div>
              {latestRunTimestamp && (
                <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-text-muted">
                  <Orbit className="h-3 w-3" />
                  Last run {formatRelativeTime(latestRunTimestamp) ?? formatDateTime(latestRunTimestamp)}
                </p>
              )}
            </div>

            <div className="rounded-xl border border-border bg-surface-2 px-4 py-3">
              <div className="mb-1 flex items-center gap-2 text-xs text-text-muted">
                <ListTodo className="h-3.5 w-3.5" />
                Coverage
              </div>
              <p className="text-sm font-semibold text-text-primary">
                {jobList.length === 0 ? 'No schedules yet' : `${Math.round((activeCount / jobList.length) * 100)}% enabled`}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-text-muted">Cron jobs</h2>
            {(jobsFetching || runsFetching) && (
              <span className="inline-flex items-center gap-2 text-xs text-text-muted">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Syncing
              </span>
            )}
          </div>

          {jobList.length === 0 && !statsLoading ? (
            <div className="rounded-xl border border-border bg-surface-2 px-6 py-10 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/10">
                <Clock3 className="h-6 w-6 text-accent" />
              </div>
              <h3 className="mb-1 text-sm font-semibold text-text-primary">No automations yet</h3>
              <p className="mx-auto max-w-md text-xs text-text-muted">
                Ask your agent to schedule something, for example: "Check my email every morning at 9am."
              </p>
            </div>
          ) : (
            jobList.map((job) => {
              const runHistory = sortedRunsByJob[job.id] ?? []
              const latestRun = runHistory[0]
              const lastRunTimestamp = getRunTimestamp(latestRun) ?? job.lastRun
              const nextRunRelative = formatRelativeTime(job.nextRun)

              return (
                <section key={job.id} className="rounded-xl border border-border bg-surface-2 px-4 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <h3 className="truncate text-sm font-semibold text-text-primary">{formatJobName(job)}</h3>
                      <p className="text-xs text-text-muted">{formatSchedule(job.schedule)}</p>
                    </div>

                    <div className="flex items-center gap-3">
                      <Badge variant={job.enabled ? 'success' : 'secondary'}>{job.enabled ? 'Enabled' : 'Disabled'}</Badge>
                      <Switch
                        checked={job.enabled}
                        onCheckedChange={(enabled) => handleSetEnabled(job.id, enabled)}
                        disabled={togglingJobId === job.id}
                        aria-label={`Toggle automation ${formatJobName(job)}`}
                      />
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <div className="rounded-lg border border-border/60 bg-surface px-3 py-2">
                      <p className="text-[11px] uppercase tracking-wide text-text-muted">Next run</p>
                      <p className="mt-1 text-sm font-medium text-text-primary">{formatDateTime(job.nextRun)}</p>
                      {nextRunRelative && <p className="mt-0.5 text-xs text-text-muted">{nextRunRelative}</p>}
                    </div>

                    <div className="rounded-lg border border-border/60 bg-surface px-3 py-2">
                      <p className="text-[11px] uppercase tracking-wide text-text-muted">Last run</p>
                      <div className="mt-1 flex items-center gap-2">
                        <p className="text-sm font-medium text-text-primary">{formatDateTime(lastRunTimestamp)}</p>
                        <Badge variant={toStatusVariant(latestRun?.status)}>{toStatusLabel(latestRun?.status)}</Badge>
                      </div>
                    </div>

                    <div className="rounded-lg border border-border/60 bg-surface px-3 py-2">
                      <p className="text-[11px] uppercase tracking-wide text-text-muted">Recent history</p>
                      {runHistory.length > 0 ? (
                        <div className="mt-2 flex items-center gap-2">
                          {runHistory.slice(0, 3).map((run) => (
                            <span
                              key={run.id}
                              className={`h-2.5 w-2.5 rounded-full ${toStatusDotClass(run.status)}`}
                              title={`${toStatusLabel(run.status)} - ${formatDateTime(getRunTimestamp(run))}`}
                            />
                          ))}
                        </div>
                      ) : (
                        <p className="mt-1 text-xs text-text-muted">No runs yet</p>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={() => handleRunNow(job.id)}
                      disabled={runningJobId === job.id}
                    >
                      <Play className="h-3.5 w-3.5" />
                      {runningJobId === job.id ? 'Running...' : 'Run Now'}
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="gap-2"
                      onClick={() => handleDelete(job)}
                      disabled={deletingJobId === job.id}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {deletingJobId === job.id ? 'Deleting...' : 'Delete'}
                    </Button>
                  </div>
                </section>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
