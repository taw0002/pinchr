# task-045: Security Page Polish

## Goal
Make the Security page a real differentiator — "Pinchr makes OpenClaw safe." This is the #1 fear around AI agents and our #1 selling point.

## Current State
Check src/renderer/src/pages/Security.tsx for what exists.

## Features to Build

### 1. Activity Audit Log
- Scrollable list of everything the agent has done
- Each entry: timestamp, action type, description, status (success/error)
- Action types: message sent, file read/written, command executed, web search, task created, etc.
- Filter by action type, date range
- Store in a local JSON file (workspace/audit-log.json)
- For now, populate with mock structure — real events will come when we hook into gateway

### 2. Permission Scopes
- Toggle switches for each capability:
  - Read files ✅/❌
  - Write files ✅/❌
  - Run commands ✅/❌
  - Send messages ✅/❌
  - Web browsing ✅/❌
  - Computer control ✅/❌
- Each with a description and risk level badge (Low/Medium/High)
- Save to workspace config or gateway config
- Visual: card-based layout with toggles, similar to Agent Builder permissions

### 3. Kill Switch
- Big red button at the top of the page
- "Stop All Agent Activity" — immediately halts everything
- Shows confirmation dialog: "Are you sure? This will stop all running tasks and sessions."
- Calls gateway restart or sends stop signal
- Visual: prominent, can't miss it

### 4. Approval Mode
- Toggle: "Require approval for external actions"
- When on, agent must ask before: sending messages, running commands, writing files outside workspace
- Shows as a setting with explanation of what it does
- This maps to OpenClaw's safety rules but makes it a user-friendly toggle

### 5. Session Monitor
- Show active sessions (main + any background/sub-agent sessions)
- Each: session name, status, last activity, model being used
- Kill button per session

## Design
- Dark theme, consistent with rest of app
- Cards with glass-card styling
- Kill switch: red accent, prominent placement
- Permission toggles: organized in a grid
- Audit log: table-like but styled as cards, newest first
- Use existing shadcn components (Switch, Badge, Card, ScrollArea)

## Files
- Modify: src/renderer/src/pages/Security.tsx
- May need: IPC methods for gateway stop/restart

## Commit
fix: security page polish — audit log, permissions, kill switch, approval mode
