# Task 026: Chat-per-Task — Isolated Sessions Scoped to Tasks

## Vision
When user clicks "Work on This" on a task, spawn an isolated chat session scoped to that task. The session gets the task spec + subtasks as context. Agent works independently without polluting main chat. Reports progress via task comments and status updates. Main chat = command center, task threads = execution.

## Current State
- Tasks exist with specs, subtasks, comments
- Chat is a single main session
- No concept of task-scoped sessions
- Work Mode picks tasks but doesn't actually execute them

## Requirements
1. **"Work on This" button** on task detail panel
2. **Spawns isolated session** via `sessions_spawn` with task context injected:
   - Task title, description, spec (full markdown)
   - Subtask checklist
   - Relevant comments/history
   - Project context
3. **Session sidebar entry** — task sessions appear in Sessions page with task badge
4. **Progress reporting** — agent writes back to task:
   - Status changes (todo → in-progress → done)
   - Subtask completion
   - Comments with progress updates
   - Links to commits/artifacts
5. **Multiple parallel sessions** — user can have several task sessions running
6. **Session history** — completed task sessions viewable from task detail

## Edge Cases
- Task has no spec → prompt user to add one first, or generate one
- Agent gets stuck → surfaces blocker as notification + marks task blocked
- Session compacts → task context should be preserved in summary
- Task updated while session running → session should pick up changes

## Definition of Done
- [ ] "Work on This" button spawns isolated session with full task context
- [ ] Task session visible in Sessions page with task link
- [ ] Agent can update task status/subtasks/comments from within session
- [ ] Completed sessions accessible from task detail history
- [ ] Works with Work Mode — Work Mode uses chat-per-task under the hood

## Technical Notes
- Use `sessions_spawn` with task context as the prompt
- Session label format: `task-{taskId}-{shortTitle}`
- Task updates via `write` tool to tasks.json (file watcher picks up changes)
- This is the missing piece that makes Work Mode actually autonomous
