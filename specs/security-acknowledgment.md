# Security Acknowledgment — Onboarding Step

## What
Add a mandatory Security Acknowledgment step to the Pinchr onboarding flow, inserted **after** the API Key step and **before** chat launch.

## Why
Pinchr wraps OpenClaw, an AI agent engine with real system access — shell commands, file I/O, and internet requests. Users must understand and explicitly acknowledge what they're granting before the app becomes usable. Pete (OpenClaw creator) requires security documentation to be front and center.

## Flow Change
```
Before: Welcome → API Key → Chat
After:  Welcome → API Key → Security → Chat
```

## Requirements

### 1. Security Summary
Display a concise, professional summary of OpenClaw capabilities:
- Runs commands on your machine
- Can read and write files
- Can access the internet on your behalf
- Your API keys stay local and are never sent to us

### 2. Required Document Links
Two documents must be linked and acknowledged:
- **Threat Model**: `https://github.com/openclaw/openclaw/blob/main/docs/security/THREAT-MODEL-ATLAS.md`
- **Trust & Security Page**: `https://trust.openclaw.ai`

### 3. Forced Acknowledgment
- Two checkboxes, one per document
- Each checkbox label is a clickable link opening the document in the default browser via `window.api.shell.openExternal()`
- "Continue" button is disabled until BOTH checkboxes are checked
- Approximate UI:
  ```
  ☐ I have read the Threat Model        (link opens in browser)
  ☐ I have read the Trust & Security Page (link opens in browser)
  [Continue →] (disabled until both checked)
  ```

### 4. Design
- Matches existing onboarding style (Card component, same animations, Tailwind classes)
- Serious but not scary — professional, clear, matter-of-fact
- Uses `ShieldCheck` icon from lucide-react for visual anchoring

### 5. Persistence
- Acknowledgment state is stored via `localStorage` (key: `security_acknowledged`)
- Set when user completes the security step
- Onboarding checks this on load — if already acknowledged, skip the step

## Implementation

### Files Modified
- `src/renderer/src/pages/Onboarding.tsx` — add `'security'` step to `OnboardingStep` type and `STEP_ORDER`, add security card render, defer `handleCompleteOnboarding` to after security step

### Key Changes
1. Add `'security'` to `OnboardingStep` union type
2. Add `'security'` to `STEP_ORDER` array (after `'api'`)
3. Add `threatModelAcked` and `trustPageAcked` boolean state
4. On API key success + gateway ready → advance to `'security'` instead of auto-completing
5. Render security card with checkboxes, links, and gated Continue button
6. Continue button calls `handleCompleteOnboarding()`
7. Step indicator shows all 3 steps: Welcome, API Key, Security

### Constraints
- TypeScript strict, no `any`
- Do NOT modify Welcome or API Key card markup
- Links open via `window.api.shell.openExternal()` (existing IPC pattern)
- Tailwind CSS only, consistent with existing cards

## Definition of Done
- [ ] Security step renders between API Key and Chat
- [ ] Both checkboxes must be checked to enable Continue
- [ ] Links open in system default browser
- [ ] TypeScript compiles with `npx tsc --noEmit`
- [ ] Visual style matches existing onboarding cards
- [ ] Committed with message: `feat: add security acknowledgment to onboarding`
