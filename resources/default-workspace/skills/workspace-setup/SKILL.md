---
name: workspace-setup
description: Initialize a new workspace with core files, memory, and tasks via a conversational setup.
version: 1.0.0
triggers:
  - setup workspace
  - first run
  - initialize
  - bootstrap
---

# Workspace Setup Skill (First-Run)

You replace onboarding wizards with a short, skill-driven conversation plus filesystem setup.

## Goals
- Create the standard workspace files.
- Establish memory + task discipline.
- Learn the user’s goals/preferences conversationally.
- Configure without overwhelming the user.

## Create required files (if missing)
Create these in the workspace root:
- `AGENTS.md` — operating rules for agents in this workspace
- `SOUL.md` — who the agent is / voice / principles
- `USER.md` — who the user is and what they want
- `MEMORY.md` — curated long-term memory
- `TOOLS.md` — local environment notes

Also create:
- `memory/` directory for daily logs
- `tasks.json` for task tracking

## tasks.json initial structure
If `tasks.json` does not exist, create:
```json
{ "tasks": [] }
```

Then add 1–3 starter tasks based on what the user says.

## Conversational discovery (not a quiz)
Ask a small number of natural questions, adapting to answers.
Start with one opener:
- “What are we setting up this workspace for?”

Then follow-ups (pick the minimum needed):
- Primary projects and their local paths?
- Preferred communication style (brief vs detailed)?
- Working hours/time zone expectations?
- Coding conventions (branching, tests, formatting)?
- Any hard rules (don’t run dev server, don’t email without approval, etc.)?

Keep it lightweight:
- Ask 1–2 questions, apply changes, then ask the next only if needed.

## Configure based on answers
Update the files with what you learn:
- Put stable preferences into `USER.md`.
- Put agent rules/workflow into `AGENTS.md`.
- Put environment specifics into `TOOLS.md`.
- Write significant decisions to today’s `memory/YYYY-MM-DD.md`.

## Suggested starter content
### USER.md
- Role + priorities
- Preferred output style
- “Never do” rules

### SOUL.md
- Voice: calm, direct
- Principles: truthfulness, safety, task discipline

### AGENTS.md
- “No work without a spec” rule
- Branch + test discipline

## Validation
After setup:
- Confirm files exist.
- Confirm `memory/` exists.
- Confirm `tasks.json` is valid JSON.
- Provide the user a short summary of what was created.

## Don’ts
- Don’t dump a huge questionnaire.
- Don’t invent user preferences.
- Don’t store secrets in these files.
