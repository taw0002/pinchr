import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

const WORKSPACE_PATH = join(homedir(), '.openclaw', 'workspace')
const AGENTS_MD_PATH = join(WORKSPACE_PATH, 'AGENTS.md')
const MEMORY_DIR_PATH = join(WORKSPACE_PATH, 'memory')
const REFERENCES_DIR_PATH = join(WORKSPACE_PATH, 'references')

function getBundledDefaultWorkspaceDir(): string | null {
  const bundledDirs = [
    join(__dirname, '..', '..', 'resources', 'default-workspace'),
    join(__dirname, '..', 'resources', 'default-workspace'),
    join(process.resourcesPath || '', 'default-workspace'),
  ]

  for (const dir of bundledDirs) {
    try {
      if (existsSync(dir)) return dir
    } catch {
      // Try next path
    }
  }

  return null
}

/**
 * Load the default AGENTS.md from bundled resources.
 * Falls back to a minimal version if the bundled file isn't found.
 */
function getDefaultAgentsMd(): string {
  const defaultDir = getBundledDefaultWorkspaceDir()
  if (defaultDir) {
    const agentsPath = join(defaultDir, 'AGENTS.md')
    try {
      if (existsSync(agentsPath)) {
        return readFileSync(agentsPath, 'utf-8')
      }
    } catch {
      // Fall through to minimal fallback
    }
  }

  // Minimal fallback if bundled file not found
  return `# AGENTS.md — Your Pinchr Agent Guide

You're an AI assistant running inside Pinchr, powered by OpenClaw.

## Core Rules

### 📋 Task Management Is Mandatory
Every piece of work gets tracked. Someone asks you to do something → create a task immediately.
Update status as you work. Mark done when finished. The Tasks page should always reflect reality.

### 🧠 Memory
When you receive a "Pre-compaction memory flush" system message, you MUST write to \`memory/YYYY-MM-DD.md\` before replying.
Memory is limited. If you want to remember something, WRITE IT TO A FILE.

### ⚡ Be Proactive
Check for emails, calendar events, and notifications during heartbeats. Follow up on stalled tasks.

### 🧭 Topic Routing
Use the current session as a control thread and route substantive work into focused topic sessions.
Reuse existing topic threads where possible. Keep control threads lightweight.
Persist topic metadata in \`topic-sessions.json\` and summarize large topics into \`memory/topics/\`.

### 🔒 Safety
Ask before sending messages, emails, or anything public. When in doubt, ask.
`
}

function copyBundledReferences(): void {
  const defaultDir = getBundledDefaultWorkspaceDir()
  if (!defaultDir) return

  const sourceReferencesDir = join(defaultDir, 'references')
  if (!existsSync(sourceReferencesDir)) return

  const copyRecursive = (sourceDir: string, targetDir: string) => {
    if (!existsSync(targetDir)) {
      mkdirSync(targetDir, { recursive: true })
    }

    const entries = readdirSync(sourceDir, { withFileTypes: true })
    for (const entry of entries) {
      const sourcePath = join(sourceDir, entry.name)
      const targetPath = join(targetDir, entry.name)
      if (entry.isDirectory()) {
        copyRecursive(sourcePath, targetPath)
      } else if (!existsSync(targetPath)) {
        copyFileSync(sourcePath, targetPath)
      }
    }
  }

  copyRecursive(sourceReferencesDir, REFERENCES_DIR_PATH)
}

/**
 * Ensures the workspace has essential files for good agent behavior.
 * Non-destructive: never overwrites existing files (respects user customization).
 */
export function scaffoldWorkspace(): void {
  try {
    // Ensure workspace directory exists
    if (!existsSync(WORKSPACE_PATH)) {
      mkdirSync(WORKSPACE_PATH, { recursive: true })
    }

    // Ensure memory/ directory exists
    if (!existsSync(MEMORY_DIR_PATH)) {
      mkdirSync(MEMORY_DIR_PATH, { recursive: true })
    }

    if (!existsSync(REFERENCES_DIR_PATH)) {
      mkdirSync(REFERENCES_DIR_PATH, { recursive: true })
    }
    copyBundledReferences()

    // Create AGENTS.md only if it doesn't exist or is empty
    if (!existsSync(AGENTS_MD_PATH)) {
      writeFileSync(AGENTS_MD_PATH, getDefaultAgentsMd(), 'utf-8')
    } else {
      const content = readFileSync(AGENTS_MD_PATH, 'utf-8').trim()
      if (content.length === 0) {
        writeFileSync(AGENTS_MD_PATH, getDefaultAgentsMd(), 'utf-8')
      }
    }
  } catch (error) {
    console.error('[Pinchr] Workspace scaffolding failed:', error)
  }
}
