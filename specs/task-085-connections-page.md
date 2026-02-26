# Connections Page

## WHAT
All integrations in one place: messaging channels (Slack, WhatsApp, Discord, Telegram, Signal, iMessage), MCP servers, and any other connections.

## WHY
Users need to see what their agent is connected to and manage those connections. This replaces the old scattered approach of configuring channels in different places.

## Current State
Connections.tsx is 943 lines with existing implementation. Check what's there and polish.

## Task: Polish and ensure it reads from gateway config
1. Show all configured channels from gateway config (slack, whatsapp, discord, telegram, signal, imessage)
2. Each connection shows: status (connected/disconnected), type icon, name/identifier
3. "Add Connection" flow — guide users to add new channels
4. MCP servers section — show configured MCP servers
5. Node connections — show paired nodes
6. Status indicators should be live (ping gateway health)
7. Clean empty states ("No connections yet — add your first one")

## Data Source
- Gateway config: channels section has all configured messaging channels
- MCP: gateway config mcp section
- Nodes: use the existing nodes IPC

## Files
- src/renderer/src/pages/Connections.tsx (943 lines — polish)
- src/renderer/src/hooks/useGateway.ts (useGatewayConfig)

## Acceptance Criteria
- Shows all configured channels with status
- Shows MCP servers if configured
- Shows paired nodes
- Add connection guidance works
- Status indicators are accurate
- TypeScript compiles clean
