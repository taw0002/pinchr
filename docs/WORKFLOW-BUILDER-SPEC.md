# Workflow Builder — Product Specification

> **Pinchr Desktop** · Visual Automation Builder
> Status: Draft · v0.1 · 2026-02-09

---

## 1. Overview

The Workflow Builder is a visual drag-and-drop canvas for creating automations that orchestrate OpenClaw agents, tools, and services. Users compose workflows by connecting typed nodes on a React Flow canvas — no code required for common patterns, with escape hatches to raw expressions when needed.

**Why visual?** OpenClaw's power is in composing agents, cron jobs, tool calls, and sessions — but today that means editing YAML/JSON config files. The Workflow Builder makes that composition tangible: you can *see* the automation, trace the data flow, and debug it step by step.

**Inspiration:** Launchpad already uses `@xyflow/react` (React Flow v12) for its LangGraph workflow visualization. We reuse that pattern language — custom node components, typed handles, a properties panel — but purpose-built for OpenClaw primitives rather than LLM chains.

### Design Principles

1. **What you see is what runs** — the visual graph IS the execution plan, not an abstraction over something else
2. **OpenClaw-native** — every node compiles to real OpenClaw operations (cron, sessions_spawn, tool calls)
3. **Progressive complexity** — simple workflows are simple; power users get expressions, sub-workflows, and raw config
4. **Debuggable** — step through any workflow, inspect every variable at every node

---

## 2. Node Types

Every node has: an ID, a type, a position on canvas, a config object, and typed input/output handles.

### 2.1 Trigger Node

The entry point of every workflow. Exactly one per workflow (enforced). No input handles.

| Trigger Kind | Config | Compiles To |
|---|---|---|
| **Cron Schedule** | cron expression (e.g. `0 9 * * 1-5`), timezone | `openclaw cron add` |
| **Webhook** | path slug, auth method (none/token/hmac), expected payload schema | Gateway webhook endpoint registration |
| **Event Listener** | event type (`message_received`, `session_completed`, `file_changed`, `agent_error`) | OpenClaw event subscription |
| **Manual** | label, optional input form fields | "Run Now" button in Pinchr UI |

**Output handles:** `→ next` (single output, always fires when triggered)

**Config panel fields:**
```
┌─────────────────────────────────┐
│ ⚡ Trigger: Cron Schedule       │
│                                 │
│ Schedule:  [0 9 * * 1-5      ] │
│ Timezone:  [America/New_York ▾] │
│                                 │
│ Human:  "Every weekday at 9am"  │
│                                 │
│ Variables exposed:              │
│   {{trigger.timestamp}}         │
│   {{trigger.run_id}}            │
└─────────────────────────────────┘
```

### 2.2 Action Node

Performs a concrete operation. The workhorse node.

| Action Kind | Config | Compiles To |
|---|---|---|
| **Send Message** | target channel/user, message template (supports `{{variables}}`), optional attachments | `message` tool call |
| **Run Tool** | tool name from available tools, parameters object | Direct tool invocation in agent turn |
| **Call API** | HTTP method, URL template, headers, body template, response mapping | `web_fetch` or custom HTTP tool |
| **File Operation** | operation (read/write/append/delete), path template, content template | `read`/`write`/`edit` tool calls |
| **Shell Command** | command template, working directory, timeout, capture stdout/stderr | `exec` tool call |

**Handles:** `← input` / `→ next` / `→ error`

**Config panel (Send Message example):**
```
┌─────────────────────────────────┐
│ 📤 Action: Send Message         │
│                                 │
│ Target:   [#general          ▾] │
│ Channel:  [slack             ▾] │
│                                 │
│ Message:                        │
│ ┌─────────────────────────────┐ │
│ │ Daily digest for            │ │
│ │ {{trigger.timestamp}}:      │ │
│ │ {{transform.summary}}       │ │
│ └─────────────────────────────┘ │
│                                 │
│ ☐ Silent (no notification)      │
│ ☐ Reply to: [message ID      ] │
└─────────────────────────────────┘
```

### 2.3 Condition Node

Branches execution based on expressions. Has one input and multiple labeled outputs.

**If/Else variant:**
- Config: expression (e.g. `{{action_1.status}} === 'success'`)
- Output handles: `→ true` / `→ false`

**Switch variant:**
- Config: expression to evaluate + case values
- Output handles: one per case + `→ default`

**Expression language:** Simple template syntax with comparisons. Supports:
- Variable references: `{{node_id.output.field}}`
- Comparisons: `===`, `!==`, `>`, `<`, `>=`, `<=`
- Logical: `&&`, `||`, `!`
- Contains: `includes()`, `startsWith()`
- Type checks: `isEmpty`, `isNumber`

```
┌─────────────────────────────────┐
│ 🔀 Condition: If/Else           │
│                                 │
│ Expression:                     │
│ [{{fetch.status}} === 200    ]  │
│                                 │
│     ┌──── true ────┐            │
│     │              │            │
│     └──────────────┘            │
│     ┌──── false ───┐            │
│     │              │            │
│     └──────────────┘            │
└─────────────────────────────────┘
```

### 2.4 Loop Node

Iterates over data or retries operations. Contains a sub-graph (nested nodes inside the loop body).

| Loop Kind | Config |
|---|---|
| **For-Each** | collection expression (`{{action_1.output.items}}`), item variable name, optional concurrency limit |
| **While** | condition expression, max iterations (safety), iteration delay |
| **Retry** | max attempts, backoff strategy (fixed/exponential), delay ms, retry-on expression |

**Handles:** `← input` / `→ body` (connects to first node inside loop) / `→ done` (after loop completes) / `→ error` (max retries exceeded or unhandled error)

The loop node renders as an expanded container on the canvas — you drag nodes *into* it to build the loop body.

### 2.5 Agent Call Node

Invokes an OpenClaw agent or sub-agent. This is the key differentiator — workflows can delegate complex reasoning to AI.

| Field | Description |
|---|---|
| **Agent** | Select from configured agents (dropdown populated from `openclaw gateway` config) |
| **Prompt Template** | The message/instruction to send, with variable interpolation |
| **Session** | `new` (spawn fresh session) or `existing` (continue a session from earlier node) |
| **Model Override** | Optional model override for this specific call |
| **Max Turns** | Safety limit on agent turns |
| **Tools Allowed** | Whitelist of tools the agent can use in this context |
| **Output Mapping** | Which parts of the agent's response to capture as variables |

**Compiles to:** `sessions_spawn` for new sessions, or a turn in an existing session.

```
┌─────────────────────────────────┐
│ 🤖 Agent Call                   │
│                                 │
│ Agent:   [main             ▾]   │
│ Session: [● New  ○ Existing ]   │
│                                 │
│ Prompt:                         │
│ ┌─────────────────────────────┐ │
│ │ Summarize these emails and  │ │
│ │ draft responses:            │ │
│ │ {{fetch_emails.output}}     │ │
│ └─────────────────────────────┘ │
│                                 │
│ Max turns: [5  ]                │
│ Output var: [agent_response]    │
└─────────────────────────────────┘
```

### 2.6 Transform Node

Reshapes data between nodes. No AI, no side effects — pure data manipulation.

| Transform Kind | Description |
|---|---|
| **Data Mapping** | Map fields from input to output structure using path expressions |
| **Template Render** | Render a text/JSON/Markdown template with variables |
| **JSON Path** | Extract values using JSONPath expressions |
| **Split** | Split a string or array into parts |
| **Merge** | Combine multiple inputs into one object |
| **Filter** | Filter array items by expression |
| **Sort** | Sort array by field |

```
┌─────────────────────────────────┐
│ 🔄 Transform: Data Mapping      │
│                                 │
│ Input:  {{fetch.output.body}}   │
│                                 │
│ Mappings:                       │
│  title  ← $.data.name          │
│  count  ← $.data.items.length  │
│  urgent ← $.data.priority > 3  │
│                                 │
│ [+ Add Mapping]                 │
└─────────────────────────────────┘
```

### 2.7 Delay / Wait Node

Pauses execution. Simple but essential for rate limiting, scheduling, and human-in-the-loop patterns.

| Wait Kind | Config |
|---|---|
| **Fixed Delay** | Duration (seconds/minutes/hours) |
| **Until Time** | Specific datetime or cron-like expression ("next Monday 9am") |
| **Wait for Event** | Event type + optional filter, with timeout |
| **Human Approval** | Sends notification, pauses until user approves/rejects in Pinchr |

The **Human Approval** variant is particularly powerful — it sends an Electron notification with context, and the workflow pauses until the user clicks Approve or Reject in the Pinchr UI. The condition output determines which branch executes next.

---

## 3. Edge Types

Edges connect output handles to input handles. They are typed and rendered differently.

| Edge Type | Visual | Behavior |
|---|---|---|
| **Sequential** | Solid line, arrow | Default. Data flows from source output to target input. |
| **Conditional (True)** | Green solid line | From Condition node's `true` handle |
| **Conditional (False)** | Red dashed line | From Condition node's `false` handle |
| **Error Path** | Orange dotted line, ⚠️ icon | From any node's `error` handle. Catches failures. |
| **Loop Body** | Blue line, loops back | From Loop node to body nodes and back |

### Edge Data

Every edge can optionally carry a **data filter** — an expression that transforms the data as it flows along the edge. This is a lightweight alternative to inserting a Transform node for simple mappings.

```typescript
interface WorkflowEdge {
  id: string;
  source: string;       // source node ID
  sourceHandle: string;  // 'next' | 'true' | 'false' | 'error' | 'done'
  target: string;       // target node ID
  targetHandle: string;  // 'input'
  type: 'sequential' | 'conditional-true' | 'conditional-false' | 'error';
  data?: {
    filter?: string;     // optional inline transform expression
    label?: string;      // optional label rendered on edge
  };
}
```

---

## 4. Compilation: Workflows → OpenClaw Primitives

The visual workflow is a high-level representation. At save/deploy time, Pinchr compiles it down to OpenClaw configuration:

### Compilation Targets

| Workflow Element | OpenClaw Primitive |
|---|---|
| Cron Trigger | `openclaw cron add --schedule "expr" --command "openclaw workflow run <id>"` |
| Webhook Trigger | Gateway webhook route → spawns workflow session |
| Event Trigger | Event subscription in gateway config |
| Action (Send Message) | Agent turn with `message` tool call |
| Action (Run Tool) | Agent turn with specified tool call |
| Action (Call API) | Agent turn with `web_fetch` tool |
| Action (File Op) | Agent turn with `read`/`write`/`edit` tool |
| Agent Call (new session) | `sessions_spawn` with prompt and config |
| Agent Call (existing) | Turn in existing session |
| Condition | Logic in agent system prompt or compiled JavaScript evaluator |
| Loop (for-each) | Repeated `sessions_spawn` or sequential turns |
| Transform | Pure function evaluated in Pinchr runtime (no agent needed) |
| Delay | `setTimeout` in workflow engine / cron for long delays |

### Compilation Pipeline

```
Visual Graph (React Flow state)
    │
    ▼
Topological Sort (detect cycles, validate DAG or valid loops)
    │
    ▼
Node Compilation (each node → execution step config)
    │
    ▼
Variable Resolution (map {{references}} to runtime paths)
    │
    ▼
Trigger Registration (cron/webhook/event setup via OpenClaw CLI)
    │
    ▼
Workflow JSON (serialized, stored in Pinchr config)
```

### Example: "Daily Email Digest" compiled

```yaml
# What the user built visually:
# [Cron 9am] → [Fetch Emails] → [Condition: any urgent?]
#                                    ├─ true → [Agent: Summarize] → [Send to Slack]
#                                    └─ false → [Send "All clear" to Slack]

# Compiles to:
cron:
  daily-email-digest:
    schedule: "0 9 * * 1-5"
    timezone: "America/New_York"
    command: "openclaw workflow run daily-email-digest"

workflow:
  id: daily-email-digest
  steps:
    - id: fetch_emails
      type: tool_call
      tool: gmail_fetch
      params:
        query: "is:unread newer_than:1d"
      output: emails

    - id: check_urgent
      type: condition
      expression: "emails.some(e => e.labels.includes('IMPORTANT'))"
      branches:
        true: summarize
        false: all_clear

    - id: summarize
      type: agent_call
      agent: main
      prompt: "Summarize these emails, highlighting urgent items: {{emails}}"
      output: summary
      next: send_digest

    - id: send_digest
      type: tool_call
      tool: message
      params:
        action: send
        target: "#general"
        message: "{{summary}}"

    - id: all_clear
      type: tool_call
      tool: message
      params:
        action: send
        target: "#general"
        message: "📬 All clear — no urgent emails this morning."
```

---

## 5. Canvas UX

### Layout

```
┌─────────────────────────────────────────────────────────────────────────┐
│  ◀ Back to Pinchr    │  Daily Email Digest ✏️   │  ▶ Run  │ 🐛 Debug  │
├──────────┬──────────────────────────────────────────────┬───────────────┤
│          │                                              │               │
│ PALETTE  │              CANVAS                          │  PROPERTIES   │
│          │                                              │               │
│ ─────── │    ┌──────────┐    ┌──────────┐              │  Node: Fetch  │
│ Triggers │    │ ⚡ Cron   │───▶│ 📥 Fetch │              │  Emails       │
│  ⚡ Cron  │    │ 9am M-F  │    │ Emails   │──┐           │               │
│  🌐 Hook │    └──────────┘    └──────────┘  │           │  Tool:        │
│  📡 Event│                                   │           │  [gmail    ▾] │
│  ▶ Manual│                    ┌──────────┐  │           │               │
│          │                 ┌──│ 🔀 Urgent?│◀─┘           │  Query:       │
│ ─────── │                 │  └──────────┘              │  [is:unread  ]│
│ Actions  │                 │       │                    │               │
│  📤 Msg  │          true ──┘       └── false            │  Timeout:     │
│  🔧 Tool │                 │              │             │  [30s      ▾] │
│  🌍 API  │          ┌──────▼───┐   ┌─────▼──────┐      │               │
│  📁 File │          │ 🤖 Agent  │   │ 📤 Send    │      │               │
│  💻 Shell│          │ Summarize │   │ "All clear"│      │               │
│          │          └──────┬───┘   └────────────┘      │               │
│ ─────── │                 │                             │               │
│ Logic    │          ┌──────▼───┐                        │               │
│  🔀 If   │          │ 📤 Send  │                        │               │
│  🔀 Switch         │ Digest   │                        │               │
│  🔁 Loop │          └──────────┘                        │               │
│  🤖 Agent│                                              │               │
│  🔄 Map  │                                              │               │
│  ⏳ Wait │     ┌─────────────────────┐                  │               │
│          │     │ ◻ Minimap           │                  │               │
│ ─────── │     │  ·  ·──·            │                  │               │
│ Templates│     │  ·──·  ·            │                  │               │
│  📋 Browse    │                     │                  │               │
│          │     └─────────────────────┘                  │               │
├──────────┴──────────────────────────────────────────────┴───────────────┤
│ Variables: trigger.timestamp, fetch_emails.output (23 items)    Zoom 85%│
└─────────────────────────────────────────────────────────────────────────┘
```

### Canvas Interactions

| Feature | Implementation |
|---|---|
| **Zoom/Pan** | Built-in React Flow. Mouse wheel zoom, click-drag pan. Ctrl+0 to reset. |
| **Minimap** | `<MiniMap />` component, bottom-left. Shows node positions, highlights viewport. |
| **Snap to Grid** | 20px grid. Toggle with `G` key. Visual grid dots on canvas. |
| **Multi-select** | Shift+click or drag-select rectangle. Move/delete groups. |
| **Undo/Redo** | Ctrl+Z / Ctrl+Shift+Z. State stack (last 50 operations). |
| **Copy/Paste** | Ctrl+C/V for selected nodes. Generates new IDs, preserves config. |
| **Node Search** | Ctrl+K opens command palette to find/jump to any node. |
| **Auto-layout** | Button to auto-arrange nodes using dagre layout algorithm. |
| **Keyboard shortcuts** | Delete=remove, Space+drag=pan, F2=rename selected node |

### Node Palette (Left Sidebar)

Collapsible sidebar (240px default). Nodes are organized by category. Drag a node type onto the canvas to create an instance. Search/filter at top.

### Properties Panel (Right Sidebar)

Context-sensitive panel (320px default). Shows config for the selected node or edge. Updates the workflow state in real-time. Includes:
- Node name (editable)
- Type-specific configuration fields
- Variable browser (available variables from upstream nodes)
- Output preview (from last execution, if any)
- Delete node button
- Documentation link for the node type

### Toolbar

| Button | Action |
|---|---|
| **▶ Run** | Execute the workflow now (manual trigger, regardless of trigger type) |
| **🐛 Debug** | Enter debug mode (step-by-step execution) |
| **💾 Save** | Save workflow (auto-saves on change, but explicit save compiles to OpenClaw config) |
| **📤 Export** | Export as JSON file |
| **📥 Import** | Import from JSON file |
| **↩️ Undo** / **↪️ Redo** | State history navigation |
| **🔀 Auto-layout** | Rearrange nodes automatically |
| **⚙️ Settings** | Workflow-level settings (name, description, enabled, timeout) |

---

## 6. Workflow Execution Engine

### Architecture

The execution engine runs inside the Pinchr Electron main process (Node.js). It:

1. Receives a trigger event (cron tick, webhook, manual run, event)
2. Loads the compiled workflow JSON
3. Walks the graph, executing nodes in topological order
4. Manages a **variable store** that accumulates outputs from each node
5. Communicates with OpenClaw gateway via CLI commands and API calls
6. Reports progress back to the renderer process for live UI updates

```
┌─────────────────────────────────────────────────┐
│  Pinchr Main Process (Electron)                 │
│                                                 │
│  ┌──────────────┐    ┌────────────────────┐     │
│  │ Trigger       │───▶│ Execution Engine   │     │
│  │ Manager       │    │                    │     │
│  │ (cron/webhook │    │ • Graph walker     │     │
│  │  /event)      │    │ • Variable store   │     │
│  └──────────────┘    │ • Error handler    │     │
│                      │ • Retry manager    │     │
│                      └────────┬───────────┘     │
│                               │                  │
│                      ┌────────▼───────────┐     │
│                      │ OpenClaw Gateway    │     │
│                      │ (CLI / API calls)   │     │
│                      └────────────────────┘     │
└─────────────────────────────────────────────────┘
```

### Variable Store

Each workflow execution has a scoped variable store. Nodes read upstream outputs and write their own:

```typescript
interface VariableStore {
  trigger: {
    timestamp: string;
    run_id: string;
    [key: string]: any;  // trigger-specific data (webhook payload, event data)
  };
  [nodeId: string]: {
    output: any;          // the node's primary output
    status: 'success' | 'error';
    duration_ms: number;
    error?: string;
  };
}
```

Variable references use double-brace syntax: `{{node_id.output.field.nested}}`. The engine resolves these at execution time using lodash-style deep path access.

### Execution Flow

```
1. Trigger fires → create ExecutionContext with new run_id
2. Initialize variable store with trigger data
3. Get start node (trigger's next connection)
4. LOOP:
   a. Resolve all {{variable}} references in node config
   b. Execute node:
      - Transform: evaluate in-process (pure function)
      - Action/Agent: call OpenClaw via CLI/API
      - Condition: evaluate expression, pick branch
      - Loop: iterate, executing body sub-graph per iteration
      - Delay: setTimeout or schedule wake-up
   c. Store output in variable store
   d. Determine next node(s) from edges
   e. If error and error edge exists → follow error path
   f. If error and no error edge → propagate up (fail workflow)
   g. If no next nodes → workflow complete
5. Record execution result (success/fail, duration, variable snapshots)
```

### Error Handling

Three levels:

1. **Node-level retry** — configured per node (max attempts, backoff). Retries before considering the node failed.
2. **Error edges** — if a node fails and has an `→ error` edge, execution follows that path instead of failing the whole workflow.
3. **Workflow-level** — if an unhandled error propagates to the top, the workflow is marked as failed. The Notification Center alerts the user.

### Retry Configuration

```typescript
interface RetryConfig {
  maxAttempts: number;        // default: 1 (no retry)
  backoffType: 'fixed' | 'exponential';
  backoffMs: number;          // base delay between retries
  retryOn?: string;           // expression — only retry if this is true
}
```

### Concurrency

By default, workflows execute nodes sequentially. When a node has multiple outgoing edges to independent branches (e.g., after a parallel split), those branches execute concurrently using `Promise.all()`. A **Join** node (implicit when branches converge) waits for all incoming branches before proceeding.

---

## 7. Serialization Format

Workflows are serialized as JSON. This is the source of truth — the visual canvas state is derived from it.

```typescript
interface Workflow {
  id: string;                   // UUID
  name: string;
  description: string;
  version: number;              // incremented on save
  enabled: boolean;
  created_at: string;           // ISO 8601
  updated_at: string;
  
  // Canvas state (for visual restoration)
  viewport: { x: number; y: number; zoom: number };
  
  // The graph
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  
  // Workflow-level settings
  settings: {
    timeout_ms: number;         // max total execution time (default: 300000 = 5min)
    max_cost_usd: number;       // cost guard — abort if estimated cost exceeds this
    notification_on_complete: boolean;
    notification_on_error: boolean;
    log_level: 'minimal' | 'standard' | 'verbose';
  };
}

interface WorkflowNode {
  id: string;                   // e.g. "trigger_1", "action_3"
  type: 'trigger' | 'action' | 'condition' | 'loop' | 'agent_call' | 'transform' | 'delay';
  subtype: string;              // e.g. "cron", "send_message", "if_else", "for_each"
  label: string;                // user-visible name
  position: { x: number; y: number };
  config: Record<string, any>;  // type-specific configuration
  retry?: RetryConfig;
  notes?: string;               // user notes/comments on this node
  
  // Loop nodes contain sub-graphs
  children?: WorkflowNode[];
  childEdges?: WorkflowEdge[];
}

interface WorkflowEdge {
  id: string;
  source: string;
  sourceHandle: string;
  target: string;
  targetHandle: string;
  type: 'sequential' | 'conditional-true' | 'conditional-false' | 'error';
  data?: {
    filter?: string;
    label?: string;
  };
}
```

### Storage

Workflows are stored as individual JSON files in the Pinchr data directory:
```
~/.openclaw/pinchr/workflows/
  ├── daily-email-digest.json
  ├── github-pr-reviewer.json
  └── weekly-report.json
```

And registered in the OpenClaw gateway config for triggers:
```yaml
# ~/.openclaw/config.yaml (relevant section)
cron:
  workflow-daily-email-digest:
    schedule: "0 9 * * 1-5"
    command: "openclaw workflow run daily-email-digest"
```

---

## 8. Template Workflows

Pre-built workflows users can start from. Each is a complete workflow JSON that users can customize.

### 8.1 Morning Briefing
```
[⚡ Cron 7:30am] → [📥 Fetch Calendar] → [📥 Fetch Email] → [🌍 Fetch Weather]
    → [🔄 Merge All] → [🤖 Agent: Compose Briefing] → [📤 Send to Slack]
```
Gathers calendar, email, and weather, then has an agent compose a natural-language briefing.

### 8.2 Smart Inbox Processor
```
[⚡ Cron every 15min] → [📥 Fetch Unread] → [🔁 For-Each Email]
    → [🤖 Agent: Classify] → [🔀 Priority?]
        ├─ urgent → [📤 Notify Immediately]
        ├─ actionable → [📤 Add to Todo]
        └─ noise → [📁 Archive]
```

### 8.3 Content Publisher
```
[▶ Manual: Topic Input] → [🤖 Agent: Research] → [🤖 Agent: Draft]
    → [⏳ Human Approval] → [🔀 Approved?]
        ├─ yes → [🌍 Publish API] → [📤 Share to Social]
        └─ no → [📤 Send Feedback to Agent] → [🤖 Agent: Revise] → (loop back)
```

### 8.4 Repository Guardian
```
[📡 Event: github_push] → [💻 Run Tests] → [🔀 Tests Pass?]
    ├─ yes → [🤖 Agent: Review Diff] → [📤 Post Review Comment]
    └─ no → [📤 Notify: Tests Failing] → [🤖 Agent: Suggest Fix]
```

### 8.5 Meeting Autopilot
```
[⚡ Cron: 5min before meetings] → [📥 Fetch Next Meeting]
    → [🔀 Has Meeting?]
        ├─ yes → [🤖 Agent: Prep Brief] → [📤 Send Prep Notes]
        └─ no → (end)
```

### 8.6 Weekly Report Generator
```
[⚡ Cron: Friday 4pm] → [📥 Fetch Git Commits] → [📥 Fetch Completed Tasks]
    → [📥 Fetch Time Entries] → [🔄 Merge Data]
    → [🤖 Agent: Write Report] → [📤 Send Report Email]
```

### 8.7 File Organizer
```
[📡 Event: file_changed in ~/Downloads] → [🔀 File Type?]
    ├─ image → [📁 Move to ~/Pictures/sorted/]
    ├─ document → [🤖 Agent: Classify] → [📁 Move to classified folder]
    ├─ code → [📁 Move to ~/Code/incoming/]
    └─ default → (ignore)
```

### 8.8 System Health Monitor
```
[⚡ Cron: every 5min] → [💻 Check Disk Space] → [💻 Check Memory]
    → [🌍 Ping Services] → [🔀 Any Issues?]
        ├─ yes → [🤖 Agent: Diagnose] → [📤 Alert with Diagnosis]
        └─ no → (end, log healthy)
```

---

## 9. Testing & Debug Mode

### Debug Mode

Activated via the 🐛 button. The workflow enters step-by-step execution:

```
┌─────────────────────────────────────────────────────────────────────────┐
│  🐛 DEBUG MODE   │  Daily Email Digest   │  Step 3/6   │  ⏸ Paused    │
├──────────┬──────────────────────────────────────────────┬───────────────┤
│          │                                              │               │
│ STEPS    │              CANVAS                          │  INSPECTOR    │
│          │                                              │               │
│ ✅ 1.    │    ┌──────────┐    ┌──────────┐              │  Node:        │
│  Trigger │    │ ✅ Cron   │───▶│ ✅ Fetch │              │  fetch_emails │
│  0ms     │    │ 9am M-F  │    │ Emails   │──┐           │               │
│          │    └──────────┘    └──────────┘  │           │  Status: ✅   │
│ ✅ 2.    │                                   │           │  Duration: 2s │
│  Fetch   │                    ┌──────────┐  │           │               │
│  2.1s    │                 ┌──│ ⏸ Urgent? │◀─┘           │  Output:      │
│          │                 │  └──────────┘              │  ┌───────────┐│
│ ⏸ 3.    │                 │       │                    │  │ {         ││
│  Check   │          true ──┘       └── false            │  │  "emails":││
│  (paused)│                 │              │             │  │  [        ││
│          │          ┌──────▼───┐   ┌─────▼──────┐      │  │   {...},  ││
│ ○ 4.     │          │ ○ Agent  │   │ ○ Send     │      │  │   {...},  ││
│  Agent   │          │ Summary  │   │ "All clear"│      │  │   {...}   ││
│          │          └──────┬───┘   └────────────┘      │  │  ]        ││
│ ○ 5.     │                 │                             │  │ }         ││
│  Send    │          ┌──────▼───┐                        │  └───────────┘│
│          │          │ ○ Send   │                        │               │
│          │          │ Digest   │                        │  Variables:   │
│          │          └──────────┘                        │  trigger: {…} │
│          │                                              │  fetch: {…}   │
│          │     [▶ Step] [▶▶ Run to End] [⏹ Stop]       │               │
├──────────┴──────────────────────────────────────────────┴───────────────┤
│ Console: fetch_emails completed (23 emails, 3 urgent)            3.2s  │
└─────────────────────────────────────────────────────────────────────────┘
```

### Debug Features

| Feature | Description |
|---|---|
| **Step** | Execute only the next node, then pause |
| **Step Over** | For loops/sub-workflows, execute the entire sub-graph as one step |
| **Run to Breakpoint** | Execute until hitting a node marked with a breakpoint 🔴 |
| **Run to End** | Execute remaining nodes without pausing |
| **Breakpoints** | Click the left edge of any node to toggle a breakpoint |
| **Variable Inspector** | Right panel shows the full variable store at the current step |
| **Node Output Preview** | Hover any completed node to see its output inline |
| **Console** | Bottom panel shows execution log with timestamps |
| **Edit & Retry** | In debug mode, edit a node's config and re-execute just that node |
| **Mock Inputs** | Override trigger data with test payloads |

### Test Payloads

For each trigger type, users can define test payloads:

```json
{
  "testPayloads": {
    "default": {
      "trigger": {
        "timestamp": "2026-02-09T09:00:00-05:00",
        "run_id": "test-001"
      }
    },
    "many-emails": {
      "trigger": {
        "timestamp": "2026-02-09T09:00:00-05:00",
        "run_id": "test-002"
      },
      "fetch_emails": {
        "output": [/* ... mock email data ... */]
      }
    }
  }
}
```

---

## 10. Implementation Plan

### Phase 1: Canvas Foundation (Week 1-2)

**Goal:** Empty canvas with node palette, drag-and-drop, and basic connections.

- Install `@xyflow/react` (React Flow v12)
- Create base `<WorkflowCanvas />` component with `<ReactFlow>`, `<MiniMap>`, `<Controls>`, `<Background>`
- Implement node palette sidebar with drag-to-create
- Define custom node components for each type (styled with shadcn/ui + Tailwind)
- Implement typed handles (color-coded by type)
- Edge rendering with custom styles per edge type
- Properties panel shell (right sidebar, shows selected node config)
- Undo/redo via `useUndoRedo` custom hook (state stack)
- Keyboard shortcuts

**Key React Flow APIs:**
```typescript
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  type Node,
  type Edge,
  type OnConnect,
  type NodeTypes,
} from '@xyflow/react';
```

**Custom node registration:**
```typescript
const nodeTypes: NodeTypes = {
  trigger: TriggerNode,
  action: ActionNode,
  condition: ConditionNode,
  loop: LoopNode,
  agent_call: AgentCallNode,
  transform: TransformNode,
  delay: DelayNode,
};
```

### Phase 2: Node Configuration (Week 3-4)

**Goal:** Full config panels for each node type.

- Build config forms for each node type using shadcn/ui form components
- Variable browser component (shows available `{{variables}}` from upstream nodes)
- Expression editor with syntax highlighting (use CodeMirror or Monaco for complex expressions)
- Template editor with variable autocomplete
- Agent selector (populated from OpenClaw config)
- Tool selector (populated from gateway capabilities)
- Validation — red borders on invalid config, tooltip explanations

### Phase 3: Serialization & Compilation (Week 5-6)

**Goal:** Save/load workflows, compile to OpenClaw config.

- JSON serialization/deserialization
- File storage in `~/.openclaw/pinchr/workflows/`
- Compilation pipeline (graph → OpenClaw primitives)
- Cron job registration via `openclaw cron add`
- Webhook route registration
- Import/export workflow files
- Workflow versioning (increment on save, keep last 10 versions)

### Phase 4: Execution Engine (Week 7-9)

**Goal:** Workflows actually run.

- `WorkflowEngine` class in Electron main process
- Graph walker with topological execution
- Variable store implementation
- OpenClaw CLI/API integration (exec tool calls, spawn sessions)
- Error handling and retry logic
- Execution progress reporting to renderer via IPC
- Live node status updates on canvas during execution
- Execution history storage (SQLite or JSON files)

### Phase 5: Debug Mode (Week 10-11)

**Goal:** Step-through debugging with variable inspection.

- Debug execution mode (pause between nodes)
- Breakpoints (visual toggle on nodes)
- Variable inspector panel
- Console/log panel
- Step / Step Over / Run to Breakpoint / Run to End controls
- Test payload editor
- Mock node outputs for testing branches
- Edit & retry individual nodes

### Phase 6: Templates & Polish (Week 12)

**Goal:** Template library and UX polish.

- 8 template workflows (pre-built JSON)
- Template browser dialog with previews
- Auto-layout using dagre (`@dagrejs/dagre`)
- Canvas polish: animations, transitions, loading states
- Workflow settings dialog (name, description, timeout, cost guard)
- Copy/paste nodes across workflows
- Search/filter in node palette
- Comprehensive keyboard shortcut sheet

### Dependencies

```json
{
  "@xyflow/react": "^12.x",
  "@dagrejs/dagre": "^1.x",
  "cron-parser": "^4.x",
  "lodash-es": "^4.x",
  "zustand": "^4.x",
  "immer": "^10.x"
}
```

**State management:** Zustand store with Immer for immutable updates. Separate stores for:
- `useWorkflowStore` — nodes, edges, selected node, viewport
- `useExecutionStore` — current run state, variable store, step history
- `useDebugStore` — breakpoints, debug mode state, inspector selection

---

## Appendix A: Node Visual Language

```
  Trigger nodes:    ⚡ Lightning bolt icon, blue border, rounded
  Action nodes:     ■  Square icon, green border, sharp corners
  Condition nodes:  ◆  Diamond shape, yellow border
  Loop nodes:       ↻  Circular arrows, purple border, expandable container
  Agent nodes:      🤖 Robot icon, gradient border (indicates AI)
  Transform nodes:  ⇄  Arrows icon, gray border
  Delay nodes:      ⏳ Hourglass icon, orange border, dashed outline

  Completed:  ✅ Green check overlay
  Running:    ⟳  Spinning indicator
  Error:      ❌ Red X overlay
  Paused:     ⏸  Pause overlay (debug mode)
  Breakpoint: 🔴 Red dot on left edge
```

## Appendix B: Expression Syntax Quick Reference

```
# Variable access
{{node_id.output}}                    # Full output
{{node_id.output.field}}              # Nested field
{{node_id.output.items[0].name}}      # Array access
{{node_id.output.items.length}}       # Array length

# Comparisons (in Condition nodes)
{{node.output.status}} === 200
{{node.output.count}} > 10
{{node.output.type}} !== 'spam'

# Logical operators
{{a.output}} > 5 && {{b.output}} === 'ready'
{{x.output.items.length}} === 0 || {{x.output.empty}} === true

# Built-in functions
isEmpty({{node.output.items}})
contains({{node.output.text}}, 'urgent')
now()                                  # current timestamp
formatDate({{trigger.timestamp}}, 'YYYY-MM-DD')

# Template strings (in Action configs)
Hello {{agent.output.name}}, your {{transform.output.count}} items are ready.
```
