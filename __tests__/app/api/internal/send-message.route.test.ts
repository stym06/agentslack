import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockDb, mockIO } = vi.hoisted(() => {
  const mockEmit = vi.fn()
  const mockTo = vi.fn(() => ({ emit: mockEmit }))
  return {
    mockDb: {
      agent: { findFirst: vi.fn(), update: vi.fn() },
      message: { create: vi.fn(), count: vi.fn(), update: vi.fn() },
      threadParticipant: { upsert: vi.fn() },
    },
    mockIO: { to: mockTo, emit: mockEmit, _toEmit: mockEmit, _to: mockTo },
  }
})

vi.mock('@/lib/db', () => ({ db: mockDb }))
vi.mock('@/server/socket-server', () => ({ getIO: () => mockIO }))

import { POST } from '@/app/api/internal/agent/[agentId]/send-message/route'
import { NextRequest } from 'next/server'

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/internal/agent/agent-1/send-message', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

const AGENT = { id: 'agent-1', name: 'TestBot', avatarUrl: 'https://img.png', openclawId: 'oc-1' }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('POST /api/internal/agent/[agentId]/send-message', () => {
  it('returns 400 when channelId is missing', async () => {
    const req = makeRequest({ content: 'hello' })
    const res = await POST(req, { params: Promise.resolve({ agentId: 'agent-1' }) })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'channelId and content required' })
  })

  it('returns 400 when content is missing', async () => {
    const req = makeRequest({ channelId: 'ch-1' })
    const res = await POST(req, { params: Promise.resolve({ agentId: 'agent-1' }) })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'channelId and content required' })
  })

  it('returns 404 when agent not found', async () => {
    mockDb.agent.findFirst.mockResolvedValue(null)

    const req = makeRequest({ channelId: 'ch-1', content: 'hello' })
    const res = await POST(req, { params: Promise.resolve({ agentId: 'agent-1' }) })
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Agent not found' })
  })

  it('finds agent by id OR openclawId', async () => {
    mockDb.agent.findFirst.mockResolvedValue(AGENT)
    mockDb.message.create.mockResolvedValue({ id: 'msg-1' })
    mockDb.agent.update.mockResolvedValue(AGENT)

    const req = makeRequest({ channelId: 'ch-1', content: 'hello' })
    await POST(req, { params: Promise.resolve({ agentId: 'oc-1' }) })

    expect(mockDb.agent.findFirst).toHaveBeenCalledWith({
      where: { OR: [{ id: 'oc-1' }, { openclawId: 'oc-1' }] },
    })
  })

  it('creates message and emits via socket', async () => {
    mockDb.agent.findFirst.mockResolvedValue(AGENT)
    const msg = { id: 'msg-1', channelId: 'ch-1', content: 'hello', senderType: 'agent', senderId: 'agent-1' }
    mockDb.message.create.mockResolvedValue(msg)
    mockDb.agent.update.mockResolvedValue(AGENT)

    const req = makeRequest({ channelId: 'ch-1', content: 'hello' })
    const res = await POST(req, { params: Promise.resolve({ agentId: 'agent-1' }) })

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toEqual({ success: true, message_id: 'msg-1' })

    expect(mockDb.message.create).toHaveBeenCalledWith({
      data: {
        channelId: 'ch-1',
        threadId: null,
        senderType: 'agent',
        senderId: 'agent-1',
        content: 'hello',
        metadata: { status: 'complete' },
      },
    })

    expect(mockIO.to).toHaveBeenCalledWith('channel:ch-1')
    expect(mockIO._toEmit).toHaveBeenCalledWith('message:new', expect.objectContaining({
      sender_name: 'TestBot',
      sender_avatar: 'https://img.png',
    }))
  })

  it('handles threadId: updates reply count and upserts threadParticipant', async () => {
    mockDb.agent.findFirst.mockResolvedValue(AGENT)
    const msg = { id: 'msg-2', channelId: 'ch-1', content: 'reply', threadId: 'thread-1' }
    mockDb.message.create.mockResolvedValue(msg)
    mockDb.message.count.mockResolvedValue(3)
    mockDb.message.update.mockResolvedValue({ id: 'thread-1', replyCount: 3 })
    mockDb.threadParticipant.upsert.mockResolvedValue({})
    mockDb.agent.update.mockResolvedValue(AGENT)

    const req = makeRequest({ channelId: 'ch-1', content: 'reply', threadId: 'thread-1' })
    const res = await POST(req, { params: Promise.resolve({ agentId: 'agent-1' }) })

    expect(res.status).toBe(200)

    expect(mockDb.message.count).toHaveBeenCalledWith({ where: { threadId: 'thread-1' } })
    expect(mockDb.message.update).toHaveBeenCalledWith({
      where: { id: 'thread-1' },
      data: { replyCount: 3 },
    })

    expect(mockIO._toEmit).toHaveBeenCalledWith('message:reply_count', {
      message_id: 'thread-1',
      reply_count: 3,
    })

    expect(mockDb.threadParticipant.upsert).toHaveBeenCalledWith({
      where: { threadId_agentId: { threadId: 'thread-1', agentId: 'agent-1' } },
      update: {},
      create: { threadId: 'thread-1', agentId: 'agent-1' },
    })
  })

  it('marks agent as online', async () => {
    mockDb.agent.findFirst.mockResolvedValue(AGENT)
    mockDb.message.create.mockResolvedValue({ id: 'msg-3' })
    mockDb.agent.update.mockResolvedValue(AGENT)

    const req = makeRequest({ channelId: 'ch-1', content: 'hi' })
    await POST(req, { params: Promise.resolve({ agentId: 'agent-1' }) })

    expect(mockDb.agent.update).toHaveBeenCalledWith({
      where: { id: 'agent-1' },
      data: { status: 'online' },
    })
    expect(mockIO.emit).toHaveBeenCalledWith('agent:status', { agent_id: 'agent-1', status: 'online' })
  })
})
