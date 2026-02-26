---
name: memory-manager
description: Capture daily notes and maintain curated long-term MEMORY.md without storing secrets.
version: 1.0.0
triggers:
  - remember this
  - memory
  - write to memory
  - compaction
---

# Memory Manager Skill

You have limited “mental” persistence. Use files as your memory.

## File layout (required)
- **Daily logs (raw):** `memory/YYYY-MM-DD.md`
  - Chronological notes: what happened, decisions, context.
  - This is the scratchpad.
- **Long-term curated memory:** `MEMORY.md`
  - Stable facts, preferences, recurring projects, important decisions.
  - This is the distilled reference.

If `memory/` does not exist, create it.

## When to write daily memory
Write to today’s `memory/YYYY-MM-DD.md` when any of these happen:
- A decision is made (what + why + owner).
- A preference is stated (tone, formatting, workflows).
- A task is started/blocked/finished (brief note).
- Credentials/integrations are discussed (store **only** non-secret identifiers).
- A recurring pain point or lesson learned emerges.

Daily entry format (suggested):
- Timestamped bullets.
- Keep it factual.
- Include links/paths.

Example:
```md
- 11:30 — Decided to use feature branches only; never commit to main/dev.
- 11:45 — Blocker: need Drew to confirm pricing tiers.
- 12:10 — Wrote skill docs in two locations for Pinchr desktop.
```

## When to update MEMORY.md
Update `MEMORY.md` during periodic review (e.g., every few days) or when:
- A decision will matter later.
- A preference is stable and should influence future behavior.
- A project fact changes (paths, commands, key rules).

Curation rules:
- Keep `MEMORY.md` short and high-signal.
- Remove outdated items.
- Prefer bullet points and headings.

## What NOT to store
Do NOT store:
- Secrets: passwords, API keys, auth tokens, private keys.
- One-off debug logs, stack traces, temporary experiments.
- Sensitive personal data unless explicitly requested and necessary.

If you must refer to a secret, store a pointer only:
- “Key stored in `.env.local`” (do not paste value)

## Searching memory
When you need context:
- Search daily files first for recent events.
- Then consult `MEMORY.md` for stable facts.

Practical search approach:
- Look for keywords across `memory/*.md`.
- If using CLI tools, prefer ripgrep (`rg`) when available.

## Pre-compaction flush (mandatory)
If you receive a system message indicating **pre-compaction memory flush**:
1. **Stop.**
2. Write a summary to `memory/YYYY-MM-DD.md` **before** replying.
3. Include:
   - what you did
   - decisions made
   - open loops / next steps
   - any blockers

Never reply without writing memory during a compaction flush.

## Don’ts
- Don’t put long essays into daily memory.
- Don’t duplicate everything into `MEMORY.md`.
- Don’t store secrets.
