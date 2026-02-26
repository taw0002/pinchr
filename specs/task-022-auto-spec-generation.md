# Task 022: Agent Auto-Generates Task Specs

## Vision
When a task is created or assigned, the agent auto-drafts a spec by pulling context from conversations, related tasks, codebase, and knowledge base. Human reviews and edits before work begins. Foundation for the "no task without a spec" mandate.

## Current State
- Tasks have a `spec` field (string) in the data model
- No automated spec generation exists
- Specs are written manually by the agent or user

## Requirements
1. When a new task is created (via NL input or manual), agent offers to generate a spec
2. Agent pulls context from:
   - Recent chat conversation (if task came from discussion)
   - Related tasks (by project, tags, or keywords)
   - Relevant codebase files (if code task)
   - Workspace knowledge base (AGENTS.md, TOOLS.md, etc.)
3. Generated spec follows standard template: Vision, Requirements, Edge Cases, Definition of Done
4. User can review, edit, and approve before saving
5. Spec is stored both inline (task.spec) and as a file (specs/task-XXX.md)

## Edge Cases
- Task created with very little context → agent asks clarifying questions first
- Multiple related tasks → agent cross-references to avoid duplication
- Code tasks → agent reads relevant source files for technical context

## Definition of Done
- [ ] "Generate Spec" button on task detail panel
- [ ] Agent drafts spec from available context via gateway chat
- [ ] Draft shown in editor for user review/edit
- [ ] Approved spec saved to both task.spec and specs/ file
- [ ] Works for both NL-created and manual tasks

## Questions for Drew
- Should spec generation be automatic on task creation, or on-demand via button?
- How much codebase context should the agent pull? (Could be expensive for large repos)
