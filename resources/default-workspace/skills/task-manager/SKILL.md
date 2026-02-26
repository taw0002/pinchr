---
name: task-manager
description: Maintain tasks.json with priority-driven execution, specs, and status hygiene.
version: 1.0.0
triggers:
  - tasks
  - tasks.json
  - what should I work on
  - prioritize
---

# Task Manager Skill

You are the agent's task system. Your job is to keep `tasks.json` truthful, current, and useful.

## Canonical file
- Use the workspace file: `tasks.json` (in the current workspace root unless a different path is specified).
- Treat it as the single source of truth for what exists, what's active, and what's done.

## Schema (required)
`tasks.json` MUST follow this shape:

```json
{
  "tasks": [
    {
      "id": "task-001",
      "title": "Short task title",
      "description": "What/why/context",
      "status": "backlog | todo | in-progress | blocked | done",
      "priority": "urgent | high | medium | low",
      "specFile": "specs/task-001-short-title.md",
      "assignee": "jarvis | drew | <name>",
      "createdAt": "2026-02-14T18:57:00Z",
      "updatedAt": "2026-02-14T18:57:00Z",
      "doneAt": "2026-02-14T19:30:00Z"
    }
  ]
}
```

Notes:
- `specFile` is optional in the schema, but **required before you start work**.
- `assignee` is optional; set it when ownership matters.
- `doneAt` exists only when `status=done`.

## Status lifecycle (use exactly these)
- `backlog` → idea captured, not ready
- `todo` → ready to execute (has a spec)
- `in-progress` → actively being worked
- `blocked` → cannot proceed without external input
- `done` → completed and verified

Never invent new statuses.

## Priority rules (strict ordering)
Work selection order:
1. `urgent`
2. `high`
3. `medium`
4. `low`

Tie-breakers (in order):
- Due date if present in description/spec
- Dependencies (unblock other work first)
- Oldest `createdAt`

## Operating procedure
### 1) Read first
Before proposing work, read `tasks.json`.
- If missing, create it with `{ "tasks": [] }` and then add tasks.

### 2) Ensure every actionable task has a spec
**No task gets worked on without a spec file.**
- If a task is `todo` or `in-progress` and has no `specFile`, immediately:
  1. create a spec path: `specs/<id>-<slug>.md`
  2. write a spec with requirements + acceptance criteria
  3. set `specFile` in `tasks.json`
  4. set status to `todo` (not `in-progress`) until the spec is complete

Spec minimum sections:
- Context / problem
- Requirements
- Acceptance criteria
- Edge cases / constraints
- Definition of done

### 3) Start work (status hygiene)
When you begin:
- Set exactly one task to `in-progress`.
- Update `updatedAt` immediately.

While you work:
- Keep status aligned with reality.
- Update `updatedAt` when you make meaningful progress.

### 4) Finish work (done means done)
To mark `done`:
- Verify the acceptance criteria.
- Write a completion summary into the task `description` (append) or into the spec under a "Completion notes" section.
- Set:
  - `status: done`
  - `doneAt: <now>`
  - `updatedAt: <now>`

Completion summary should include:
- What changed
- Where to find it (files/paths)
- How to validate (commands/steps)

### 5) Handle blocked tasks
If blocked:
- Move task to `blocked`.
- Add a **clear blocker note** in `description` starting with `BLOCKED:`.
- Tag the human explicitly in your next message (e.g., "Need human decision on …").
- Immediately select the next best task by priority and proceed.

Blocked task checklist:
- What do you need?
- Who can provide it?
- What options exist?
- What is your recommendation?

## Task creation rules
When adding tasks:
- Use stable IDs like `task-###` (zero-padded).
- Titles: short, action-oriented.
- Descriptions: include "why" and any constraints.
- Set `createdAt` and `updatedAt` on creation.
- **Always create a spec file** (see below).

Example new task entry:
```json
{
  "id": "task-012",
  "title": "Add CSV export to reports",
  "description": "Users need to export reports for accounting. Include filters and timezone handling.",
  "status": "backlog",
  "priority": "medium",
  "specFile": "specs/task-012-csv-export.md",
  "createdAt": "2026-02-14T19:00:00Z",
  "updatedAt": "2026-02-14T19:00:00Z"
}
```

## Auto-spec generation (MANDATORY)

**Every task gets a spec file at creation time. No exceptions.**

### When you create a task, immediately:
1. Create `specs/task-{id}-{slug}.md` (e.g. `specs/task-012-csv-export.md`)
2. Set the `specFile` field in the `tasks.json` entry
3. Populate the spec using the template below

### Spec template

```markdown
# Task {id}: {Title}

## Problem
What's broken, missing, or needed. Why does this task exist?

## Requirements
- [ ] Concrete requirement 1
- [ ] Concrete requirement 2
- [ ] ...

## Acceptance Criteria
- [ ] How do we know this is done?
- [ ] What can be tested/verified?
- [ ] Edge cases handled?

## Files Affected
- `path/to/file.ts` — what changes and why
- `path/to/other.ts` — what changes and why

## Constraints
Any technical limitations, dependencies, or decisions already made.

## Notes
Context from conversation, links, references. Anything a sub-agent would need to do this work without asking questions.
```

### When a task comes from conversation:
- Extract the key requirements and decisions discussed — don't just summarize, capture specifics
- Include exact quotes or decisions where they matter ("The user said X should work like Y")
- Note any rejected alternatives so future-you doesn't re-propose them
- If the conversation was vague, fill in what you can and mark the rest with `TODO: need clarification`

### When you don't have enough context:
- Still create the spec file with what you know
- Mark unknown sections with `TODO: need input from human`
- Set the task status to `blocked`
- Tag the human with specific questions (not "tell me more" — ask concrete questions)

## Don'ts
- Don't do work "because it seems useful" unless it's in `tasks.json` (or you add it first).
- Don't keep multiple tasks `in-progress`.
- Don't mark `done` without verification steps.
