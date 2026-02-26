# Spec: Smart Tool Call Display & System Message Filtering

## Problem
The current UI shows ALL tool calls and system messages with equal weight, creating noise that drowns out useful information. Users see raw agent plumbing (streamText, sessions_send, compaction) mixed in with genuinely useful activity (web search, file operations, task updates).

## Design Philosophy
**Show the agent WORKING, not the agent's WIRING.**

Users want to feel like they have a capable assistant doing things on their behalf. They want to see:
- What the agent is researching (web search, browsing)
- What files it's reading or changing
- What actions it's taking (sending messages, updating tasks)
- Its reasoning process (thinking blocks)

They do NOT want to see:
- Internal memory operations
- Stream/session management
- Compaction events
- Metadata about how messages were delivered

## Tool Call Categories

### 🟢 SHOW — User-Visible Activity
These tools represent actions the user would want to know about.

| Tool | Display | Icon |
|------|---------|------|
| `web_search` | "Searching: {query}" with result links | 🔍 |
| `web_fetch` | "Reading: {domain}" | 🌐 |
| `browser` (navigate/snapshot) | "Browsing: {url}" | 🌐 |
| `read` (file) | "Reading {filename}" | 📄 |
| `write` (file) | "Wrote {filename}" | ✏️ |
| `edit` (file) | "Edited {filename}" | ✏️ |
| `exec` | "Running: {short_command}" | ⚡ |
| `message` (send) | "Sent message to {target}" | 💬 |
| `tts` | "Converting to audio..." | 🔊 |
| `image` | "Analyzing image..." | 🖼️ |
| `cron` (add/remove) | "Set reminder: {name}" | ⏰ |
| `nodes` (run/camera) | "Running on {node}..." | 🖥️ |

**Presentation:** Compact card with icon + one-line description. Expandable to show details/results.

### 🟡 COLLAPSE — Show on Demand
These are useful for debugging but not for normal chat flow.

| Tool | When to show |
|------|-------------|
| `sessions_spawn` | Show as "Started background task: {description}" |
| `sessions_send` | Only when sending to a different visible session |
| `gateway` | Show as "Restarting gateway..." |

### 🔴 HIDE — Never Show to Users
These are internal plumbing. Zero user value.

| Tool | Why hidden |
|------|-----------|
| `memory_search` | Internal recall — user doesn't need to see the agent remembering |
| `memory_get` | Same — internal memory access |
| `session_status` | Agent checking its own status |
| `sessions_list` | Internal session management |
| `sessions_history` | Internal history lookup |
| Any streaming/completion call | Obviously the agent is generating text |

## System Message Filtering

### HIDE entirely:
- **Compaction messages** — any message with role=system containing "compaction" or summary markers
- **Heartbeat messages** — HEARTBEAT_OK or heartbeat prompts
- **Pre-compaction flush** messages
- **NO_REPLY** messages
- **Session routing metadata** — topic routing envelopes

### Show as minimal indicator:
- **Compaction** → tiny "🔄 Context refreshed" pill (not a message bubble)
- **System events** → only if they contain user-relevant info (reminders, alerts)

## Message Content Cleaning
(Already implemented in b63f0f7, listing for completeness)

- Strip `[Queued messages while agent was busy]` headers
- Strip `Conversation info (untrusted metadata):` blocks
- Strip `[media attached: ...]` paths
- Strip agent instruction text ("To send an image back...")
- Extract channel badge from metadata before stripping

## Implementation Plan

### 1. Tool Call Categorization (chatUtils.ts)
```typescript
type ToolVisibility = 'show' | 'collapse' | 'hide'

function getToolVisibility(toolName: string): ToolVisibility
function formatToolDisplay(toolName: string, args: Record<string, unknown>): {
  icon: string
  label: string
  details?: string
}
```

### 2. System Message Filter (chatUtils.ts)
```typescript
function isHiddenSystemMessage(message: DisplayMessage): boolean
function getSystemMessageDisplay(message: DisplayMessage): 'hide' | 'pill' | 'normal'
```

### 3. Updated MessageBubble
- Tool calls filtered through visibility check
- Hidden tools produce no UI
- Shown tools get compact card with icon + label
- Collapsed tools available via "Show details" toggle

### 4. Updated Activity Stream (CommandCenter)
- System messages filtered before rendering
- Compaction → minimal pill indicator
- Duplicate adjacent system messages collapsed

## Success Criteria
- [ ] User never sees raw tool JSON or "CODE" blocks for hidden tools
- [ ] Web search, file ops, exec show as clean one-line cards
- [ ] Compaction messages hidden or shown as tiny pills
- [ ] No duplicate system messages
- [ ] Metadata fully stripped from all user-visible content
- [ ] Channel badges still work after metadata stripping
