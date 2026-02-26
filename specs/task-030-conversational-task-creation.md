# Task-030: Conversational Task Creation

## Problem
TaskQuickAdd fires a silent gateway request with no user feedback. Users describe a task and nothing visibly happens — no "thinking" state, no parsed result preview, no follow-up questions, no confirmation. Tasks either silently appear or silently fail.

## Goal
Make task creation feel like a conversation with the agent. User describes what they need → agent shows it's thinking → agent presents a parsed task card for review (or asks follow-up questions) → user confirms or edits → task is created.

## Design

### UI Flow

**Step 1: User types description and hits Enter**
- Input shows "thinking..." state with spinner
- Below the input, a **chat-like bubble** appears: "🤖 Let me break that down..."

**Step 2: Agent responds with a parsed task preview**
- Show an inline **task preview card** below the input:
  ```
  ┌─────────────────────────────────────────┐
  │ 📋 Title: Fix login page dark theme     │
  │ Priority: 🔴 High                       │
  │ Project: Pinchr Desktop                 │
  │ Description: Redesign the login page... │
  │ Subtasks:                               │
  │   □ Audit current theme variables       │
  │   □ Update color tokens                 │
  │   □ Test on all screens                 │
  │ Tags: ui, dark-theme                    │
  │                                         │
  │  [Create Task]  [Edit]  [Cancel]        │
  └─────────────────────────────────────────┘
  ```
- **Create Task** → saves immediately, clears preview, shows success toast
- **Edit** → opens the full task modal pre-filled with parsed data
- **Cancel** → clears preview, returns to input

**Step 3 (if agent needs clarification):**
- Instead of a preview card, show a question bubble:
  ```
  🤖 "This sounds like it could be part of either Pinchr Desktop or the Landing Site.
      Which project should I file it under?"
  ```
- Input stays active for the user to respond
- Multi-turn: agent asks → user answers → agent asks or shows preview
- Max 3 turns, then force-create with best guess

### Implementation

#### New component: `TaskCreationFlow.tsx`
Replaces `TaskQuickAdd` with a conversational wrapper.

```tsx
interface TaskCreationFlowProps {
  projects: Project[]
  existingTags: string[]
  onAddTask: (task: CreateTaskInput) => void
}

// State machine:
// idle → parsing → preview | clarifying → creating → idle
type FlowState = 'idle' | 'parsing' | 'preview' | 'clarifying' | 'creating'
```

#### Gateway prompt update
Change from one-shot JSON parser to conversational agent:

```
You are a task creation assistant. The user will describe a task they want to create.

Your job:
1. If the description is clear enough, respond with a JSON task object wrapped in ```json fences
2. If you need clarification (ambiguous project, unclear priority, missing context), ask ONE short question
3. Never ask more than one question at a time
4. If the user's follow-up answers your question, output the final JSON

Response format:
- For a complete task: ```json { ... } ```
- For a question: Just ask the question in plain text (no JSON, no markdown fences)

Task JSON shape:
{
  "title": "string (concise, under 80 chars)",
  "subtitle": "string (one-line summary, under 100 chars)",
  "description": "string (full description with context)",
  "priority": "urgent|high|medium|low",
  "projectId": "string|null",
  "subtasks": ["string"],
  "tags": ["string"]
}
```

#### Conversation state
- Keep a `messages` array for multi-turn: `[{role, content}]`
- On each user input, append to messages and send full history to gateway
- Parse response: if JSON found → show preview; if plain text → show as agent question
- Clear conversation on Create/Cancel

#### Success feedback
- After task creation: brief green toast "✅ Task created: {title}"
- Preview card animates out
- Input clears and refocuses

### Files to modify
- `src/renderer/src/components/tasks/TaskQuickAdd.tsx` → Rewrite as `TaskCreationFlow.tsx`
- `src/renderer/src/pages/Tasks.tsx` → Import new component
- Keep all the JSON parsing/normalization utils from current TaskQuickAdd

### Edge cases
- Gateway unreachable → show error: "Couldn't reach your AI. Creating as a simple task." + create with raw title
- Parse failure → same fallback
- User types very short input (1-2 words) → skip AI, create simple task directly (existing behavior)
- Conversation exceeds 3 turns → "Let me create this with what I have" + force output

### NOT in scope
- Changing task data model
- Modifying useTasks hook
- Task editing after creation (existing modal handles this)
