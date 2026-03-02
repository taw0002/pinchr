# OpenClaw Patches

We bundle OpenClaw inside Pinchr. When we need changes that upstream won't accept (2 PRs denied so far), we handle it ourselves.

## Patch Strategy

- **Pinchr-side filtering** (preferred): Handle in our renderer/main process code. No minified JS patching needed. Survives upgrades cleanly.
- **`patch-package`** (for stable files): For config, non-hashed files, or small targeted fixes. Patches auto-apply on `yarn install`.
- **`scripts/patch-openclaw.js`** (for hashed dist files): Programmatic patching that finds files by content, not filename. Use when we must patch minified dist bundles.

## Active Patches

### 1. Chat Message Filtering (Pinchr-side)
- **File**: `src/renderer/src/hooks/useSimpleChat.ts`
- **What**: `classifyMessage()` hides system noise (heartbeat prompts, cron injections, sub-agent announcements, exec completions, memory flush, [System Message] blocks)
- **Why**: OpenClaw injects system messages as `role: "user"`, making them indistinguishable from real user input. Upstream has no `__openclaw.kind` tagging on injected messages.
- **Upstream status**: Would need `__openclaw.kind` on all injected messages. PRs denied.
- **Added**: 2026-02-16

## Denied PRs

| PR | What | Why Denied | Our Workaround |
|----|------|------------|----------------|
| #16838 | Model fallback cooldown bypass fix | CI failures (pre-existing upstream) | Local workaround in gateway.ts |
| TBD | TBD | TBD | TBD |

## When Upgrading OpenClaw

1. `yarn upgrade openclaw@latest`
2. `patch-package` runs automatically via postinstall
3. If patches fail, check if hashed filenames changed
4. Test: `npx tsc --noEmit && yarn build`
5. Review this file — some patches may no longer be needed
