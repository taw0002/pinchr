# Sessions Page Polish

## WHAT
The Sessions page shows all agent sessions with rich detail — more than the Chat sidebar. It's the "session manager" where users see token usage, timestamps, session types, and can manage (delete/archive) old sessions.

## WHY
Users need visibility into what their agent has been doing. Sessions are the core unit of work in OpenClaw. The Chat sidebar shows a compact list; Sessions gives the full picture.

## Current State
Sessions.tsx is 923 lines and already has:
- Session list with search/filter
- Process list (background exec sessions)
- Session detail panel
- Delete/kill functionality

## Task: Polish and connect to disk sessions
1. Ensure it uses the same `getSessions()` that now includes disk sessions (from session-history-from-disk feature)
2. Add session type badges (main, direct, sub-agent, cron, etc.) based on session key parsing
3. Show file size of transcript (proxy for conversation length)
4. Add "Open in Chat" button that navigates to Chat page with that session selected
5. Clean up any placeholder/mock data
6. Ensure empty states are clean

## Files
- src/renderer/src/pages/Sessions.tsx (923 lines — polish, don't rewrite)

## Acceptance Criteria
- Sessions page shows all sessions from disk + in-memory
- Each session shows: label, key, last activity, token count, type badge
- Search/filter works across all sessions
- "Open in Chat" navigates correctly
- Delete works for non-active sessions
- TypeScript compiles clean
