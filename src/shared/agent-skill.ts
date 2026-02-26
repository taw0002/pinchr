export type SkillAgentStatus = 'active' | 'disabled'

export interface SkillToolPermissions {
  file_read: boolean
  file_write: boolean
  command_run: boolean
  clipboard_access: boolean
  browser_action: boolean
  send_messages: boolean
}

export interface ParsedAgentSkillContent {
  name: string
  description: string
  emoji: string
  model: string
  status: SkillAgentStatus
  systemPrompt: string
  toolPermissions: SkillToolPermissions
  workspaceRoot: string
  sessionLabel: string
  includeMemory: boolean
}

export interface BuildAgentSkillInput extends ParsedAgentSkillContent {}

export const DEFAULT_SKILL_TOOL_PERMISSIONS: SkillToolPermissions = {
  file_read: true,
  file_write: true,
  command_run: false,
  clipboard_access: false,
  browser_action: false,
  send_messages: true
}

function splitFrontmatter(content: string): { frontmatter: string; body: string } {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/)
  if (!match) {
    return { frontmatter: '', body: content }
  }
  return { frontmatter: match[1], body: match[2] }
}

function stripYamlValue(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

function parseYamlScalar(raw: string): unknown {
  const value = raw.trim()
  if (!value) return ''

  if (value.startsWith('"') && value.endsWith('"')) {
    try {
      return JSON.parse(value)
    } catch {
      return value.slice(1, -1)
    }
  }

  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replace(/\\'/g, "'")
  }

  const lower = value.toLowerCase()
  if (lower === 'true' || lower === 'yes' || lower === 'enabled') return true
  if (lower === 'false' || lower === 'no' || lower === 'disabled') return false
  if (lower === 'null' || lower === '~') return null

  if (/^-?\d+(\.\d+)?$/.test(value)) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }

  if (value.startsWith('[') && value.endsWith(']')) {
    const inner = value.slice(1, -1).trim()
    if (!inner) return []
    return inner
      .split(',')
      .map((item) => parseYamlScalar(item.trim()))
      .filter((item) => item !== undefined)
  }

  return stripYamlValue(value)
}

function parseYamlObject(frontmatter: string): Record<string, unknown> {
  const root: Record<string, unknown> = {}
  const stack: Array<{ indent: number; node: Record<string, unknown> }> = [{ indent: -1, node: root }]
  const lines = frontmatter.replace(/\r\n/g, '\n').split('\n')

  for (const line of lines) {
    if (!line.trim()) continue

    const match = line.match(/^(\s*)([^:#]+):(?:\s*(.*))?$/)
    if (!match) continue

    const indent = match[1].length
    const key = match[2].trim()
    const rawValue = (match[3] ?? '').trim()

    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) {
      stack.pop()
    }

    const parent = stack[stack.length - 1].node
    if (!rawValue) {
      const child: Record<string, unknown> = {}
      parent[key] = child
      stack.push({ indent, node: child })
      continue
    }

    parent[key] = parseYamlScalar(rawValue)
  }

  return root
}

function getYamlPath(root: Record<string, unknown>, ...path: string[]): unknown {
  let cursor: unknown = root
  for (const segment of path) {
    if (!cursor || typeof cursor !== 'object' || Array.isArray(cursor)) return undefined
    cursor = (cursor as Record<string, unknown>)[segment]
  }
  return cursor
}

function yamlStringAt(root: Record<string, unknown>, ...path: string[]): string | undefined {
  const value = getYamlPath(root, ...path)
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

function yamlBooleanAt(root: Record<string, unknown>, ...path: string[]): boolean | undefined {
  const value = getYamlPath(root, ...path)
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const normalized = value.toLowerCase()
    if (normalized === 'true' || normalized === 'yes' || normalized === 'enabled') return true
    if (normalized === 'false' || normalized === 'no' || normalized === 'disabled') return false
  }
  return undefined
}

function yamlQuoted(value: string): string {
  return JSON.stringify(value)
}

export function parseAgentSkillContent(content: string, fallbackName = 'agent'): ParsedAgentSkillContent {
  const { frontmatter, body } = splitFrontmatter(content)
  const yamlRoot = parseYamlObject(frontmatter)

  const statusRaw = (
    yamlStringAt(yamlRoot, 'status')
    ?? yamlStringAt(yamlRoot, 'metadata', 'openclaw', 'status')
    ?? 'active'
  ).toLowerCase()
  const status: SkillAgentStatus = statusRaw === 'disabled' || statusRaw === 'false' ? 'disabled' : 'active'

  const toolPermissions: SkillToolPermissions = {
    file_read:
      yamlBooleanAt(yamlRoot, 'file_read')
      ?? yamlBooleanAt(yamlRoot, 'metadata', 'openclaw', 'toolPermissions', 'file_read')
      ?? DEFAULT_SKILL_TOOL_PERMISSIONS.file_read,
    file_write:
      yamlBooleanAt(yamlRoot, 'file_write')
      ?? yamlBooleanAt(yamlRoot, 'metadata', 'openclaw', 'toolPermissions', 'file_write')
      ?? DEFAULT_SKILL_TOOL_PERMISSIONS.file_write,
    command_run:
      yamlBooleanAt(yamlRoot, 'command_run')
      ?? yamlBooleanAt(yamlRoot, 'metadata', 'openclaw', 'toolPermissions', 'command_run')
      ?? DEFAULT_SKILL_TOOL_PERMISSIONS.command_run,
    clipboard_access:
      yamlBooleanAt(yamlRoot, 'clipboard_access')
      ?? yamlBooleanAt(yamlRoot, 'metadata', 'openclaw', 'toolPermissions', 'clipboard_access')
      ?? DEFAULT_SKILL_TOOL_PERMISSIONS.clipboard_access,
    browser_action:
      yamlBooleanAt(yamlRoot, 'browser_action')
      ?? yamlBooleanAt(yamlRoot, 'metadata', 'openclaw', 'toolPermissions', 'browser_action')
      ?? DEFAULT_SKILL_TOOL_PERMISSIONS.browser_action,
    send_messages:
      yamlBooleanAt(yamlRoot, 'send_messages')
      ?? yamlBooleanAt(yamlRoot, 'metadata', 'openclaw', 'toolPermissions', 'send_messages')
      ?? DEFAULT_SKILL_TOOL_PERMISSIONS.send_messages
  }

  return {
    name: yamlStringAt(yamlRoot, 'name') ?? fallbackName,
    description: yamlStringAt(yamlRoot, 'description') ?? '',
    emoji:
      yamlStringAt(yamlRoot, 'emoji')
      ?? yamlStringAt(yamlRoot, 'metadata', 'openclaw', 'emoji')
      ?? '🤖',
    model:
      yamlStringAt(yamlRoot, 'model')
      ?? yamlStringAt(yamlRoot, 'metadata', 'openclaw', 'model')
      ?? '',
    status,
    systemPrompt: body.trim() || '# Instructions\n\nDefine how this agent should behave.',
    toolPermissions,
    workspaceRoot:
      yamlStringAt(yamlRoot, 'root')
      ?? yamlStringAt(yamlRoot, 'metadata', 'openclaw', 'workspace', 'root')
      ?? '.',
    sessionLabel:
      yamlStringAt(yamlRoot, 'sessionLabel')
      ?? yamlStringAt(yamlRoot, 'metadata', 'openclaw', 'workspace', 'sessionLabel')
      ?? fallbackName,
    includeMemory:
      yamlBooleanAt(yamlRoot, 'includeMemory')
      ?? yamlBooleanAt(yamlRoot, 'metadata', 'openclaw', 'workspace', 'includeMemory')
      ?? true
  }
}

export function buildAgentSkillMarkdown(skill: BuildAgentSkillInput): string {
  const description = skill.description.trim() || `${skill.name} agent`
  const model = skill.model.trim() || 'openclaw:main'
  const root = skill.workspaceRoot.trim() || '.'
  const sessionLabel = skill.sessionLabel.trim() || skill.name
  const prompt = skill.systemPrompt.trim() || '# Instructions\n\nDescribe this agent behavior.'

  return `---
name: ${yamlQuoted(skill.name)}
description: ${yamlQuoted(description)}
metadata:
  openclaw:
    emoji: ${yamlQuoted(skill.emoji || '🤖')}
    model: ${yamlQuoted(model)}
    status: ${yamlQuoted(skill.status)}
    toolPermissions:
      file_read: ${skill.toolPermissions.file_read}
      file_write: ${skill.toolPermissions.file_write}
      command_run: ${skill.toolPermissions.command_run}
      clipboard_access: ${skill.toolPermissions.clipboard_access}
      browser_action: ${skill.toolPermissions.browser_action}
      send_messages: ${skill.toolPermissions.send_messages}
    workspace:
      root: ${yamlQuoted(root)}
      includeMemory: ${skill.includeMemory}
      sessionLabel: ${yamlQuoted(sessionLabel)}
---
${prompt}
`
}
