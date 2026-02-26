# Pinchr Dashboard & App Redesign Plan

## Drew's Feedback (2026-02-08)
- Design is inconsistent with pinchr.app website
- Mixed emoji + lucide icons look terrible
- Confusing OpenClaw integrations (channels in openclaw.json) with Pinchr extensions (OAuth connections user sets up in-app)
- Dashboard doesn't help users maximize OpenClaw — they'll go back to CLI
- Onboarding should ask about existing OpenClaw FIRST, then roles (still needed for agent tabs), skip AI key if gateway exists
- "Not configured" bugs from wrong config paths (FIXED but design still bad)

## Design Language (match pinchr.app)
- **Glass morphism**: `bg-gray-900/40 backdrop-blur-xl border border-gray-700/30 rounded-2xl`
- **Glass hover**: `hover:border-gray-600/50 hover:bg-gray-900/60 transition-all duration-300`
- **Gradient text**: `bg-gradient-to-r from-white via-gray-100 to-gray-300 bg-clip-text text-transparent`
- **Coral glow**: `box-shadow: 0 0 60px rgba(255, 107, 107, 0.15)`
- **Font**: Inter (already used)
- **Background**: #0a0a0a
- **Icons**: Lucide ONLY — no emoji anywhere in the UI
- **Accent color**: coral/red (#ff6b6b range) — matches the Pinchr logo

## Conceptual Model (CRITICAL)

### OpenClaw Layer (detected, read-only in Pinchr)
- Gateway status (online/offline)
- AI model + provider (from auth.profiles)
- Messaging channels (from config.channels: slack, whatsapp, imessage)
- Skills (from config.skills)
- Sessions (from sessions_list)
- Cron jobs
- These are CONFIGURED via openclaw.json / CLI — Pinchr reads and displays them

### Pinchr Layer (user configures in-app)
- Agent tabs + roles (what Pinchr adds)
- Pinchr connections (GitHub, Google, Linear, Notion OAuth — user sets up in Pinchr)
- Workspaces + quick actions
- Voice mode settings
- Pinchr-specific preferences

### Dashboard Should Show BOTH clearly separated:
1. "Your OpenClaw" section — gateway health, model, channels, sessions, skills
2. "Your Pinchr" section — agent tabs, connections, workspaces

## Dashboard Redesign

### Header
- Pinchr logo + "Welcome back, Drew" (or just clean header)
- Gateway status pill (green dot + "Online")
- Model badge (Claude Opus 4.6)

### Section 1: OpenClaw Overview (glass-card)
- Status: Online, model, uptime
- Channels: Show connected channels with status dots (Slack ●, WhatsApp ●, iMessage ●)
- Active sessions list with channel badges, names, last message, time
- "Open in terminal" or "Edit config" link for power users

### Section 2: Agent Tabs (glass-card)  
- Show the user's configured agent tabs with their workspaces
- Quick switch buttons

### Section 3: Connections (glass-card)
- Pinchr-specific OAuth connections (GitHub, Google, etc.)
- "Connect" buttons for unconfigured ones
- These are DIFFERENT from OpenClaw channels

### Section 4: Quick Actions (glass-card)
- Context-aware actions based on active agent tab
- "New chat", "Check email", "Run tests", etc.

## Files to Rewrite
1. `src/renderer/src/pages/Dashboard.tsx` — full redesign with glass-card components
2. `src/renderer/src/components/Sidebar.tsx` — consistent Lucide icons, no emoji fallback where possible
3. Possibly extract glass-card component for reuse
4. Update tailwind config if needed for glass utilities

## Config Paths (CORRECT)
```
config.channels → { slack: {...}, whatsapp: {...}, imessage: {...} }
config.auth.profiles → { 'anthropic:default': {...}, 'anthropic:drew': {...} }
config.agents.defaults → { workspace, compaction, maxConcurrent }
config.gateway → { port, auth, http }
config.skills → installed skills
config.plugins → installed plugins
```

## Build/Test
- `npx electron-vite build` → verify no errors
- `npx electron-builder --mac --dir` → build .app
- Install and visually verify

## UPDATE: Remove Roles/Agent Tabs (Drew's call, 2026-02-08 22:58)

Roles and agent tabs are not adding value yet. Remove for now, add back in a future update when fleshed out.

### Remove:
- Role selection step in onboarding (skip from Connect → AI or Ready)
- Agent tabs in sidebar
- Workspace switcher in sidebar
- RoleStep component usage (keep code but don't route to it)
- Agent tab props threading through App.tsx, Sidebar, Chat

### Onboarding becomes:
1. Welcome → Get Started
2. Connect → detect existing OpenClaw or fresh setup
3. AI Key → only if fresh (no existing gateway)
4. Ready → done

### Sidebar becomes:
- Logo at top
- Simple nav: Dashboard, Chat, Connections, Settings
- Gateway status dot at bottom
- No agent tabs, no workspace switcher

### Chat becomes:
- Single session view (connect to main session)
- No agent tab switching
