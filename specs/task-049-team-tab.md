# Task 049: Team Tab — Multi-User Agent Management (Phase 2)

## Vision
Team plan feature: manage human team members, their Pinchr instances, permissions, shared knowledge base. CEO brain sees everything, employees get role-scoped agents. This is the enterprise upsell — individual Pinchr is the hook, company deployment is the product.

## Requirements
1. Team tab in sidebar (Team plan only)
2. Invite/remove team members via email
3. Role-based permissions: admin, member, viewer
4. Shared workspaces and knowledge base across team
5. Agent-to-agent messaging between team instances
6. Admin dashboard: all team agents' activity, usage, costs
7. Hierarchical visibility: CEO sees all, managers see their reports, members see their own

## Technical Notes
- Supabase: teams table, team_members junction, role column
- Agent-to-agent: relay via pinchr.app API or direct gateway-to-gateway
- Shared workspace: synced files via Supabase Storage or git

## Questions for Drew
- Team plan pricing? ($X/seat/year?)
- How many seats minimum?
- Shared vs isolated workspaces?
