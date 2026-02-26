# Spec: Chat Page Consolidation + Real Command Center

## What
1. Merge Command Center and Chat into ONE page called "Chat" (the default/home page)
2. Delete the old Chat page
3. Fix topic categories — derive from real session data instead of static JSON
4. Build a separate "Dashboard" page with real status/notifications/management

## Why
- "Command Center" sounds like a dashboard but it's just chat — misleading
- Two chat pages confuses users
- Topics from a static JSON file don't reflect actual conversations
- Users need a real dashboard for status, notifications, and management

## Part 1: Chat Page Consolidation

### Changes
1. **Rename**: "Command Center" → "Chat" in sidebar, navigation, everywhere
2. **Delete**: Old `Chat.tsx` page entirely
3. **Default page**: "Chat" becomes the default landing page
4. **Sidebar**: Remove old "Chat" entry, rename "Command Center" to "Chat"
5. **URL hash**: `#/chat` → Chat page (was command-center)
6. **Component**: `CommandCenter.tsx` renamed to `Chat.tsx` (or keep file, just update label)

### Navigation type changes
- Remove `'command-center'` from Page type
- Keep `'chat'` as the only chat page
- Update all references in App.tsx, Sidebar.tsx, navigation.ts

## Part 2: Fix Topic Categories

### Current Problem
Topics come from `~/.openclaw/workspace/topic-sessions.json` — a static file with 3 manually curated entries. Doesn't reflect actual conversations.

### Solution: Derive topics from sessions
1. Use `sessions_list` to get all sessions
2. Group/categorize by session key patterns and labels
3. Show as sidebar categories with message counts
4. Categories:
   - **Direct** — main DM sessions (WhatsApp, Slack, Pinchr)  
   - **Channels** — group chats, Discord servers
   - **Background** — sub-agent sessions, cron jobs
   - **Archived** — old/inactive sessions
5. Each session shows: label, last message preview, timestamp, channel badge
6. Clicking a session loads its history in the chat view

### Why NOT keyword-based topic extraction
Drew already said (2026-02-14) agent-driven topic tagging is the v2 plan. For now, session-based grouping is honest and works.

## Part 3: Real Dashboard (New Page)

### What it shows
A "Dashboard" page in the sidebar that answers: "What has my agent been doing? What needs attention?"

```
┌─────────────────────────────────────────────────────────┐
│ Dashboard                                                │
│                                                          │
│ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐     │
│ │ ✅ Gateway    │ │ 📊 Model     │ │ 💬 Channels  │     │
│ │ Running      │ │ Opus 4.6     │ │ 3 active     │     │
│ │ 65k/200k ctx │ │ Medium think │ │ Slack,WA,Pin │     │
│ └──────────────┘ └──────────────┘ └──────────────┘     │
│                                                          │
│ ⚡ Needs Attention (2)                                   │
│ ┌────────────────────────────────────────────────────┐  │
│ │ 🔑 No OpenAI API key configured                    │  │
│ │ 📧 3 unread emails                                 │  │
│ └────────────────────────────────────────────────────┘  │
│                                                          │
│ 📋 Recent Activity                                      │
│ • Built Pinchr v0.6.0 — 2 hours ago                    │
│ • Responded to Drew on Slack — 15 min ago              │
│ • Updated MEMORY.md — 1 hour ago                       │
│ • Completed task-080 — 3 hours ago                     │
│                                                          │
│ 🔄 Background Tasks                                     │
│ • Codex: API key management — completed ✅              │
│ • Cron: daily health check — next run 9am              │
│                                                          │
│ ⚙️ Quick Actions                                        │
│ [Restart Gateway] [Check Email] [Open Terminal]         │
└─────────────────────────────────────────────────────────┘
```

### Implementation
- New page component: `Dashboard.tsx`
- Sidebar entry: replaces current "Dashboard" or goes at top
- Data sources:
  - Gateway health (existing `useGatewayHealth`)
  - Session status (existing query)
  - Sessions list (for activity)
  - Cron jobs (for background tasks)
  - Provider status (new, from providers:list)
- Needs Attention items sourced from:
  - No API keys configured
  - Gateway offline
  - Trial expiring soon
  - Pending sub-agent completions

## Files to Modify
- `src/renderer/src/types/navigation.ts` — remove 'command-center', update Page type
- `src/renderer/src/App.tsx` — update page mapping, default page, hash routing
- `src/renderer/src/components/Sidebar.tsx` — remove old Chat, rename Command Center
- `src/renderer/src/pages/CommandCenter.tsx` — rename to Chat.tsx (or update exports)
- `src/renderer/src/pages/Chat.tsx` — DELETE old chat page
- `src/renderer/src/components/command-center/TopicSidebar.tsx` — rewrite to use sessions
- `src/renderer/src/hooks/useCommandCenter.ts` — update to fetch real sessions for topics

## Files to Create
- `src/renderer/src/pages/Dashboard.tsx` — new real dashboard

## Part 4: Chat Status Bar

A compact status/control bar at the top of the Chat page for quick model switching and monitoring without leaving the conversation.

```
┌──────────────────────────────────────────────────────────┐
│ Claude Opus 4.6 ▾  │  65k/200k ctx  │  Medium ▾  │  ✅  │
└──────────────────────────────────────────────────────────┘
```

- **Model selector** — compact dropdown, only shows connected provider models (reuses provider registry)
- **Context usage** — current/max tokens
- **Thinking level** — quick toggle (Off/Low/Medium/High)
- **Gateway status** — green dot = running, red = offline

Clicking model opens a small popover (not full Settings page). Changes apply immediately via gateway config update.

### Implementation
- New component: `<ChatStatusBar />`
- Placed at top of Chat page (above conversation thread)
- Data: `useQuery` for session-status (model, context, thinking), gateway health
- Model change: `window.api.gateway.updateConfig({ model })` + invalidate queries
- Compact — single row, doesn't eat conversation space

## Part 5: Onboarding Model Selection

During onboarding (after gateway install + start), show:
1. Provider setup (compact ProviderManager — just the "Add Key" flow for Anthropic/OpenAI)
2. Model selector with recommendation
3. "You can change this anytime in Settings or from the Chat page"

This ensures users pick a model before they ever hit Chat.

## Definition of Done
- [ ] Only ONE chat page exists, called "Chat"
- [ ] "Chat" is the default landing page
- [ ] Old Chat page deleted
- [ ] Sidebar shows "Chat" (not "Command Center") + "Dashboard"
- [ ] Topic sidebar shows real session-based categories
- [ ] Dashboard page shows gateway status, model, channels, needs attention, recent activity
- [ ] No references to "command-center" remain in UI-facing strings
