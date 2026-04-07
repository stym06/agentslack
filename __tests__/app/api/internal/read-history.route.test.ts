import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    agent: { findFirst: vi.fn(), findMany: vi.fn() },
    message: { findMany: vi.fn() },
    user: { findMany: vi.fn() },
  },
}))

vi.mock('@/lib/db', () => ({ db: mockDb }))

import { GET } from '@/app/api/internal/agent/[agentId]/read-history/route'
import { NextRequest } from 'next/server'

function makeRequest(query: Record<string, string>) {
  const url = new URL('http://localhost/api/internal/agent/agent-1/read-history')
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v)
  return new NextRequest(url)
}

const AGENT = { id: 'agent-1', name: 'TestBot' }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/internal/agent/[agentId]/read-history', () => {
  it('returns 400 when channelId is missing', async () => {
    const req = makeRequest({})
    const res = await GET(req, { params: Promise.resolve({ agentId: 'agent-1' }) })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'channelId required' })
  })

  it('returns 404 when agent not found', async () => {
    mockDb.agent.findFirst.mockResolvedValue(null)

    const req = makeRequest({ channelId: 'ch-1' })
    const res = await GET(req, { params: Promise.resolve({ agentId: 'agent-1' }) })
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Agent not found' })
  })

  it('queries top-level messages when no threadId', async () => {
    mockDb.agent.findFirst.mockResolvedValue(AGENT)
    mockDb.message.findMany.mockResolvedValue([])
    mockDb.agent.findMany.mockResolvedValue([])
    mockDb.user.findMany.mockResolvedValue([])

    const req = makeRequest({ channelId: 'ch-1' })
    await GET(req, { params: Promise.resolve({ agentId: 'agent-1' }) })

    expect(mockDb.message.findMany).toHaveBeenCalledWith({
      where: { channelId: 'ch-1', threadId: null },
      orderBy: { createdAt: 'desc' },
      take: 20,
    })
  })

  it('queries thread messages when threadId provided', async () => {
    mockDb.agent.findFirst.mockResolvedValue(AGENT)
    mockDb.message.findMany.mockResolvedValue([])
    mockDb.agent.findMany.mockResolvedValue([])
    mockDb.user.findMany.mockResolvedValue([])

    const req = makeRequest({ channelId: 'ch-1', threadId: 'thread-1' })
    await GET(req, { params: Promise.resolve({ agentId: 'agent-1' }) })

    expect(mockDb.message.findMany).toHaveBeenCalledWith({
      where: { threadId: 'thread-1' },
      orderBy: { createdAt: 'desc' },
      take: 20,
    })
  })

  it('resolves sender names from agents and users', async () => {
    mockDb.agent.findFirst.mockResolvedValue(AGENT)
    const now = new Date()
    mockDb.message.findMany.mockResolvedValue([
      { id: 'm1', senderType: 'agent', senderId: 'a1', content: 'hi', createdAt: now, threadId: null, replyCount: 0 },
      { id: 'm2', senderType: 'user', senderId: 'u1', content: 'hey', createdAt: now, threadId: null, replyCount: 0 },
    ])
    mockDb.agent.findMany.mockResolvedValue([{ id: 'a1', name: 'Bot1' }])
    mockDb.user.findMany.mockResolvedValue([{ id: 'u1', name: 'Alice' }])

    const req = makeRequest({ channelId: 'ch-1' })
    const res = await GET(req, { params: Promise.resolve({ agentId: 'agent-1' }) })

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.messages).toHaveLength(2)
    // Messages are ordered desc then reversed → original insertion order
    // Both have the same createdAt so the reverse preserves mock order
    const senders = json.messages.map((m: any) => m.sender)
    expect(senders).toContain('Bot1')
    expect(senders).toContain('Alice')
  })

  it('returns formatted messages with expected fields', async () => {
    mockDb.agent.findFirst.mockResolvedValue(AGENT)
    const now = new Date('2025-01-01T00:00:00Z')
    mockDb.message.findMany.mockResolvedValue([
      { id: 'm1', senderType: 'agent', senderId: 'a1', content: 'hello', createdAt: now, threadId: null, replyCount: 2 },
    ])
    mockDb.agent.findMany.mockResolvedValue([{ id: 'a1', name: 'Bot1' }])
    mockDb.user.findMany.mockResolvedValue([])

    const req = makeRequest({ channelId: 'ch-1' })
    const res = await GET(req, { params: Promise.resolve({ agentId: 'agent-1' }) })
    const json = await res.json()

    expect(json.messages[0]).toEqual({
      id: 'm1',
      sender: 'Bot1',
      senderType: 'agent',
      content: 'hello',
      timestamp: now.toISOString(),
      threadId: null,
      replyCount: 2,
    })
  })

  it('uses custom limit', async () => {
    mockDb.agent.findFirst.mockResolvedValue(AGENT)
    mockDb.message.findMany.mockResolvedValue([])
    mockDb.agent.findMany.mockResolvedValue([])
    mockDb.user.findMany.mockResolvedValue([])

    const req = makeRequest({ channelId: 'ch-1', limit: '5' })
    await GET(req, { params: Promise.resolve({ agentId: 'agent-1' }) })

    expect(mockDb.message.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 5 }),
    )
  })

  it('falls back to default names for unknown senders', async () => {
    mockDb.agent.findFirst.mockResolvedValue(AGENT)
    const now = new Date()
    mockDb.message.findMany.mockResolvedValue([
      { id: 'm1', senderType: 'agent', senderId: 'unknown-a', content: 'x', createdAt: now, threadId: null, replyCount: 0 },
      { id: 'm2', senderType: 'user', senderId: 'unknown-u', content: 'y', createdAt: now, threadId: null, replyCount: 0 },
    ])
    mockDb.agent.findMany.mockResolvedValue([])
    mockDb.user.findMany.mockResolvedValue([])

    const req = makeRequest({ channelId: 'ch-1' })
    const res = await GET(req, { params: Promise.resolve({ agentId: 'agent-1' }) })
    const json = await res.json()

    const senders = json.messages.map((m: any) => m.sender)
    expect(senders).toContain('Agent')
    expect(senders).toContain('User')
  })
})
