# Task System Spec — Pinchr

## Vision
A standalone task/project management system that serves as the shared priority layer between humans and AI agents. Tasks live in the workspace so agents can natively read, act on, and update them. Pinchr provides the visual interface. Future: assign tasks across teammates and their agents to build a collaborative work graph.

## Data Model

### Task
```typescript
interface Task {
  id: string                    // nanoid
  title: string
  description?: string
  priority: 'urgent' | 'high' | 'medium' | 'low'
  status: 'backlog' | 'todo' | 'in-progress' | 'blocked' | 'done' | 'cancelled'
  projectId?: string            // references Project.id
  assignee?: string             // "drew", "jarvis", agent id, or future teammate
  tags: string[]
  dueDate?: string              // ISO date
  createdAt: string             // ISO timestamp
  updatedAt: string             // ISO timestamp
  completedAt?: string          // ISO timestamp
  notes: TaskNote[]             // append-only activity log
  source: TaskSource
  subtasks: Subtask[]
  blockedBy?: string[]          // task ids this is blocked on
}

interface TaskNote {
  id: string
  author: string                // who added it
  text: string
  createdAt: string
}

interface Subtask {
  id: string
  title: string
  done: boolean
}

interface TaskSource {
  kind: 'manual'               // standalone, created in Pinchr or by agent
  // Future: 'github' | 'linear' | 'jira' — with externalId, url, syncedAt
}
```

### Project
```typescript
interface Project {
  id: string
  name: string                  // "Pinchr", "Launchpad", "OpenClaw", etc.
  emoji?: string                // visual identifier
  color?: string                // hex for UI
  description?: string
  createdAt: string
}
```

### TaskStore (root file shape)
```typescript
interface TaskStore {
  version: 1
  projects: Project[]
  tasks: Task[]
}
```

**Storage:** `workspace/tasks.json` — read/written via gateway `tools/invoke` (read/write tools). Pinchr UI calls gateway; agent reads natively.

## UI Pages & Components

### TasksPage (`src/renderer/src/pages/Tasks.tsx`)
Replace existing automations-only tasks page with a full task management page.

**Layout:** Sidebar (project list + filters) | Main area (board or list view)

**Views (tabs):**
1. **Board View** — Kanban columns: Todo → In Progress → Blocked → Done. Cards show title, priority badge, assignee avatar, due date, project tag. Drag-and-drop between columns (use @dnd-kit/core if available, otherwise simple drag handlers).
2. **List View** — Table/list with sortable columns: title, priority, status, project, assignee, due date. Bulk actions (select multiple → change status/priority/project).
3. **Timeline View** — Tasks ordered by due date, grouped by week. Shows overdue in red.

**Sidebar:**
- "All Tasks" (default)
- Project filters (click to filter by project)
- Status filters: My Tasks, Overdue, Unassigned
- "+ New Project" button

### TaskDetailPanel (slide-over or modal)
When clicking a task card/row:
- Editable title (inline)
- Description (markdown editor, simple textarea is fine)
- Priority selector (dropdown with colored badges)
- Status selector
- Project selector
- Assignee selector
- Due date picker
- Tags (chip input)
- Subtasks (checkbox list with add)
- Blocked by (link to other tasks)
- Notes/Activity log (append-only, newest first, shows who + when)

### QuickAddTask
- Triggered from command palette (⌘K → "Add task") and a FAB/button on the tasks page
- Minimal: title, priority, project (optional), assignee (optional)
- Enter to create, Escape to cancel

### TaskCard (board view)
- Compact card: title, priority dot, assignee initials, due date, project badge
- Hover: subtle shadow
- Click: opens TaskDetailPanel

### ProjectManager (small modal/sheet)
- CRUD projects: name, emoji, color
- Delete only if no tasks reference it (or reassign)

## Hooks

### `useTaskStore()`
Central hook. Reads `tasks.json` via gateway, provides:
- `tasks`, `projects` — reactive data
- `addTask(task)`, `updateTask(id, patch)`, `deleteTask(id)`
- `addProject(project)`, `updateProject(id, patch)`, `deleteProject(id)`
- `addNote(taskId, note)` — append to activity log
- `moveTask(id, status)` — shortcut for status change
- Uses `@tanstack/react-query` for caching, `useMutation` for writes
- Optimistic updates for snappy UI
- Debounced write-back (500ms) to avoid thrashing the file

### `useTaskFilters()`
- Filter state: project, status, assignee, priority, search query
- Derived filtered/sorted task list
- Persisted to localStorage

## Integration Points

### Command Palette
- "Add Task" (⌘K → type "task")
- "View Tasks" → navigate to tasks page
- "My Tasks" → tasks page filtered to user's tasks

### Keyboard Shortcuts
- ⌘4 → Tasks page (reuse existing)
- Within tasks page: N = new task, / = search

### Sidebar
- Keep "Automations" as-is (cron/workflows)
- Tasks gets its own sidebar entry above Automations

### Gateway/Agent
The agent reads `workspace/tasks.json` directly. The file is the source of truth.
- Agent checks tasks during heartbeats
- Agent can create/update tasks via workspace file writes
- No special API needed — it's just a file

## Design Guidelines
- Use existing shadcn/ui components (Card, Badge, Button, Input, Select, Dialog, Sheet, Tabs)
- Priority colors: urgent=red, high=orange, medium=blue, low=gray
- Status colors: backlog=gray, todo=blue, in-progress=yellow, blocked=red, done=green, cancelled=gray
- Assignee shows initials in colored circle
- Keep it clean — this is a productivity tool, not a Christmas tree
- Dark theme consistent with rest of Pinchr
- No fake data. If no tasks exist, show empty state with "Create your first task" CTA

## File Structure
```
src/renderer/src/
├── pages/
│   └── Tasks.tsx                    # Main tasks page (replaces old automations-only)
├── components/tasks/
│   ├── TaskBoard.tsx                # Kanban board view
│   ├── TaskList.tsx                 # List/table view  
│   ├── TaskTimeline.tsx             # Timeline view
│   ├── TaskCard.tsx                 # Card for board view
│   ├── TaskRow.tsx                  # Row for list view
│   ├── TaskDetailPanel.tsx          # Slide-over detail/edit panel
│   ├── QuickAddTask.tsx             # Quick-add form
│   ├── ProjectSidebar.tsx           # Project list + filters sidebar
│   └── ProjectManager.tsx           # CRUD projects modal
├── hooks/
│   ├── useTasks.ts                  # Task store hook (read/write/mutate)
│   └── useTaskFilters.ts            # Filter/sort state
```

## What NOT to Build (yet)
- External integrations (GitHub, Linear, Jira) — future phase
- Real-time collaboration / multi-user — future (needs Supabase sync)
- Recurring tasks — future
- Time tracking — future
- Notifications/reminders — agent handles this via heartbeat + cron
- Drag-and-drop reordering within columns — nice-to-have, not MVP
