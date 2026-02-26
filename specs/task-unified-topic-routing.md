# Unified Topic Routing — All Surfaces Get Smart Context Management

## Problem
The topic router we built today (topic-router.ts) only works for messages sent from the Pinchr desktop UI. Messages from web and mobile go through the companion relay's `executeChatStreamCommand`, which streams directly to `/v1/chat/completions` bypassing the topic router entirely.

**Result:** Desktop users get smart topic-based session routing. Web and mobile users get a dumb pipe that dumps everything into one session — the exact context rot problem topic routing was built to solve.

## Architecture Principle
The desktop is the single brain. ALL intelligence — topic routing, memory, skills, gateway — lives there. Web and mobile are thin remote controls. Every message, regardless of origin surface, must flow through the same routing logic.

## Current Flow (Broken)
```
Desktop UI:
  message → topic-router.ts → picks/creates topic session → sends to correct session ✅

Web/Mobile (via companion relay):
  message → executeChatStreamCommand → /v1/chat/completions with client-provided session_key ❌
  (no topic routing, no session management, context rots)
```

## Target Flow (Fixed)
```
ALL surfaces:
  message → topic router classifies → picks/creates topic session → stream to THAT session
```

## Implementation

### 1. Create `routeAndStream` function in companion-relay.ts

This is the core change. A new function that combines topic routing + streaming:

```typescript
async function routeAndStream(
  command: CompanionCommand,
  config: CompanionRelayConfig
): Promise<{ content: string; reasoning: string; topicId: string; topicLabel: string }> {
  const payload = command.payload || {}
  const mainSessionKey = typeof payload.session_key === 'string' ? payload.session_key.trim() : 'agent:main:direct'
  const message = typeof payload.message === 'string' ? payload.message.trim() : ''

  // Step 1: Route through topic router (fast, keyword-based, no LLM)
  const routeResult = await routeMessageToTopicSession({
    workspacePath: WORKSPACE_PATH,
    mainSessionKey,
    message,
    invokeTool: invokeGatewayTool
  })

  const targetSessionKey = routeResult.route.sessionKey

  // Step 2: Stream to the ROUTED session (not the client-provided session_key)
  // ... same SSE streaming logic as current executeChatStreamCommand
  // ... but using targetSessionKey instead of sessionKey
  // ... broadcast chunks to Supabase including topic envelope metadata

  // Step 3: Include topic metadata in the first chunk
  // Browser/mobile can show "Routed to: [topic label]" badge
}
```

### 2. Update `executeChatStreamCommand` to use `routeAndStream`

Replace the current direct-to-gateway streaming with the routed version:

```typescript
case 'chat_stream':
  return routeAndStream(command, config)
```

### 3. Broadcast topic metadata in stream chunks

The first chunk should include routing info so the UI can display it:

```json
{
  "type": "chunk",
  "meta": {
    "topicId": "sidebar-alignment-abc12",
    "topicLabel": "Sidebar Button Alignment",
    "sessionKey": "agent:sub:topic-1",
    "created": false,
    "confidence": 0.85
  },
  "content": "",
  "done": false
}
```

### 4. Update web ChatView to show topic routing info

When the first chunk arrives with `meta.topicLabel`:
- Show a small badge above the assistant response: "📌 Sidebar Button Alignment"
- Helps user understand which topic context the agent is using

### 5. Update mobile ChatScreen to show topic routing info

Same badge pattern as web, using React Native components.

### 6. Update desktop Chat.tsx `useRouteMessage` integration

The desktop currently has `useRouteMessage` hook but it's separate from the main chat flow. Ensure the desktop Chat page also uses topic routing for all messages, not just when explicitly triggered.

### 7. Handle edge cases

#### New topic creation
When topic router creates a new session, the first chunk should indicate `created: true`. UI can show "New topic: [label]" with a subtle animation.

#### Topic session doesn't exist yet
The `spawnTopicSession` in topic-router.ts uses `sessions_spawn`. After spawning, we need the session to be ready before streaming to it. Add a small readiness check (poll `sessions_list` for the new session key, max 3 attempts with 500ms delay).

#### Fallback to main session
If topic routing fails (error, timeout), fall back to streaming directly to the main session. Never block the user's message because routing failed.

```typescript
let targetSessionKey = mainSessionKey // fallback
try {
  const routeResult = await routeMessageToTopicSession(...)
  targetSessionKey = routeResult.route.sessionKey
} catch (routeError) {
  activityLogger.log('api_call', `Topic routing failed, falling back to main: ${routeError}`)
}
// Stream to targetSessionKey regardless
```

#### Topic overflow / archival
Topic router already handles lifecycle (archive stale >7 days, cap at 32 per session). But when a topic is archived and a related message comes in, the router should create a fresh topic, seeded with the archived summary if available.

Check `memory/topics/archive/{topicId}.md` for context when creating a new topic in the same domain.

#### Session key from web/mobile clients
Web/mobile currently send a client-provided `session_key`. The router should use this as the `mainSessionKey` (the parent session that topics branch from), NOT as the target session. The router picks the target.

### 8. Update stream chunk schema

Add optional `route` field to StreamChunk type across all three surfaces:

```typescript
interface StreamChunk {
  type: string
  content?: string
  reasoning?: string
  toolEvent?: 'start' | 'result' | null
  toolName?: string
  toolResult?: string
  toolError?: string
  done?: boolean
  route?: {
    topicId: string
    topicLabel: string
    sessionKey: string
    created: boolean
    confidence: number
  }
}
```

### 9. Tests

Add to `topic-router.test.ts`:
- Test that `routeAndStream` routes follow-up messages to the same topic
- Test fallback when routing fails
- Test that archived topic summary is available for re-creation
- Test concurrent messages from different surfaces route correctly

### 10. Desktop IPC: unify `gateway:route-message` and `gateway:stream-message`

Currently there are two IPC handlers:
- `gateway:route-message` — goes through topic router, returns result via events
- `gateway:stream-message` — streams directly to gateway, no routing

Merge these: ALL messages from the desktop renderer should go through topic routing + streaming. Remove the non-routed path.

## Files to Modify

### openclaw-desktop (Pinchr Desktop)
- `src/main/companion-relay.ts` — Add `routeAndStream`, update `executeChatStreamCommand`
- `src/main/topic-router.ts` — No changes needed (already works)
- `src/main/ipc.ts` — Merge route + stream IPC handlers
- `src/renderer/src/hooks/useGateway.ts` — Update `useStreamMessage` to always route
- `src/renderer/src/pages/Chat.tsx` — Remove separate route/stream paths
- `src/shared/types.ts` — Add `route` field to StreamChunk

### pinchr-landing (Web App)
- `src/app/app/hooks/useCompanionChat.ts` — Handle `route` metadata in chunks
- `src/app/app/components/StreamingMessage.tsx` — Show topic badge
- `src/app/app/components/ChatView.tsx` — Display routing info

### pinchr-mobile (Mobile App)
- `src/lib/companion.ts` — Update StreamChunk type with `route` field
- `src/components/StreamingMessage.tsx` — Show topic badge
- `app/(tabs)/index.tsx` — Handle route metadata in chunks

## Definition of Done
- [ ] ALL messages from ALL surfaces (desktop, web, mobile) go through topic routing
- [ ] Topic routing failures fall back gracefully to main session (never blocks user)
- [ ] Topic metadata visible in UI on all surfaces (badge with topic label)
- [ ] New topic creation shows "New topic" indicator
- [ ] Follow-up messages route to same topic (verified by test)
- [ ] Archived topic context available for re-created topics
- [ ] No regression in direct gateway streaming (desktop LAN mode)
- [ ] No regression in companion relay streaming (web/mobile)
- [ ] Tests pass for all routing scenarios
- [ ] TypeScript clean across all three repos
- [ ] Session picker on web/mobile shows topic sessions grouped correctly
