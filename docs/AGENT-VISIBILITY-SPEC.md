# Agent Visibility — Product Specification

> **Pinchr Desktop** · Real-Time Agent Activity Dashboard
> Status: Draft · v0.1 · 2026-02-09

---

## 1. Overview

Pinchr's Agent Visibility system is the mission control center for OpenClaw agents. Users need to **see** what their agents are doing right now, what's scheduled to happen next, and what happened in the past — with full drill-down into every tool call, token spent, and error encountered.

Without visibility, AI agents are black boxes. Users set up automations and hope they work. Pinchr changes that: every agent action is observable, every execution is replayable, and every failure surfaces immediately.

### Design Principles

1. **Real-time first** — live streaming of agent activity, not refresh-to-check
2. **Glanceable** — the dashboard tells you the health of your system in 2 seconds
3. **Drill-down** — from high-level status → execution timeline → individual tool call logs
4. **Non-intrusive** — notifications for what matters, silence for what doesn't
5. **Performant** — virtualized rendering, incremental loading, local caching for histories with thousands of entries

---

## 2. Dashboard Layout

The Agent Visibility dashboard is the default "home" view in Pinchr. It's a single-page layout with configurable panels.

```
┌─────────────────────────────────────────────────────────────────────────┐
│  🏠 Dashboard    │  Workflows  │  Agents  │  Settings      🔔 3  ⚙️   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  AGENT STATUS CARDS                                                     │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐  │
│  │ 🤖 Main      │ │ 🤖 Coder     │ │ 🤖 Researcher│ │ 🤖 Monitor   │  │
│  │ ● Running    │ │ ○ Idle       │ │ ○ Idle       │ │ ● Running    │  │
│  │ Session: a3f │ │ Last: 2h ago │ │ Last: 1d ago │ │ Session: b7c │  │
│  │ 🟢 Healthy   │ │ 🟢 Healthy   │ │ 🟡 Stale     │ │ 🟢 Healthy   │  │
│  └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘  │
│                                                                         │
├──────────────────────────────────┬──────────────────────────────────────┤
│                                  │                                      │
│  LIVE ACTIVITY FEED              │  UPCOMING SCHEDULE                   │
│                                  │                                      │
│  19:42 🤖 Main                   │  ┌────────────────────────────────┐  │
│    📤 Sent message to #general   │  │ ⚡ Morning Briefing            │  │
│    └ "Daily digest: 3 urgent..." │  │   Tomorrow 7:30am  [▶] [⏸]   │  │
│                                  │  ├────────────────────────────────┤  │
│  19:41 🤖 Main                   │  │ ⚡ Inbox Processor             │  │
│    🔧 Tool: web_fetch            │  │   In 12 min        [▶] [⏸]   │  │
│    └ GET https://api.example...  │  ├────────────────────────────────┤  │
│    └ 200 OK (1.2s)               │  │ ⚡ Health Check               │  │
│                                  │  │   In 3 min          [▶] [⏸]   │  │
│  19:40 🤖 Monitor                │  ├────────────────────────────────┤  │
│    💻 Tool: exec                 │  │ ⚡ Weekly Report               │  │
│    └ `df -h` (0.3s)             │  │   Fri 4:00pm        [▶] [⏸]   │  │
│                                  │  └────────────────────────────────┘  │
│  19:38 ⚡ Cron: health-check     │                                      │
│    Triggered workflow run        │  QUICK STATS (24h)                   │
│                                  │  ┌────────────────────────────────┐  │
│  19:35 🤖 Main                   │  │ Runs: 47  ✅ 44  ❌ 3         │  │
│    📁 Tool: write                │  │ Tokens: 125.4k  ($1.82)       │  │
│    └ ~/reports/daily.md          │  │ Avg duration: 12.3s            │  │
│                                  │  │ Active agents: 2/4             │  │
│  [Load more...]                  │  └────────────────────────────────┘  │
│                                  │                                      │
├──────────────────────────────────┴──────────────────────────────────────┤
│                                                                         │
│  EXECUTION TIMELINE (last 6 hours)                     [◀] [▶] [Today] │
│                                                                         │
│  Main      ████░░░░██░░░░░░░░████░░░░░░░░░░░░░░░░████████░░░████      │
│  Monitor   ░░██░░██░░██░░██░░██░░██░░██░░██░░██░░██░░██░░██░░██░      │
│  Coder     ░░░░░░░░░░░░░░░░░░░░░░░░████████████░░░░░░░░░░░░░░░░░      │
│  Research  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░      │
│            14:00     15:00     16:00     17:00     18:00     19:00      │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Live Activity Feed

A real-time, chronologically ordered stream of every action taken by any agent.

### Event Types

| Icon | Event Type | Detail Fields |
|---|---|---|
| 📤 | **Message Sent** | target channel, message preview (truncated), agent |
| 📥 | **Message Received** | source channel, sender, message preview |
| 🔧 | **Tool Call** | tool name, parameters summary, result status, duration |
| 📁 | **File Read/Write** | operation, file path, size |
| 🌍 | **Web Search** | query, result count |
| 🌐 | **Web Fetch** | URL, HTTP status, response size |
| 💻 | **Shell Command** | command (truncated), exit code, duration |
| 🤖 | **Agent Turn** | agent name, model used, token count, thinking summary |
| ⚡ | **Cron Trigger** | job name, schedule |
| 🔀 | **Workflow Step** | workflow name, step name, status |
| ❌ | **Error** | error message, node/tool that failed |
| 🔔 | **Notification** | notification type, target |

### Event Data Structure

```typescript
interface ActivityEvent {
  id: string;
  timestamp: string;          // ISO 8601
  agent: string;              // agent name (e.g. "main", "coder")
  session_id: string;
  type: EventType;
  summary: string;            // one-line human-readable summary
  details: Record<string, any>; // type-specific details
  duration_ms?: number;
  status: 'success' | 'error' | 'pending';
  
  // For drill-down
  parent_run_id?: string;     // links to workflow execution
  parent_step?: string;       // links to workflow step
}
```

### UI Behavior

- **Auto-scroll** — feed scrolls to bottom as new events arrive (unless user has scrolled up)
- **Pause button** — freezes the feed for reading without new events pushing content
- **Filter bar** — filter by agent, event type, status, or search text
- **Expandable rows** — click an event to expand and see full details (parameters, response body, error stack)
- **Relative timestamps** — "2 min ago" that updates live, hover for absolute time
- **Color coding** — left border color matches agent (consistent colors per agent throughout UI)
- **Grouping** — consecutive events from the same agent turn are visually grouped

### Expanded Event Detail

```
┌──────────────────────────────────────────────────────────┐
│ 19:41:23  🔧 Tool: web_fetch                     🤖 Main │
│                                                          │
│ URL:      https://api.weather.gov/points/32.7,-79.9      │
│ Method:   GET                                            │
│ Status:   200 OK                                         │
│ Duration: 1.2s                                           │
│ Size:     4.2 KB                                         │
│                                                          │
│ Response Preview:                                        │
│ ┌────────────────────────────────────────────────────┐   │
│ │ {                                                  │   │
│ │   "properties": {                                  │   │
│ │     "forecast": "Partly cloudy, high of 72°F",    │   │
│ │     ...                                            │   │
│ │   }                                                │   │
│ │ }                                                  │   │
│ └────────────────────────────────────────────────────┘   │
│                                                          │
│ Part of: Morning Briefing workflow (step 3/7)            │
│ [View Workflow Run] [View Full Response] [Copy]          │
└──────────────────────────────────────────────────────────┘
```

---

## 4. Execution Timeline

A horizontal Gantt-style visualization showing agent activity over time. Each agent gets a swimlane. Activity blocks show when agents were running, with color indicating status.

### Timeline Component

```typescript
interface TimelineConfig {
  range: { start: Date; end: Date };  // visible time window
  zoom: 'hour' | '6h' | 'day' | 'week';
  agents: string[];                    // agents to show (all by default)
}

interface TimelineBlock {
  id: string;
  agent: string;
  start: Date;
  end: Date;
  status: 'success' | 'error' | 'running';
  label: string;         // workflow or session name
  tokens?: number;
  cost_usd?: number;
}
```

### Visual Design

- **Swimlanes** — one horizontal row per agent, labeled on the left
- **Activity blocks** — colored rectangles showing execution duration
  - 🟢 Green = success
  - 🔴 Red = error
  - 🔵 Blue/animated = currently running
  - 🟡 Yellow = partial/warning
- **Hover tooltip** — shows execution name, duration, token count, cost
- **Click** — opens the Run History detail for that execution
- **Time ruler** — top axis with tick marks, adapts to zoom level
- **Scroll** — horizontal scroll through time, or click-drag to pan
- **Zoom** — mouse wheel on timeline, or preset buttons (1h / 6h / day / week)
- **Now indicator** — red vertical line at current time

### Dense View

When zoomed out to week view, individual runs may be too small to render individually. Switch to a density heatmap:

```
  Main      ░░▓▓██▓▓░░░░▓▓██░░░░▓▓░░░░░░██▓▓░░░░▓▓██▓▓░░
             Mon       Tue       Wed       Thu       Fri
```

Where density of shading indicates activity level.

---

## 5. Scheduled Jobs View

Shows all registered cron jobs and workflow schedules, their next run times, and controls.

### Layout

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Scheduled Jobs                                    [+ New Schedule]     │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ ⚡ Morning Briefing                                    [ON/off] │   │
│  │ Schedule: 0 7 30 * * 1-5  (Weekdays at 7:30am ET)              │   │
│  │ Next run: Tomorrow, Feb 10 at 7:30 AM (in 11h 43m)             │   │
│  │ Last run: Today 7:30 AM — ✅ Success (14.2s, 8.4k tokens)      │   │
│  │ Agent: main │ Workflow: morning-briefing                         │   │
│  │                                              [▶ Run Now] [✏️] [🗑] │   │
│  ├─────────────────────────────────────────────────────────────────┤   │
│  │ ⚡ Inbox Processor                                     [ON/off] │   │
│  │ Schedule: */15 * * * *  (Every 15 minutes)                      │   │
│  │ Next run: 19:59 (in 12 min)                                     │   │
│  │ Last run: 19:45 — ✅ Success (3.1s, 2.1k tokens)               │   │
│  │ Agent: main │ Workflow: smart-inbox                              │   │
│  │                                              [▶ Run Now] [✏️] [🗑] │   │
│  ├─────────────────────────────────────────────────────────────────┤   │
│  │ ⚡ System Health Check                                 [ON/off] │   │
│  │ Schedule: */5 * * * *  (Every 5 minutes)                        │   │
│  │ Next run: 19:52 (in 5 min)                                      │   │
│  │ Last run: 19:47 — ✅ Success (1.8s, 0.5k tokens)               │   │
│  │ Agent: monitor │ Workflow: health-check                          │   │
│  │                                              [▶ Run Now] [✏️] [🗑] │   │
│  ├─────────────────────────────────────────────────────────────────┤   │
│  │ ⚡ Weekly Report                                       [on/OFF] │   │
│  │ Schedule: 0 16 * * 5  (Fridays at 4:00pm ET)        ⚠️ PAUSED  │   │
│  │ Next run: — (disabled)                                          │   │
│  │ Last run: Feb 7 4:00 PM — ❌ Error: timeout after 300s         │   │
│  │ Agent: main │ Workflow: weekly-report                            │   │
│  │                                              [▶ Run Now] [✏️] [🗑] │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Data Source

```bash
# List all cron jobs
openclaw cron list
# Returns: name, schedule, command, enabled, last_run, next_run

# Get run history for a specific job
openclaw cron runs <job-name> --limit 20
# Returns: run_id, started_at, completed_at, status, output summary
```

### Controls

| Control | Action |
|---|---|
| **ON/OFF toggle** | `openclaw cron enable/disable <name>` — immediately enables or pauses the job |
| **▶ Run Now** | `openclaw cron trigger <name>` — manually triggers the job immediately |
| **✏️ Edit** | Opens the workflow builder for associated workflow, or cron config editor |
| **🗑 Delete** | Confirmation dialog → `openclaw cron remove <name>` |
| **+ New Schedule** | Opens dialog to create a new cron job or workflow schedule |

### Calendar View (Alternative)

Toggle between list view and a calendar/timeline view showing when jobs are scheduled:

```
  Today          Tomorrow        Wednesday
  ──┬────────────┬────────────┬────────────
    │            │ 7:30 Brief │
    │ ●●●● Inbox (every 15m)  │
    │ ●● Health (every 5m)    │
    │            │            │ 16:00 Report
```

---

## 6. Run History

Searchable, filterable log of all past executions with detailed drill-down.

### List View

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Run History            [Search...        ] [Filter ▾] [Export CSV]     │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Status │ Name                │ Agent  │ Duration │ Tokens │ Cost │ Time│
│  ───────┼─────────────────────┼────────┼──────────┼────────┼──────┼─────│
│  ✅     │ Morning Briefing    │ main   │ 14.2s    │ 8.4k   │$0.12 │ 7:30│
│  ✅     │ Inbox Processor     │ main   │ 3.1s     │ 2.1k   │$0.03 │ 7:45│
│  ❌     │ Weekly Report       │ main   │ 300.0s   │ 45.2k  │$0.67 │ 7:00│
│  ✅     │ Health Check        │ monitor│ 1.8s     │ 0.5k   │$0.01 │ 7:47│
│  ✅     │ Inbox Processor     │ main   │ 2.8s     │ 1.9k   │$0.03 │ 8:00│
│  ⚠️     │ Content Publisher   │ main   │ 45.3s    │ 12.1k  │$0.18 │ 8:15│
│  ✅     │ Health Check        │ monitor│ 1.6s     │ 0.5k   │$0.01 │ 7:52│
│  ...                                                                    │
│                                                                         │
│  Showing 1-50 of 1,247 runs                         [◀ Prev] [Next ▶]  │
└─────────────────────────────────────────────────────────────────────────┘
```

### Run Detail View

Click any run to see full details:

```
┌─────────────────────────────────────────────────────────────────────────┐
│  ← Back    Morning Briefing — Run #a3f8c2    ✅ Success                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Started:   Feb 9, 2026 7:30:00 AM                                     │
│  Completed: Feb 9, 2026 7:30:14 AM                                     │
│  Duration:  14.2 seconds                                                │
│  Agent:     main (claude-opus-4-6)                                       │
│  Tokens:    8,412 (in: 3,201 / out: 5,211)                             │
│  Est. Cost: $0.12                                                       │
│  Trigger:   Cron (0 7 30 * * 1-5)                                      │
│                                                                         │
│  ── Execution Steps ─────────────────────────────────────────────────   │
│                                                                         │
│  1. ⚡ Trigger (cron)                                    0ms    ✅      │
│  2. 📥 Fetch Calendar (tool: google_calendar)            2.1s   ✅      │
│     └ Retrieved 3 events                                                │
│  3. 📥 Fetch Email (tool: gmail_fetch)                   1.8s   ✅      │
│     └ Retrieved 12 unread emails (2 urgent)                             │
│  4. 🌍 Fetch Weather (tool: web_fetch)                   1.2s   ✅      │
│     └ GET weather.gov → 200 OK                                          │
│  5. 🔄 Merge Data (transform)                            3ms    ✅      │
│  6. 🤖 Agent: Compose Briefing                           8.8s   ✅      │
│     └ 6,102 tokens (claude-opus-4-6)                                     │
│  7. 📤 Send to #general (tool: message)                  0.3s   ✅      │
│     └ "Good morning! Here's your briefing..."                           │
│                                                                         │
│  ── Variables ───────────────────────────────────────────────────────   │
│  [trigger] [fetch_cal] [fetch_email] [weather] [merge] [agent] [send]  │
│                                                                         │
│  ┌────────────────────────────────────────────────────────────────┐     │
│  │ fetch_email.output: {                                          │     │
│  │   "emails": [                                                  │     │
│  │     { "from": "boss@co.com", "subject": "Q1 Review", ... },   │     │
│  │     { "from": "team@co.com", "subject": "Standup Notes", ... }│     │
│  │   ],                                                           │     │
│  │   "count": 12,                                                 │     │
│  │   "urgent_count": 2                                            │     │
│  │ }                                                              │     │
│  └────────────────────────────────────────────────────────────────┘     │
│                                                                         │
│  [🔄 Re-run] [📋 Copy Log] [🐛 Debug Re-run]                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Cost Estimation

Token costs are calculated using known model pricing:

```typescript
interface CostEstimate {
  model: string;
  input_tokens: number;
  output_tokens: number;
  input_cost: number;    // USD
  output_cost: number;   // USD
  total_cost: number;    // USD
}

// Pricing table (updated periodically)
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'claude-opus-4-6':   { input: 15.00 / 1_000_000, output: 75.00 / 1_000_000 },
  'claude-sonnet-4-5': { input: 3.00 / 1_000_000,  output: 15.00 / 1_000_000 },
  'gpt-4.1':           { input: 2.00 / 1_000_000,  output: 8.00 / 1_000_000 },
  // ...
};
```

---

## 7. Agent Status Cards

Per-agent cards providing at-a-glance health status. Displayed as a horizontal row at the top of the dashboard.

### Card States

| State | Visual | Meaning |
|---|---|---|
| **Running** | `● Running` green pulse | Agent is currently executing a session/workflow |
| **Idle** | `○ Idle` gray | No active session |
| **Error** | `⊘ Error` red | Last execution failed, no recovery |
| **Stale** | `◑ Stale` yellow | Agent hasn't run in longer than expected |

### Card Data

```typescript
interface AgentStatus {
  name: string;
  status: 'running' | 'idle' | 'error' | 'stale';
  current_session?: string;     // active session ID
  current_task?: string;        // human-readable current action
  last_activity: string;        // ISO timestamp
  health: 'healthy' | 'warning' | 'error';
  stats_24h: {
    runs: number;
    successes: number;
    failures: number;
    tokens: number;
    cost_usd: number;
  };
}
```

### Data Source

```bash
# Get agent status
openclaw session_status
# Returns: active sessions, current model, tool states

# List recent sessions per agent
openclaw sessions_list --agent main --limit 5
# Returns: session IDs, status, created_at, last_activity

# Get session history (for detail drill-down)
openclaw sessions_history --session <id> --limit 50
# Returns: turns with tool calls, messages, timestamps
```

### Card Interactions

- **Click card** → navigate to agent detail view with full session history
- **Quick actions** on hover: "View Session", "Send Message", "Stop Session"
- **Status tooltip** on hover: shows more detail (session ID, current tool call, uptime)

---

## 8. Notification Center

Alerts users to important events without requiring them to watch the dashboard.

### Notification Types

| Priority | Type | Example | Delivery |
|---|---|---|---|
| 🔴 Critical | Agent error / crash | "Weekly Report failed: timeout" | Electron native notification + sound + badge |
| 🟡 Warning | Partial failure, high cost | "Content Publisher: 2 of 5 steps failed" | Electron native notification |
| 🔵 Info | Completion, trigger | "Morning Briefing completed (14s)" | In-app only (bell icon) |
| ⚪ Debug | Step detail, variable | "Inbox: 0 urgent emails found" | In-app only, if verbose mode on |

### Electron Integration

```typescript
import { Notification, app } from 'electron';

function sendNativeNotification(event: ActivityEvent) {
  if (!shouldNotify(event)) return;
  
  const notification = new Notification({
    title: notificationTitle(event),
    body: event.summary,
    icon: getAgentIcon(event.agent),
    silent: event.priority !== 'critical',
    urgency: event.priority === 'critical' ? 'critical' : 'normal',
  });
  
  notification.on('click', () => {
    // Focus Pinchr and navigate to the relevant run detail
    focusMainWindow();
    navigateToRun(event.parent_run_id);
  });
  
  notification.show();
  
  // Update dock badge count (macOS)
  const unread = getUnreadNotificationCount();
  app.setBadgeCount(unread);
}
```

### Notification Center UI

Bell icon in top-right of Pinchr header. Badge shows unread count. Clicking opens a dropdown panel:

```
┌────────────────────────────────────────┐
│ 🔔 Notifications              Mark All│
├────────────────────────────────────────┤
│                                        │
│ 🔴 19:45 Weekly Report failed          │
│    Timeout after 300s. Last step:      │
│    "Generate Charts" — no response.    │
│    [View Run] [Re-run]                 │
│                                        │
│ 🔵 19:30 Morning Briefing complete     │
│    14.2s, 8.4k tokens ($0.12)          │
│    [View Run]                          │
│                                        │
│ 🔵 19:15 Inbox: 2 urgent emails       │
│    Routed to #urgent channel           │
│    [View Run]                          │
│                                        │
│ [View All Notifications]               │
└────────────────────────────────────────┘
```

### Notification Preferences

Per-workflow and per-agent settings:

```typescript
interface NotificationPrefs {
  global: {
    enabled: boolean;
    quiet_hours: { start: string; end: string } | null;  // e.g. "23:00" to "07:00"
    sound: boolean;
  };
  per_workflow: Record<string, {
    on_complete: boolean;   // default: false for frequent jobs, true for infrequent
    on_error: boolean;      // default: true always
    on_warning: boolean;    // default: true
  }>;
  per_agent: Record<string, {
    on_error: boolean;
    on_stale_after_min: number;  // alert if agent hasn't run in N minutes
  }>;
}
```

---

## 9. Data Sources & APIs

### OpenClaw API Mapping

| Dashboard Feature | OpenClaw API | Method | Polling Interval |
|---|---|---|---|
| Agent status | `openclaw session_status` | CLI exec | 10s (active), 30s (idle) |
| Active sessions | `openclaw sessions_list` | CLI exec | 10s |
| Session history | `openclaw sessions_history --session <id>` | CLI exec | On-demand (drill-down) |
| Cron job list | `openclaw cron list` | CLI exec | 60s |
| Cron run history | `openclaw cron runs <name>` | CLI exec | On-demand |
| Cron trigger | `openclaw cron trigger <name>` | CLI exec | Manual action |
| Cron enable/disable | `openclaw cron enable/disable <name>` | CLI exec | Manual action |
| Live activity | Gateway event stream | WebSocket | Real-time streaming |

### WebSocket Streaming

For the live activity feed, Pinchr connects to the OpenClaw gateway's WebSocket endpoint:

```typescript
interface GatewayEventStream {
  url: string;  // ws://localhost:<gateway-port>/events
  
  // Events received:
  events: {
    'session.started': { session_id: string; agent: string };
    'session.turn': { session_id: string; role: string; content: string };
    'tool.called': { session_id: string; tool: string; params: any };
    'tool.result': { session_id: string; tool: string; result: any; duration_ms: number };
    'session.completed': { session_id: string; status: string };
    'cron.triggered': { job: string; run_id: string };
    'cron.completed': { job: string; run_id: string; status: string };
    'error': { session_id?: string; message: string; stack?: string };
  };
}
```

### Fallback: CLI Polling

If WebSocket is unavailable (older gateway versions), fall back to polling:

```typescript
class PollingDataSource {
  private intervals: Map<string, NodeJS.Timer> = new Map();
  
  start() {
    // High-frequency: active session status
    this.intervals.set('status', setInterval(() => {
      this.pollSessionStatus();
    }, 10_000));
    
    // Medium-frequency: session list
    this.intervals.set('sessions', setInterval(() => {
      this.pollSessionList();
    }, 15_000));
    
    // Low-frequency: cron list
    this.intervals.set('cron', setInterval(() => {
      this.pollCronList();
    }, 60_000));
  }
  
  private async pollSessionStatus() {
    const result = await execOpenClaw('session_status');
    this.emit('status_update', parseSessionStatus(result));
  }
}
```

### Local Cache

To avoid redundant API calls and enable instant UI on app launch:

```typescript
interface LocalCache {
  // SQLite database at ~/.openclaw/pinchr/cache.db
  tables: {
    activity_events: ActivityEvent[];     // last 10,000 events
    run_history: RunRecord[];             // last 30 days
    agent_status: AgentStatus[];          // latest snapshot
    cron_jobs: CronJob[];                 // latest snapshot
  };
  
  // Cache invalidation
  maxAge: {
    activity_events: '7d',
    run_history: '30d',
    agent_status: '5m',     // always refresh, cache is just for instant load
    cron_jobs: '5m',
  };
}
```

---

## 10. UI Components

### Component Architecture

```
<Dashboard>
├── <AgentStatusBar>
│   └── <AgentCard> × N
├── <DashboardGrid>              (CSS Grid, responsive)
│   ├── <ActivityFeed>
│   │   ├── <FeedFilters>
│   │   ├── <VirtualizedFeedList>
│   │   │   └── <FeedItem> × N
│   │   │       └── <FeedItemDetail>  (expandable)
│   │   └── <FeedPauseButton>
│   ├── <SchedulePanel>
│   │   ├── <JobList>
│   │   │   └── <JobCard> × N
│   │   └── <QuickStats>
│   └── <ExecutionTimeline>
│       ├── <TimelineHeader>     (time axis)
│       ├── <TimelineSwimlane> × N
│       │   └── <TimelineBlock> × N
│       └── <TimelineControls>   (zoom, pan, range)
├── <RunHistoryView>             (separate route)
│   ├── <RunHistoryTable>        (virtualized)
│   └── <RunDetailPanel>
│       ├── <StepList>
│       ├── <VariableInspector>
│       └── <RunActions>
└── <NotificationCenter>
    └── <NotificationDropdown>
        └── <NotificationItem> × N
```

### Key Libraries

| Component Need | Library | Rationale |
|---|---|---|
| Virtualized lists | `@tanstack/react-virtual` | Handles 10k+ activity events without DOM bloat |
| Timeline chart | Custom Canvas/SVG | No library fits exactly; build with `<canvas>` for perf |
| Data tables | `@tanstack/react-table` | Sorting, filtering, pagination for run history |
| Date formatting | `date-fns` | Lightweight, tree-shakeable relative time formatting |
| State management | `zustand` | Consistent with workflow builder stores |
| Charts (stats) | `recharts` | Simple bar/line charts for cost and token summaries |

### Virtualized Feed List

The activity feed may have thousands of events. Use windowed rendering:

```typescript
import { useVirtualizer } from '@tanstack/react-virtual';

function ActivityFeedList({ events }: { events: ActivityEvent[] }) {
  const parentRef = useRef<HTMLDivElement>(null);
  
  const virtualizer = useVirtualizer({
    count: events.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => {
      // Expanded items are taller
      return events[index].expanded ? 200 : 56;
    },
    overscan: 20,
  });
  
  return (
    <div ref={parentRef} className="h-full overflow-auto">
      <div style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((virtualItem) => (
          <FeedItem
            key={virtualItem.key}
            event={events[virtualItem.index]}
            style={{
              position: 'absolute',
              top: virtualItem.start,
              height: virtualItem.size,
            }}
          />
        ))}
      </div>
    </div>
  );
}
```

---

## 11. Performance Considerations

### Rendering Budget

Target: 60fps for all interactions, even with live streaming activity.

| Concern | Mitigation |
|---|---|
| Large activity feed (10k+ items) | Virtualized list — only ~30 DOM nodes at a time |
| Rapid event stream (10+ events/sec during agent runs) | Batch updates: collect events for 100ms, then flush to UI |
| Timeline with many blocks | Canvas rendering for timeline blocks (not DOM) |
| Run history table (1000+ rows) | Paginated server-side (50 per page), virtualized scroll |
| Frequent polling (10s intervals) | Diff results before updating state — no re-render if nothing changed |
| Memory (caching events) | LRU cache with 10k max events in memory, overflow to SQLite |

### Data Loading Strategy

```
App Launch
  │
  ├─ Load from SQLite cache (instant UI)
  │
  ├─ Connect WebSocket (live stream starts)
  │
  ├─ Poll session_status (fill in current state)
  │
  ├─ Poll cron list (fill in schedules)
  │
  └─ Background: backfill any missing history from last session
```

### Incremental Loading

Run history and activity events use cursor-based pagination:

```typescript
interface PaginatedQuery {
  before?: string;    // event ID — get events before this one
  after?: string;     // event ID — get events after this one
  limit: number;      // default 50
}
```

"Load more" at the top of the activity feed fetches older events. New events stream in at the bottom via WebSocket.

---

## 12. Implementation Phases

### Phase 1: Agent Status & Basic Feed (Week 1-2)

**Goal:** Dashboard shell with status cards and a basic activity feed.

- Dashboard layout with CSS Grid (responsive: 1-col mobile, 2-col desktop)
- `AgentStatusBar` component with cards populated from `session_status`
- Polling data source (10s for status, 60s for cron)
- Basic `ActivityFeed` component — flat list of events from `sessions_history`
- Feed item component with expand/collapse
- Zustand stores: `useDashboardStore`, `useActivityStore`
- Local SQLite cache setup (via `better-sqlite3` in Electron main process)

**APIs used:** `session_status`, `sessions_list`, `sessions_history`

### Phase 2: Scheduled Jobs & Notifications (Week 3-4)

**Goal:** Cron job management and Electron notifications.

- `SchedulePanel` with job list from `cron list`
- Enable/disable toggles (`cron enable/disable`)
- Manual trigger buttons (`cron trigger`)
- Next-run time calculation from cron expressions (using `cron-parser`)
- `NotificationCenter` component with dropdown
- Electron native notification integration
- Notification preferences UI
- Quiet hours logic
- Dock badge count (macOS)

**APIs used:** `cron list`, `cron runs`, `cron trigger`, `cron enable`, `cron disable`

### Phase 3: WebSocket Streaming & Live Feed (Week 5-6)

**Goal:** Real-time activity feed via gateway WebSocket.

- WebSocket client connecting to gateway event stream
- Event normalization (gateway events → `ActivityEvent` format)
- Live feed with auto-scroll, pause, and filtering
- Batched rendering (100ms collection window)
- Feed filters (by agent, type, status, text search)
- Virtualized feed list with `@tanstack/react-virtual`
- Reconnection logic with exponential backoff

### Phase 4: Run History & Detail View (Week 7-8)

**Goal:** Searchable run history with full drill-down.

- `RunHistoryView` as a separate route
- `RunHistoryTable` with sorting, filtering, pagination (`@tanstack/react-table`)
- `RunDetailPanel` showing steps, variables, timing
- Cost estimation engine (model pricing table → per-run cost)
- Token usage aggregation
- Variable inspector (JSON tree view for node outputs)
- Re-run and debug re-run buttons (launches workflow in debug mode)
- CSV export of run history

### Phase 5: Execution Timeline (Week 9-10)

**Goal:** Gantt-style timeline visualization.

- Custom `<canvas>` timeline renderer for performance
- Swimlane layout per agent
- Block rendering (position from start/end times, color from status)
- Zoom controls (1h / 6h / day / week)
- Pan via click-drag
- Hover tooltips on blocks
- Click-to-navigate to run detail
- Now indicator (animated red line)
- Dense heatmap mode for zoomed-out views
- Time range selector

### Phase 6: Polish & Performance (Week 11-12)

**Goal:** Production-quality performance and UX.

- Performance audit: profile rendering, fix any jank
- LRU cache tuning (memory limits, eviction)
- Backfill logic on app launch (sync missed events)
- Dashboard widget reordering (drag to rearrange panels)
- Keyboard navigation (arrow keys in feed, Escape to close panels)
- Empty states ("No activity yet — set up your first workflow!")
- Loading skeletons for all data-dependent components
- Error boundaries with retry for each panel (one failed panel doesn't crash dashboard)
- Accessibility audit (ARIA labels, screen reader support, focus management)

---

## Appendix A: State Management

```typescript
// Dashboard-level store
interface DashboardState {
  agents: AgentStatus[];
  cronJobs: CronJob[];
  quickStats: QuickStats;
  
  // Connection state
  wsConnected: boolean;
  lastPollAt: Record<string, number>;
  
  // Actions
  refreshAgentStatus: () => Promise<void>;
  refreshCronJobs: () => Promise<void>;
  toggleCronJob: (name: string, enabled: boolean) => Promise<void>;
  triggerCronJob: (name: string) => Promise<void>;
}

// Activity feed store (separate for performance — high update frequency)
interface ActivityState {
  events: ActivityEvent[];
  filters: FeedFilters;
  paused: boolean;
  
  // Actions
  addEvents: (events: ActivityEvent[]) => void;
  setFilters: (filters: Partial<FeedFilters>) => void;
  togglePause: () => void;
  loadOlder: () => Promise<void>;
}

// Run history store
interface RunHistoryState {
  runs: RunRecord[];
  selectedRun: RunRecord | null;
  pagination: { page: number; total: number; pageSize: number };
  sort: { field: string; direction: 'asc' | 'desc' };
  filters: RunFilters;
  
  // Actions
  loadPage: (page: number) => Promise<void>;
  selectRun: (id: string) => Promise<void>;
  reRun: (id: string) => Promise<void>;
}
```

## Appendix B: Notification Sound Design

Pinchr ships with subtle notification sounds:

| Event | Sound | File |
|---|---|---|
| Task complete | Soft chime (2 notes ascending) | `assets/sounds/complete.mp3` |
| Error | Low tone (single descending note) | `assets/sounds/error.mp3` |
| Warning | Mid-range ping | `assets/sounds/warning.mp3` |
| Info | Quiet click | `assets/sounds/info.mp3` |

All sounds are < 1s duration, < 50KB. Users can disable in preferences. macOS system notification sound is used as fallback.

## Appendix C: Keyboard Shortcuts

| Key | Action |
|---|---|
| `Ctrl+D` | Toggle dashboard view |
| `Ctrl+H` | Open run history |
| `Ctrl+J` | Open scheduled jobs |
| `Ctrl+N` | Open notification center |
| `Ctrl+F` | Focus activity feed search |
| `Escape` | Close panel / deselect |
| `R` | Refresh all data |
| `Space` | Pause/resume activity feed |
| `Enter` | Expand selected feed item |
| `←` / `→` | Pan timeline |
| `+` / `-` | Zoom timeline |
