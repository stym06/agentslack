import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    agent: { findFirst: vi.fn() },
    message: { findMany: vi.fn() },
    user: { findMany: vi.fn() },
  },
}))

vi.mock('@/lib/db', () => ({ db: mockDb }))

// We need to import fresh each time because of the in-memory lastCheckMap
let GET: typeof import('@/app/api/internal/agent/[agentId]/check-messages/route').GET

beforeEach(async () => {
  vi.clearAllMocks()
  // Reset module to get fresh lastCheckMap
  vi.resetModules()
  vi.doMock('@/lib/db', () => ({ db: mockDb }))
  const mod = await import('@/app/api/internal/agent/[agentId]/check-messages/route')
  GET = mod.GET
})

const PARAMS = { params: Promise.resolve({ agentId: 'agent-1' }) }

describe('GET /api/internal/agent/[agentId]/check-messages', () => {
  it('returns 404 if agent not found', async () => {
    mockDb.agent.findFirst.mockResolvedValue(null)
    const req = new NextRequest('http://localhost/api/internal/agent/agent-1/check-messages')
    const res = await GET(req, PARAMS)
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Agent not found' })
  })

  it('returns empty messages if agent has no channels', async () => {
    mockDb.agent.findFirst.mockResolvedValue({
      id: 'agent-1',
      channelAgents: [],
    })
    const req = new NextRequest('http://localhost/api/internal/agent/agent-1/check-messages')
    const res = await GET(req, PARAMS)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ messages: [] })
  })

  it('returns new messages since last check', async () => {
    const now = new Date()
    mockDb.agent.findFirst.mockResolvedValue({
      id: 'agent-1',
      channelAgents: [{ channelId: 'ch-1' }, { channelId: 'ch-2' }],
    })
    mockDb.message.findMany.mockResolvedValue([
      {
        id: 'msg-1', channelId: 'ch-1', threadId: null, senderId: 'user-1',
        content: 'hello', createdAt: now, senderType: 'user',
      },
    ])
    mockDb.user.findMany.mockResolvedValue([{ id: 'user-1', name: 'Alice' }])

    const req = new NextRequest('http://localhost/api/internal/agent/agent-1/check-messages')
    const res = await GET(req, PARAMS)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.messages).toHaveLength(1)
    expect(body.messages[0].sender).toBe('Alice')
    expect(body.messages[0].content).toBe('hello')
    expect(body.messages[0].channelId).toBe('ch-1')
  })

  it('second call returns empty if no new messages (lastCheckMap updated)', async () => {
    mockDb.agent.findFirst.mockResolvedValue({
      id: 'agent-1',
      channelAgents: [{ channelId: 'ch-1' }],
    })
    // First call: one message
    mockDb.message.findMany.mockResolvedValue([
      {
        id: 'msg-1', channelId: 'ch-1', threadId: null, senderId: 'user-1',
        content: 'hello', createdAt: new Date(), senderType: 'user',
      },
    ])
    mockDb.user.findMany.mockResolvedValue([{ id: 'user-1', name: 'Alice' }])

    const req1 = new NextRequest('http://localhost/api/internal/agent/agent-1/check-messages')
    await GET(req1, PARAMS)

    // Second call: no new messages
    mockDb.message.findMany.mockResolvedValue([])
    mockDb.user.findMany.mockResolvedValue([])

    const req2 = new NextRequest('http://localhost/api/internal/agent/agent-1/check-messages')
    const res2 = await GET(req2, PARAMS)

    expect(res2.status).toBe(200)
    const body = await res2.json()
    expect(body.messages).toHaveLength(0)

    // Verify the second findMany was called with a gt date that's recent (not epoch)
    const secondCall = mockDb.message.findMany.mock.calls[1]
    const gtDate = secondCall[0].where.createdAt.gt
    // The gt date should be after epoch (0) because lastCheckMap was set
    expect(gtDate.getTime()).toBeGreaterThan(0)
  })

  it('returns 500 on error', async () => {
    mockDb.agent.findFirst.mockRejectedValue(new Error('DB fail'))
    const req = new NextRequest('http://localhost/api/internal/agent/agent-1/check-messages')
    const res = await GET(req, PARAMS)
    expect(res.status).toBe(500)
  })

  it('uses fallback sender name when user not found', async () => {
    mockDb.agent.findFirst.mockResolvedValue({
      id: 'agent-1',
      channelAgents: [{ channelId: 'ch-1' }],
    })
    mockDb.message.findMany.mockResolvedValue([
      {
        id: 'msg-1', channelId: 'ch-1', threadId: null, senderId: 'unknown-user',
        content: 'hi', createdAt: new Date(), senderType: 'user',
      },
    ])
    mockDb.user.findMany.mockResolvedValue([])

    const req = new NextRequest('http://localhost/api/internal/agent/agent-1/check-messages')
    const res = await GET(req, PARAMS)
    const body = await res.json()
    expect(body.messages[0].sender).toBe('User')
  })
})
