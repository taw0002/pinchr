# task-046: Conversational Onboarding

## Vision
Onboarding should feel like meeting a smart new assistant, not configuring software. After the minimal technical setup (API key + permissions), the user drops into a conversation where the agent learns who they are, what they want, and helps them get started — all through natural chat.

## Flow

### Phase 1: Technical Setup (minimal UI, keep existing)
1. Welcome screen → "Let's get you set up"
2. API key input (OpenAI or Anthropic) — with helper text, paste-friendly
3. macOS permissions (screen recording, accessibility) — only if needed
4. Gateway starts connecting

### Phase 2: First Conversation (NEW — replaces the old scripted wizard steps)
Once gateway is connected, navigate directly to Chat page. The agent's system prompt (via AGENTS.md "First Session" section) drives the conversation:

**Agent opens with something like:**
> "Hey! I'm your AI assistant in Pinchr. I'll be managing tasks, automating workflows, and keeping things organized for you. Before we dive in — what should I call you?"

**After name:**
> "Nice to meet you, [Name]! What are you hoping to use me for? I can help with project management, research, scheduling, writing, coding — or something completely different."

**User describes their goals.** Agent responds naturally, then:
> "Got it — sounds like [summary]. Want me to suggest some things to set up, or do you want to just jump in and start working?"

**During this conversation, the agent:**
- Writes user's name and goals to MEMORY.md (visible in Memory Explorer)
- Creates their first task based on what they said (visible on Tasks page)
- Maybe suggests an automation ("Want me to check your email every morning and brief you?")
- Shows inline task cards in chat so they SEE the task appear

### Phase 3: User is onboarded
- They've had a real conversation
- Their agent knows who they are
- There's a task on the board
- Memory has context
- They understand the value

## Technical Implementation

### Onboarding.tsx changes
- Remove steps after API key + permissions
- After gateway connects, navigate to Chat page
- Pass a flag or query param like `?firstRun=true` so Chat knows to show a welcome state

### Chat.tsx changes
- If `firstRun=true`, show a subtle banner: "This is your first conversation. Your agent is learning about you."
- The actual conversation is driven by the agent reading AGENTS.md — no client-side scripting needed
- The AGENTS.md "First Session" checklist handles the flow

### AGENTS.md "First Session" section (already written)
```
## First Session
When you first meet your human:
1. Introduce yourself briefly — you're their AI assistant in Pinchr
2. Ask what they'd like help with first
3. Create a task for whatever they mention — let them see it appear
4. Ask about their preferences (work style, hours, communication)
5. Write initial notes to MEMORY.md
6. Show them you're organized from minute one
```

### Inline task cards (separate task, task-041)
When the agent creates a task via the task system, show a compact card in the chat message flow. This is the "magic moment" — user says something, agent creates a task, and they see it appear.

## What NOT to do
- No multi-step wizard after API key
- No "select your use case" buttons
- No pre-canned responses — the agent drives it naturally
- No tour/walkthrough overlays — the conversation is the tour
- Don't show the Tasks page during onboarding — let them discover it

## Success Criteria
- Time from API key → first real conversation: < 30 seconds
- User has told the agent their name and goals within 2-3 messages
- Agent has created at least one task
- MEMORY.md has user context
- User understands that tasks track their work
