# Task 027: Seamless Computer Control Permissions

## Vision
Make computer control seamless for new users. Permission check on first launch with guided flow to System Settings. Auto-detect when granted. All control goes through Pinchr.app permissions — users never see peekaboo CLI.

## Current State
- Onboarding has a permissions step for Screen Recording + Accessibility
- Pinchr computer API exists on port 18790 with token auth
- Peekaboo CLI is wrapped but permissions are per-binary on macOS
- Agent skill at `workspace/skills/pinchr-computer/SKILL.md`
- Permission detection via Electron native APIs (auto-polls)

## Requirements
1. **Permission check on launch** — detect Screen Recording + Accessibility status
2. **Guided flow** — deep link to System Settings > Privacy > Screen Recording / Accessibility
3. **Auto-detect** — poll every 2s, show green checkmarks when granted
4. **Single binary** — all control through Pinchr.app, no peekaboo in user's face
5. **Graceful degradation** — if permissions not granted, computer use features hidden (not erroring)
6. **Settings page** — show permission status with re-grant flow

## Edge Cases
- User grants permission but hasn't restarted Pinchr → need to detect without restart
- macOS Sequoia+ changed permission flows → test on latest OS
- Electron dev mode (`yarn dev`) runs as "Electron" not "Pinchr" → different permissions
- User revokes permission after granting → detect and show re-grant prompt

## Definition of Done
- [ ] Permission status visible in Settings and onboarding
- [ ] Deep links to correct System Settings pane
- [ ] Auto-detection with polling (no manual refresh needed)
- [ ] Computer use features gracefully hidden when permissions missing
- [ ] Works in production build (not just dev mode)

## Technical Notes
- macOS: `systemPreferences.getMediaAccessStatus('screen')` for Screen Recording
- Accessibility: `systemPreferences.isTrustedAccessibilityClient(false)` to check without prompting
- Deep link: `x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture`
