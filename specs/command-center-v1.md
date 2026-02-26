# Command Center v1 — Mission Control Dashboard

## Vision Context
Read VISION.md in the repo root. This is Phase 1 of the Pinchr vision: the dashboard becomes mission control — the primary way users interact with and see what their agent is doing.

## What We're Building

Replace the current Dashboard + separate Chat page with a unified **Command Center** that combines:
1. **Needs Attention** — actionable items requiring human decision
2. **Activity Stream** — real-time feed of agent actions
3. **Conversational Input** — chat input always available at the bottom
4. **Quick Context** — schedule, weather, key metrics as ambient info

The chat is not a separate page. It's the input layer integrated into the command center.

## Current State
- `Dashboard.tsx` — greeting, quick actions, suggested prompts, fake usage stats
- `Chat.tsx` — 2445-line monolith handling sidebar + chat + sessions
- `Sessions.tsx` — separate session management page
- These three get consolidated into one experience

## Architecture

### New File Structure
```
src/renderer/src/pages/
  CommandCenter.tsx          # Main page component (layout + orchestration)
  
src/renderer/src/components/command-center/
  NeedsAttention.tsx         # Priority items requiring decisions
  ActivityStream.tsx         # Scrollable activity feed
  ActivityCard.tsx           # Individual activity item
  ChatInput.tsx              # Persistent chat input bar
  QuickContext.tsx            # Ambient context strip (time, weather, next event)
  TopicSidebar.tsx           # Left sidebar: topics, projects, search
  ConversationThread.tsx     # Inline conversation display (messages appear in stream)
```

### Data Flow
```
Gateway (sessions_list, sessions_history)
    ↓
useCommandCenter hook (orchestrates all data)
    ↓
CommandCenter.tsx
    ├── TopicSidebar (left)
    ├── NeedsAttention (top, collapsible)  
    ├── ActivityStream + ConversationThread (main, interleaved)
    ├── QuickContext (ambient strip)
    └── ChatInput (bottom, always visible)
```

### Key Hook
```typescript
// src/renderer/src/hooks/useCommandCenter.ts
interface CommandCenterState {
  // Activity
  activities: ActivityItem[]
  needsAttention: AttentionItem[]
  
  // Conversation
  messages: ChatMessage[]
  isStreaming: boolean
  streamingContent: string
  thinkingContent: string
  
  // Context
  topics: Topic[]
  activeTopic: string | null
  
  // Actions
  sendMessage: (text: string) => Promise<void>
  approveAction: (id: string) => Promise<void>
  dismissAction: (id: string) => Promise<void>
  filterByTopic: (topic: string) => void
}
```

## Component Specs

### CommandCenter.tsx
- Full-page layout, replaces Dashboard as the home route (`#/`)
- Three-column on wide screens: sidebar | main content | (optional context panel)
- Two-column on medium: sidebar | main content
- Single column on small: collapsible sidebar

### NeedsAttention.tsx
- Top section, accent-bordered, shows items needing human decision
- Each item: icon + title + description + action buttons (approve/dismiss/view)
- Sources: sub-agent completions (review needed), draft messages (approve/edit), questions from agent (stuck/need input)
- Collapsible when empty — don't waste space
- Badge count in section header
- Data source: Parse from recent session history — look for tool calls with pending status, messages asking questions, sub-agent completion announcements

### ActivityStream.tsx
- Scrollable feed, newest at bottom (chat-like scrolling)
- **Interleaves activity cards with conversation messages**
- Activity cards: tool calls, sub-agent spawns/completions, file changes, emails processed, etc.
- Conversation messages: user messages + agent responses, rendered inline
- Each item has timestamp, expandable for details
- Filter by topic (from sidebar)
- Data source: `sessions_history` for messages + tool calls, `sessions_list` for sub-agents

### ActivityCard.tsx
- Compact by default: icon + title + status badge + timestamp
- Expandable: full details, file list, diff preview, transcript link
- Types and their icons:
  - 🔧 tool_call — "Used [tool name]"
  - 🤖 sub_agent — "Working on [task]" / "Completed [task]"
  - 📧 communication — "Processed email from [sender]"
  - 💻 code — "Modified [file]"
  - 🔍 research — "Searched: [query]"
  - 📄 file — "Created/Updated [filename]"
  - ⚙️ system — "Configuration changed"
- Status colors: blue (in progress), green (completed), red (failed), yellow (needs attention)

### ChatInput.tsx
- Fixed at bottom of command center, always visible
- Text input + voice button + attachment button (reuse existing file drop)
- Shows streaming indicator when agent is responding
- Submit sends to gateway via existing `chat_stream` flow
- Voice: existing record → Whisper → send flow
- Keyboard: Enter to send, Shift+Enter for newline

### ConversationThread.tsx
- Renders user + assistant messages inline in the activity stream
- User messages: right-aligned or green accent (consistent with current)
- Agent messages: left-aligned, rendered markdown, thinking blocks collapsible
- Tool call results: rendered as ActivityCards inline
- This replaces the current Chat.tsx message rendering

### TopicSidebar.tsx
- Left sidebar, collapsible
- Sections:
  - **Search** — full-text search across messages and activities
  - **Pinned** — user-pinned topics/projects
  - **Recent Topics** — auto-generated from conversation content
  - **All Activity** — unfiltered view (default)
- Topics are generated client-side from message content (keyword extraction)
- Selecting a topic filters the activity stream + conversation
- At bottom: links to Settings, Connections, Agent Builder (secondary pages)

### QuickContext.tsx
- Thin ambient strip showing contextual info
- Current time + next calendar event + weather (if available)
- Pulls from recent agent tool call results (calendar/weather skills)
- Non-interactive, just ambient context
- Can be hidden in settings

## Routing Changes

### Before
```
#/ → Dashboard
#/chat → Chat (with sessions sidebar)
#/sessions → Sessions
```

### After
```
#/ → CommandCenter (the main experience)
#/settings → Settings
#/connections → Connections  
#/agent-builder → Agent Builder
#/mcp → MCP Servers
#/brain → Brain
#/memory → Memory
#/security → Security
#/activity → Full Activity Log (expanded view)
#/team → Team
```

Chat and Sessions are no longer separate routes. They're integrated into CommandCenter.

### Sidebar Navigation
```
🏠 Command Center  (home, the main view)
---
⚡ Activity        (full activity log, expanded view)
📋 Tasks           (task manager)
🔧 Agent Builder   (if Pro)
🔌 Connections     (integrations)
🧠 Brain           (knowledge base)
💾 Memory          (memory files)
🔒 Security        (permissions)
⚙️ Settings
```

## Migration Strategy

1. Build CommandCenter as a NEW page alongside existing Dashboard/Chat
2. Route `#/` to CommandCenter
3. Keep `#/chat` working temporarily (redirects or legacy mode)
4. Once CommandCenter is stable, remove old Dashboard.tsx and refactor Chat.tsx into the component parts
5. Don't delete Chat.tsx yet — extract the streaming/gateway logic into shared hooks first

## What NOT To Build Yet

- json-render integration (Phase 1.5 — after basic cards work with hardcoded React)
- Agent-generated custom components (Phase 2+)
- Cross-platform catalog (mobile comes later)
- Skill component loading (needs ClawHub integration)
- Context scoping (personal/work — Phase 2)

## What To Reuse

- `useSessionState.ts` — streaming logic, message handling
- `useGatewaySessions.ts` — session fetching
- `ChatMessage` component — message rendering (extract from Chat.tsx)
- `useActivityLog.ts` — activity parsing (already built)
- `useSessionSearch.ts` — search (already built)
- Tailwind + shadcn design system — all existing components

## Acceptance Criteria

1. CommandCenter loads as the home page
2. Activity stream shows real agent actions from session history
3. Needs Attention section shows pending items (or collapses when empty)
4. Chat input at bottom sends messages and receives streaming responses
5. Conversation messages interleave with activity cards
6. Sidebar shows topics/filters
7. Existing pages (Settings, Connections, etc.) still accessible from sidebar nav
8. No regression in streaming, voice, or file upload functionality
9. Mobile-responsive (sidebar collapses)
10. No fake data anywhere — empty states for missing data

## Key Files to Reference
- `src/renderer/src/pages/Dashboard.tsx` — current dashboard (being replaced)
- `src/renderer/src/pages/Chat.tsx` — current chat (being decomposed)
- `src/renderer/src/pages/Sessions.tsx` — current sessions (being absorbed)
- `src/renderer/src/hooks/useSessionState.ts` — streaming logic to reuse
- `src/renderer/src/hooks/useGatewaySessions.ts` — session data to reuse
- `src/renderer/src/hooks/useActivityLog.ts` — activity parsing to reuse
- `src/renderer/src/hooks/useSessionSearch.ts` — search to reuse
- `src/renderer/src/components/Sidebar.tsx` — navigation (needs update)
- `src/renderer/src/App.tsx` — routing (needs update)
