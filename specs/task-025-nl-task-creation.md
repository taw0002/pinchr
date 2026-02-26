# Task-025: Natural Language Task Creation

## Goal
Replace the manual task form with natural language input. User types a description, the agent parses it into a structured task (title, project, priority, description, subtasks).

## Current State
- `TaskQuickAdd.tsx` has a text input that creates a task with just a title
- Tasks stored in `tasks.json` via `window.api.files.read/write`
- `useTasks.ts` hook manages all task CRUD
- Projects exist in tasks.json under `projects` array

## Requirements

### 1. Smart Input Bar
- Replace the current TaskQuickAdd with a single text input at the top of the Tasks page
- Placeholder: "Describe a task... e.g. 'High priority: redesign the login page for Pinchr with dark theme support'"
- On Enter, send the text to the gateway for AI parsing
- Show a brief loading spinner while parsing

### 2. AI Parsing (via Gateway)
- Send the natural language input to the gateway's `/v1/chat/completions` endpoint
- System prompt instructs the model to extract:
  - `title`: Concise task title (under 80 chars)
  - `subtitle`: One-line summary (under 100 chars) 
  - `description`: Full description with context
  - `priority`: urgent / high / medium / low (default: medium)
  - `projectId`: Match against existing projects by name, or null
  - `subtasks`: Array of subtask titles if the task implies multiple steps
  - `tags`: Relevant tags
- Model should be fast (use whatever model the gateway has configured)
- Response must be valid JSON

### 3. Instant Creation
- Parse the AI response and create the task immediately via `useTasks.addTask()`
- Task appears on the board instantly
- No confirmation dialog — trust the AI parsing (user can edit after)
- If parsing fails, fall back to creating a simple task with the input as the title

### 4. Context Awareness
- Include the list of existing projects in the AI prompt so it can match project names
- Include existing tags for consistency

## Technical Implementation

### File Changes
- `src/renderer/src/components/tasks/TaskQuickAdd.tsx` — Rewrite as NL input
- `src/renderer/src/hooks/useTasks.ts` — No changes needed (addTask already works)
- `src/renderer/src/pages/Tasks.tsx` — May need minor layout adjustments

### AI Parsing Approach
Use the gateway streaming endpoint but collect the full response:
```typescript
// In the renderer, call the gateway to parse
const response = await window.api.gateway.streamMessage(
  'task-parser', // ephemeral session
  userInput,
  { systemPromptAddition: TASK_PARSER_PROMPT }
)
```

Or simpler: use a direct fetch to `/v1/chat/completions` with a system prompt:
```typescript
const TASK_PARSER_PROMPT = `You are a task parser. Given a natural language description, extract a structured task.
Return ONLY valid JSON with these fields:
{
  "title": "string (concise, under 80 chars)",
  "subtitle": "string (one-line summary, under 100 chars)",
  "description": "string (full description)",
  "priority": "urgent|high|medium|low",
  "projectId": "string|null (match from available projects)",
  "subtasks": ["string", ...],
  "tags": ["string", ...]
}

Available projects:
{{PROJECTS}}

Do not include any explanation, just the JSON object.`
```

### Gateway Call
```typescript
const gatewayUrl = 'http://localhost:18789'
const token = await window.api.gateway.getConfig() // get auth token
const res = await fetch(`${gatewayUrl}/v1/chat/completions`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    messages: [
      { role: 'system', content: taskParserPrompt },
      { role: 'user', content: userInput }
    ],
    // Don't need streaming for this — just get the response
    stream: false
  })
})
```

### Preload/IPC
Check if `gateway.getConfig()` or similar exists to get the auth token. If not, add an IPC handler that reads the token from `~/.openclaw/openclaw.json`.

## Edge Cases
- Empty input: ignore
- Very short input ("fix bug"): Create simple task, title = input, medium priority
- No project match: Leave projectId null (goes to "No Project" column or inbox)
- AI returns invalid JSON: Fall back to simple task creation with input as title
- Gateway unavailable: Fall back to simple task creation

## UX Flow
1. User types: "High priority: add dark mode toggle to settings page for Pinchr, needs CSS variables and theme context"
2. Brief spinner (< 2 seconds)
3. Task appears on board:
   - Title: "Add dark mode toggle to settings page"
   - Priority: High
   - Project: Pinchr Desktop
   - Subtasks: ["Set up CSS variables for theme colors", "Create ThemeContext provider", "Add toggle switch to Settings page", "Persist theme preference"]

## NOT in scope
- Voice input (future)
- Task editing via NL (future)  
- Bulk task creation (future)
- Chat-per-task (that's task-026)
