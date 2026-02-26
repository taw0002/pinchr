import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { routeMessageToTopicSession } from './topic-router'

type HistoryMessage = { role: string; content: string }

function createWorkspace(): { workspacePath: string; cleanup: () => void } {
  const workspacePath = mkdtempSync(join(tmpdir(), 'topic-router-'))
  return {
    workspacePath,
    cleanup: () => rmSync(workspacePath, { recursive: true, force: true })
  }
}

function readTopicDoc(workspacePath: string): { topics: Array<{ id: string; label: string; sessionKey: string }> } {
  const filePath = join(workspacePath, 'topic-sessions.json')
  const parsed = JSON.parse(readFileSync(filePath, 'utf-8')) as { topics: Array<{ id: string; label: string; sessionKey: string }> }
  return parsed
}

test('routes follow-up messages into the same topic session', async () => {
  const { workspacePath, cleanup } = createWorkspace()

  const mainSessionKey = 'agent:main:test-session'
  const topicSessionKey = 'agent:sub:topic-1'
  const topicHistory: HistoryMessage[] = []
  let spawnCalls = 0

  const invokeTool = async (tool: string, args?: Record<string, unknown>): Promise<unknown> => {
    if (tool === 'sessions_history') {
      const sessionKey = String(args?.sessionKey || '')
      if (sessionKey === mainSessionKey) {
        return { messages: [] }
      }
      if (sessionKey === topicSessionKey) {
        return { messages: topicHistory }
      }
      return { messages: [] }
    }

    if (tool === 'sessions_spawn') {
      spawnCalls += 1
      return { sessionKey: topicSessionKey }
    }

    if (tool === 'sessions_send') {
      const sessionKey = String(args?.sessionKey || '')
      const message = String(args?.message || '')
      if (sessionKey !== topicSessionKey) {
        throw new Error(`Unexpected session key: ${sessionKey}`)
      }

      const response = `Topic response: ${message}`
      topicHistory.push({ role: 'user', content: message })
      topicHistory.push({ role: 'assistant', content: response })
      return { text: response }
    }

    throw new Error(`Unexpected tool: ${tool}`)
  }

  try {
    const first = await routeMessageToTopicSession({
      workspacePath,
      mainSessionKey,
      message: 'Fix sidebar button alignment in settings page',
      invokeTool
    })

    const second = await routeMessageToTopicSession({
      workspacePath,
      mainSessionKey,
      message: 'Sidebar button alignment still broken on mobile',
      invokeTool
    })

    assert.equal(first.route.created, true)
    assert.equal(second.route.created, false)
    assert.equal(second.route.sessionKey, first.route.sessionKey)
    assert.equal(spawnCalls, 1)

    const doc = readTopicDoc(workspacePath)
    assert.equal(doc.topics.length, 1)
  } finally {
    cleanup()
  }
})

test('archives stale topics before routing and records lifecycle actions', async () => {
  const { workspacePath, cleanup } = createWorkspace()

  const mainSessionKey = 'agent:main:test-session'
  const staleTopicId = 'stale-billing-topic'
  const staleDate = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString()
  const freshDate = new Date().toISOString()

  writeFileSync(
    join(workspacePath, 'topic-sessions.json'),
    JSON.stringify(
      {
        version: 1,
        updatedAt: freshDate,
        topics: [
          {
            id: staleTopicId,
            label: 'Old Billing Issue',
            sessionKey: 'agent:sub:old-billing',
            mainSessionKey,
            keywords: ['billing', 'invoice', 'old'],
            createdAt: staleDate,
            lastActive: staleDate,
            messageCount: 10,
            approxChars: 9000,
            summary: 'Legacy billing context summary.'
          },
          {
            id: 'fresh-topic',
            label: 'Fresh Product Topic',
            sessionKey: 'agent:sub:fresh',
            mainSessionKey,
            keywords: ['product', 'roadmap', 'fresh'],
            createdAt: freshDate,
            lastActive: freshDate,
            messageCount: 2,
            approxChars: 1200
          }
        ]
      },
      null,
      2
    )
  )

  const spawnedSessionKey = 'agent:sub:new-topic'
  const invokeTool = async (tool: string, args?: Record<string, unknown>): Promise<unknown> => {
    if (tool === 'sessions_history') {
      return { messages: [] }
    }

    if (tool === 'sessions_spawn') {
      return { sessionKey: spawnedSessionKey }
    }

    if (tool === 'sessions_send') {
      if (String(args?.sessionKey || '') === spawnedSessionKey) {
        return { text: 'Routed result from new topic session' }
      }
      return { text: 'Existing topic response' }
    }

    throw new Error(`Unexpected tool: ${tool}`)
  }

  try {
    const result = await routeMessageToTopicSession({
      workspacePath,
      mainSessionKey,
      message: 'Need a deep dive into invoices and refunds',
      invokeTool
    })

    assert.notEqual(result.route.topicId, staleTopicId)
    assert.equal(
      result.envelope.next_actions.some((action) => action.includes('Archived inactive topic "Old Billing Issue"')),
      true
    )

    const doc = readTopicDoc(workspacePath)
    assert.equal(doc.topics.some((topic) => topic.id === staleTopicId), false)

    const archivePath = join(workspacePath, 'memory', 'topics', 'archive', `${staleTopicId}.md`)
    assert.equal(existsSync(archivePath), true)
  } finally {
    cleanup()
  }
})

test('embeds inbound routing context metadata in routed messages and envelope', async () => {
  const { workspacePath, cleanup } = createWorkspace()
  const mainSessionKey = 'agent:main:slack:dm:C12345'
  const topicSessionKey = 'agent:sub:topic-slack'
  let capturedMessage = ''

  const invokeTool = async (tool: string, args?: Record<string, unknown>): Promise<unknown> => {
    if (tool === 'sessions_history') return { messages: [] }
    if (tool === 'sessions_spawn') return { sessionKey: topicSessionKey }
    if (tool === 'sessions_send') {
      capturedMessage = String(args?.message || '')
      return { text: 'Slack reply' }
    }
    throw new Error(`Unexpected tool: ${tool}`)
  }

  try {
    const result = await routeMessageToTopicSession({
      workspacePath,
      mainSessionKey,
      message: 'Can you summarize this thread?',
      invokeTool,
      inboundContext: {
        channel: 'slack',
        requestId: 'req-123',
        threadId: 'thread-abc',
        sourceSessionKey: mainSessionKey,
        sourceMessageId: 'msg-789',
        sourceFingerprint: 'fingerprint-xyz'
      }
    })

    assert.equal(capturedMessage.includes('"channel": "slack"'), true)
    assert.equal(capturedMessage.includes('"request_id": "req-123"'), true)
    assert.equal(capturedMessage.includes('"thread_id": "thread-abc"'), true)
    assert.equal(capturedMessage.includes('"source_session_key": "agent:main:slack:dm:C12345"'), true)
    assert.equal(capturedMessage.includes('"source_message_id": "msg-789"'), true)
    assert.equal(capturedMessage.includes('"source_fingerprint": "fingerprint-xyz"'), true)

    assert.equal(result.envelope.channel, 'slack')
    assert.equal(result.envelope.request_id, 'req-123')
    assert.equal(result.envelope.thread_id, 'thread-abc')
    assert.equal(result.envelope.source_session_key, mainSessionKey)
    assert.equal(result.envelope.source_message_id, 'msg-789')
    assert.equal(result.envelope.source_fingerprint, 'fingerprint-xyz')
  } finally {
    cleanup()
  }
})
