# Spec: Clean Chat Message Filtering

## What
Pinchr's Chat page shows raw OpenClaw session history, which includes system plumbing (heartbeat prompts, cron injections, sub-agent announcements, memory flush prompts) mixed in with real user conversations. We need to classify every message and hide the noise so users see only their actual conversations.

## Why
The chat is unusable right now — system messages outnumber real messages in the main session. Users shouldn't see the agent's internal plumbing. They should see a clean conversation view with an optional way to peek at system activity.

## Current State

### Files involved:
- `src/renderer/src/hooks/useSimpleChat.ts` — Main chat hook, has partial filtering
- `src/renderer/src/components/chat/SimpleChatMessage.tsx` — Message rendering
- `src/renderer/src/pages/Chat.tsx` — Chat page with session sidebar
- `src/shared/types.ts` — Message type definition
- `src/main/gateway.ts` — `getSessionHistory()` fetches from OpenClaw

### What's already filtered (in useSimpleChat.ts):
- `HEARTBEAT_OK` / `NO_REPLY` (exact match, case-insensitive)
- Heartbeat prompt prefix (`/^read\s+heartbeat\.md/i`)
- `WORK_MODE:` prefix
- `scheduled reminder has been triggered`
- Compaction markers → shown as divider pills
- Pure JSON system metadata (system role + valid JSON)
- Channel envelope metadata (via `stripMessageMetadata`)

### What's NOT filtered (the junk users see):
1. Sub-agent announcement prompts: `"A subagent task 'xyz' just completed successfully..."`
2. Sub-agent stats lines: `"Stats: runtime 45s • tokens 12.5k..."`
3. Sub-agent instruction text: `"Summarize this naturally for the user..."`
4. Exec completion prompts: `"An async command you ran earlier has completed..."`
5. Memory flush prompts that slip through compaction patterns
6. HEARTBEAT_OK embedded in longer assistant text
7. Cron system event wrappers
8. `[System Message]` blocks injected into session

## Implementation

### 1. Add `classifyMessage()` function to useSimpleChat.ts

Replace the current inline `isNoiseMessage()` / `isCompactionMessage()` / `isPureJsonSystemMetadata()` checks with a single classification function:

```typescript
type MessageClass = 'user' | 'assistant' | 'compaction' | 'system-hidden'

// Messages that are system-injected prompts disguised as user role
const INJECTION_PATTERNS: RegExp[] = [
  // Sub-agent announcements
  /^(?:\[System Message\]\s*)?A (?:subagent task|completed subagent|cron job) ".+" just (?:completed|timed out|failed|finished)/i,
  /^(?:\[System Message\]\s*)?\[sessionId:/i,
  
  // Sub-agent instruction suffixes (these appear in the same message)
  /summarize this naturally for the user/i,
  /do not mention technical details like tokens/i,
  /convert the result above into your normal assistant voice/i,
  /you can respond with NO_REPLY if no announcement is needed/i,
  
  // Stats lines
  /^Stats:\s*runtime\s/m,
  /\bsessionKey\s+agent:\S+:subagent:/,
  
  // Exec completion
  /async command you ran earlier has completed/i,
  /a background (?:process|command|exec) .* (?:completed|finished)/i,
  
  // Heartbeat (broader)
  /^Read HEARTBEAT\.md/i,
  /follow it strictly.*?(?:reply |respond with )HEARTBEAT_OK/is,
  
  // Cron/reminder injection
  /^A scheduled reminder has been triggered/i,
  /scheduled (?:cron |system )?event/i,
  
  // Memory flush
  /^pre-compaction memory flush/i,
  
  // Work mode
  /^work_mode:/i,
  
  // System message blocks
  /^\[System Message\]/i,
]

// Assistant responses that are pure noise
const NOISE_RESPONSE_PATTERNS: RegExp[] = [
  /^heartbeat_ok$/i,
  /^no_reply$/i,
  /^\s*heartbeat_ok\s*$/im,  // catches it on its own line in longer text
  /^\s*no_reply\s*$/im,
]
```

The `classifyMessage()` function:
```typescript
function classifyMessage(message: Message, content: string): MessageClass {
  // System role = always synthetic
  if (message.role === 'system') {
    if (isCompactionMessage(content)) return 'compaction'
    return 'system-hidden'
  }
  
  // Assistant noise responses
  if (message.role === 'assistant') {
    if (NOISE_RESPONSE_PATTERNS.some(p => p.test(content))) return 'system-hidden'
    return 'assistant'
  }
  
  // User role — could be real or injected
  if (INJECTION_PATTERNS.some(p => p.test(content))) return 'system-hidden'
  if (isCompactionMessage(content)) return 'compaction'
  if (isPureJsonSystemMetadata(message, content)) return 'system-hidden'
  
  return 'user'
}
```

### 2. Update `buildHistoryEntries()` in useSimpleChat.ts

Replace the current filtering logic with:
```typescript
function buildHistoryEntries(messages: Message[]): SimpleChatEntry[] {
  const entries: SimpleChatEntry[] = []

  for (const message of messages) {
    const timestamp = parseTimestamp(message.timestamp)
    const content = extractMessageText(message)
    const classification = classifyMessage(message, content)

    if (classification === 'system-hidden') continue
    
    if (classification === 'compaction') {
      const previous = entries[entries.length - 1]
      if (previous?.type !== 'compaction') {
        entries.push({ id: createId('compaction'), type: 'compaction', timestamp })
      }
      continue
    }

    const hasToolCall = Boolean(message.toolName || message.toolResult)
    if (!content && !hasToolCall) continue

    // ... rest of existing message building logic unchanged
  }

  return sortEntriesChronologically(entries)
}
```

### 3. Remove old filter functions

Delete these now-redundant functions from useSimpleChat.ts:
- `isNoiseMessage()` 
- `isPureJsonSystemMetadata()` (fold into classifyMessage)
- The `HIDDEN_PATTERNS` constant (replaced by INJECTION_PATTERNS + NOISE_RESPONSE_PATTERNS)

Keep:
- `isCompactionMessage()` + `COMPACTION_PATTERNS` (used by classifyMessage)
- `extractMessageText()` (used by classifyMessage)

### 4. No changes needed to:
- `SimpleChatMessage.tsx` — rendering is fine
- `Chat.tsx` — page structure is fine  
- `SessionSidebar.tsx` — sidebar is fine
- `shared/types.ts` — no schema changes needed
- `gateway.ts` — no IPC changes needed

## Files to modify
1. `src/renderer/src/hooks/useSimpleChat.ts` — Replace filtering with classifyMessage()

## Acceptance Criteria
- [ ] Sub-agent announcement prompts are hidden from chat
- [ ] Stats lines are hidden
- [ ] Exec completion prompts are hidden
- [ ] `[System Message]` blocks are hidden
- [ ] Memory flush prompts are hidden
- [ ] HEARTBEAT_OK / NO_REPLY responses are hidden (including embedded in longer text)
- [ ] Heartbeat prompts (all variations) are hidden
- [ ] Cron injection wrappers are hidden
- [ ] Real user messages still display correctly
- [ ] Real assistant responses still display correctly
- [ ] Compaction markers still show as divider pills
- [ ] Tool calls still display correctly
- [ ] Streaming still works
- [ ] TypeScript compiles cleanly (`npx tsc --noEmit`)
- [ ] App builds (`yarn build`)

## What NOT to change
- Don't touch the session sidebar
- Don't touch message rendering/styling
- Don't touch the streaming logic
- Don't add any new UI components
- Don't modify the gateway or IPC layer
- This is purely a filtering change in one file
