# Dashboard Page

## WHAT
The home page that ties everything together. A summary view showing agent status, recent activity, quick stats, and gateway health at a glance.

## WHY
Users opening Pinchr need a "home base" that tells them what's happening. The Dashboard is the first thing they see after onboarding.

## Current State
Dashboard.tsx is 620 lines with existing implementation. Check what's there and polish.

## Task: Polish into a clean summary dashboard
1. Agent Status Card:
   - Gateway online/offline indicator
   - OpenClaw version
   - Current model
   - Uptime
2. Quick Stats:
   - Number of active sessions
   - Number of automations (cron jobs)
   - Number of installed skills
   - Number of connections
3. Recent Activity:
   - Last 5-10 messages across sessions (brief previews)
   - Recent automation runs
4. Quick Actions:
   - "Start chatting" → navigates to Chat
   - "View automations" → navigates to Automations
   - "Check settings" → navigates to Settings
5. Gateway Health:
   - Connection status with last check time

## Data Sources
- useGatewayHealth() — gateway status
- useSessions() — session count and recent activity
- useCronList() — automation count
- useAvailableSkills/useWorkspaceSkills — skill count
- useGatewayConfig() — model, connections info

## Files
- src/renderer/src/pages/Dashboard.tsx (620 lines — polish)

## Acceptance Criteria
- Shows gateway status prominently
- Quick stats are accurate and live
- Recent activity shows real data (no mocks)
- Quick action buttons navigate correctly
- Clean empty states when no data
- TypeScript compiles clean
