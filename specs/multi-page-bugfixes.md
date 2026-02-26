# Spec: Multi-Page Bug Fixes

## Bug 1: Sessions page and Chat sidebar only show 1 session

**Root cause:** `getSessions()` in `src/main/gateway.ts:121` passes `limit: 20` but the Sessions page's `useGatewaySessions()` in `src/renderer/src/hooks/useGatewaySessions.ts:428` doesn't pass `limit` at all, so it defaults to whatever OpenClaw's default is (probably 10 or 20).

**Fix:**
- In `src/main/gateway.ts:121`, change `limit: 20` to `limit: 100`
- In `src/renderer/src/hooks/useGatewaySessions.ts:428`, add `limit: 100` to the `sessions_list` params

## Bug 2: Terminal starts in ~ instead of workspace directory

**Root cause:** `src/main/ipc.ts:197` has `cwd: homedir()` for the PTY spawn.

**Fix:** Change `cwd: homedir()` to `cwd: join(OPENCLAW_HOME_PATH, 'workspace')` (WORKSPACE_PATH is already defined at line 119). Also add `~/.pinchr/bin` to the PATH env so `openclaw` CLI works.

The WORKSPACE_PATH constant already exists: `const WORKSPACE_PATH = join(OPENCLAW_HOME_PATH, 'workspace')` (line 119).

Change line ~197:
```typescript
cwd: WORKSPACE_PATH,
```

For the PATH, there's already a `commandPath()` function — check if it includes `~/.pinchr/bin`. If not, ensure the terminal PATH includes it.

## Bug 3: Skills page shows 0 workspace skills

**Root cause:** `listFilesRecursive()` in `src/main/ipc.ts` (around line 1994) only recurses into directories named exactly `memory` or `skills`. So it enters `skills/` but then won't recurse into `skills/code-workflow/` because `code-workflow` isn't in the allowlist.

**Fix:** Make the recursion go deeper for the `skills` directory. After entering `skills/`, recurse into ALL subdirectories (not just those named `memory` or `skills`):

```typescript
function listFilesRecursive(dir: string, prefix = '', depth = 0): string[] {
  const results: string[] = []
  if (!existsSync(dir)) return results

  const entries = readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      // At root level, only recurse into memory and skills
      // Inside skills/, recurse into all subdirectories (skill folders)
      if (depth === 0 && (entry.name === 'memory' || entry.name === 'skills')) {
        results.push(...listFilesRecursive(join(dir, entry.name), relativePath, depth + 1))
      } else if (depth > 0) {
        results.push(...listFilesRecursive(join(dir, entry.name), relativePath, depth + 1))
      }
    } else if (entry.name.endsWith('.md') || entry.name.endsWith('.json')) {
      results.push(relativePath)
    }
  }
  return results
}
```

Also add `.json` files since tasks.json and other config files should be listable.

## Bug 4: Connections page shows all disconnected

**Root cause:** The Connections page likely checks the OpenClaw config for channel credentials but doesn't check the actual gateway connection status. Slack IS connected (we're talking through it right now), but the page doesn't detect live connections.

**Investigation needed:** Check `src/renderer/src/pages/Connections.tsx` to see how it determines connected status. It probably needs to query gateway health/channels status instead of just checking config.

## Bug 5: Chat sidebar shows only 1 session (same as Bug 1)

Same root cause as Bug 1. The `SessionSidebar.tsx` calls `getSessions()` which has `limit: 20` in gateway.ts. But the real issue may be that sessions without recent activity aren't returned. Increasing the limit should help, but also check if the sessions_list API needs `activeMinutes` param to be larger or removed.

## Files to modify
1. `src/main/gateway.ts` — Increase session limit to 100
2. `src/renderer/src/hooks/useGatewaySessions.ts` — Add limit: 100 to sessions_list call
3. `src/main/ipc.ts` — Fix terminal cwd to WORKSPACE_PATH, fix listFilesRecursive to recurse into skill subdirectories
4. `src/renderer/src/pages/Connections.tsx` — Investigate and fix connection status detection
