# Session History from Disk

## WHAT
Pinchr's Chat sidebar currently only shows sessions from the gateway's in-memory `sessions_list` API. When the gateway restarts (e.g., after a Pinchr update), the in-memory store is wiped and only the newly-created session appears. Users lose visibility into all their conversation history.

## WHY
This is a critical UX issue — users see only 1 session after a restart when they actually have 92+ transcript files with full conversation history on disk. The whole point of the Chat page is to let users access their conversations.

## Architecture

### How OpenClaw stores sessions
- **Transcript files**: `~/.openclaw/agents/main/sessions/<uuid>.jsonl` — full message history
- **Session index**: `~/.openclaw/agents/main/sessions/sessions.json` — maps session keys to transcript UUIDs
- **Deleted transcripts**: `*.jsonl.deleted.<timestamp>` — soft-deleted, should be excluded

### sessions.json format
```json
{
  "agent:main:main": {
    "sessionId": "0bf635b7-6ddb-48fd-80f0-6787ddad25ae",
    "updatedAt": 1771290458500,
    "systemSent": true,
    ...
  },
  "slack:g-agent-main-main": {
    "sessionId": "...",
    "updatedAt": ...,
    ...
  }
}
```

### Transcript JSONL first line (session header)
```json
{
  "type": "session",
  "version": 3,
  "id": "00f273c5-73f4-4ac1-8e1e-ea911435bf3f",
  "timestamp": "2026-02-15T11:14:10.045Z",
  "cwd": "/Users/drewwagner/.openclaw/workspace"
}
```

## Implementation

### 1. New function in `src/main/gateway.ts`: `getSessionsFromDisk()`

```typescript
export async function getSessionsFromDisk(): Promise<unknown[]> {
  // 1. Read sessions.json to get key -> UUID mapping
  // 2. For each entry, stat the corresponding .jsonl file for size/mtime
  // 3. Read first line (session header) for creation timestamp
  // 4. Read last few lines for latest message preview
  // 5. Return array matching the format getSessions() returns
}
```

Key details:
- Path: `~/.openclaw/agents/main/sessions/sessions.json`
- Transcript path: `~/.openclaw/agents/main/sessions/<sessionId>.jsonl`
- Skip entries where transcript file doesn't exist or is `.deleted`
- Use `fs.stat()` for mtime (last activity proxy)
- Read last non-empty JSONL line for message preview (look for `type: "message"` with `role: "assistant"` or `role: "user"`)
- Don't read entire files — use `readline` or tail approach for last few lines

### 2. Update `getSessions()` in `src/main/gateway.ts`

Merge in-memory sessions (from `toolsInvoke('sessions_list')`) with disk sessions:
- In-memory sessions take priority (they have live state like token counts)
- Disk-only sessions fill in the history
- Deduplicate by session key
- Sort by `updatedAt` descending

### 3. No renderer changes needed

`SessionSidebar.tsx` already handles the session data format — it just needs more sessions in the array.

### 4. Performance considerations
- `sessions.json` is small (< 100KB typically), safe to read synchronously
- Don't read full transcript files — only stat + first/last lines
- Cache disk sessions for 30s to avoid re-reading on every 12s sidebar refresh
- The 12s refresh interval in SessionSidebar is fine — the disk read with caching will be fast

## Acceptance Criteria
- [ ] Session sidebar shows ALL sessions from disk, not just in-memory
- [ ] Sessions display correct labels (resolved from session key)
- [ ] Sessions display approximate last activity time (from file mtime or sessions.json updatedAt)
- [ ] Sessions display a message preview from the last message
- [ ] Clicking a disk-only session loads its full history via `getSessionHistory()`
- [ ] Deleted transcripts (`.jsonl.deleted.*`) are excluded
- [ ] No performance regression — disk reads are cached
- [ ] TypeScript compiles clean (`npx tsc --noEmit`)

## Files to modify
- `src/main/gateway.ts` — add `getSessionsFromDisk()`, update `getSessions()`
- That's it. The renderer already works with the data format.

## Edge cases
- sessions.json doesn't exist yet (fresh install) → return empty array
- Transcript file referenced in sessions.json was deleted → skip it
- Very large transcript files → only read first/last lines, never full file
- Session key format variations → `SessionSidebar` already handles these via `resolveSessionLabel()`
