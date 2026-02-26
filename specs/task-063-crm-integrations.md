# Task 063: Salesforce + HubSpot MCP Integrations (Phase 2)

## Vision
"Never manually update your CRM again." High-quality CRM integrations as MCP servers. Agent auto-logs calls, emails, meetings. Updates pipeline stages. Generates reports. Alerts on stale deals.

## HubSpot MCP Server
- Port knowledge from Launchpad's existing HubSpot integration
- Contact sync, deal tracking, email sequences
- Auto-log interactions from conversation context
- Pipeline automation

## Salesforce MCP Server
- Auto-log calls, emails, meetings to contacts/opportunities
- Update pipeline stages from conversation context
- Generate reports and forecasts
- Alert on stale deals (no activity > X days)

## Technical Notes
- Build as MCP servers so any Pinchr user can connect
- HubSpot: REST API, OAuth2
- Salesforce: REST API, OAuth2, SOQL for queries
- Both support webhooks for real-time sync

## Questions for Drew
- HubSpot first (since we have Launchpad knowledge) or Salesforce?
- Should these be free MCP servers or Pro-only?
- Any specific CRM workflows that are highest pain?
