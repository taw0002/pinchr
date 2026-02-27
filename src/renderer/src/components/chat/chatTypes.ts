import type { Message } from '../../../../shared/types'

export interface ComposerImage {
  id: string
  name: string
  dataUrl: string
}

export interface ToolCallBlock {
  id: string
  name: string
  status: 'running' | 'completed'
  result?: string
}

export interface SubAgentEvent {
  id: string
  description: string
  status: 'running' | 'completed'
  summary?: string
  sessionKey?: string
}

export type DisplayMessage = Message & {
  sessionKey?: string
  localId?: string
  isQueued?: boolean
  _optimistic?: boolean
  _optimisticId?: string
  _optimisticState?: 'queued' | 'sending' | 'thinking' | 'pending' | 'failed'
  thinkingContent?: string
  metadata?: Record<string, unknown>
  toolCalls?: ToolCallBlock[]
  subAgentEvents?: SubAgentEvent[]
  routeInfo?: {
    topicId: string
    topicLabel: string
    sessionKey: string
    created: boolean
    confidence: number
  }
}
