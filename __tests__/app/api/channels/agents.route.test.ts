import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockGetServerSession, mockDb } = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  mockDb: {
    channel: { findUnique: vi.fn() },
    agent: { findUnique: vi.fn() },
    channelAgent: { findMany: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
  },
}))

vi.mock('next-auth', () => ({ getServerSession: mockGetServerSession }))
vi.mock('@/lib/auth/config', () => ({ authOptions: {} }))
vi.mock('@/lib/db', () => ({ db: mockDb }))

import { GET, POST } from '@/app/api/channels/[id]/agents/route'
import { DELETE } from '@/app/api/channels/[id]/agents/[agentId]/route'
import { NextRequest } from 'next/server'

const MOCK_SESSION = {
  user: { id: 'user-1', email: 'test@test.com', name: 'TestUser' },
  expires: '2099-01-01',
}

const makeParams = (id: string) => ({ params: Promise.resolve({ id }) })
const makeDeleteParams = (id: string, agentId: string) => ({
  params: Promise.resolve({ id, agentId }),
})

beforeEach(() => {
  vi.clearAllMocks()
})

// ---- GET /api/channels/[id]/agents ----

describe('GET /api/channels/[id]/agents', () => {
  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValue(null)

    const req = new NextRequest('http://localhost/api/channels/ch-1/agents')
    const res = await GET(req, makeParams('ch-1'))

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Unauthorized' })
  })

  it('returns 404 when channel not found', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    mockDb.channel.findUnique.mockResolvedValue(null)

    const req = new NextRequest('http://localhost/api/channels/ch-999/agents')
    const res = await GET(req, makeParams('ch-999'))

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Channel not found' })
  })

  it('returns 403 when user does not own workspace', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    mockDb.channel.findUnique.mockResolvedValue({
      id: 'ch-1',
      workspace: { userId: 'other-user' },
    })

    const req = new NextRequest('http://localhost/api/channels/ch-1/agents')
    const res = await GET(req, makeParams('ch-1'))

    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'Forbidden' })
  })

  it('returns agents on success', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    mockDb.channel.findUnique.mockResolvedValue({
      id: 'ch-1',
      workspace: { userId: 'user-1' },
    })
    const channelAgents = [
      { agent: { id: 'a-1', name: 'agent-one' } },
      { agent: { id: 'a-2', name: 'agent-two' } },
    ]
    mockDb.channelAgent.findMany.mockResolvedValue(channelAgents)

    const req = new NextRequest('http://localhost/api/channels/ch-1/agents')
    const res = await GET(req, makeParams('ch-1'))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([
      { id: 'a-1', name: 'agent-one' },
      { id: 'a-2', name: 'agent-two' },
    ])
    expect(mockDb.channelAgent.findMany).toHaveBeenCalledWith({
      where: { channelId: 'ch-1' },
      include: { agent: true },
    })
  })
})

// ---- POST /api/channels/[id]/agents ----

describe('POST /api/channels/[id]/agents', () => {
  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValue(null)

    const req = new NextRequest('http://localhost/api/channels/ch-1/agents', {
      method: 'POST',
      body: JSON.stringify({ agent_id: 'a-1' }),
    })
    const res = await POST(req, makeParams('ch-1'))

    expect(res.status).toBe(401)
  })

  it('returns 400 when agent_id is missing', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)

    const req = new NextRequest('http://localhost/api/channels/ch-1/agents', {
      method: 'POST',
      body: JSON.stringify({}),
    })
    const res = await POST(req, makeParams('ch-1'))

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'agent_id required' })
  })

  it('returns 404 when channel not found', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    mockDb.channel.findUnique.mockResolvedValue(null)

    const req = new NextRequest('http://localhost/api/channels/ch-999/agents', {
      method: 'POST',
      body: JSON.stringify({ agent_id: 'a-1' }),
    })
    const res = await POST(req, makeParams('ch-999'))

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Channel not found' })
  })

  it('returns 403 when user does not own channel workspace', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    mockDb.channel.findUnique.mockResolvedValue({
      id: 'ch-1',
      workspaceId: 'ws-1',
      workspace: { userId: 'other-user' },
    })

    const req = new NextRequest('http://localhost/api/channels/ch-1/agents', {
      method: 'POST',
      body: JSON.stringify({ agent_id: 'a-1' }),
    })
    const res = await POST(req, makeParams('ch-1'))

    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'Forbidden' })
  })

  it('returns 404 when agent not found', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    mockDb.channel.findUnique.mockResolvedValue({
      id: 'ch-1',
      workspaceId: 'ws-1',
      workspace: { userId: 'user-1' },
    })
    mockDb.agent.findUnique.mockResolvedValue(null)

    const req = new NextRequest('http://localhost/api/channels/ch-1/agents', {
      method: 'POST',
      body: JSON.stringify({ agent_id: 'a-999' }),
    })
    const res = await POST(req, makeParams('ch-1'))

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Agent not found' })
  })

  it('returns 403 when agent belongs to different workspace', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    mockDb.channel.findUnique.mockResolvedValue({
      id: 'ch-1',
      workspaceId: 'ws-1',
      workspace: { userId: 'user-1' },
    })
    mockDb.agent.findUnique.mockResolvedValue({
      id: 'a-1',
      workspaceId: 'ws-other',
    })

    const req = new NextRequest('http://localhost/api/channels/ch-1/agents', {
      method: 'POST',
      body: JSON.stringify({ agent_id: 'a-1' }),
    })
    const res = await POST(req, makeParams('ch-1'))

    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'Forbidden' })
  })

  it('upserts channel agent assignment on success', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    mockDb.channel.findUnique.mockResolvedValue({
      id: 'ch-1',
      workspaceId: 'ws-1',
      workspace: { userId: 'user-1' },
    })
    mockDb.agent.findUnique.mockResolvedValue({
      id: 'a-1',
      workspaceId: 'ws-1',
    })
    const channelAgent = { channelId: 'ch-1', agentId: 'a-1' }
    mockDb.channelAgent.upsert.mockResolvedValue(channelAgent)

    const req = new NextRequest('http://localhost/api/channels/ch-1/agents', {
      method: 'POST',
      body: JSON.stringify({ agent_id: 'a-1' }),
    })
    const res = await POST(req, makeParams('ch-1'))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, channelAgent })
    expect(mockDb.channelAgent.upsert).toHaveBeenCalledWith({
      where: {
        channelId_agentId: { channelId: 'ch-1', agentId: 'a-1' },
      },
      create: { channelId: 'ch-1', agentId: 'a-1' },
      update: {},
    })
  })
})

// ---- DELETE /api/channels/[id]/agents/[agentId] ----

describe('DELETE /api/channels/[id]/agents/[agentId]', () => {
  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValue(null)

    const req = new NextRequest('http://localhost/api/channels/ch-1/agents/a-1', {
      method: 'DELETE',
    })
    const res = await DELETE(req, makeDeleteParams('ch-1', 'a-1'))

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Unauthorized' })
  })

  it('returns 404 when channel not found', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    mockDb.channel.findUnique.mockResolvedValue(null)

    const req = new NextRequest('http://localhost/api/channels/ch-999/agents/a-1', {
      method: 'DELETE',
    })
    const res = await DELETE(req, makeDeleteParams('ch-999', 'a-1'))

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Channel not found' })
  })

  it('returns 403 when user does not own workspace', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    mockDb.channel.findUnique.mockResolvedValue({
      id: 'ch-1',
      workspace: { userId: 'other-user' },
    })

    const req = new NextRequest('http://localhost/api/channels/ch-1/agents/a-1', {
      method: 'DELETE',
    })
    const res = await DELETE(req, makeDeleteParams('ch-1', 'a-1'))

    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'Forbidden' })
  })

  it('deletes channel agent assignment on success', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    mockDb.channel.findUnique.mockResolvedValue({
      id: 'ch-1',
      workspace: { userId: 'user-1' },
    })
    mockDb.channelAgent.deleteMany.mockResolvedValue({ count: 1 })

    const req = new NextRequest('http://localhost/api/channels/ch-1/agents/a-1', {
      method: 'DELETE',
    })
    const res = await DELETE(req, makeDeleteParams('ch-1', 'a-1'))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true })
    expect(mockDb.channelAgent.deleteMany).toHaveBeenCalledWith({
      where: { channelId: 'ch-1', agentId: 'a-1' },
    })
  })
})
