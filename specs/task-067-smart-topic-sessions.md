# Task 067: Smart Topic Sessions — Auto-Organize Conversations by Topic

## Vision (Drew, 2026-02-13)
Users send stream-of-consciousness messages through any channel (Slack, WhatsApp, Pinchr chat). The agent automatically groups these into topic-based sub-sessions. Pinchr displays organized topic threads instead of a flat list of raw session keys. The user never has to manually organize — the intelligence layer handles it.

"It is super nice to be able to just stream of consciousness send stuff but on the Pinchr side we need to better organize by topic."

## Problem
- Main DM becomes a giant monolithic conversation with everything mixed together
- Context rot from 200k+ token conversations that compact away details
- Pinchr sidebar shows raw session keys ("Slack Channel · d0ae412sy9x") — meaningless to users
- No way to see or navigate topic-specific conversation threads
- Sub-agent sessions appear but aren't labeled or grouped

## Solution: Three Layers

### Layer 1: Agent-Side Topic Routing (Behavior Change)
The agent in the main session acts as a **dispatcher**:
1. Receives user message in main DM
2. Detects topic from message content + recent context
3. Routes to existing sub-session OR spawns new one for new topics
4. Gets response from sub-session
5. Relays answer back to user in main DM
6. Main DM stays lightweight — just routing, not accumulating work context

**Topic detection**: Keyword matching + recent conversation context. Examples:
- "the update button is broken" → "Pinchr UI" session
- "how's the Luna eval suite" → "Launchpad Dev" session
- "check my calendar" → "Daily Ops" session
- New unrecognized topic → spawn fresh session

**Routing table**: Stored in workspace file (`topic-sessions.json`):
```json
{
  "topics": [
    {
      "id": "pinchr-ui",
      "label": "Pinchr UI Fixes",
      "sessionKey": "agent:coder:subagent:xxx",
      "keywords": ["pinchr", "sidebar", "button", "page", "UI", "build", "deploy"],
      "lastActive": "2026-02-13T23:00:00Z",
      "messageCount": 15
    }
  ]
}
```

### Layer 2: Pinchr Session Display (UI Feature)
Transform the Sessions sidebar from raw session keys to meaningful topic labels:

**Current (broken):**
```
Slack Channel · d0ae412sy9x  5:51 PM
Slack Channel · d0ae412sy9x  5:49 PM
Slack Channel · d0ae412sy9x  5:48 PM
```

**New (organized):**
```
📌 PINNED
  Direct Drew                    6:08 PM

📂 TOPICS
  Pinchr UI Fixes               5:51 PM  (3 new)
  Task Audit & Specs             5:38 PM
  OpenClaw Update                5:20 PM

🤖 SUB-AGENTS
  Coder · task-067               running
  Writer · blog posts            done

⚙️ BACKGROUND
  Codex · luna-consolidation     completed
```

**Data source**: Read `topic-sessions.json` from workspace + `sessions_list` from gateway. Merge and display with labels.

**Features:**
- Click topic → see that topic's conversation history
- Topic auto-created when agent spawns a new sub-session
- Unread count per topic
- Pin/archive topics
- Search across all topics

### Layer 3: Default AGENTS.md Behavior (All Pinchr Users)
Add topic routing as default agent behavior in the shipped AGENTS.md:
- Agent automatically organizes conversations by topic
- Creates `topic-sessions.json` to track active threads
- Relays between main chat and topic sessions
- Users see organized topics in Pinchr sidebar

## Implementation Plan

### Phase 1: Pinchr Session Display (UI-only)
- Rename sessions from raw keys to human-readable labels
- Group by type: Direct, Topics, Sub-Agents, Background
- Read session metadata (displayName, channel, model, lastMessage)
- This alone makes the sidebar 10x more useful

### Phase 2: Topic Routing Table
- `topic-sessions.json` workspace file
- Agent reads/writes routing table
- Manual topic creation via Pinchr UI ("New Topic" button)
- Agent suggests topic assignment for incoming messages

### Phase 3: Auto-Detection
- Agent automatically detects topics from message content
- Spawns sub-sessions without user intervention
- Seamless relay: user messages in main, agent routes to topic, response comes back

## Edge Cases
- Message spans multiple topics → route to most relevant, mention others
- Topic session compacts → summary preserved, topic label persists
- User explicitly wants to talk in main (quick one-off question) → don't route everything
- Too many topics → auto-archive inactive ones (>7 days)
- Sub-agent completes → topic stays in history, marked "completed"

## Definition of Done
- [ ] Pinchr sidebar shows labeled, grouped sessions (not raw keys)
- [ ] Topics are clickable with conversation history
- [ ] Agent routes messages to topic sub-sessions
- [ ] Default AGENTS.md includes topic routing behavior
- [ ] topic-sessions.json tracks active topics
- [ ] Unread counts per topic
- [ ] Works for all Pinchr users out of the box

## Technical Notes
- `sessions_list` returns: key, kind, channel, displayName, model, totalTokens, updatedAt
- `sessions_spawn` creates isolated sub-sessions with specific context
- `sessions_send` routes messages to existing sub-sessions
- `sessions_history` retrieves conversation for display
- File watcher on `topic-sessions.json` for real-time sidebar updates
