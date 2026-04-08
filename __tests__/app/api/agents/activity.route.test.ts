import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockGetServerSession, mockDb, mockGetActivityEvents } = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  mockDb: {
    workspace: { findFirst: vi.fn() },
    agent: { findFirst: vi.fn() },
  },
  mockGetActivityEvents: vi.fn(),
}))

vi.mock('next-auth', () => ({ getServerSession: mockGetServerSession }))
vi.mock('@/lib/auth/config', () => ({ authOptions: {} }))
vi.mock('@/lib/db', () => ({ db: mockDb }))
vi.mock('@/lib/activity/store', () => ({
  getActivityEvents: mockGetActivityEvents,
}))

import { GET } from '@/app/api/agents/[agentId]/activity/route'
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

describe('GET /api/agents/[agentId]/activity', () => {
  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValue(null)

    const req = new NextRequest('http://localhost/api/agents/agent-1/activity')
    const res = await GET(req, makeParams('agent-1'))

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Unauthorized' })
  })

  it('returns 404 when agent not found', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    mockDb.workspace.findFirst.mockResolvedValue(MOCK_WORKSPACE)
    mockDb.agent.findFirst.mockResolvedValue(null)

    const req = new NextRequest('http://localhost/api/agents/agent-1/activity')
    const res = await GET(req, makeParams('agent-1'))

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Agent not found' })
  })

  it('returns activity events with default limit', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    mockDb.workspace.findFirst.mockResolvedValue(MOCK_WORKSPACE)
    mockDb.agent.findFirst.mockResolvedValue(MOCK_AGENT)
    const events = [
      { type: 'tool_use', toolName: 'Bash', input: '{}', timestamp: 1000 },
      { type: 'result', subtype: 'success', durationMs: 100, totalCostUsd: 0.01, timestamp: 2000 },
    ]
    mockGetActivityEvents.mockResolvedValue(events)

    const req = new NextRequest('http://localhost/api/agents/agent-1/activity')
    const res = await GET(req, makeParams('agent-1'))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.events).toEqual(events)
    expect(mockGetActivityEvents).toHaveBeenCalledWith('agent-1', 200)
  })

  it('respects custom limit capped at 500', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    mockDb.workspace.findFirst.mockResolvedValue(MOCK_WORKSPACE)
    mockDb.agent.findFirst.mockResolvedValue(MOCK_AGENT)
    mockGetActivityEvents.mockResolvedValue([])

    const req = new NextRequest('http://localhost/api/agents/agent-1/activity?limit=999')
    const res = await GET(req, makeParams('agent-1'))

    expect(res.status).toBe(200)
    expect(mockGetActivityEvents).toHaveBeenCalledWith('agent-1', 500)
  })

  it('uses custom limit when within range', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    mockDb.workspace.findFirst.mockResolvedValue(MOCK_WORKSPACE)
    mockDb.agent.findFirst.mockResolvedValue(MOCK_AGENT)
    mockGetActivityEvents.mockResolvedValue([])

    const req = new NextRequest('http://localhost/api/agents/agent-1/activity?limit=50')
    const res = await GET(req, makeParams('agent-1'))

    expect(mockGetActivityEvents).toHaveBeenCalledWith('agent-1', 50)
  })
})
