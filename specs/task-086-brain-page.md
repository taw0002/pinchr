# Brain Page — Memory & Workspace

## WHAT
The Brain page lets users view and edit their agent's memory, personality, and workspace files. It's the "consciousness" viewer — SOUL.md, MEMORY.md, AGENTS.md, daily memory files, specs, research docs.

## WHY
Users need to understand and customize their agent. The workspace files ARE the agent's identity and memory. Making them visible and editable is key to the product experience.

## Current State
- Brain.tsx exists (256 lines)
- MemoryExplorer.tsx exists (439 lines) — may have file browsing logic
- Hooks: useWorkspaceFiles, useFileContent, useSaveFile in useGateway.ts

## Task: Build a clean Brain page
1. File tree sidebar showing workspace structure:
   - Core files: SOUL.md, AGENTS.md, TOOLS.md, MEMORY.md, IDENTITY.md
   - memory/ directory (daily files)
   - specs/ directory
   - research/ directory
   - skills/ directory
2. File viewer/editor panel:
   - Markdown rendering for .md files (read mode)
   - Plain text editor (edit mode) with save button
   - Syntax highlighting would be nice but not required
3. Quick access buttons for core files at the top
4. File metadata: last modified, size
5. Search across workspace files

## Data Source
- useWorkspaceFiles() — lists files from workspace
- useFileContent(filename) — reads file content
- useSaveFile() — saves edited file

## Files
- src/renderer/src/pages/Brain.tsx (256 lines — may need significant work)
- src/renderer/src/pages/MemoryExplorer.tsx (439 lines — merge into Brain or reference)
- src/renderer/src/hooks/useGateway.ts

## Acceptance Criteria
- File tree shows workspace structure
- Can browse and view any workspace file
- Can edit and save .md files
- Core files (SOUL.md, MEMORY.md, etc.) have quick access
- Clean empty state for new workspaces
- TypeScript compiles clean
