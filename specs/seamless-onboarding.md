# Seamless Onboarding — Pinchr Owns Everything

## Problem (UPDATED 2026-02-15)
Original issues:
1. Homebrew install needs `sudo` → requires TTY → Electron's `child_process` has no TTY → **EBADF crash**
2. If install fails, user sees raw error messages and has no recovery path
3. OpenClaw's own `init` wizard competes with Pinchr's onboarding (asks for name, key, channels)
4. User sees "OpenClaw" branding during setup instead of Pinchr

**NEW: Dual-install drift problem (discovered 2026-02-15)**
Users can end up with OpenClaw installed in multiple locations (e.g., Homebrew's Node 25.x AND nvm's Node 22.x). When `openclaw update` runs, it updates one copy while the other stays stale. The gateway might run from one version while `openclaw --version` in the terminal reports another. This caused the dashboard to show a stale version even after a successful update.

**Root cause:** Relying on a global npm install means OpenClaw's location depends on which Node is on the user's PATH, which varies by shell, terminal, and launch method (Electron vs terminal).

## Solution (UPDATED 2026-02-15)
Pinchr **bundles OpenClaw** as a dependency inside the Electron app. No global npm install. No Homebrew. No Node.js dependency. The user never interacts with OpenClaw's CLI directly.

### Why Bundle vs Global Install
- **Eliminates dual-install drift** — only one copy exists, inside Pinchr.app
- **Eliminates Node.js requirement** — Electron ships its own Node runtime
- **Eliminates PATH ambiguity** — Pinchr spawns the gateway from a known, fixed path
- **Version always in sync** — OpenClaw updates when Pinchr updates
- **True seamless onboarding** — download Pinchr → paste API key → chatting

### Bundling Architecture
- OpenClaw installed as a **production dependency** in Pinchr's `package.json` (not global)
- Lives at: `<app>/node_modules/openclaw/` inside the packaged .app
- Pinchr's main process spawns the gateway using Electron's bundled Node:
  ```
  const openclawBin = path.join(app.getAppPath(), 'node_modules', 'openclaw', 'openclaw.mjs')
  child_process.fork(openclawBin, ['gateway', 'start'], { env: { ... } })
  ```
- Config still at `~/.openclaw/` (user's data persists across Pinchr updates)
- **No system PATH modification** — Pinchr never adds anything to the user's shell

### Migration for Existing Users
- On first launch after bundling update, detect existing `~/.openclaw/` config → reuse it
- Stop any globally-installed gateway (`openclaw gateway stop`) before starting bundled one
- Optionally suggest: "You can uninstall the global OpenClaw if you only use Pinchr"
- Existing CLI users who want `openclaw` in their terminal can keep the global install — Pinchr ignores it

## Architecture

### Flow (2 steps for user — simplified from 3)

```
1. WELCOME → "Hey! Let's get you set up"
2. API KEY → User pastes their Anthropic/OpenAI key
→ DONE → Pinchr starts bundled gateway → straight into chat
```

**Step 2 (Engine Install) is ELIMINATED.** No install step needed — OpenClaw ships inside Pinchr.

### Step 1: Welcome (no change)
- "Hey 👋 I'm your AI assistant. Let's get you set up — it'll only take a minute."
- Pill: "I'm new — set it up for me" / "I already have OpenClaw"
- If "already have OpenClaw" → skip to Step 3 (API key) if gateway reachable, or Step 2 if not

### Step 2: Engine Install — REMOVED (Bundled)
**OpenClaw is bundled inside Pinchr. No install step needed.**

On first launch, Pinchr:
1. Checks if `~/.openclaw/openclaw.json` exists
2. If not → writes minimum viable config (see below)
3. Spawns the bundled gateway process
4. Polls `http://127.0.0.1:18789` for health
5. Auto-advances to API key step (or chat if key already exists)

This replaces the entire terminal-based install flow. No Homebrew, no Node, no sudo, no waiting.

### Step 3: API Key (ENHANCED)
**Key change: Pinchr writes config directly instead of going through OpenClaw.**

1. Show provider selector (Anthropic / OpenAI / Google)
2. User pastes API key
3. Pinchr validates key (existing `validateProviderApiKey()`)
4. Pinchr writes config directly:
   - Write `~/.openclaw/openclaw.json` with minimal viable config (see below)
   - Write `~/.openclaw/agents/main/agent/auth-profiles.json` with API key
5. Restart gateway: `openclaw gateway restart`
6. Verify gateway health
7. Auto-advance to chat

### Minimum Viable Config

**`~/.openclaw/openclaw.json`** (Pinchr writes this if it doesn't exist):
```json
{
  "meta": {
    "lastTouchedVersion": "pinchr-0.4.0",
    "lastTouchedAt": "<ISO timestamp>"
  },
  "wizard": {
    "lastRunAt": "<ISO timestamp>",
    "lastRunVersion": "pinchr-0.4.0",
    "lastRunCommand": "pinchr-onboard",
    "lastRunMode": "local"
  },
  "gateway": {
    "port": 18789,
    "mode": "local",
    "bind": "loopback",
    "auth": {
      "mode": "token",
      "token": "<random UUID>"
    },
    "http": {
      "endpoints": {
        "chatCompletions": { "enabled": true },
        "responses": { "enabled": true }
      }
    }
  },
  "agents": {
    "defaults": {
      "model": {
        "primary": "<provider>/<model based on key>"
      },
      "workspace": "~/.openclaw/workspace",
      "compaction": {
        "mode": "safeguard",
        "memoryFlush": { "enabled": true }
      }
    },
    "list": [
      { "id": "main" }
    ]
  }
}
```

Model defaults by provider:
- Anthropic → `anthropic/claude-sonnet-4-20250514`
- OpenAI → `openai/gpt-4.1`
- Google → `google/gemini-2.5-pro`

**`~/.openclaw/agents/main/agent/auth-profiles.json`**:
```json
{
  "version": 1,
  "profiles": {
    "<provider>:default": {
      "type": "api_key",
      "provider": "<provider>",
      "key": "<user's key>"
    }
  }
}
```

### Changes Required

#### `src/main/ipc.ts`
1. **`onboarding:install-openclaw`** — Remove the silent install attempt. Instead, return immediately with `{ ok: false, needsTerminal: true }` so the UI always shows the embedded terminal.
   
   Actually better: Remove this handler entirely. The install always goes through the embedded terminal now.

2. **`onboarding:prepare-gateway`** — This runs after the terminal install completes. Keep it but make it more robust:
   - Retry gateway health check 5 times with 2s intervals
   - If gateway not responding, try `openclaw gateway start` one more time

3. **`onboarding:save-api-key`** — Currently writes to `env.vars` in openclaw.json. Change to ALSO write `auth-profiles.json` directly (the proper way OpenClaw stores keys). The env var approach works but auth-profiles is more correct and enables failover tracking.

4. **NEW: `onboarding:write-initial-config`** — If `openclaw.json` doesn't exist, write the minimum viable config. Called after install completes but before API key step.
   - Generate random gateway auth token (UUID)
   - Set wizard metadata so OpenClaw doesn't re-prompt
   - Enable chatCompletions + responses endpoints
   - Create agent directory structure

#### `src/renderer/src/pages/Onboarding.tsx`
1. Remove the 3-button install card (Check system / Install / Prepare). Replace with auto-running embedded terminal.
2. When "I'm new" is clicked → immediately show terminal card that auto-runs the install
3. Add gateway polling (2s interval) that auto-advances when detected
4. Remove "Open in Terminal" fallback — embedded terminal IS the terminal

#### `src/renderer/src/components/onboarding/OnboardingInstallCard.tsx`
1. Simplify: always show terminal, auto-run command
2. Add status indicators above terminal (progress steps with checkmarks)
3. Add retry button on failure

### Edge Cases
- **Existing global OpenClaw running**: Pinchr detects port 18789 in use → offer to stop external gateway and use bundled one, or connect to existing
- **User has existing `~/.openclaw/` config**: Reuse it — bundled gateway reads same config dir
- **User closes Pinchr during first launch**: On relaunch, re-check state and resume
- **Multiple API keys**: For now, one key. Later, allow adding more in Settings.
- **OpenClaw version mismatch**: Bundled version might be newer than user's config format — handle migration gracefully
- **Port conflict**: If 18789 is taken by something else, detect and show friendly error

### What This Removes
- **Entire install step** — no Homebrew, no Node, no npm, no terminal, no sudo
- The 3-step button flow (Check System → Install → Prepare Gateway)
- Silent install attempt that always fails on fresh Macs
- "Open in Terminal" external app escape hatch
- Raw ANSI/error output shown in non-terminal UI
- **Global npm dependency** — no PATH ambiguity, no dual-install drift
- **Node.js system requirement** — Electron has its own runtime

### Definition of Done
- [ ] Fresh Mac user opens Pinchr → sees welcome → pastes API key → chatting in <1 minute
- [ ] No install step, no terminal, no sudo, no Homebrew
- [ ] No OpenClaw branding visible during onboarding
- [ ] Gateway config written by Pinchr, not by `openclaw init`
- [ ] Bundled gateway starts automatically from Pinchr.app contents
- [ ] Works when: completely fresh Mac (no Node, no OpenClaw)
- [ ] Works when: existing OpenClaw config exists (reuse it)
- [ ] Works when: existing gateway running on port (detect + handle)
- [ ] OpenClaw updates ship with Pinchr updates (no separate update mechanism)
- [ ] Error states have clear recovery
