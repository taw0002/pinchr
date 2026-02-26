---
name: daily-ops
description: Run a concise daily status check across email, calendar, tasks, and notifications.
version: 1.0.0
triggers:
  - daily brief
  - morning briefing
  - status check
  - what’s on my plate
---

# Daily Ops Skill (Morning Briefing)

Run a fast, practical briefing. Output must be concise, actionable, and prioritized.

## Inputs to check (in this order)
1. **Email**
   - Look for urgent/unread messages.
   - Identify anything requiring a same-day reply or decision.
2. **Calendar (next 24–48 hours)**
   - List next meetings/events.
   - Highlight prep needed and travel/zoom links if relevant.
3. **Tasks (`tasks.json`)**
   - What is `urgent/high`?
   - What is blocked?
   - What is currently `in-progress`?
4. **Notifications / mentions**
   - Any pings requiring attention (work, personal, system alerts).

If you can’t access a source, say so and continue with what you have.

## Output requirements
- Produce exactly **3 priority actions** for today.
- Flag blockers and decisions needed.
- Keep to skimmable bullets.
- Do not include long explanations.

## Prioritization logic
- Prefer time-sensitive commitments (calendar) first.
- Then unblock highest-priority tasks.
- Then important-but-not-urgent work that prevents future fire drills.

## What to include
- Today’s “Top 3” actions with an estimated time block.
- A short “Upcoming” section (next 24–48h).
- A “Blockers / Decisions” section.
- A “Waiting on” section if you’re blocked by others.

## Example output format
Use this structure:

```
DAILY BRIEF — Sat Feb 14

Top 3 (do these first)
1) [ ] <action> (time: 30–60m)
   - why it matters: <one line>
2) [ ] <action> (time: 60–90m)
3) [ ] <action> (time: 15–30m)

Inbox (urgent/unread)
- <sender>: <subject> — <needed action>

Calendar (next 48h)
- <time> <event> — <prep>

Tasks snapshot
- In progress: <task-id> <title>
- Urgent/High: <task-id> <title>
- Blocked: <task-id> <blocker>

Blockers / Decisions needed
- <decision> (owner: user) — <what you recommend>
```

## After the brief (keep it lightweight)
- If you discover a new actionable item (email request, meeting follow-up), add it to `tasks.json` as `backlog` or `todo` with the right priority.
- If something is due today and not yet tracked, create a task and (if it’s truly actionable) create a spec stub.
- Do **not** change a task to `in-progress` unless you are actually starting it right now.

## Escalation rules
Escalate to the user immediately when:
- A meeting is within 2 hours and prep is required.
- An email requires a same-day decision or contains a deadline.
- A task is blocked on a user decision.

## Don’ts
- Don’t dump full email bodies.
- Don’t list more than 3 “Top 3” actions.
- Don’t hide blockers; elevate them.
