# MCP Page Redesign — Agent-Assisted Setup (task-023)

## Goal
Redesign the MCP Servers page to be beginner-friendly. Replace the form-first approach with an educational empty state, popular preset cards, and a natural language input that routes to chat for agent-assisted setup.

## Current State
File: `src/renderer/src/pages/MCPServers.tsx`

Currently shows:
- Header "MCP Servers" with "+ Add Server" button
- Empty state card with text about presets and asking agent
- When clicking Add Server, opens a technical form (name, command, args, env vars)

## New Design

### Empty State (when no servers configured)
Replace the current empty state with:

1. **Hero section** with illustration/icon:
   - Heading: "Supercharge your agent with tools"
   - Subtext: "MCP servers connect your agent to databases, APIs, and services. Pick a popular tool below or describe what you need."

2. **Popular Preset Cards** (grid of 4-6 cards):
   Each card shows: icon/emoji, name, one-line description, "Add" button
   
   Presets:
   - 🗄️ **Supabase** — "Connect to your Supabase database" 
   - 🐙 **GitHub** — "Manage repos, issues, and PRs"
   - 📝 **Notion** — "Read and write Notion pages"
   - 📁 **Filesystem** — "Read and write local files"
   - 🔍 **Brave Search** — "Search the web"
   - 💬 **Slack** — "Send and read Slack messages"
   
   Clicking "Add" on a preset should pre-fill the Add Server form with that preset's config (command, args template).

3. **Natural language input** at the bottom:
   - Input field with placeholder: "Describe what tools you need..."  
   - "Ask Agent" button
   - Clicking routes to Chat page with the user's message prefixed: "I want to add an MCP server: {input}"
   - This lets the agent walk them through setup conversationally

4. **Learn More link**: "What are MCP servers?" linking to https://modelcontextprotocol.io

### With Servers Configured
When servers exist, show them in the current list/card format, but add:
- The preset cards in a collapsible "Add More" section
- The natural language input still visible

### Keep the Form
The "+ Add Server" button with the technical form stays for power users, but move it to a secondary position (text link or smaller button below the presets).

## Preset Data Structure
```ts
interface MCPPreset {
  id: string;
  name: string;
  emoji: string;
  description: string;
  command: string;
  args: string[];
  envHints: string[]; // env vars the user needs to provide
  docsUrl: string;
}
```

Store presets as a constant array in the component or a shared file.

## Files to Modify
- `src/renderer/src/pages/MCPServers.tsx` — main redesign
- Potentially extract preset data to `src/renderer/src/data/mcpPresets.ts`

## Constraints
- Dark theme styling (bg-surface-1, text-text-primary, etc.)
- Use existing shadcn components (Card, Button, Input, etc.)
- No new dependencies needed
- The "Ask Agent" flow just navigates to Chat with a pre-filled message — no new IPC needed
- Preset configs should be reasonable defaults (users will need to add their own API keys)
