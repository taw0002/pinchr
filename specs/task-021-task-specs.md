# Task Specs — Markdown Docs per Task (task-021)

## Goal
Add a "Spec" tab to the task detail modal with a markdown editor and rendered preview. Each task can have a rich document (requirements, notes, design decisions) that both humans and agents can read/edit. Think Confluence attached to Jira tickets.

## Data Model
In `src/shared/types.ts`, add to the `Task` type:
```ts
spec?: string; // Markdown content for the task spec
```

Tasks are stored in `tasks.json` via the `useTasks` hook at `src/renderer/src/hooks/useTasks.ts`.

## UI Changes

### TaskDetailPanel (`src/renderer/src/components/tasks/TaskDetailPanel.tsx`)
Currently a Dialog with two columns (main content left, metadata sidebar right).

Add a tab bar at the top of the main content area (left column):
- **Details** tab (default) — current content (title, description, subtasks, comments, activity)
- **Spec** tab — markdown editor + preview

### Spec Tab Implementation
- Use a textarea for editing with monospace font (simple first, can upgrade to CodeMirror later)
- Toggle between "Edit" and "Preview" modes with a button
- Preview renders markdown using `react-markdown` with `remark-gfm` for GitHub-flavored markdown
- Syntax highlighting in code blocks via `rehype-highlight` or similar
- Dark theme styling that matches the app
- Auto-save on blur or after 2s debounce of typing

### Styling
- Match existing dark theme (`bg-surface-1`, `text-text-primary`, etc.)
- Preview should look clean — proper heading sizes, code blocks, lists, tables
- Editor should have a subtle border, comfortable line height

## Dependencies to Add
```bash
yarn add react-markdown remark-gfm
```
(rehype-highlight optional — skip if it adds too much complexity)

## Subtasks
1. Add `spec` field to Task type in `src/shared/types.ts`
2. Add Spec tab to TaskDetailPanel with tab bar (Details / Spec)
3. Markdown editor (textarea) with edit/preview toggle
4. Markdown preview renderer (react-markdown + remark-gfm)
5. Auto-save spec changes through useTasks hook
6. Dark theme styling for rendered markdown

## Files to Modify
- `src/shared/types.ts` — add `spec?: string` to Task
- `src/renderer/src/components/tasks/TaskDetailPanel.tsx` — add tab bar + Spec tab
- `src/renderer/src/hooks/useTasks.ts` — updateTask already handles arbitrary fields, should work

## Constraints
- Keep it simple — textarea + preview toggle, not a full WYSIWYG editor
- Must work with existing task persistence (tasks.json via Electron IPC)
- Dark theme only (no light mode needed)
- No external API calls — everything local
