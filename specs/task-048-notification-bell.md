# task-048: Notification Bell

## Goal
Bell icon in the top bar that shows items the agent needs from the human. This is how the agent asks for help without interrupting.

## Implementation

### NotificationBell Component
Location: src/renderer/src/components/NotificationBell.tsx

- Bell icon (lucide Bell) in the top bar area
- Badge with count of pending notifications (coral/red circle with number)
- Click → dropdown/popover showing notification list
- Each notification: icon, title, description, timestamp, urgency badge
- Click a notification → navigate to relevant page (Tasks, Chat, etc.)
- "Mark all read" button at the bottom

### Notification Sources (Phase 1)
- **Blocked tasks**: Any task in tasks.json with status "blocked" and assignee "human"
- **Agent questions**: When the agent needs a decision (future — store in a notifications.json)

### Data Model
Store in workspace: `notifications.json`
```json
{
  "notifications": [
    {
      "id": "notif-001",
      "type": "blocked-task" | "question" | "review" | "alert",
      "title": "Review estimate for Johnson",
      "description": "I need your approval before sending",
      "urgency": "low" | "medium" | "urgent" | "critical",
      "taskId": "task-042",  // optional link
      "page": "tasks",       // where to navigate
      "read": false,
      "createdAt": "2026-02-12T..."
    }
  ]
}
```

### Auto-populate from Tasks
On every tasks.json change (via file watcher), scan for:
- Tasks with status "blocked" + assignee "human" → create notification if not already exists
- Tasks completed → auto-dismiss related notifications

### Placement
Add to the top of the sidebar (src/renderer/src/components/Sidebar.tsx) near the Pinchr logo, or as a fixed element in the top-right area. Should be visible from every page.

### Urgency Visual
- 🟢 Low — gray/subtle badge
- 🟡 Medium — amber badge
- 🔴 Urgent — coral/red badge
- 🚨 Critical — red pulsing badge

### Design
- Dark popover matching glass-card style
- Max height with scroll for many notifications
- Empty state: "All clear! Nothing needs your attention."
- Group by urgency (critical first)
- Relative timestamps ("2 min ago", "1 hour ago")

## Files
- Create: src/renderer/src/components/NotificationBell.tsx
- Create: src/renderer/src/hooks/useNotifications.ts
- Modify: src/renderer/src/components/Sidebar.tsx (add bell)

## Commit
feat: notification bell — agent-to-human communication in top bar
