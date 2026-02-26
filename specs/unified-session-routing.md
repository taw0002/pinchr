# Unified Session Routing — Single Conversation Across All Channels

## Problem

Pinchr desktop uses `/v1/chat/completions` for direct gateway chat. This creates an isolated session (`agent:main:openai-user:pinchr-*`) that is SEPARATE from the main agent session (`agent:main:direct:drew`) where WhatsApp and Slack messages land.

Result: conversation in Pinchr is disconnected from conversations on other channels. The agent has different context in Pinchr vs Slack/WhatsApp. This breaks the "one continuous conversation" experience.

## Goal

All channels — WhatsApp, Slack, Pinchr desktop, Pinchr web, Pinchr mobile, voice — feed into ONE session. The agent has one brain, one context, one conversation history. Pinchr shows the full unified timeline with channel badges.

## Current Architecture

```
WhatsApp ──→ agent:main:direct:drew ──→ Agent ──→ Response to WhatsApp
Slack    ──→ agent:main:direct:drew ──→ Agent ──→ Response to Slack
Pinchr   ──→ agent:main:openai-user:pinchr-* ──→ Agent ──→ Response to Pinchr (ISOLATED)
```

WhatsApp and Slack already share a session. Pinchr is the odd one out.

## Target Architecture

```
WhatsApp ──→ agent:main:direct:drew ──→ Agent ──→ Response to WhatsApp  
Slack    ──→ agent:main:direct:drew ──→ Agent ──→ Response to Slack
Pinchr   ──→ agent:main:direct:drew ──→ Agent ──→ Response to Pinchr ✅
```

All channels → one session. Responses route back to the source channel.

## Implementation

### Approach: Use `tools/invoke` with `chat_stream` Instead of `/v1/chat/completions`

The companion relay ALREADY routes through the main session via `tools/invoke`. This is proven working for web/mobile. Desktop should use the same path for direct gateway mode.

Currently:
- **Direct mode** (desktop → local gateway): Uses `/v1/chat/completions` → creates isolated session
- **Relay mode** (web/mobile → API → Supabase → desktop → gateway): Uses `tools/invoke` with `chat_stream` → hits main session

Fix: Desktop direct mode should ALSO use `tools/invoke` with `chat_stream` (or equivalent) to hit the main session.

### Option A: Desktop Uses `tools/invoke` Directly

Desktop's chat handler switches from:
```typescript
// BEFORE: Creates isolated session
const response = await fetch(`${gatewayUrl}/v1/chat/completions`, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` },
  body: JSON.stringify({ messages, stream: true })
});
```

To:
```typescript
// AFTER: Routes to main session
const response = await fetch(`${gatewayUrl}/tools/invoke`, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` },
  body: JSON.stringify({
    tool: 'sessions_send',
    args: {
      sessionKey: 'agent:main:direct:drew', // or dynamically resolved
      message: userMessage
    }
  })
});
```

**Problem**: `sessions_send` blocks and doesn't stream. Not suitable for real-time chat.

### Option B: Use `/v1/chat/completions` with Session Key Mapping

OpenClaw's `/v1/chat/completions` uses the `user` field to determine session routing. If we can set the `user` field to map to the main session key, messages will land in the right session.

```typescript
// Set user to match main session routing
const response = await fetch(`${gatewayUrl}/v1/chat/completions`, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` },
  body: JSON.stringify({
    messages,
    stream: true,
    user: 'direct:drew'  // Maps to agent:main:direct:drew
  })
});
```

**Need to verify**: How does OpenClaw map the `user` field to session keys? Check the gateway source or docs.

### Option C: Use the Companion Relay Path for Everything (Recommended)

The companion relay's `chat_stream` command in `companion-relay.ts` already:
1. Receives a message
2. Sends it through `tools/invoke` to the gateway
3. Streams the response back via Supabase Broadcast

For desktop direct mode, we can use the same `tools/invoke` pattern but skip Supabase — stream directly from the HTTP response.

```typescript
// In main process: direct gateway chat via tools/invoke
async function chatDirect(message: string, gatewayUrl: string, token: string): AsyncGenerator<StreamChunk> {
  const response = await fetch(`${gatewayUrl}/tools/invoke`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      tool: 'sessions_send',
      args: {
        message: message
      }
      // No sessionKey = sends to main session
    })
  });
  // Parse streaming response...
}
```

**Need to verify**: Does `tools/invoke` with `sessions_send` support streaming? If not, we may need a different tool or a gateway enhancement.

### Research Completed — How It Works

From OpenClaw docs (`docs/gateway/openai-http-api.md`):
- **`x-openclaw-session-key: <sessionKey>`** header fully controls session routing
- **`user` field** derives a stable session key if no header is set
- Pinchr's `gateway.ts:streamMessage()` ALREADY passes both `user` and `x-openclaw-session-key`

Current Pinchr code (`src/main/gateway.ts:154`):
```typescript
// streamMessage() sends to /v1/chat/completions with:
user: sessionUser || deriveUserFromSessionKey(sessionKey)  // e.g., "pinchr-aa46f5e5..."
headers: { 'x-openclaw-session-key': sessionKey }          // e.g., Pinchr-specific key
```

**The fix**: Pass the MAIN session key instead of a Pinchr-specific one:
```typescript
// Route to main agent session instead of isolated Pinchr session
headers: { 'x-openclaw-session-key': 'agent:main:direct:drew' }
```

But `agent:main:direct:drew` is user-specific. We need to dynamically discover the main session key. Options:
1. Use `sessions_list` to find the primary session at startup
2. Derive from gateway config (the agent's main session key format is predictable)
3. Add a Pinchr setting for "main session key"

**Recommended**: On first connect, call `sessions_list`, find the session with pattern `agent:main:direct:*` or `agent:main:main`, cache it, use for all chat routing.

### Unified History View

Once all channels route to one session, `sessions_history` on that session returns ALL messages. Each message has metadata about its source channel.

Pinchr renders:
```
📱 [WhatsApp] 2:30 PM — "Check my email"
🤖 2:30 PM — "3 emails need attention..."
💬 [Slack] 3:15 PM — "What about that calendar conflict"  
🤖 3:15 PM — "The 2pm conflict..."
🖥️ [Pinchr] Now — "Show me the code review"
🤖 Now — [streaming response...]
```

Channel badge derived from message metadata (inbound context channel field).

### Session History Display

The conversation view in Pinchr should:
1. Fetch from `sessions_history` on the main session
2. Render messages chronologically with channel badges
3. Show the full unified conversation — not just Pinchr messages
4. Support search across all messages
5. Handle compaction gracefully (older messages summarized, recent messages detailed)

## Files to Modify

### Desktop
- `src/renderer/src/hooks/useSessionState.ts` — change direct gateway chat to route to main session
- `src/renderer/src/hooks/useGatewaySessions.ts` — fetch from main session, not pinchr-specific
- `src/renderer/src/components/command-center/ConversationThread.tsx` — add channel badges
- `src/renderer/src/components/command-center/ActivityStream.tsx` — interleave with channel context
- `src/main/companion-relay.ts` — reference for how relay already routes correctly

### Web App
- Already uses companion relay → already unified ✅
- Add channel badges to message display

### Mobile
- Already uses companion relay → already unified ✅
- Add channel badges to message display

## Acceptance Criteria

1. Messages sent from Pinchr desktop land in the main session (same as WhatsApp/Slack)
2. Agent has full context from all channels when responding in Pinchr
3. Pinchr conversation view shows messages from ALL channels with badges
4. Streaming still works (thinking blocks, tool calls, progressive rendering)
5. Voice input routes to the same session
6. No regression in companion relay (web/mobile) behavior
7. Session history search works across all channels

## Risks

- **Double delivery**: If Pinchr and Slack are both connected, a response might need to go to BOTH surfaces. Need to ensure response routes only to the source channel.
- **Context window**: One session means all channels share the 200k context window. More messages = faster compaction. This is actually fine — compaction already handles this, and memory files bridge the gaps.
- **Message formatting**: Slack supports rich formatting, WhatsApp is limited, Pinchr can render anything. Agent may need to know which channel the response is going to for formatting decisions. (OpenClaw already handles this via channel context.)

---

*This is the foundational fix that makes the "one continuous conversation" vision real. Everything else (command center, cards, marketplace) builds on this.*

*References: VISION.md, command-center-v1.md*
*Last updated: 2026-02-14*
