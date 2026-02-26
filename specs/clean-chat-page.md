# Clean Chat Page — Spec

## What
Replace the current broken Command Center / Chat page with a dead-simple, bulletproof chat interface. Think iMessage — chronological messages, clean rendering, reliable streaming.

## Why
The Command Center accumulated too many layers (topics, activity cards, needs attention, channel badges, metadata stripping, deduplication, system message filtering) and the fundamental chat experience broke. Messages don't show, system noise leaks through, the page renders blank. We need to start over with a solid foundation.

## Requirements

### Core (must have)
1. **Chronological message list** — user messages (right-aligned, coral) and assistant messages (left-aligned, dark surface)
2. **Streaming responses** — tokens appear as they arrive, thinking indicator while agent is working
3. **Tool call pills** — inline small pills showing what the agent is doing ("🔍 Searching web", "📄 Reading file.ts", "✏️ Wrote config.json"). Collapsed by default, expandable on click.
4. **Input box** — bottom of page, auto-growing textarea, send on Enter (Shift+Enter for newline), send button
5. **Auto-scroll** — scroll to bottom on new messages, unless user has scrolled up
6. **Message timestamps** — small, subtle, on each message
7. **Markdown rendering** — agent responses render markdown (code blocks, bold, italic, lists, links, inline code)
8. **File attachments** — drag and drop files onto the input area (existing DropZone component can be reused if it works)
9. **Session routing** — connects to main agent session (`agent:main:direct:drew` or discovered via `getMainSession()`)
10. **History loading** — loads last 50 messages on mount, "Load more" button at top

### Filtering (simple rules)
- Hide messages where content matches: `heartbeat_ok`, `no_reply`, starts with `Read HEARTBEAT.md`, starts with `WORK_MODE:`, contains `scheduled reminder has been triggered`
- Hide system-role messages that are pure JSON metadata
- Show compaction as a small divider pill ("Context compacted")
- Everything else shows normally

### NOT in scope (explicitly excluded)
- Topic sidebar / topic filtering
- "Needs Attention" cards
- Activity cards / special message layouts
- Channel badges (Slack, WhatsApp indicators)
- Message grouping by topic
- Command Center dashboard concept
- Search (can add later)

## Technical Approach

### New files
- `src/renderer/src/pages/Chat.tsx` — the page component (replace existing)
- `src/renderer/src/components/chat/SimpleChatMessage.tsx` — single message component
- `src/renderer/src/components/chat/SimpleToolPill.tsx` — tool call pill
- `src/renderer/src/components/chat/SimpleChatInput.tsx` — input area
- `src/renderer/src/hooks/useSimpleChat.ts` — hook that manages messages, streaming, history

### Reuse from existing
- `src/main/gateway.ts` — `getMainSession()`, `getSessionHistory()`, `streamMessage()`, `getGatewayUrl()`, `getGatewayToken()`
- `src/shared/strip-metadata.ts` — `stripMessageMetadata()` for cleaning content
- `src/shared/types.ts` — `Message`, `StreamChunkPayload`, `MessageContentPart`
- Tailwind + shadcn/ui primitives (ScrollArea, Button)
- Existing markdown renderer if one exists, otherwise use `react-markdown` + `remark-gfm`

### Delete / remove
- `src/renderer/src/components/command-center/` — entire directory (ActivityStream, ActivityCard, ConversationThread, NeedsAttention, TopicSidebar)
- `src/renderer/src/hooks/useCommandCenter.ts`
- `src/renderer/src/pages/CommandCenter.tsx` (if still exists separately)
- Any imports/routes referencing these deleted components

### Keep working
- App.tsx routing — Chat page should be the default/home route
- Sidebar navigation — Chat link in sidebar
- All other pages (Settings, Sessions, Workflows, etc.) untouched

## Design

### Layout
```
┌─────────────────────────────────────┐
│  [Sidebar]  │  Chat                 │
│             │                       │
│  Chat  ●    │  ┌─ Load more ──────┐ │
│  Settings   │  │                  │ │
│  Sessions   │  │  User message    │ │
│  ...        │  │         [coral]  │ │
│             │  │                  │ │
│             │  │  Agent response  │ │
│             │  │  [dark surface]  │ │
│             │  │                  │ │
│             │  │  🔍 Searched web │ │
│             │  │                  │ │
│             │  │  Agent response  │ │
│             │  │  with markdown   │ │
│             │  │                  │ │
│             │  │  ··· typing ···  │ │
│             │  │                  │ │
│             │  ├──────────────────┤ │
│             │  │ [Message input]  │ │
│             │  │            [Send]│ │
│             │  └──────────────────┘ │
└─────────────────────────────────────┘
```

### Colors (existing theme)
- User messages: `bg-accent` (coral) with white text, right-aligned
- Agent messages: `bg-surface-2` with `text-primary`, left-aligned  
- Tool pills: `bg-surface-1` border `border-border`, small text
- Timestamps: `text-text-muted` text-xs
- Input: `bg-surface-1` with `border-border`

## Definition of Done
- [ ] Chat page loads and shows message history
- [ ] Can send a message and see it appear immediately (optimistic)
- [ ] Streaming response renders token by token
- [ ] Tool calls show as small pills
- [ ] Heartbeat/system noise is filtered out
- [ ] Markdown renders correctly in responses (code blocks, lists, bold, links)
- [ ] Auto-scroll works (follows new messages, stops when user scrolls up)
- [ ] No blank screen, no missing messages, no console errors
- [ ] TypeScript clean (`npx tsc --noEmit` passes)
- [ ] Build passes (`yarn build`)
