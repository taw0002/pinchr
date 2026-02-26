# Spec: API Key Management in Settings

## What
Replace the current "AI Model Configuration" card in Settings with a cohesive **Providers & Models** experience that lets users:
1. See which AI providers they have connected
2. Add/edit/remove API keys directly from the UI
3. Get guided instructions for obtaining keys and setting up billing
4. Select a model from ONLY the providers they've configured
5. See recommendations and warnings about model tiers

## Why
Pinchr is "OpenClaw for non-tech people." Currently users must edit JSON config files in the terminal to manage API keys. That's a dealbreaker for our target audience. The Settings page needs to be the ONE place to manage their AI setup — no terminal required.

## Current State
- API keys stored in `~/.openclaw/agents/<agentId>/agent/auth-profiles.json`
- Gateway config at `~/.openclaw/openclaw.json` has active model
- Settings page has a hardcoded model dropdown showing all models regardless of provider access
- No visibility into which providers are configured
- No way to add/edit keys from the UI

## Design

### Section 1: AI Providers
A card showing all supported providers with connection status.

```
🔑 AI Providers
Connect your AI provider API keys. You need at least one to get started.

┌─────────────────────────────────────────────────┐
│ Anthropic                        ✅ Connected   │
│ Claude Opus, Sonnet, Haiku       [Manage]       │
├─────────────────────────────────────────────────┤
│ OpenAI                           ✅ Connected   │
│ GPT-4o, GPT-5, o1               [Manage]       │
├─────────────────────────────────────────────────┤
│ Google AI                        ➕ Add Key     │
│ Gemini Pro, Flash                                │
├─────────────────────────────────────────────────┤
│ Groq                             ➕ Add Key     │
│ Fast inference for open models                   │
├─────────────────────────────────────────────────┤
│ 💻 Local Models                  🔍 2 found    │
│ Ollama, LM Studio (auto-detected)               │
└─────────────────────────────────────────────────┘
```

**Clicking "Add Key" or "Manage" opens an inline expandable panel:**

```
┌─ Anthropic ──────────────────────────────────────┐
│                                                   │
│  API Key                                          │
│  [sk-ant-api03-••••••••••••••••••••]  [👁] [Save] │
│                                                   │
│  ℹ️ How to get your Anthropic API key:            │
│  1. Go to console.anthropic.com                   │
│  2. Sign up or log in                             │
│  3. Go to API Keys → Create Key                   │
│  4. Set up billing (pay-as-you-go, ~$0.01-0.08/k) │
│  [Open Anthropic Console →]                       │
│                                                   │
│  ⚠️ Remove Key                                    │
└───────────────────────────────────────────────────┘
```

### Section 2: Model Selection
ONLY shows models from connected providers. Grouped by provider.

```
🤖 Default Model

┌─────────────────────────────────────────────────┐
│ ◉ Claude Opus 4.6          ⭐ Recommended       │
│   Anthropic · Best reasoning · $$$              │
├─────────────────────────────────────────────────┤
│ ○ Claude Sonnet 4.5        💰 Best Value        │
│   Anthropic · Great balance of speed & quality  │
├─────────────────────────────────────────────────┤
│ ○ GPT-5.2                                       │
│   OpenAI · Strong all-around                    │
├─────────────────────────────────────────────────┤
│ ○ GPT-4o                   ⚡ Fast               │
│   OpenAI · Fast and capable                     │
├─────────────────────────────────────────────────┤
│ 💻 Local: llama-3.3-70b    🆓 Free              │
│   Ollama · Runs on your machine                 │
│   ⚠️ Local models may not support all features  │
└─────────────────────────────────────────────────┘

💡 We recommend Claude Opus or Sonnet for the best experience.
   Non-frontier and open-source models may produce lower quality
   results and may not support features like tool use or thinking.
```

### Section 3: Thinking Level
Stays as-is (Off / Low / Medium / High toggle).

## Provider Registry
Hardcoded provider metadata (NOT models from the gateway):

```typescript
const PROVIDERS = [
  {
    id: 'anthropic',
    name: 'Anthropic',
    description: 'Claude Opus, Sonnet, Haiku',
    setupUrl: 'https://console.anthropic.com/settings/keys',
    billingUrl: 'https://console.anthropic.com/settings/billing',
    instructions: [
      'Go to console.anthropic.com',
      'Sign up or log in',
      'Navigate to Settings → API Keys',
      'Click "Create Key" and copy it',
      'Set up billing under Settings → Billing (pay-as-you-go)',
    ],
    keyPrefix: 'sk-ant-',
    keyPlaceholder: 'sk-ant-api03-...',
    models: [
      { id: 'anthropic/claude-opus-4-6', name: 'Claude Opus 4.6', badge: 'Recommended', badgeColor: 'amber', costTier: '$$$', description: 'Best reasoning and quality' },
      { id: 'anthropic/claude-sonnet-4-5-20250929', name: 'Claude Sonnet 4.5', badge: 'Best Value', badgeColor: 'green', costTier: '$$', description: 'Great balance of speed and quality' },
      { id: 'anthropic/claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5', badge: 'Fast', badgeColor: 'blue', costTier: '$', description: 'Fastest, good for simple tasks' },
    ],
  },
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'GPT-4o, GPT-5, o1',
    setupUrl: 'https://platform.openai.com/api-keys',
    billingUrl: 'https://platform.openai.com/settings/organization/billing',
    instructions: [
      'Go to platform.openai.com',
      'Sign up or log in',
      'Navigate to API Keys',
      'Click "Create new secret key" and copy it',
      'Set up billing under Settings → Billing (prepaid credits)',
    ],
    keyPrefix: 'sk-',
    keyPlaceholder: 'sk-proj-...',
    models: [
      { id: 'openai/gpt-5.2', name: 'GPT-5.2', badge: null, costTier: '$$$', description: 'Latest and most capable' },
      { id: 'openai/gpt-4o', name: 'GPT-4o', badge: 'Fast', badgeColor: 'blue', costTier: '$$', description: 'Fast and capable' },
      { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', badge: null, costTier: '$', description: 'Budget-friendly' },
      { id: 'openai/o1', name: 'o1', badge: null, costTier: '$$$', description: 'Reasoning-focused' },
    ],
  },
  {
    id: 'google',
    name: 'Google AI',
    description: 'Gemini Pro, Flash',
    setupUrl: 'https://aistudio.google.com/app/apikey',
    billingUrl: 'https://aistudio.google.com/app/billing',
    instructions: [
      'Go to aistudio.google.com',
      'Sign in with your Google account',
      'Click "Get API Key" → "Create API Key"',
      'Copy the key',
      'Free tier available; paid tier for higher limits',
    ],
    keyPrefix: 'AI',
    keyPlaceholder: 'AIza...',
    models: [
      { id: 'google/gemini-2.5-pro', name: 'Gemini 2.5 Pro', badge: null, costTier: '$$', description: 'Strong reasoning' },
      { id: 'google/gemini-2.5-flash', name: 'Gemini 2.5 Flash', badge: 'Fast', badgeColor: 'blue', costTier: '$', description: 'Fast and efficient' },
    ],
  },
  {
    id: 'groq',
    name: 'Groq',
    description: 'Fast inference for open models',
    setupUrl: 'https://console.groq.com/keys',
    billingUrl: 'https://console.groq.com/settings/billing',
    instructions: [
      'Go to console.groq.com',
      'Sign up or log in',
      'Navigate to API Keys',
      'Click "Create API Key" and copy it',
      'Free tier available with rate limits',
    ],
    keyPrefix: 'gsk_',
    keyPlaceholder: 'gsk_...',
    models: [
      { id: 'groq/llama-3.3-70b', name: 'Llama 3.3 70B', badge: 'Open Source', badgeColor: 'purple', costTier: '$', description: 'Fast open-source model' },
    ],
    warning: 'Open-source models may not support all features (tool use, thinking). Best used as secondary/fallback models.',
  },
]
```

## Implementation

### IPC API (new endpoints)
Add to `src/main/ipc.ts`:

```typescript
// Get configured providers (reads auth-profiles.json)
'providers:list' → { providers: Array<{ id: string, configured: boolean, profileName: string | null }> }

// Add/update a provider API key (writes auth-profiles.json)
'providers:setKey' → { provider: string, apiKey: string } → { ok: boolean, error?: string }

// Remove a provider API key (removes from auth-profiles.json)
'providers:removeKey' → { provider: string } → { ok: boolean, error?: string }

// Validate a key format (client-side, no API call)
// Actual validation happens when the gateway tries to use it
```

### Auth Profile Management (new: `src/main/providers.ts`)
Read/write `~/.openclaw/agents/<agentId>/agent/auth-profiles.json`:

```typescript
// Read existing profiles
function getAuthProfiles(): Record<string, AuthProfile>

// Add or update a profile
function setProviderKey(provider: string, apiKey: string): void
// - Adds/updates entry in auth-profiles.json
// - Profile name format: `<provider>:default` (e.g., `anthropic:default`)
// - key_type: 'api_key'

// Remove a profile
function removeProviderKey(provider: string): void
// - Removes entry from auth-profiles.json
// - Also removes from openclaw.json config if referenced
```

### Settings UI Changes
Replace the current "AI Model Configuration" card with two new cards:

1. **`<ProviderManager />`** — new component (`src/renderer/src/components/ProviderManager.tsx`)
   - Lists all providers from registry
   - Shows connected status from IPC
   - Expandable panels for key input, instructions, external links
   - Key input shows masked value with reveal toggle
   - Save writes via IPC, restarts gateway
   - Remove button with confirmation

2. **`<ModelSelector />`** — new component (`src/renderer/src/components/ModelSelector.tsx`)
   - Radio-button list of models from CONNECTED providers only
   - Shows badges (Recommended, Fast, Best Value)
   - Shows cost tier ($, $$, $$$)
   - Shows description
   - Local models section at bottom if detected
   - Warning banner for non-frontier models
   - Recommendation note at bottom

3. **Thinking Level** — stays as existing toggle

### Files to Create
- `src/main/providers.ts` — auth profile read/write logic
- `src/renderer/src/components/ProviderManager.tsx` — provider card UI
- `src/renderer/src/components/ModelSelector.tsx` — filtered model picker
- `src/renderer/src/data/providers.ts` — provider registry (metadata)

### Files to Modify
- `src/main/ipc.ts` — add provider IPC handlers
- `src/shared/types.ts` — add provider types to IPC bridge
- `src/renderer/src/pages/Settings.tsx` — replace AI Model Configuration card

### Security
- API keys stored in `auth-profiles.json` (same as OpenClaw CLI)
- Keys displayed masked by default (•••••) with reveal toggle
- No keys sent over network (local file only)
- Gateway restart after key changes to pick up new auth

### Edge Cases
- No providers configured → show prominent "Get Started" prompt
- Key validation: format-check prefix on save, real validation on first use
- Gateway not running → show warning, still allow key management
- Multiple keys per provider: for v1, one key per provider (`<provider>:default`)

## Guided Setup Flow
Each provider's expandable panel should feel like a guided walkthrough, not a wall of text:

1. **"Help me set up" button** — primary action when no key is configured. Opens the expandable setup guide.
2. **Step-by-step with screenshots/links** — each step is a numbered card:
   - Step 1: "Go to [provider console] →" (clickable link, opens external)
   - Step 2: "Sign up or log in to your account"
   - Step 3: "Create an API key and copy it"
   - Step 4: "Set up billing" (with note about costs)
   - Step 5: "Paste your key below"
3. **"Ask your agent for help" prompt** — at the bottom of each setup guide AND at the top of the Providers section:
   ```
   💡 Need help? Ask your agent — it can walk you through any step.
   ```
   This should link/navigate to the chat (Command Center) page.
4. **Contextual tips** — e.g. for Anthropic: "Most users spend $5-20/month. You only pay for what you use."
5. **Success state** — when key is saved and verified, show a green checkmark with "✅ Connected — you're ready to use [models]"

The overall UX should feel like onboarding, not settings. We're teaching people something new.

## Sub-Agent Model Configuration (Agent Builder)
The Agent Builder page needs the same philosophy: guided, simple, filtered by connected providers.

### Design
Each sub-agent card shows:
```
┌─────────────────────────────────────────────────┐
│ 🔧 Coder                                        │
│ Writes and reviews code                          │
│                                                  │
│ Model: [Claude Opus 4.6      ▾]  ⭐ Recommended │
│ Fallback: [GPT-5.2           ▾]                 │
│                                                  │
│ Permissions: Full tools ✅                       │
│ [Edit] [Delete]                                  │
└─────────────────────────────────────────────────┘
```

### Requirements
- Model dropdown per sub-agent, ONLY showing models from connected providers
- Same badges/recommendations as main model selector
- Pre-built templates with sensible defaults:
  - **Coder** — Opus/Codex primary, full tools
  - **Researcher** — Opus/Codex primary, full tools
  - **Writer** — Sonnet primary, no exec (content/docs)
  - **Ops** — Sonnet primary, full tools (git/file ops)
- "Create Agent" guided flow: Name → Role → Model → Permissions → Done
- Plain English descriptions of what each permission means
- "Ask your agent for help" prompt
- Model selection shares the same `<ModelSelector />` component (or a compact variant) and provider registry from the Providers section
- Changes write to OpenClaw's sub-agent config (`openclaw.json` → `agents.subagents`)

### Implementation
- Reuse `src/renderer/src/data/providers.ts` registry for model lists
- Reuse provider connection status from `providers:list` IPC
- Add `<AgentModelPicker />` compact variant of `<ModelSelector />`
- Agent Builder page reads/writes sub-agent config via existing gateway config IPC

## Out of Scope (v2)
- OAuth-based provider connection (vs manual API key)
- Usage/spend tracking per provider
- Model benchmarks or speed comparisons
- Custom/self-hosted model endpoints
- Multiple keys per provider
- Fallback chain configuration in UI

## Definition of Done
- [ ] User can see which providers are connected
- [ ] User can add API key for any supported provider
- [ ] User can remove API key for a provider
- [ ] Key is masked by default with reveal toggle
- [ ] Instructions panel shows step-by-step for each provider
- [ ] External links open setup/billing pages
- [ ] Model list only shows models from connected providers
- [ ] Models show badges (Recommended, Best Value, Fast, etc.)
- [ ] Non-frontier model warning displayed
- [ ] Recommendation text shown
- [ ] Local models detected and shown separately
- [ ] Gateway restarts after key changes
- [ ] Thinking level toggle preserved
