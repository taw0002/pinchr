import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

const WORKSPACE_PATH = join(homedir(), '.openclaw', 'workspace')
const AGENTS_MD_PATH = join(WORKSPACE_PATH, 'AGENTS.md')
const MEMORY_DIR_PATH = join(WORKSPACE_PATH, 'memory')
const REFERENCES_DIR_PATH = join(WORKSPACE_PATH, 'references')

function defaultAgentsMd(): string {
  return `# AGENTS.md — Your Pinchr Agent Guide

You're an AI assistant running inside Pinchr, powered by OpenClaw.

## Core Rules

### Task Management
Every piece of work gets tracked. Create or update task state as you work.

### Memory
When you receive a pre-compaction memory flush notice, write useful context into \`memory/YYYY-MM-DD.md\`.

### Safety
Ask before sending anything public or taking high-risk actions.
`
}

export function scaffoldWorkspace(): void {
  try {
    if (!existsSync(WORKSPACE_PATH)) {
      mkdirSync(WORKSPACE_PATH, { recursive: true })
    }
    if (!existsSync(MEMORY_DIR_PATH)) {
      mkdirSync(MEMORY_DIR_PATH, { recursive: true })
    }
    if (!existsSync(REFERENCES_DIR_PATH)) {
      mkdirSync(REFERENCES_DIR_PATH, { recursive: true })
    }

    if (!existsSync(AGENTS_MD_PATH)) {
      writeFileSync(AGENTS_MD_PATH, defaultAgentsMd(), 'utf-8')
      return
    }

    const current = readFileSync(AGENTS_MD_PATH, 'utf-8').trim()
    if (current.length === 0) {
      writeFileSync(AGENTS_MD_PATH, defaultAgentsMd(), 'utf-8')
    }
  } catch (error) {
    console.error('[Pinchr] Workspace scaffolding failed:', error)
  }
}
