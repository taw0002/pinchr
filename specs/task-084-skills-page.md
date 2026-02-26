# Skills Page — ClawHub Marketplace

## WHAT
Skills are "where the magic of OpenClaw lives" (Drew). This page shows installed skills and lets users browse/install from ClawHub marketplace.

## WHY
Skills are what make OpenClaw useful — email, calendar, camera, TTS, coding agents, etc. Users need to see what's installed, what's available, and install new ones easily.

## Current State
SkillMarketplace.tsx is 429 lines with:
- Workspace skills tab (installed)
- Marketplace tab (from ClawHub API)
- Search functionality
- Skill cards with install/details
- SkillCard component exists

Hooks: useAvailableSkills, useWorkspaceSkills from useSkillMarketplace.ts

## Task: Polish
1. Ensure workspace skills tab shows all installed skills from the gateway
2. Marketplace tab should fetch from ClawHub API (already implemented in hooks)
3. Each skill card should show: name, description, emoji, install status
4. Install button should work (via gateway IPC or clawhub CLI)
5. "Try it" button that prefills a chat prompt related to the skill
6. Clean up any placeholder data
7. Add skill count badges to tabs
8. Empty state for marketplace when offline

## Files
- src/renderer/src/pages/SkillMarketplace.tsx (429 lines — polish)
- src/renderer/src/hooks/useSkillMarketplace.ts
- src/renderer/src/components/SkillCard.tsx

## Acceptance Criteria
- Shows all installed skills with descriptions
- Marketplace tab shows ClawHub skills (when online)
- Search filters both tabs
- Install/uninstall works
- TypeScript compiles clean
