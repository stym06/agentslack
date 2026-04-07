import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    agent: { findFirst: vi.fn(), findMany: vi.fn() },
  },
}))

vi.mock('@/lib/db', () => ({ db: mockDb }))

import { GET } from '@/app/api/internal/agent/[agentId]/list-agents/route'
import { NextRequest } from 'next/server'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/internal/agent/[agentId]/list-agents', () => {
  it('returns 404 when agent not found', async () => {
    mockDb.agent.findFirst.mockResolvedValue(null)

    const req = new NextRequest('http://localhost/api/internal/agent/agent-1/list-agents')
    const res = await GET(req, { params: Promise.resolve({ agentId: 'agent-1' }) })

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Agent not found' })
  })

  it('finds agent by id OR openclawId', async () => {
    mockDb.agent.findFirst.mockResolvedValue({ id: 'agent-1', workspaceId: 'ws-1' })
    mockDb.agent.findMany.mockResolvedValue([])

    const req = new NextRequest('http://localhost/api/internal/agent/oc-123/list-agents')
    await GET(req, { params: Promise.resolve({ agentId: 'oc-123' }) })

    expect(mockDb.agent.findFirst).toHaveBeenCalledWith({
      where: { OR: [{ id: 'oc-123' }, { openclawId: 'oc-123' }] },
      select: { id: true, workspaceId: true },
    })
  })

  it('returns other agents in the same workspace excluding self', async () => {
    mockDb.agent.findFirst.mockResolvedValue({ id: 'agent-1', workspaceId: 'ws-1' })
    const otherAgents = [
      { id: 'agent-2', openclawId: 'oc-2', name: 'Bot2', role: 'assistant', isAdmin: false, status: 'online' },
      { id: 'agent-3', openclawId: null, name: 'Bot3', role: 'developer', isAdmin: true, status: 'offline' },
    ]
    mockDb.agent.findMany.mockResolvedValue(otherAgents)

    const req = new NextRequest('http://localhost/api/internal/agent/agent-1/list-agents')
    const res = await GET(req, { params: Promise.resolve({ agentId: 'agent-1' }) })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ agents: otherAgents })

    expect(mockDb.agent.findMany).toHaveBeenCalledWith({
      where: {
        workspaceId: 'ws-1',
        id: { not: 'agent-1' },
      },
      select: {
        id: true,
        openclawId: true,
        name: true,
        role: true,
        isAdmin: true,
        status: true,
      },
    })
  })

  it('returns empty array when no other agents exist', async () => {
    mockDb.agent.findFirst.mockResolvedValue({ id: 'agent-1', workspaceId: 'ws-1' })
    mockDb.agent.findMany.mockResolvedValue([])

    const req = new NextRequest('http://localhost/api/internal/agent/agent-1/list-agents')
    const res = await GET(req, { params: Promise.resolve({ agentId: 'agent-1' }) })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ agents: [] })
  })
})
