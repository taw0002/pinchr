# Optimistic Chat Rendering

## Problem
When a user sends a message while the agent is busy processing another request, the message disappears from the UI. It only reappears when the agent finally responds and the session history is refreshed. This is confusing and feels broken.

## Current Behavior
1. User types message and hits send
2. Message is sent to OpenClaw gateway (queued because agent is busy)
3. Message DISAPPEARS from Pinchr UI
4. Minutes pass with no feedback
5. Agent finishes previous work, processes queued message, responds
6. Both the user's message and agent's response appear together

## Expected Behavior
1. User types message and hits send
2. Message appears IMMEDIATELY in the chat (optimistic rendering)
3. A "thinking" or "queued" indicator shows below the message
4. If the agent is busy, show "Message queued — agent is working on something else"
5. When the agent responds, the response streams in naturally
6. The optimistic message reconciles with the server-confirmed message

## Implementation

### 1. Optimistic Message Queue (ConversationThread / ChatView)
- Maintain a local `pendingMessages` state array
- On send: immediately push `{ role: 'user', content: text, id: tempId, status: 'pending' }` to the array
- Render pending messages at the bottom of the message list
- When session history refreshes and contains a matching message, remove from pending

### 2. Status Indicator
- Below the last message, show current state:
  - "Sending..." → message is being transmitted
  - "Agent is thinking..." → message delivered, waiting for response (with animated dots)
  - "Queued — agent is busy" → agent is processing another request
- Use the streaming state from the gateway to determine which indicator to show

### 3. Reconciliation
- Match pending messages to history messages by content + timestamp proximity
- Remove pending messages once confirmed in history
- Handle edge cases: message fails to send → show retry button

### 4. Never Hide User Input
- Even if the gateway returns an error, keep the message visible
- Show error state inline: "Failed to send — tap to retry"

## Files to Modify
- `src/renderer/src/components/command-center/ConversationThread.tsx` — add optimistic rendering
- `src/renderer/src/hooks/useCommandCenter.ts` — manage pending message state
- `src/renderer/src/hooks/useGateway.ts` — expose busy/queued state from gateway

## Priority
HIGH — this is a fundamental chat UX issue that makes Pinchr feel broken.
