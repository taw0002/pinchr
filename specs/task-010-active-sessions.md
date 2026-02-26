# Task 010: Active Sessions — Full Agent Visibility

## Vision (Drew, 2026-02-13)
The Sessions page should give the user complete visibility into what their AI agents and sub-agents are doing at any given time, as well as their history. Right now it's a black box — you can't see what's running, what finished, or what any agent said. This is the "Activity Monitor for your AI team."

## Current State
- Sessions page only shows `exec` processes (background CLI sessions like Codex/Claude Code)
- Uses `useProcessList` hook which calls `process:list` — only tracks spawned shell processes
- Gateway has `sessions_list` with all active sessions but the page doesn't use it
- No history view, no conversation logs, no sub-agent visibility

## Requirements

### Left Panel — Session List
- **Show all gateway sessions** from `sessions_list` API (main, slack, discord, whatsapp threads, etc.)
- **Show sub-agent sessions** (coder, researcher, writer, ops, monitor) — these appear in sessions_list with their agent ID
- **Show exec processes** (background CLI tasks) — keep existing functionality
- **Group by type**: "Channels" (slack, discord, whatsapp), "Sub-Agents" (coder, researcher, etc.), "Processes" (exec sessions)
- **Status indicators**: 🟢 active/running, 🔵 idle, ⚪ completed
- **Last message preview** — show truncated last message for each session
- **Token count** — show total tokens used per session
- **Model badge** — show which model the session is using
- **Sort by**: most recently active first

### Right Panel — Session Detail
- **Conversation history** — pull from `sessions_history` API, render messages with role badges (user/assistant/system/tool)
- **For exec processes**: keep existing terminal output viewer
- **Session metadata**: model, token count, created time, last activity, channel info
- **Live updates**: auto-refresh running sessions (poll every 5s for active, 30s for idle)

### Header
- **Running count** — "3 active · 12 total"
- **Filter/search** — filter by agent ID, channel, status
- **Clear completed** — keep existing button for exec processes

## Data Sources
- `sessions_list` → all gateway sessions (via `window.api.gateway.toolsInvoke('sessions_list', {...})`)
- `sessions_history` → conversation messages for a session (via `window.api.gateway.toolsInvoke('sessions_history', {...})`)
- `process:list` → exec processes (existing, keep as-is)
- `process:log` → terminal output for exec processes (existing, keep as-is)

## Edge Cases
- Sessions with 0 messages (just created)
- Very long conversations — paginate or virtualize message list
- Sub-agents that were spawned and completed — show in history with "completed" status
- Exec processes that were killed — show with "failed" status and exit code

## Definition of Done
- [ ] Sessions page shows all gateway sessions grouped by type
- [ ] Clicking a session shows its conversation history
- [ ] Sub-agent sessions visible with model and status
- [ ] Exec processes still work as before (terminal output)
- [ ] Live status updates for running sessions
- [ ] Token count and model visible per session
- [ ] No dummy/mock data — empty state if nothing running

## Technical Notes
- Gateway session keys look like: `agent:main:direct:drew`, `agent:main:slack:channel:xxx`, `agent:coder:isolated:xxx`
- `sessions_list` returns: key, kind, channel, displayName, model, totalTokens, updatedAt, sessionId
- `sessions_history` returns: messages array with role, content (array of blocks), timestamp
- Need new hooks: `useGatewaySessions()` and `useSessionHistory(sessionKey)`
