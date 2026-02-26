export function friendlySessionName(key: string): string {
  // agent:main:whatsapp:dm:+18434781963 → WhatsApp DM
  // agent:main:slack:channel:C123 → Slack Channel
  // agent:main:main → Main Session
  const parts = key.split(':')
  if (parts.length >= 4) {
    const channel = parts[2]
    const type = parts[3]
    const target = parts[4] || ''
    const channelName = channel.charAt(0).toUpperCase() + channel.slice(1)
    const typeName = type === 'dm' ? 'DM' : type.charAt(0).toUpperCase() + type.slice(1)
    return `${channelName} ${typeName}${target ? ' · ' + target.replace(/^\+/, '') : ''}`
  }
  if (key.endsWith(':main')) return 'Main Session'
  return key
}

export function getChannelEmoji(sessionKey: string): string {
  const parts = sessionKey.split(':')
  if (parts.length >= 3) {
    const channel = parts[2]
    switch (channel) {
      case 'whatsapp': return '🟢'
      case 'slack': return '💬'
      case 'imessage': return '📱'
      case 'main':
      default: return '🦞'
    }
  }
  return '🦞'
}

export function getChannelName(sessionKey: string): string {
  const parts = sessionKey.split(':')
  if (parts.length >= 3) {
    const channel = parts[2]
    switch (channel) {
      case 'whatsapp': return 'WhatsApp'
      case 'slack': return 'Slack'
      case 'imessage': return 'iMessage'
      case 'main':
      default: return 'Pinchr'
    }
  }
  return 'Pinchr'
}