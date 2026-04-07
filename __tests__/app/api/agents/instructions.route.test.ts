import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockGetServerSession, mockDb, mockReadAgentInstructions, mockWriteAgentInstructions } = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  mockDb: {
    workspace: { findFirst: vi.fn() },
    agent: { findFirst: vi.fn(), update: vi.fn() },
  },
  mockReadAgentInstructions: vi.fn(),
  mockWriteAgentInstructions: vi.fn(),
}))

vi.mock('next-auth', () => ({ getServerSession: mockGetServerSession }))
vi.mock('@/lib/auth/config', () => ({ authOptions: {} }))
vi.mock('@/lib/db', () => ({ db: mockDb }))
vi.mock('@/lib/agents/directory', () => ({
  readAgentInstructions: mockReadAgentInstructions,
  writeAgentInstructions: mockWriteAgentInstructions,
}))

import { GET, PUT } from '@/app/api/agents/[agentId]/instructions/route'
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

describe('GET /api/agents/[agentId]/instructions', () => {
  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValue(null)

    const req = new NextRequest('http://localhost/api/agents/agent-1/instructions')
    const res = await GET(req, makeParams('agent-1'))

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Unauthorized' })
  })

  it('returns 404 when workspace not found', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    mockDb.workspace.findFirst.mockResolvedValue(null)

    const req = new NextRequest('http://localhost/api/agents/agent-1/instructions')
    const res = await GET(req, makeParams('agent-1'))

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Agent not found' })
  })

  it('returns 404 when agent not found', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    mockDb.workspace.findFirst.mockResolvedValue(MOCK_WORKSPACE)
    mockDb.agent.findFirst.mockResolvedValue(null)

    const req = new NextRequest('http://localhost/api/agents/agent-1/instructions')
    const res = await GET(req, makeParams('agent-1'))

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Agent not found' })
  })

  it('returns instructions content on success', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    mockDb.workspace.findFirst.mockResolvedValue(MOCK_WORKSPACE)
    mockDb.agent.findFirst.mockResolvedValue(MOCK_AGENT)
    mockReadAgentInstructions.mockReturnValue('You are a helpful agent.')

    const req = new NextRequest('http://localhost/api/agents/agent-1/instructions')
    const res = await GET(req, makeParams('agent-1'))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ content: 'You are a helpful agent.' })
    expect(mockReadAgentInstructions).toHaveBeenCalledWith('agent-1')
  })
})

describe('PUT /api/agents/[agentId]/instructions', () => {
  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValue(null)

    const req = new NextRequest('http://localhost/api/agents/agent-1/instructions', {
      method: 'PUT',
      body: JSON.stringify({ content: 'new instructions' }),
    })
    const res = await PUT(req, makeParams('agent-1'))

    expect(res.status).toBe(401)
  })

  it('returns 404 when agent not found', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    mockDb.workspace.findFirst.mockResolvedValue(MOCK_WORKSPACE)
    mockDb.agent.findFirst.mockResolvedValue(null)

    const req = new NextRequest('http://localhost/api/agents/agent-1/instructions', {
      method: 'PUT',
      body: JSON.stringify({ content: 'new instructions' }),
    })
    const res = await PUT(req, makeParams('agent-1'))

    expect(res.status).toBe(404)
  })

  it('returns 400 when content is not a string', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    mockDb.workspace.findFirst.mockResolvedValue(MOCK_WORKSPACE)
    mockDb.agent.findFirst.mockResolvedValue(MOCK_AGENT)

    const req = new NextRequest('http://localhost/api/agents/agent-1/instructions', {
      method: 'PUT',
      body: JSON.stringify({ content: 123 }),
    })
    const res = await PUT(req, makeParams('agent-1'))

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'content is required' })
  })

  it('writes instructions and updates db on success', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    mockDb.workspace.findFirst.mockResolvedValue(MOCK_WORKSPACE)
    mockDb.agent.findFirst.mockResolvedValue(MOCK_AGENT)
    mockDb.agent.update.mockResolvedValue({})

    const req = new NextRequest('http://localhost/api/agents/agent-1/instructions', {
      method: 'PUT',
      body: JSON.stringify({ content: 'updated instructions' }),
    })
    const res = await PUT(req, makeParams('agent-1'))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true })
    expect(mockWriteAgentInstructions).toHaveBeenCalledWith('agent-1', 'updated instructions')
    expect(mockDb.agent.update).toHaveBeenCalledWith({
      where: { id: 'agent-1' },
      data: { soulMd: 'updated instructions' },
    })
  })
})
