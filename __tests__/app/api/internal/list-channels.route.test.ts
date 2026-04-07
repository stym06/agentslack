import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    agent: { findFirst: vi.fn() },
  },
}))

vi.mock('@/lib/db', () => ({ db: mockDb }))

import { GET } from '@/app/api/internal/agent/[agentId]/list-channels/route'
import { NextRequest } from 'next/server'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/internal/agent/[agentId]/list-channels', () => {
  it('returns 404 when agent not found', async () => {
    mockDb.agent.findFirst.mockResolvedValue(null)

    const req = new NextRequest('http://localhost/api/internal/agent/agent-1/list-channels')
    const res = await GET(req, { params: Promise.resolve({ agentId: 'agent-1' }) })

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Agent not found' })
  })

  it('finds agent with channelAgents include', async () => {
    mockDb.agent.findFirst.mockResolvedValue({
      id: 'agent-1',
      channelAgents: [],
    })

    const req = new NextRequest('http://localhost/api/internal/agent/agent-1/list-channels')
    await GET(req, { params: Promise.resolve({ agentId: 'agent-1' }) })

    expect(mockDb.agent.findFirst).toHaveBeenCalledWith({
      where: { OR: [{ id: 'agent-1' }, { openclawId: 'agent-1' }] },
      include: {
        channelAgents: {
          include: {
            channel: {
              select: { id: true, name: true, description: true, channelType: true },
            },
          },
        },
      },
    })
  })

  it('returns channels from channelAgents', async () => {
    const channels = [
      { id: 'ch-1', name: 'general', description: 'General channel', channelType: 'text' },
      { id: 'ch-2', name: 'dev', description: null, channelType: 'text' },
    ]
    mockDb.agent.findFirst.mockResolvedValue({
      id: 'agent-1',
      channelAgents: channels.map((ch) => ({ channel: ch })),
    })

    const req = new NextRequest('http://localhost/api/internal/agent/agent-1/list-channels')
    const res = await GET(req, { params: Promise.resolve({ agentId: 'agent-1' }) })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ channels })
  })

  it('returns empty channels array when agent has no channels', async () => {
    mockDb.agent.findFirst.mockResolvedValue({
      id: 'agent-1',
      channelAgents: [],
    })

    const req = new NextRequest('http://localhost/api/internal/agent/agent-1/list-channels')
    const res = await GET(req, { params: Promise.resolve({ agentId: 'agent-1' }) })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ channels: [] })
  })
})
