import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildAgentSkillMarkdown,
  parseAgentSkillContent,
  type BuildAgentSkillInput
} from './agent-skill'

test('agent skill metadata.openclaw round-trip preserves key fields', () => {
  const input: BuildAgentSkillInput = {
    name: 'research-agent',
    description: 'Researches topics. Use when user asks for research or source comparison.',
    emoji: '🔍',
    model: 'anthropic/claude-opus-4-6',
    status: 'active',
    systemPrompt: '# Instructions\n\n1. Search\n2. Synthesize',
    toolPermissions: {
      file_read: true,
      file_write: true,
      command_run: false,
      clipboard_access: false,
      browser_action: true,
      send_messages: false
    },
    workspaceRoot: '.',
    sessionLabel: 'research-topic',
    includeMemory: true
  }

  const markdown = buildAgentSkillMarkdown(input)
  const parsed = parseAgentSkillContent(markdown, 'fallback')

  assert.equal(parsed.name, input.name)
  assert.equal(parsed.description, input.description)
  assert.equal(parsed.emoji, input.emoji)
  assert.equal(parsed.model, input.model)
  assert.equal(parsed.status, input.status)
  assert.equal(parsed.workspaceRoot, input.workspaceRoot)
  assert.equal(parsed.sessionLabel, input.sessionLabel)
  assert.equal(parsed.includeMemory, input.includeMemory)
  assert.deepEqual(parsed.toolPermissions, input.toolPermissions)
})

test('parser supports legacy top-level fields and metadata.openclaw fields', () => {
  const skill = `---
name: "legacy-agent"
description: "Legacy parser compatibility. Use when editing old skills."
emoji: "🧪"
model: "openai/gpt-5.2"
status: "disabled"
file_read: true
file_write: false
command_run: true
clipboard_access: true
browser_action: false
send_messages: false
root: "workspace/ops"
includeMemory: false
sessionLabel: "legacy-label"
---
# Instructions

Test legacy fields.
`

  const parsed = parseAgentSkillContent(skill, 'fallback')
  assert.equal(parsed.name, 'legacy-agent')
  assert.equal(parsed.emoji, '🧪')
  assert.equal(parsed.model, 'openai/gpt-5.2')
  assert.equal(parsed.status, 'disabled')
  assert.equal(parsed.workspaceRoot, 'workspace/ops')
  assert.equal(parsed.includeMemory, false)
  assert.equal(parsed.sessionLabel, 'legacy-label')
  assert.equal(parsed.toolPermissions.command_run, true)
  assert.equal(parsed.toolPermissions.file_write, false)
})
