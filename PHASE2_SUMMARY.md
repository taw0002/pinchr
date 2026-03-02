# Phase 2: Computer Use HTTP API & OpenClaw Integration

## Summary

Phase 2 is complete! Pinchr now exposes its computer use capabilities through a local HTTP API that OpenClaw (or any local tool) can use. The Chat UI also supports sharing screenshots with AI.

## What Was Built

### Part A: Local HTTP API Server

**File:** `src/main/computer-server.ts`

- HTTP server on port 18790 (configurable)
- Bearer token authentication (stored in `~/.pinchr/config.json`)
- Auto-generated auth token on first run
- CORS enabled for local access

**Endpoints:**
- `GET /health` - Status + permission check (no auth required)
- `POST /screenshot` - Capture screen/window
- `POST /see` - Vision + annotated UI elements
- `POST /click` - Click by element ID or coordinates
- `POST /type` - Type text with options
- `POST /press` - Press special keys
- `POST /hotkey` - Execute hotkey combinations
- `POST /scroll` - Scroll in direction
- `GET /apps` - List running apps
- `GET /windows` - List windows (filterable)
- `POST /app/launch` - Launch application
- `POST /app/focus` - Focus application

All endpoints return `{ ok: boolean, data?: any, error?: string }`

### Part B: OpenClaw Skill

**File:** `/Users/drewwagner/.openclaw/workspace/skills/pinchr-computer/SKILL.md`

Complete documentation for the Pinchr computer API:
- Authentication guide
- Full endpoint reference with examples
- Workflow examples
- Error handling
- Integration notes

OpenClaw can now discover and use this skill to control the computer through Pinchr.

### Part C: Chat Integration

**File:** `src/renderer/src/pages/Chat.tsx`

- Added "Share Screen" button (Monitor icon) next to attachment button
- Captures screenshot using computer API
- Sends screenshot context to AI (base64 image support ready)
- Displays inline images in chat messages
- Shows capturing state with visual feedback

### Part D: Server Control API

**Files:**
- `src/main/ipc.ts` - Added IPC handlers
- `src/preload/index.ts` - Added preload API
- `src/shared/types.ts` - Added TypeScript types

**New API methods:**
```typescript
window.api.computer.server.start()  // Start server
window.api.computer.server.stop()   // Stop server
window.api.computer.server.status() // Get status
```

### Integration Changes

**File:** `src/main/index.ts`

- Auto-start computer server on app launch
- Auto-stop server on app quit
- Error handling for server lifecycle

## Testing

1. **Start Pinchr** - Server should start automatically
   - Check console for: `[Computer Server] Running on http://127.0.0.1:18790`

2. **Get auth token:**
   ```bash
   jq -r '.computerServer.authToken' ~/.pinchr/config.json
   ```

3. **Test health check:**
   ```bash
   curl http://127.0.0.1:18790/health
   ```

4. **Test screenshot (with auth):**
   ```bash
   AUTH_TOKEN=$(jq -r '.computerServer.authToken' ~/.pinchr/config.json)
   curl -X POST http://127.0.0.1:18790/screenshot \
     -H "Authorization: Bearer $AUTH_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"mode": "screen"}'
   ```

5. **Test in Chat:**
   - Open Chat page
   - Click Monitor icon (Share Screen button)
   - Should capture screenshot and send context message

## Configuration

Server config is stored in `~/.pinchr/config.json`:

```json
{
  "computerServer": {
    "enabled": true,
    "port": 18790,
    "authToken": "generated-secure-token-here"
  }
}
```

## Security

- Server binds to `127.0.0.1` only (localhost)
- Bearer token auth on all endpoints (except /health)
- Token auto-generated and persisted
- CORS enabled for local access only
- All actions logged via activity logger

## Next Steps

**Optional Enhancements:**

1. **Full Media Support in Chat:**
   - Send actual base64 image data through gateway
   - Support multipart uploads for large screenshots
   - Display images from AI responses

2. **UI for Server Control:**
   - Settings page to enable/disable server
   - Change port number
   - Regenerate auth token
   - View server status

3. **Advanced Features:**
   - Screen recording endpoints
   - Window management (resize, move)
   - Multi-monitor support
   - Screenshot region selector UI

4. **OpenClaw Integration Testing:**
   - Test skill from OpenClaw sessions
   - Verify automation workflows
   - Add example use cases

## Architecture

```
┌─────────────────────────────────────────┐
│           Pinchr Desktop App            │
│                                         │
│  ┌────────────┐      ┌──────────────┐  │
│  │   Chat UI  │      │  Computer    │  │
│  │            │─────▶│  Functions   │  │
│  │  (Monitor  │      │  (Phase 1)   │  │
│  │   Button)  │      └──────┬───────┘  │
│  └────────────┘             │          │
│                              │          │
│  ┌─────────────────────────────────┐   │
│  │   Computer HTTP Server          │   │
│  │   (Phase 2)                     │   │
│  │   - Port 18790                  │   │
│  │   - Bearer token auth           │   │
│  │   - All computer use endpoints  │   │
│  └──────────────┬──────────────────┘   │
│                 │                       │
└─────────────────┼───────────────────────┘
                  │
                  │ HTTP API (localhost only)
                  │
         ┌────────▼─────────┐
         │   OpenClaw       │
         │   Gateway        │
         │                  │
         │  Uses skill:     │
         │  pinchr-computer │
         └──────────────────┘
```

## Commits

- **openclaw-desktop:** `17320d4` - Phase 2 implementation
- **openclaw workspace:** `dc21724` - Pinchr computer skill

## TypeScript Validation

✅ All types compile successfully (`npx tsc --noEmit`)

## Files Changed

**Created:**
- `src/main/computer-server.ts` (361 lines)
- `skills/pinchr-computer/SKILL.md` (417 lines)

**Modified:**
- `src/main/index.ts` (added server lifecycle)
- `src/main/ipc.ts` (added server control handlers)
- `src/preload/index.ts` (added server control API)
- `src/shared/types.ts` (added server types)
- `src/renderer/src/pages/Chat.tsx` (added Share Screen button)

**Total additions:** ~800 lines of code + documentation
