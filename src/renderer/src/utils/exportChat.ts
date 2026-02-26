import type { Message, MessageContentPart } from '../../../shared/types'

interface ExportableMessage {
  role: Message['role']
  content: string
  parts?: MessageContentPart[]
  timestamp?: string
  isThinking?: boolean
  toolName?: string
  toolResult?: string
}

interface ExportOptions {
  sessionKey: string
  sessionName?: string
}

function formatTimestamp(isoString?: string): string {
  if (!isoString) return ''
  const date = new Date(isoString)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString()
}

function roleLabel(role: Message['role']): string {
  switch (role) {
    case 'user':
      return 'You'
    case 'assistant':
      return 'Assistant'
    case 'system':
      return 'System'
    default:
      return String(role)
  }
}

function extractTextContent(message: ExportableMessage): string {
  if (Array.isArray(message.parts) && message.parts.length > 0) {
    return message.parts
      .filter((part): part is Extract<MessageContentPart, { type: 'text' }> => part.type === 'text')
      .map((part) => part.text)
      .join('\n')
  }
  return message.content || ''
}

function buildMetadataMarkdown(options: ExportOptions): string {
  const lines: string[] = []
  lines.push(`# Chat Export`)
  lines.push('')
  if (options.sessionName) {
    lines.push(`**Session:** ${options.sessionName}`)
  }
  lines.push(`**Session Key:** \`${options.sessionKey}\``)
  lines.push(`**Exported:** ${new Date().toLocaleString()}`)
  lines.push('')
  lines.push('---')
  lines.push('')
  return lines.join('\n')
}

function buildMetadataText(options: ExportOptions): string {
  const lines: string[] = []
  lines.push('Chat Export')
  lines.push('='.repeat(40))
  if (options.sessionName) {
    lines.push(`Session: ${options.sessionName}`)
  }
  lines.push(`Session Key: ${options.sessionKey}`)
  lines.push(`Exported: ${new Date().toLocaleString()}`)
  lines.push('')
  lines.push('-'.repeat(40))
  lines.push('')
  return lines.join('\n')
}

export function formatAsMarkdown(messages: ExportableMessage[], options: ExportOptions): string {
  const parts: string[] = [buildMetadataMarkdown(options)]

  for (const message of messages) {
    const timestamp = formatTimestamp(message.timestamp)
    const label = roleLabel(message.role)
    const timeStr = timestamp ? ` *(${timestamp})*` : ''

    // Thinking/reasoning blocks
    if (message.isThinking) {
      parts.push(`### 💭 ${label} (thinking)${timeStr}`)
      parts.push('')
      const text = extractTextContent(message)
      if (text) {
        parts.push(
          text
            .split('\n')
            .map((line) => `> ${line}`)
            .join('\n')
        )
        parts.push('')
      }
      continue
    }

    // Tool calls
    if (message.toolName) {
      parts.push(`### 🔧 Tool: \`${message.toolName}\`${timeStr}`)
      parts.push('')
      parts.push('<details>')
      parts.push(`<summary>Tool call: ${message.toolName}</summary>`)
      parts.push('')
      const text = extractTextContent(message)
      if (text) {
        parts.push('```')
        parts.push(text)
        parts.push('```')
      }
      if (message.toolResult) {
        parts.push('')
        parts.push('**Result:**')
        parts.push('```')
        parts.push(message.toolResult)
        parts.push('```')
      }
      parts.push('')
      parts.push('</details>')
      parts.push('')
      continue
    }

    // Regular messages
    const roleEmoji = message.role === 'user' ? '👤' : message.role === 'assistant' ? '🤖' : '⚙️'
    parts.push(`### ${roleEmoji} ${label}${timeStr}`)
    parts.push('')

    const text = extractTextContent(message)
    if (text) {
      parts.push(text)
      parts.push('')
    }
  }

  return parts.join('\n').trimEnd() + '\n'
}

export function formatAsText(messages: ExportableMessage[], options: ExportOptions): string {
  const parts: string[] = [buildMetadataText(options)]

  for (const message of messages) {
    const timestamp = formatTimestamp(message.timestamp)
    const label = roleLabel(message.role)
    const timeStr = timestamp ? ` (${timestamp})` : ''

    // Thinking/reasoning blocks
    if (message.isThinking) {
      parts.push(`[${label} - thinking]${timeStr}`)
      const text = extractTextContent(message)
      if (text) {
        parts.push(
          text
            .split('\n')
            .map((line) => `  | ${line}`)
            .join('\n')
        )
      }
      parts.push('')
      continue
    }

    // Tool calls
    if (message.toolName) {
      parts.push(`[Tool: ${message.toolName}]${timeStr}`)
      const text = extractTextContent(message)
      if (text) {
        parts.push(`  ${text.split('\n').join('\n  ')}`)
      }
      if (message.toolResult) {
        parts.push(`  Result: ${message.toolResult.split('\n').join('\n  ')}`)
      }
      parts.push('')
      continue
    }

    // Regular messages
    parts.push(`[${label}]${timeStr}`)
    const text = extractTextContent(message)
    if (text) {
      parts.push(text)
    }
    parts.push('')
  }

  return parts.join('\n').trimEnd() + '\n'
}
