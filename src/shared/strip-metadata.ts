/**
 * Strip OpenClaw envelope metadata from message content.
 *
 * Messages routed through OpenClaw channels (Slack, WhatsApp, etc.) arrive wrapped
 * in metadata blocks that are useful for the agent but should NOT be:
 * - Indexed by the topic router (produces garbage topics like #drew, #metadata, #json)
 * - Displayed to users in the chat UI
 *
 * This module provides a single `stripMessageMetadata()` function used by both
 * the main process (topic-router.ts) and the renderer (chatUtils.ts / MessageBubble).
 */

/**
 * Patterns to strip from message content, applied in order.
 *
 * Each pattern is designed to remove a specific type of OpenClaw envelope metadata
 * while preserving the actual user/assistant message content.
 */
const METADATA_PATTERNS: RegExp[] = [
  // "[Queued messages while agent was busy]" header and queue separators
  /\[Queued messages while agent was busy\]\s*/gi,
  // "---\nQueued #N\n" section headers (with optional trailing content before the actual message)
  /---\s*\nQueued #\d+\s*\n/gi,
  // Trailing "---" separators between queued messages
  /^---\s*$/gm,

  // Media attachment metadata lines
  /\[media attached:[^\]]*\]\s*/gi,
  // "To send an image back..." instruction lines (multi-line, greedy up to the closing period/newline)
  /To send an image back,.*?(?:Avoid absolute paths.*?\.)?\s*/gs,
  // "prefer the message tool..." instruction block (alternate phrasing of media instructions)
  /prefer the message tool.*?(?:Keep caption in the text body\.)\s*/gs,

  // System routing prefix: "System: [timestamp] Channel Type from Name:" (Slack DM, WhatsApp message, etc.)
  /System:\s*\[\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\s+\w{2,5}\]\s*(?:Slack|WhatsApp|Telegram|Signal|Discord|iMessage|Google Chat|IRC)\s+(?:DM|message|msg|group)\s+from\s+[^:\n]+:\s*/gi,
  // Broader System routing prefix: "System: [timestamp] <anything>:" — catches new channel types
  /^System:\s*\[\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\s+\w{2,5}\]\s+\S+.*?from\s+[^:\n]+:\s*/gm,

  // "Conversation info (untrusted metadata):" blocks with fenced JSON
  /Conversation info \(untrusted metadata\):\s*```json\s*\{[^}]*\}\s*```\s*/gs,
  // Same but without fenced code block (plain JSON)
  /Conversation info \(untrusted metadata\):\s*\{[^}]*\}\s*/gs,
  // Bare "Conversation info" label even without JSON block
  /Conversation info \(untrusted metadata\):\s*/gi,

  // Inbound context blocks (system-injected metadata)
  /```json\s*\{\s*"schema"\s*:\s*"openclaw\.inbound_meta[^}]*\}\s*```\s*/gs,

  // "[message_id: ...]" envelope tags
  /\[message_id:[^\]]*\]\s*/gi,

  // OpenClaw reply directives: [[reply_to_current]], [[reply_to:<id>]]
  /\[\[\s*reply_to_(?:current|\S+)\s*\]\]/g,

  // "Queued #N" prefix at line start (sometimes appears inline)
  /^Queued #\d+\s*/gm,
]

function normalizeDuplicateSegment(segment: string): string {
  return segment
    .replace(/[“”]/g, '"')
    .replace(/[’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[`"'([{]+/, '')
    .replace(/[`"')\]}]+$/, '')
    .replace(/[.!?,;:]+$/, '')
    .toLowerCase()
}

function areNearDuplicateSegments(a: string, b: string): boolean {
  const normalizedA = normalizeDuplicateSegment(a)
  const normalizedB = normalizeDuplicateSegment(b)
  if (!normalizedA || !normalizedB) return false
  if (normalizedA === normalizedB) return true

  const longer = normalizedA.length >= normalizedB.length ? normalizedA : normalizedB
  const shorter = normalizedA.length >= normalizedB.length ? normalizedB : normalizedA
  const lengthRatio = shorter.length / longer.length
  if (lengthRatio < 0.9) return false
  if (longer.includes(shorter)) return true

  const tokensA = normalizedA.split(' ').filter(Boolean)
  const tokensB = normalizedB.split(' ').filter(Boolean)
  if (tokensA.length === 0 || tokensB.length === 0) return false
  const setA = new Set(tokensA)
  const setB = new Set(tokensB)
  let overlap = 0
  for (const token of setA) {
    if (setB.has(token)) overlap += 1
  }

  return overlap / Math.max(setA.size, setB.size) >= 0.95
}

function deduplicateRepeatedBody(text: string): string {
  const trimmed = text.trim()
  if (!trimmed) return ''

  const paragraphSegments = trimmed.split(/\n\s*\n+/).map((segment) => segment.trim()).filter(Boolean)
  if (paragraphSegments.length >= 2) {
    const first = paragraphSegments[0]
    if (paragraphSegments.every((segment) => areNearDuplicateSegments(first, segment))) {
      return paragraphSegments.reduce((longest, segment) => (segment.length > longest.length ? segment : longest), first)
    }
  }

  const newlineMatches = [...trimmed.matchAll(/\n+/g)]
  for (const match of newlineMatches) {
    const splitIndex = match.index ?? -1
    if (splitIndex <= 0 || splitIndex >= trimmed.length - 1) continue

    const left = trimmed.slice(0, splitIndex).trim()
    const right = trimmed.slice(splitIndex + match[0].length).trim()
    if (!left || !right) continue

    if (areNearDuplicateSegments(left, right)) {
      return left.length >= right.length ? left : right
    }
  }

  return trimmed
}

/**
 * Strip all OpenClaw envelope metadata from a message string.
 *
 * Returns the cleaned user/assistant content with leading/trailing whitespace trimmed.
 * If the entire message was metadata (nothing left), returns an empty string.
 */
export function stripMessageMetadata(text: string): string {
  if (!text) return ''

  let cleaned = text
  for (const pattern of METADATA_PATTERNS) {
    // Reset lastIndex for stateful regexes (global flag)
    pattern.lastIndex = 0
    cleaned = cleaned.replace(pattern, '')
  }

  // Collapse multiple blank lines into at most two
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n')
  cleaned = deduplicateRepeatedBody(cleaned)

  return cleaned.trim()
}

/**
 * Extract just the channel name from a message's metadata, if present.
 * Returns null if no channel metadata is found.
 *
 * Useful for detecting which channel a message came from (for badge display)
 * even after stripping the metadata from the display content.
 */
export function extractChannelFromMetadata(text: string): string | null {
  if (!text) return null

  // Check for conversation_label or channel in JSON metadata
  const jsonMatch = text.match(/Conversation info \(untrusted metadata\):\s*```json\s*(\{[^}]*\})\s*```/s)
    ?? text.match(/Conversation info \(untrusted metadata\):\s*(\{[^}]*\})/s)

  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]) as Record<string, unknown>
      if (typeof parsed.channel === 'string') return parsed.channel
    } catch { /* ignore */ }
  }

  // Check for inbound_meta schema
  const inboundMatch = text.match(/"channel"\s*:\s*"([^"]+)"/)
  if (inboundMatch) return inboundMatch[1]

  return null
}
