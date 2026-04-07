import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockGetServerSession, mockDb, mockDaemon } = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  mockDb: {
    workspace: { findFirst: vi.fn() },
    agent: { findFirst: vi.fn(), update: vi.fn() },
  },
  mockDaemon: {
    startAgent: vi.fn(),
    isRunning: vi.fn(),
    isReady: vi.fn(),
  },
}))

vi.mock('next-auth', () => ({ getServerSession: mockGetServerSession }))
vi.mock('@/lib/auth/config', () => ({ authOptions: {} }))
vi.mock('@/lib/db', () => ({ db: mockDb }))
vi.mock('@/server/agent-daemon', () => ({ getAgentDaemon: () => mockDaemon }))

import { GET, PUT } from '@/app/api/agents/[agentId]/route'
import { NextRequest } from 'next/server'

const MOCK_SESSION = {
  user: { id: 'user-1', email: 'test@test.com', name: 'TestUser' },
  expires: '2099-01-01',
}

const makeParams = (agentId: string) => ({ params: Promise.resolve({ agentId }) })

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/agents/[agentId]', () => {
  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValue(null)

    const req = new NextRequest('http://localhost/api/agents/a-1')
    const res = await GET(req, makeParams('a-1'))

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Unauthorized' })
  })

  it('returns 404 when workspace not found', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    mockDb.workspace.findFirst.mockResolvedValue(null)

    const req = new NextRequest('http://localhost/api/agents/a-1')
    const res = await GET(req, makeParams('a-1'))

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Workspace not found' })
  })

  it('returns 404 when agent not found', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    mockDb.workspace.findFirst.mockResolvedValue({ id: 'ws-1', userId: 'user-1' })
    mockDb.agent.findFirst.mockResolvedValue(null)

    const req = new NextRequest('http://localhost/api/agents/a-999')
    const res = await GET(req, makeParams('a-999'))

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Agent not found' })
  })

  it('returns agent with process status on success', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    mockDb.workspace.findFirst.mockResolvedValue({ id: 'ws-1', userId: 'user-1' })
    const agent = {
      id: 'a-1',
      name: 'my-agent',
      channelAgents: [{ channel: { id: 'ch-1', name: 'general' } }],
    }
    mockDb.agent.findFirst.mockResolvedValue(agent)
    mockDaemon.isRunning.mockReturnValue(true)
    mockDaemon.isReady.mockReturnValue(false)

    const req = new NextRequest('http://localhost/api/agents/a-1')
    const res = await GET(req, makeParams('a-1'))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.id).toBe('a-1')
    expect(body.process).toEqual({ running: true, ready: false })

    expect(mockDb.agent.findFirst).toHaveBeenCalledWith({
      where: { id: 'a-1', workspaceId: 'ws-1' },
      include: {
        channelAgents: {
          include: {
            channel: { select: { id: true, name: true } },
          },
        },
      },
    })
    expect(mockDaemon.isRunning).toHaveBeenCalledWith('a-1')
    expect(mockDaemon.isReady).toHaveBeenCalledWith('a-1')
  })
})

describe('PUT /api/agents/[agentId]', () => {
  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValue(null)

    const req = new NextRequest('http://localhost/api/agents/a-1', {
      method: 'PUT',
      body: JSON.stringify({ model: 'gpt-4' }),
    })
    const res = await PUT(req, makeParams('a-1'))

    expect(res.status).toBe(401)
  })

  it('returns 404 when workspace not found', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    mockDb.workspace.findFirst.mockResolvedValue(null)

    const req = new NextRequest('http://localhost/api/agents/a-1', {
      method: 'PUT',
      body: JSON.stringify({ model: 'gpt-4' }),
    })
    const res = await PUT(req, makeParams('a-1'))

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Workspace not found' })
  })

  it('returns 404 when agent not found', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    mockDb.workspace.findFirst.mockResolvedValue({ id: 'ws-1', userId: 'user-1' })
    mockDb.agent.findFirst.mockResolvedValue(null)

    const req = new NextRequest('http://localhost/api/agents/a-999', {
      method: 'PUT',
      body: JSON.stringify({ model: 'gpt-4' }),
    })
    const res = await PUT(req, makeParams('a-999'))

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Agent not found' })
  })

  it('updates agent model on success', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    mockDb.workspace.findFirst.mockResolvedValue({ id: 'ws-1', userId: 'user-1' })
    mockDb.agent.findFirst.mockResolvedValue({ id: 'a-1', name: 'my-agent' })
    const updated = { id: 'a-1', name: 'my-agent', model: 'gpt-4' }
    mockDb.agent.update.mockResolvedValue(updated)

    const req = new NextRequest('http://localhost/api/agents/a-1', {
      method: 'PUT',
      body: JSON.stringify({ model: 'gpt-4' }),
    })
    const res = await PUT(req, makeParams('a-1'))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(updated)
    expect(mockDb.agent.update).toHaveBeenCalledWith({
      where: { id: 'a-1' },
      data: { model: 'gpt-4' },
    })
  })
})
