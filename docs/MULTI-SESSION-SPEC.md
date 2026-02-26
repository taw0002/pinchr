# Multi-Session Support — Pinchr Feature Spec

## Overview
Allow users to create, switch between, and manage multiple conversation sessions in Pinchr, similar to ChatGPT/Claude desktop apps. Each session has its own context window and conversation history.

## How OpenClaw Sessions Work (from actual spec)

### Session Keys
- Sessions are identified by `sessionKey` strings
- `/v1/chat/completions` creates a stable session when `user` field is provided
- Different `user` values = different sessions (stateless without `user`)
- Or use `x-openclaw-session-key` header for explicit session control

### API Endpoints (all on gateway port 18789, auth via Bearer token)

**List sessions:**
```
POST /tools/invoke
{ "tool": "sessions_list", "args": { "limit": 50, "messageLimit": 1 } }
→ { ok: true, result: { content: [{ type: "text", text: "<JSON array of sessions>" }] } }
```

**Get session history:**
```
POST /tools/invoke
{ "tool": "sessions_history", "args": { "sessionKey": "<key>", "limit": 50 } }
→ { ok: true, result: { content: [{ type: "text", text: "<JSON messages>" }] } }
```

**Send message (streaming):**
```
POST /v1/chat/completions
{
  "model": "openclaw",
  "stream": true,
  "user": "pinchr-<sessionId>",
  "messages": [{ "role": "user", "content": "hello" }]
}
```
Key: the `user` field determines which session the message lands in. Different `user` = different session.

Alternatively, use header: `x-openclaw-session-key: <key>` for precise routing.

**Reset a session:**
Send `/new` or `/reset` as the message content to start fresh.

### Session Lifecycle
- Sessions auto-reset daily at 4 AM local time by default
- `/new` or `/reset` triggers manual reset
- `/new <model>` resets with a different model

## UX Design

### Sidebar Changes
- **"+ New Chat" button** at top of sidebar (prominent, always visible)
- Session list shows Pinchr-created sessions separately from channel sessions
- Each Pinchr session shows: name, last message preview, timestamp
- Click to switch; active session highlighted
- Right-click context menu: Rename, Delete, Archive

### Session Creation
- Click "+ New Chat" → creates new session immediately, focuses it
- Auto-named "New Chat" initially
- After first AI response, auto-generate a title (ask the AI: "Title this conversation in 3-5 words")
- User can rename anytime via double-click or context menu

### Session Storage (Local)
Pinchr sessions metadata stored in localStorage/electron-store:
```typescript
interface PinchrSession {
  id: string           // UUID
  name: string         // User-editable display name
  sessionKey: string   // OpenClaw session key (derived from user field)
  createdAt: number    // timestamp
  updatedAt: number    // timestamp
  archived: boolean
}
```

The actual conversation history lives on the gateway (queried via sessions_history). Pinchr only stores metadata locally.

### Chat Input Area
- When viewing a channel session (Slack/WhatsApp/etc): show read-only history with "Switch to Pinchr to send messages" — make this a **clickable link** that creates/opens a Pinchr chat session
- When viewing a Pinchr session: full input with send, image, voice, etc.

### Session Switching
- Messages load from gateway via `sessions_history` on session switch
- Show loading skeleton while fetching
- Cache recent session history locally for instant switching

## Implementation Plan

### Phase 1: Core Multi-Session
1. Add `PinchrSession` type and local storage (electron-store or localStorage)
2. Add "+ New Chat" button to sidebar
3. Modify Chat.tsx to track `activePinchrSession`
4. Route messages through `/v1/chat/completions` with `user: "pinchr-<sessionId>"` or `x-openclaw-session-key`
5. Load history from gateway on session switch

### Phase 2: Polish
1. Auto-title generation after first exchange
2. Rename/delete/archive via context menu
3. "Switch to Pinchr" clickable link in read-only channel views
4. Search across sessions

## Technical Notes

### Message Routing
Each Pinchr session uses a unique `user` field in completions API:
```
user: `pinchr-${session.id}`
```
This creates a stable gateway session key: `agent:main:openai-user:pinchr-<uuid>`

### History Fetching
On session switch, fetch via:
```typescript
const history = await window.api.gateway.getSessionHistory(session.sessionKey)
```
The gateway returns the full transcript. Parse and display.

### Build Constraints
- Electron + Vite + React 19 + Tailwind + shadcn/ui
- Build command: `yarn build`
- All UI must use existing component patterns
- No new npm dependencies unless absolutely necessary
