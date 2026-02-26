# Agent Tabs Architecture — Build Spec

## THE VISION

Each user role becomes its own agent tab with a dedicated chat, connections panel, and role-specific system prompt. When a user selects roles during onboarding (e.g. CEO + Developer), the app creates agent tabs for each.

## WHAT TO BUILD

### 1. Agent Tab Data Model (src/shared/types.ts)

Add an `AgentTab` type:

```ts
interface AgentTab {
  id: string
  role: UserRole
  name: string         // e.g. "CEO", "Developer"
  emoji: string        // from ROLE_LABELS
  workspaces: Workspace[]
  activeWorkspaceId: string
  connections: ConnectionConfig[]  // which integrations are active
  systemPrompt: string  // role-specific system prompt
}

interface ConnectionConfig {
  id: string           // e.g. "github", "slack", "stripe"
  name: string
  icon: string         // emoji
  status: "connected" | "disconnected" | "pending"
  authType: "oauth" | "api_key" | "webhook"
  category: string     // "communication", "development", "analytics", "finance", "crm"
}
```

### 2. Connection Registry (src/renderer/src/lib/connections.ts)

Create a registry of all available connections with their auth types and which roles suggest them:
- GitHub (OAuth) -> developer
- Slack (OAuth) -> all roles
- Gmail/Google (OAuth) -> all roles  
- Stripe (API key) -> finance, ceo
- HubSpot (OAuth) -> sales, marketer
- Sentry (API key) -> developer
- Linear/Jira (OAuth) -> developer, product_manager
- Google Analytics (OAuth) -> marketer, ceo
- Salesforce (OAuth) -> sales
- QuickBooks (OAuth) -> finance
- Calendar (OAuth) -> all roles
- Notion (OAuth) -> product_manager

Each connection should have: id, name, icon (emoji), description, authType, category, suggestedRoles[].

### 3. Agent Tabs in Sidebar (src/renderer/src/components/Sidebar.tsx)

Replace the current workspace buttons with agent tabs. The sidebar should show:
- Logo at top (already there)
- Agent tabs section: each role the user selected becomes a tab with its emoji and name
- The active agent tab is highlighted
- Below the agent tabs: the nav items (Dashboard, Connections, Settings, etc.)
- Each agent tab, when clicked, switches to that agent's chat view

Make the tabs look like they belong — pill-shaped or rounded cards with the role emoji, similar to how Arc browser handles spaces/profiles.

### 4. Refactor App.tsx

- Load saved roles from config (array of UserRole, from `roles` key)
- Create AgentTab objects for each role on mount
- Track `activeTabId` state
- The main content area shows the Chat component scoped to the active tab
- Pass the active tab's workspaces and system prompt to Chat
- Keep other pages (Settings, Connections, Dashboard) as global (not per-tab)

### 5. Refactor Chat.tsx  

- Accept an `agentTab` prop (AgentTab)
- Each tab should maintain its own chat session/history (use the tab id as part of the session key)
- Show the agent's name and emoji in the chat header
- Show a "Connections" mini-panel in the chat header or sidebar showing which integrations are active for this agent, with a button to manage them
- The empty state should suggest connecting relevant integrations for the role
- Keep all existing functionality: streaming, voice mode, timeline view, markdown rendering

### 6. Connection Management UI

In the Connections page (src/renderer/src/pages/Connections.tsx), update it to:
- Show connections grouped by category
- For each connection, show status (connected/disconnected)
- "Connect" button that either:
  - Opens OAuth flow (placeholder: just set status to "connected" for now)
  - Shows API key input modal
- Show which agent tabs use each connection
- Per-agent-tab, show a mini connections panel

### 7. Onboarding Flow Update

After role selection, the onboarding should:
- Skip straight to AI setup (already exists)
- On completion, create agent tabs for each selected role
- Save the selected roles to config

### 8. Persist Agent Tabs

Save/load agent tabs and their connection states to electron-store or the gateway config. On app launch, restore the tabs.

## DESIGN GUIDELINES

- Look: Linear/Arc/Raycast aesthetic. Dark theme. Clean borders, subtle gradients.
- Colors: Use the existing accent color system. Each agent tab can have a subtle color indicator from its first workspace.
- Animations: Use Framer Motion for tab switches. Keep it snappy (150-200ms transitions).
- Typography: Keep existing text styles.

## EXISTING CODE CONTEXT

- Workspace data is in `src/renderer/src/lib/workspaces.ts` — it has ROLE_LABELS, workspace definitions per role, and helper functions.
- UserRole type is in `src/shared/types.ts`: `developer | product_manager | marketer | finance | ceo | sales`
- The sidebar is currently 68px wide with icon-only nav + workspace dots at bottom.
- Chat.tsx is 785 lines with streaming, voice mode, timeline view, session list.
- App.tsx manages page routing and workspace state.
- UI components are in `src/renderer/src/components/ui/` (shadcn/ui).

## CRITICAL RULES

1. Do NOT break existing functionality — streaming, voice mode, session management must still work
2. Use existing UI components from components/ui/
3. Keep TypeScript strict — no `any` types unless wrapping existing `window.api` calls
4. All new files should follow the existing code style
5. Build must pass: `npx electron-vite build`
6. Commit your changes when done with a descriptive message
