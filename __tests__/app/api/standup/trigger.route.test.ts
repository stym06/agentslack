import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockDb, mockIO, mockDaemon } = vi.hoisted(() => ({
  mockDb: {
    channel: { findFirst: vi.fn() },
    agent: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    message: { create: vi.fn() },
  },
  mockIO: {
    to: vi.fn().mockReturnThis(),
    emit: vi.fn(),
  },
  mockDaemon: {
    deliverMessage: vi.fn(),
  },
}))

vi.mock('@/lib/db', () => ({ db: mockDb }))
vi.mock('@/server/socket-server', () => ({ getIO: () => mockIO }))
vi.mock('@/server/agent-daemon', () => ({ getAgentDaemon: () => mockDaemon }))

import { POST } from '@/app/api/standup/trigger/route'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('POST /api/standup/trigger', () => {
  it('returns 404 when standup channel not found', async () => {
    mockDb.channel.findFirst.mockResolvedValue(null)

    const res = await POST()

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Standup channel not found' })
  })

  it('returns 404 when admin bot not found', async () => {
    mockDb.channel.findFirst.mockResolvedValue({ id: 'ch-standup', workspaceId: 'ws-1' })
    mockDb.agent.findFirst.mockResolvedValue(null)

    const res = await POST()

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'AdminBot not found' })
  })

  it('creates opening message and emits it', async () => {
    const standupChannel = { id: 'ch-standup', workspaceId: 'ws-1' }
    const adminBot = { id: 'admin-1', name: 'AdminBot', avatarUrl: 'http://avatar.png', isAdmin: true }
    const openingMsg = {
      id: 'msg-1',
      channelId: 'ch-standup',
      senderType: 'agent',
      senderId: 'admin-1',
      content: 'Good morning team! Time for daily standup.',
    }

    mockDb.channel.findFirst.mockResolvedValue(standupChannel)
    mockDb.agent.findFirst.mockResolvedValue(adminBot)
    mockDb.message.create.mockResolvedValue(openingMsg)
    mockDb.agent.findMany.mockResolvedValue([])

    const res = await POST()

    expect(res.status).toBe(200)
    expect(mockDb.message.create).toHaveBeenCalledWith({
      data: {
        channelId: 'ch-standup',
        senderType: 'agent',
        senderId: 'admin-1',
        content: 'Good morning team! Time for daily standup.',
      },
    })
    expect(mockIO.to).toHaveBeenCalledWith('channel:ch-standup')
    expect(mockIO.emit).toHaveBeenCalledWith('message:new', {
      ...openingMsg,
      sender_name: 'AdminBot',
      sender_avatar: 'http://avatar.png',
    })
  })

  it('delivers standup prompt to each non-admin agent', async () => {
    const standupChannel = { id: 'ch-standup', workspaceId: 'ws-1' }
    const adminBot = { id: 'admin-1', name: 'AdminBot', avatarUrl: null, isAdmin: true }
    const agents = [
      { id: 'a-1', name: 'Agent1' },
      { id: 'a-2', name: 'Agent2' },
    ]

    mockDb.channel.findFirst.mockResolvedValue(standupChannel)
    mockDb.agent.findFirst.mockResolvedValue(adminBot)
    mockDb.message.create.mockResolvedValue({ id: 'msg-1' })
    mockDb.agent.findMany.mockResolvedValue(agents)
    mockDb.agent.update.mockResolvedValue({})

    const res = await POST()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({
      success: true,
      message: 'Standup prompts delivered to agents',
      agentCount: 2,
    })

    // Each agent should be set to busy
    expect(mockDb.agent.update).toHaveBeenCalledTimes(2)
    expect(mockDb.agent.update).toHaveBeenCalledWith({
      where: { id: 'a-1' },
      data: { status: 'busy' },
    })
    expect(mockDb.agent.update).toHaveBeenCalledWith({
      where: { id: 'a-2' },
      data: { status: 'busy' },
    })

    // Each agent should get a status emit
    expect(mockIO.emit).toHaveBeenCalledWith('agent:status', { agent_id: 'a-1', status: 'busy' })
    expect(mockIO.emit).toHaveBeenCalledWith('agent:status', { agent_id: 'a-2', status: 'busy' })

    // Each agent should receive the standup prompt via daemon
    expect(mockDaemon.deliverMessage).toHaveBeenCalledTimes(2)
    expect(mockDaemon.deliverMessage).toHaveBeenCalledWith('a-1', {
      channelId: 'ch-standup',
      senderName: 'AdminBot',
      content: expect.stringContaining('daily standup time'),
    })
    expect(mockDaemon.deliverMessage).toHaveBeenCalledWith('a-2', {
      channelId: 'ch-standup',
      senderName: 'AdminBot',
      content: expect.stringContaining('daily standup time'),
    })
  })

  it('queries non-admin agents in the standup workspace', async () => {
    mockDb.channel.findFirst.mockResolvedValue({ id: 'ch-standup', workspaceId: 'ws-1' })
    mockDb.agent.findFirst.mockResolvedValue({ id: 'admin-1', name: 'AdminBot', avatarUrl: null })
    mockDb.message.create.mockResolvedValue({ id: 'msg-1' })
    mockDb.agent.findMany.mockResolvedValue([])

    await POST()

    expect(mockDb.agent.findMany).toHaveBeenCalledWith({
      where: {
        workspaceId: 'ws-1',
        isAdmin: false,
      },
    })
  })

  it('returns 500 on unexpected error', async () => {
    mockDb.channel.findFirst.mockRejectedValue(new Error('DB down'))

    const res = await POST()

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'Internal server error' })
  })
})
