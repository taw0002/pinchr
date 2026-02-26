# Task-029: Onboarding Rework — AI Key First + Scripted Pre-Key Chat

## Goal
Rearrange onboarding so users connect their AI provider FIRST, then the chat panel uses their own key for the rest of setup. Before key entry, chat is scripted-only with clickable buttons (no free text input, no API calls, no abuse surface).

## Current Step Order
1. Welcome
2. Connect (detect existing gateway vs fresh install)
3. Install (OpenClaw CLI + gateway)
4. Permissions (screen recording + accessibility)
5. Channels (messaging apps)
6. Role (user roles)
7. AI (API key setup) ← TOO LATE
8. Skills
9. Ready

## New Step Order
1. Welcome
2. Connect (detect existing gateway vs fresh install)
3. Install (OpenClaw CLI + gateway) — only if fresh setup
4. **AI (API key setup) ← MOVED UP** — "First, let's connect your brain"
5. Permissions (screen recording + accessibility)
6. Channels (messaging apps)
7. Role (user roles)
8. Skills
9. Ready

## Chat Panel Behavior

### BEFORE API key is entered (steps 1-3/4)
- Chat panel shows pre-scripted assistant messages per step (already exists)
- **NO text input field** — hide the input bar entirely
- Instead, show clickable **suggestion buttons** below the last message
- Each button reveals a pre-written answer (no API call)

Suggestion buttons per step:

**Welcome:**
- "What is Pinchr?" → "Pinchr is a desktop app that makes managing AI assistants easy. Think of it as mission control for your AI — chat, tasks, automations, all in one place."
- "Is it free?" → "You get 7 days of full access free. After that, plans start at $20/year."

**Connect:**
- "What is OpenClaw?" → "OpenClaw is the open-source AI engine that powers Pinchr. It runs locally on your Mac and connects to AI providers like Anthropic and OpenAI."
- "Do I need to install anything?" → "If you're new, we'll install OpenClaw right here in the app. It takes about a minute."

**Install:**
- "What's happening?" → "I'm installing the OpenClaw engine on your Mac. This is what connects to AI providers and manages your assistant."
- "Is this safe?" → "Yes! OpenClaw is open-source (MIT licensed) and runs entirely on your machine. Nothing leaves your Mac unless you connect external services."

**AI (key setup):**
- "Which provider should I pick?" → "I'd recommend Anthropic (Claude) for the most capable experience. OpenAI (GPT) is great too. Both work well with Pinchr."
- "How do I get an API key?" → "Go to console.anthropic.com (Anthropic) or platform.openai.com (OpenAI), create an account, and generate an API key. It takes about 30 seconds."
- "How much does it cost?" → "API costs depend on usage. Typical personal use is $5-20/month. You only pay for what you use — there's no minimum."

### AFTER API key is entered (steps 5-9)
- Chat input field APPEARS with message: "✨ Your AI is connected! I can help with the rest of setup."
- Chat now uses the gateway (which has their key configured) for real AI responses
- Falls back to scripted responses if gateway is unreachable

## Implementation

### Chat Panel Changes (in Onboarding.tsx)

1. Track whether AI is connected: `const [aiConnected, setAiConnected] = useState(false)`
2. When API key is saved successfully in the AI step, set `aiConnected = true`
3. Conditional rendering in chat panel:
   - If `!aiConnected`: Hide input bar, show suggestion buttons
   - If `aiConnected`: Show input bar, enable real chat

### Suggestion Button Component
```tsx
interface SuggestionButton {
  label: string
  answer: string
}

// Render as pill-shaped buttons below the last message
// On click: add user message (the label) + assistant message (the answer) to chat
// Animate in/out smoothly
```

### Step Reordering
- Move the `'ai'` step to position after `'install'` (or after `'connect'` if existing gateway)
- Update STEPS array and navigation logic
- Update `canProceedFromAi` check
- The `hasExistingGateway` path: Welcome → Connect → AI → Permissions → ...
- The fresh install path: Welcome → Connect → Install → AI → Permissions → ...

### Chat Input Visibility
```tsx
{/* Chat input — only show after AI is connected */}
{aiConnected ? (
  <div className="border-t border-border p-4">
    <div className="flex gap-2">
      <Input ... />
      <Button ... />
    </div>
  </div>
) : (
  <div className="border-t border-border p-4">
    <p className="text-center text-xs text-text-muted">
      Connect your AI provider to start chatting
    </p>
  </div>
)}
```

### Suggestion Buttons Rendering
```tsx
{/* Show suggestion buttons when AI is not connected */}
{!aiConnected && STEP_SUGGESTIONS[currentStep] && (
  <div className="flex flex-wrap gap-2 px-5 pb-3">
    {STEP_SUGGESTIONS[currentStep].map((suggestion) => (
      <button
        key={suggestion.label}
        onClick={() => handleSuggestionClick(suggestion)}
        className="rounded-full border border-border bg-surface-2 px-3 py-1.5 text-xs text-text-secondary hover:border-accent/40 hover:text-text-primary transition-colors"
      >
        {suggestion.label}
      </button>
    ))}
  </div>
)}
```

## Files to Modify
- src/renderer/src/pages/Onboarding.tsx — Main changes (step reorder, chat behavior, suggestion buttons)

## NOT in scope
- Changing the actual AI step UI (it already works well)
- Adding new providers
- Changing the Install step
- Post-onboarding behavior

## Test Cases
1. Fresh user, no OpenClaw → Welcome → Connect → Install → AI → rest works
2. Existing OpenClaw user → Welcome → Connect (auto-detect) → AI → rest works  
3. Chat input hidden before key entry
4. Suggestion buttons appear and work
5. Chat goes live after key entry
6. Chat falls back to scripted if gateway fails after key entry
