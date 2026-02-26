# Spec: Separate Automations and Tasks Pages

## What
The Automations page currently embeds the entire Tasks page below the cron stats header. These are two fundamentally different concepts that need their own dedicated pages:
- **Tasks** = work queue (finite items to do, kanban board, projects, assignees)
- **Automations** = repeatable processes (cron jobs, scheduled recurring actions)

## Why
Drew flagged this as confusing — the current page is a weird blend. Tasks are "things to do" (finite). Automations are "things that keep happening" (recurring). Mixing them makes both worse and confuses users.

## Current State

### AutomationsHub.tsx (143 lines)
- Top section: Cron stats cards (total, active, health, coverage) — ✅ correct for Automations
- Bottom section: `<Tasks embedded />` — ❌ this is the entire Tasks page jammed in
- Uses `useCronList()` and `useCronRunsForJobs()` hooks from useGateway.ts

### Tasks.tsx (567 lines)
- Full task management: Projects sidebar, TaskQuickAdd, search/filters, Board/List/Timeline views, TaskDetailPanel, Settings sheet
- Has an `embedded` prop that AutomationsHub uses
- Standalone page works fine on its own

## Implementation

### 1. Rebuild AutomationsHub.tsx as a dedicated Automations page

Remove the `<Tasks embedded />` import entirely. Replace with a proper cron job management UI:

**Layout:**
- Same header with stats cards (keep existing)
- Below: List of cron jobs with details

**Each cron job card should show:**
- Job name (from `job.name` or derive from payload text)
- Schedule description (human-readable: "Every 30 minutes", "Daily at 9:00 AM", etc.)
- Status: enabled/disabled toggle
- Last run: timestamp + status (success/error)
- Next run: estimated time
- Quick actions: Enable/Disable, Run Now, Delete

**Hooks already available in useGateway.ts:**
- `useCronList()` — fetches all cron jobs
- `useCronRunsForJobs()` — fetches run history per job
- `useSetCronJobEnabled()` — toggle enable/disable
- `useRunCronJob()` — trigger immediate run
- `useRemoveCronJob()` — delete a job

**CronJobSummary type (from useGateway.ts):**
```typescript
interface CronJobSummary {
  id: string
  name: string
  enabled: boolean
  schedule: {
    kind: 'cron' | 'every' | 'at'
    expr?: string
    everyMs?: number
    at?: string
    tz?: string
  }
  payload: {
    kind: 'systemEvent' | 'agentTurn'
    text?: string
    message?: string
  }
  sessionTarget: 'main' | 'isolated'
  nextRunAt?: string
  lastRunAt?: string
}
```

**CronRunSummary type:**
```typescript
interface CronRunSummary {
  id: string
  jobId: string
  status: string
  startedAt: string
  endedAt?: string
  error?: string
}
```

**Empty state:** Show a friendly message like "No automations yet. Ask your agent to schedule something — e.g., 'Check my email every morning at 9am'"

**Create new automation:** A "New Automation" button that opens a simple form or just prompts the user to ask the agent in chat.

### 2. Clean up Tasks.tsx

- Remove the `embedded` prop and all conditional logic around it (the `embedded ? '...' : '...'` ternary for padding)
- Tasks page becomes standalone only, no embedding

### 3. Helper function for human-readable schedules

Add to AutomationsHub.tsx or a shared util:
```typescript
function formatSchedule(schedule: CronJobSummary['schedule']): string {
  if (schedule.kind === 'every' && schedule.everyMs) {
    const minutes = schedule.everyMs / 60000
    if (minutes < 60) return `Every ${minutes} minutes`
    const hours = minutes / 60
    if (hours < 24) return `Every ${hours} hours`
    return `Every ${Math.round(hours / 24)} days`
  }
  if (schedule.kind === 'cron' && schedule.expr) {
    // Simple common patterns
    return `Cron: ${schedule.expr}${schedule.tz ? ` (${schedule.tz})` : ''}`
  }
  if (schedule.kind === 'at' && schedule.at) {
    return `One-time: ${new Date(schedule.at).toLocaleString()}`
  }
  return 'Custom schedule'
}
```

## Files to modify
1. `src/renderer/src/pages/AutomationsHub.tsx` — Complete rebuild (remove Tasks embed, add cron job list UI)
2. `src/renderer/src/pages/Tasks.tsx` — Remove `embedded` prop and conditional padding

## Files NOT to modify
- `src/renderer/src/hooks/useGateway.ts` — All hooks already exist
- `src/renderer/src/App.tsx` — Routing is already correct
- Sidebar — Already has separate entries for Tasks and Automations
- Any task components in `src/renderer/src/components/tasks/`

## Acceptance Criteria
- [ ] Automations page shows ONLY cron/automation content (no tasks)
- [ ] Each cron job displayed with name, schedule, status, last run, enable/disable toggle
- [ ] Enable/disable toggle works (calls useSetCronJobEnabled)
- [ ] "Run Now" button works (calls useRunCronJob)
- [ ] Empty state shown when no automations exist
- [ ] Tasks page works standalone (no embedded prop)
- [ ] Tasks page still has full functionality: projects, search, filters, board/list/timeline
- [ ] TypeScript compiles cleanly (`npx tsc --noEmit`)
- [ ] App builds (`yarn build`)
