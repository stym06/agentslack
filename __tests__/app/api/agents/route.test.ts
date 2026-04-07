import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockGetServerSession, mockDb, mockDaemon, mockEnsureAgentDir } = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  mockDb: {
    workspace: { findFirst: vi.fn() },
    agent: { findMany: vi.fn(), create: vi.fn() },
  },
  mockDaemon: {
    startAgent: vi.fn(),
    isRunning: vi.fn(),
    isReady: vi.fn(),
  },
  mockEnsureAgentDir: vi.fn(),
}))

vi.mock('next-auth', () => ({ getServerSession: mockGetServerSession }))
vi.mock('@/lib/auth/config', () => ({ authOptions: {} }))
vi.mock('@/lib/db', () => ({ db: mockDb }))
vi.mock('@/server/agent-daemon', () => ({ getAgentDaemon: () => mockDaemon }))
vi.mock('@/lib/agents/directory', () => ({ ensureAgentDir: mockEnsureAgentDir }))

import { GET, POST } from '@/app/api/agents/route'
import { NextRequest } from 'next/server'

const MOCK_SESSION = {
  user: { id: 'user-1', email: 'test@test.com', name: 'TestUser' },
  expires: '2099-01-01',
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/agents', () => {
  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValue(null)

    const req = new NextRequest('http://localhost/api/agents')
    const res = await GET(req)

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Unauthorized' })
  })

  it('returns 404 when workspace not found', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    mockDb.workspace.findFirst.mockResolvedValue(null)

    const req = new NextRequest('http://localhost/api/agents')
    const res = await GET(req)

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Workspace not found' })
  })

  it('returns agents list on success', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    mockDb.workspace.findFirst.mockResolvedValue({ id: 'ws-1', userId: 'user-1' })
    const agents = [
      { id: 'a-1', name: 'agent-one' },
      { id: 'a-2', name: 'agent-two' },
    ]
    mockDb.agent.findMany.mockResolvedValue(agents)

    const req = new NextRequest('http://localhost/api/agents')
    const res = await GET(req)

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(agents)
    expect(mockDb.agent.findMany).toHaveBeenCalledWith({
      where: { workspaceId: 'ws-1' },
      orderBy: { createdAt: 'asc' },
    })
  })
})

describe('POST /api/agents', () => {
  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValue(null)

    const req = new NextRequest('http://localhost/api/agents', {
      method: 'POST',
      body: JSON.stringify({ name: 'test', soul_md: 'soul' }),
    })
    const res = await POST(req)

    expect(res.status).toBe(401)
  })

  it('returns 400 when name is missing', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)

    const req = new NextRequest('http://localhost/api/agents', {
      method: 'POST',
      body: JSON.stringify({ soul_md: 'soul' }),
    })
    const res = await POST(req)

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'name and soul_md required' })
  })

  it('returns 400 when soul_md is missing', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)

    const req = new NextRequest('http://localhost/api/agents', {
      method: 'POST',
      body: JSON.stringify({ name: 'myagent' }),
    })
    const res = await POST(req)

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'name and soul_md required' })
  })

  it('returns 400 for invalid agent name', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)

    const req = new NextRequest('http://localhost/api/agents', {
      method: 'POST',
      body: JSON.stringify({ name: 'Invalid Name!', soul_md: 'soul' }),
    })
    const res = await POST(req)

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/username-style/)
  })

  it('returns 400 for name starting with a number', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)

    const req = new NextRequest('http://localhost/api/agents', {
      method: 'POST',
      body: JSON.stringify({ name: '1agent', soul_md: 'soul' }),
    })
    const res = await POST(req)

    expect(res.status).toBe(400)
  })

  it('returns 404 when workspace not found', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    mockDb.workspace.findFirst.mockResolvedValue(null)

    const req = new NextRequest('http://localhost/api/agents', {
      method: 'POST',
      body: JSON.stringify({ name: 'myagent', soul_md: 'soul' }),
    })
    const res = await POST(req)

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Workspace not found' })
  })

  it('creates agent, ensures dir, and starts daemon on success', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    mockDb.workspace.findFirst.mockResolvedValue({ id: 'ws-1', userId: 'user-1' })
    const createdAgent = {
      id: 'a-1',
      name: 'my-agent',
      model: 'anthropic/claude-sonnet-4-5',
      soulMd: 'soul content',
    }
    mockDb.agent.create.mockResolvedValue(createdAgent)
    mockEnsureAgentDir.mockReturnValue('/agents/a-1')

    const req = new NextRequest('http://localhost/api/agents', {
      method: 'POST',
      body: JSON.stringify({ name: 'my-agent', soul_md: 'soul content' }),
    })
    const res = await POST(req)

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(createdAgent)

    expect(mockDb.agent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: 'ws-1',
        name: 'my-agent',
        soulMd: 'soul content',
        openclawId: 'my-agent',
        isAdmin: false,
        status: 'online',
      }),
    })

    expect(mockEnsureAgentDir).toHaveBeenCalledWith('a-1', 'soul content')

    expect(mockDaemon.startAgent).toHaveBeenCalledWith({
      id: 'a-1',
      openclawId: 'my-agent',
      name: 'my-agent',
      model: 'anthropic/claude-sonnet-4-5',
      soulMd: 'soul content',
      isAdmin: false,
      dirPath: '/agents/a-1',
    })
  })
})
