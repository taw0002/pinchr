# Dashboard Overhaul Spec

## Problem
The current dashboard after onboarding is generic and doesn't show what OpenClaw actually has configured. Users need to see their enabled channels, model, skills, sessions — and easily add/configure new items.

## What to Build

### Dashboard Page (`src/renderer/src/pages/Dashboard.tsx`)

Replace the current generic dashboard with an **OpenClaw Status & Configuration** view:

#### 1. Gateway Status Header
- Show gateway connection status (online/offline) with the Pinchr logo
- Show the current AI model (e.g., "Claude Opus 4.6")
- Show uptime/session count

#### 2. "Enabled Services" Section
Query the gateway config via `window.api.gateway.getConfig()` which returns the OpenClaw config JSON. Parse it to show:

- **AI Model**: Current model name + provider
- **Channels**: Which messaging channels are enabled (slack, telegram, whatsapp, discord, signal, imessage, googlechat). Show enabled ones with green badges, disabled ones greyed out with "Enable" buttons
- **Skills**: List installed skills (if available from config)
- **Sessions**: Active sessions with last message preview

Each item should be a card with:
- Icon/emoji
- Name
- Status (enabled/disabled/connected)
- Configure button (links to settings or opens config)

#### 3. Quick Setup Cards
For items NOT yet configured, show helpful "Set up X" cards:
- "Add Slack" → links to connections page or settings
- "Add Telegram" → same
- "Configure Voice" → etc.

### Data Sources

The gateway config is at `~/.openclaw/openclaw.json`. The IPC handler `gateway:config` reads and returns it:

```typescript
ipcMain.handle('gateway:config', async () => {
  // reads OPENCLAW_CONFIG_PATH = ~/.openclaw/openclaw.json
})
```

Add a new hook `useGatewayConfig` in `src/renderer/src/hooks/useGateway.ts`:

```typescript
export function useGatewayConfig() {
  return useQuery({
    queryKey: ['gateway', 'config'],
    queryFn: async () => {
      const result = await api().gateway.getConfig()
      if (!result.ok) return null
      return result.data ?? null
    },
    refetchInterval: 30000
  })
}
```

### OpenClaw Config Structure
The config at `~/.openclaw/openclaw.json` has this shape:
```json
{
  "gateway": {
    "port": 18789,
    "auth": { "token": "..." },
    "model": "anthropic/claude-opus-4-6",
    "defaultModel": "anthropic/claude-opus-4-6",
    "channels": {
      "slack": { ... },
      "telegram": { ... },
      "whatsapp": { ... }
    },
    "heartbeat": { ... },
    "http": { ... }
  },
  "anthropic_api_key": "sk-ant-...",
  "openai_api_key": "sk-..."
}
```

Channels present in `gateway.channels` are enabled. Check for existence of API keys to show AI provider status.

### Design Notes
- Match the existing dark theme (bg-background, surface, surface-2, surface-3, accent, text-primary, text-secondary, text-muted)
- Use the existing Card, Badge, Button components from `@/components/ui/`
- Keep the layout clean — Linear/Arc style, not cluttered
- Use emoji for channel icons (💬 Slack, ✈️ Telegram, 📱 WhatsApp, 🎮 Discord, 🔒 Signal, 💬 iMessage)
- Green badges for enabled, grey for disabled
- Animate with framer-motion (existing pattern)

### Files to Modify
1. `src/renderer/src/pages/Dashboard.tsx` — full rewrite
2. `src/renderer/src/hooks/useGateway.ts` — add `useGatewayConfig` hook
3. `src/main/ipc.ts` — verify `gateway:config` handler returns full config (it already exists)

### DO NOT
- Touch onboarding
- Touch the sidebar
- Change the nav structure
- Add new dependencies
- Modify types unless necessary

### Build & Verify
After changes, run `npx electron-vite build` to verify no errors.
