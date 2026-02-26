# Task 088: Onboarding Overhaul + Bundle Peekaboo

## WHAT
Pinchr is an Electron desktop app that wraps OpenClaw (an AI agent engine). When a user installs it fresh, the onboarding experience needs to:
1. Bundle the peekaboo binary so screen capture works out of the box
2. Auto-select the frontier model for whatever API key the user enters
3. After mechanical setup, hand off to the AGENT who drives the rest of the experience — introduces itself, learns the user's name, what they want to do, gets named, etc.

## WHY
Drew's son tested a fresh install and the experience was terrible:
- No default model selected → agent couldn't respond
- Peekaboo not found → screen capture broken
- Onboarding didn't explain what anything was or guide the user
- After setup, user lands on a cold chat page with no guidance

The agent IS the product. The onboarding should demonstrate that immediately.

## Changes Required

### 1. Bundle Peekaboo Binary

**Source:** `/opt/homebrew/Cellar/peekaboo/3.0.0-beta3/bin/peekaboo` (38MB, universal binary x86_64+arm64)

**Copy to:** `resources/peekaboo/peekaboo` in the repo

**electron-builder.yml** — add extraResource:
```yaml
extraResources:
  # ... existing entries ...
  - from: resources/peekaboo/peekaboo
    to: peekaboo/peekaboo
```

**ipc.ts** — add PATH setup so OpenClaw can find it:
In the gateway spawn environment, prepend `$RESOURCES_PATH/peekaboo` to PATH, similar to how we handle the bundled Node binary. The bundled peekaboo should be found before any system peekaboo.

Look at how the Node binary path is set up (search for `resources/node/node` or `RESOURCES_PATH`) and follow the same pattern for peekaboo.

### 2. Auto-Select Default Model on API Key Save

**File:** `src/main/ipc.ts`

The `onboarding:save-api-key` handler (around line 2509) already has logic to set `model.primary` if empty:
```ts
if (!readNonEmptyString(model.primary)) {
  model.primary = providerDefaultModel(provider)
}
```

This should work. But verify it actually fires on fresh install. The `ONBOARDING_PROVIDER_DEFAULT_MODELS` mapping is:
- anthropic → `anthropic/claude-sonnet-4-20250514`  
- openai → `openai/gpt-4.1`
- google → `google/gemini-2.5-pro`

**Update these to true frontier models:**
- anthropic → `anthropic/claude-sonnet-4-20250514` (keep — good default, fast + capable)
- openai → `openai/gpt-4.1` (keep)
- google → `google/gemini-2.5-pro` (keep)

These are fine. Just make sure the logic works end-to-end.

### 3. Redesign Onboarding Flow

**Current flow:** Welcome → API Key → Done (confetti) → redirects to Chat

**New flow:** Welcome → API Key → Agent First Contact

The key insight: remove the "Done" celebration screen entirely. Instead, after the API key is saved and gateway is ready, transition directly to the Chat page where the **agent sends the first message**.

#### Onboarding.tsx changes:
- Remove the 'done' step entirely
- After successful API key save + gateway ready → mark onboarding complete → redirect to Chat
- If user skips API key → still go to Chat (agent can prompt them to add a key)

#### First Message System:
When onboarding completes, we need the agent to send the first message. Options:
- **Option A (recommended):** Write a `BOOTSTRAP.md` file to the workspace that the agent reads on first session. The file tells the agent: "This is a fresh install. Introduce yourself, ask the user's name, learn what they want to do, offer to pick a name for yourself, and walk them through what you can do. Then delete this file."
- **Option B:** Send an initial system event via the gateway API.

Go with **Option A** — it's simpler and uses existing OpenClaw primitives. The workspace-setup skill already exists and handles first-run conversational setup.

#### BOOTSTRAP.md content (write to default-workspace/BOOTSTRAP.md):
```markdown
# First Run — Read This, Then Delete It

You just woke up for the first time. A new user just installed Pinchr.

**Your mission right now:**
1. Send a warm, friendly first message introducing yourself
2. Ask what the user would like to call you (suggest a few fun names, or let them pick)
3. Ask their name
4. Briefly explain what you can do (keep it conversational, not a feature list)
5. Ask what they'd like to work on first
6. Based on their answers, run the workspace-setup skill to configure their workspace
7. Delete this file when setup conversation is complete

**Tone:** Friendly, capable, slightly playful. You're meeting someone new. Make a good first impression. Don't be stiff or corporate.

**Important:** Don't dump everything at once. Have a natural back-and-forth conversation. 2-3 exchanges before you start configuring things.
```

#### AGENTS.md First Session section (already has this):
```markdown
## First Session
When meeting a new user:
1. Introduce yourself briefly.
2. Ask their name and main goals.
...
```

This aligns perfectly with BOOTSTRAP.md. The AGENTS.md rule is permanent (handles any new session), BOOTSTRAP.md is the one-time first-install trigger.

### 4. Welcome Screen Polish

Keep the welcome screen but make it warmer:
- **Title:** "Meet your AI assistant"
- **Subtitle:** "Pinchr gives you a personal AI that lives on your desktop — it can help you think, build, research, and get things done. Let's get you set up."
- **Button:** "Let's go" (instead of "Get Started")

### 5. API Key Screen Polish

Make it clearer what's happening:
- **Title:** "Connect an AI provider"  
- **Subtitle:** "Your assistant needs an AI model to think with. Paste an API key from any provider below. Your key stays on your machine — it's never sent to us."
- Add a small "Where do I get a key?" link/accordion for each provider with direct URLs:
  - Anthropic: https://console.anthropic.com/settings/keys
  - OpenAI: https://platform.openai.com/api-keys
  - Google: https://aistudio.google.com/apikey

## Files to Modify
- `electron-builder.yml` — add peekaboo extraResource
- `src/main/ipc.ts` — add peekaboo to PATH in gateway env, verify model defaulting
- `src/renderer/src/pages/Onboarding.tsx` — remove done step, polish copy, redirect to chat
- `resources/default-workspace/BOOTSTRAP.md` — CREATE new file (first-run agent prompt)

## Files to Create
- `resources/peekaboo/peekaboo` — copy of binary (DO NOT create this in Codex — will be copied manually)

## Definition of Done
- [ ] Peekaboo binary bundled and on PATH for gateway process
- [ ] Default model auto-selected based on API key provider
- [ ] Onboarding flows: Welcome → API Key → Chat (no "done" screen)
- [ ] BOOTSTRAP.md in default workspace triggers agent-driven first conversation
- [ ] Welcome + API key screens have better copy
- [ ] API key screen has "where to get a key" help links
- [ ] No TypeScript errors, strict mode

## DO NOT
- Don't touch any other pages
- Don't modify the sidebar or navigation
- Don't change the gateway startup logic (it works)
- Don't create the peekaboo binary file — it will be copied manually before build
