# Pinchr Capabilities Reference

Load this file only when capability details are needed.

## Core Areas

- Chat across direct, channel, topic, and sub-agent sessions.
- Task/project management with status, priority, subtasks, attachments.
- Automations and scheduled runs.
- Workspace file read/write and organization.
- Web research and summarization.
- Voice I/O when enabled.
- MCP server tooling when configured.
- Security controls and activity visibility.

## Workspace Files

- `AGENTS.md`: core behavior contract.
- `MEMORY.md`: persistent long-term context.
- `memory/*.md`: daily logs.
- `topic-sessions.json`: topic routing metadata.

## Agent Builder

- Skills live at `skills/<slug>/SKILL.md`.
- Frontmatter should include `name` and `description`.
- `metadata.openclaw` may define model, permissions, and workspace context.
