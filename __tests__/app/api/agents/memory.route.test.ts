import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockGetServerSession, mockDb, mockReadAgentMemory, mockClearAgentMemory } = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  mockDb: {
    workspace: { findFirst: vi.fn() },
    agent: { findFirst: vi.fn() },
  },
  mockReadAgentMemory: vi.fn(),
  mockClearAgentMemory: vi.fn(),
}))

vi.mock('next-auth', () => ({ getServerSession: mockGetServerSession }))
vi.mock('@/lib/auth/config', () => ({ authOptions: {} }))
vi.mock('@/lib/db', () => ({ db: mockDb }))
vi.mock('@/lib/agents/directory', () => ({
  readAgentMemory: mockReadAgentMemory,
  clearAgentMemory: mockClearAgentMemory,
}))

import { GET, DELETE } from '@/app/api/agents/[agentId]/memory/route'
import { NextRequest } from 'next/server'

const MOCK_SESSION = {
  user: { id: 'user-1', email: 'test@test.com', name: 'TestUser' },
  expires: '2099-01-01',
}

const MOCK_WORKSPACE = { id: 'ws-1', userId: 'user-1' }
const MOCK_AGENT = { id: 'agent-1', name: 'test-agent', workspaceId: 'ws-1' }

beforeEach(() => {
  vi.clearAllMocks()
})

function makeParams(agentId: string) {
  return { params: Promise.resolve({ agentId }) }
}

describe('GET /api/agents/[agentId]/memory', () => {
  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValue(null)

    const req = new NextRequest('http://localhost/api/agents/agent-1/memory')
    const res = await GET(req, makeParams('agent-1'))

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Unauthorized' })
  })

  it('returns 404 when workspace not found', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    mockDb.workspace.findFirst.mockResolvedValue(null)

    const req = new NextRequest('http://localhost/api/agents/agent-1/memory')
    const res = await GET(req, makeParams('agent-1'))

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Agent not found' })
  })

  it('returns 404 when agent not found', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    mockDb.workspace.findFirst.mockResolvedValue(MOCK_WORKSPACE)
    mockDb.agent.findFirst.mockResolvedValue(null)

    const req = new NextRequest('http://localhost/api/agents/agent-1/memory')
    const res = await GET(req, makeParams('agent-1'))

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Agent not found' })
  })

  it('returns memory entries on success', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    mockDb.workspace.findFirst.mockResolvedValue(MOCK_WORKSPACE)
    mockDb.agent.findFirst.mockResolvedValue(MOCK_AGENT)
    const entries = ['memory entry 1', 'memory entry 2']
    mockReadAgentMemory.mockReturnValue(entries)

    const req = new NextRequest('http://localhost/api/agents/agent-1/memory')
    const res = await GET(req, makeParams('agent-1'))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ entries })
    expect(mockReadAgentMemory).toHaveBeenCalledWith('agent-1')
  })
})

describe('DELETE /api/agents/[agentId]/memory', () => {
  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValue(null)

    const req = new NextRequest('http://localhost/api/agents/agent-1/memory', { method: 'DELETE' })
    const res = await DELETE(req, makeParams('agent-1'))

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Unauthorized' })
  })

  it('returns 404 when agent not found', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    mockDb.workspace.findFirst.mockResolvedValue(MOCK_WORKSPACE)
    mockDb.agent.findFirst.mockResolvedValue(null)

    const req = new NextRequest('http://localhost/api/agents/agent-1/memory', { method: 'DELETE' })
    const res = await DELETE(req, makeParams('agent-1'))

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Agent not found' })
  })

  it('clears memory and returns success', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    mockDb.workspace.findFirst.mockResolvedValue(MOCK_WORKSPACE)
    mockDb.agent.findFirst.mockResolvedValue(MOCK_AGENT)

    const req = new NextRequest('http://localhost/api/agents/agent-1/memory', { method: 'DELETE' })
    const res = await DELETE(req, makeParams('agent-1'))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true })
    expect(mockClearAgentMemory).toHaveBeenCalledWith('agent-1')
  })
})
