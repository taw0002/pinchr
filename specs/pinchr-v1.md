# Pinchr v1.0 — Product Spec

## Vision
Pinchr is the desktop app for your personal AI agent. Not a chatbot — an agent that works across conversations, manages tasks, runs automations, and gets smarter over time.

## Pages (10 items, 3 sections)

### YOUR AGENT
1. **Dashboard** — Overview hub. What's happening, what needs attention, quick stats.
2. **Chat** — Conversations with your agent. Session list sidebar + active chat. ✅ REBUILT
3. **Sessions** — All running sessions, sub-agents, background work. Process manager view.
4. **Tasks** — Agent-managed task board. Todo/In Progress/Done/Blocked.

### TOOLS  
5. **Automations** — Heartbeats, crons, scheduled work. View, create, manage, run history.
6. **Skills** — ClawHub marketplace + installed skills. The app store.
7. **Connections** — ALL integrations: channels (Slack, WhatsApp), APIs, services, data sources.

### CONFIGURE
8. **Brain** — Soul, memory, workspace files, documents. Everything the agent knows/created.
9. **Terminal** — Pre-loaded commands, agent-assisted, power-user escape hatch.
10. **Settings** — Tabs: General, Providers/API Keys, Gateway, Security, Companion, Document Style.

## Pages to DELETE
- AgentBuilder.tsx, WorkflowBuilder.tsx, MCPServers.tsx, Security.tsx (→ Settings tab)
- WorkMode.tsx, DocumentPreferences.tsx (→ Settings tab), Team.tsx
- Conversations.tsx, Activity.tsx, Usage.tsx, WhatsNew.tsx, Debug.tsx, Logs.tsx, QuickMessage.tsx

## Onboarding (3 steps)
1. Welcome → 2. API Key → 3. Start chatting

## Definition of Done
- All 10 pages load and function
- Dead pages deleted, no broken imports
- TypeScript clean, build passes
- Onboarding simplified to 3 steps
- Sidebar shows 10 items in 3 sections
- v1.0.0 version bump
- Website updated, S3 deployed
