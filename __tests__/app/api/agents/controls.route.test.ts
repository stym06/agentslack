import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockGetServerSession, mockDb, mockDaemon, mockIO } = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  mockDb: {
    workspace: { findFirst: vi.fn() },
    agent: { findFirst: vi.fn(), update: vi.fn() },
  },
  mockDaemon: {
    startAgentManual: vi.fn(),
    stopAgentManual: vi.fn(),
    updateConfig: vi.fn(),
    restartAgent: vi.fn(),
  },
  mockIO: {
    emit: vi.fn(),
  },
}))

vi.mock('next-auth', () => ({ getServerSession: mockGetServerSession }))
vi.mock('@/lib/auth/config', () => ({ authOptions: {} }))
vi.mock('@/lib/db', () => ({ db: mockDb }))
vi.mock('@/server/agent-daemon', () => ({ getAgentDaemon: () => mockDaemon }))
vi.mock('@/server/socket-server', () => ({ getIO: () => mockIO }))

import { POST as startPOST } from '@/app/api/agents/[agentId]/start/route'
import { POST as stopPOST } from '@/app/api/agents/[agentId]/stop/route'
import { POST as restartPOST } from '@/app/api/agents/[agentId]/restart/route'
import { NextRequest } from 'next/server'

const MOCK_SESSION = {
  user: { id: 'user-1', email: 'test@test.com', name: 'TestUser' },
  expires: '2099-01-01',
}

const MOCK_WORKSPACE = { id: 'ws-1', userId: 'user-1' }
const MOCK_AGENT = { id: 'agent-1', name: 'test-agent', workspaceId: 'ws-1', model: 'anthropic/claude-sonnet-4-5', soulMd: 'soul content' }

beforeEach(() => {
  vi.clearAllMocks()
})

function makeParams(agentId: string) {
  return { params: Promise.resolve({ agentId }) }
}

// ── START ──────────────────────────────────────────────────────────

describe('POST /api/agents/[agentId]/start', () => {
  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValue(null)

    const req = new NextRequest('http://localhost/api/agents/agent-1/start', { method: 'POST' })
    const res = await startPOST(req, makeParams('agent-1'))

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Unauthorized' })
  })

  it('returns 404 when workspace not found', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    mockDb.workspace.findFirst.mockResolvedValue(null)

    const req = new NextRequest('http://localhost/api/agents/agent-1/start', { method: 'POST' })
    const res = await startPOST(req, makeParams('agent-1'))

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Workspace not found' })
  })

  it('returns 404 when agent not found', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    mockDb.workspace.findFirst.mockResolvedValue(MOCK_WORKSPACE)
    mockDb.agent.findFirst.mockResolvedValue(null)

    const req = new NextRequest('http://localhost/api/agents/agent-1/start', { method: 'POST' })
    const res = await startPOST(req, makeParams('agent-1'))

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Agent not found' })
  })

  it('updates status to loading, emits event, and starts agent', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    mockDb.workspace.findFirst.mockResolvedValue(MOCK_WORKSPACE)
    mockDb.agent.findFirst.mockResolvedValue(MOCK_AGENT)
    mockDb.agent.update.mockResolvedValue({})

    const req = new NextRequest('http://localhost/api/agents/agent-1/start', { method: 'POST' })
    const res = await startPOST(req, makeParams('agent-1'))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true })
    expect(mockDb.agent.update).toHaveBeenCalledWith({
      where: { id: 'agent-1' },
      data: { status: 'loading' },
    })
    expect(mockIO.emit).toHaveBeenCalledWith('agent:status', { agent_id: 'agent-1', status: 'loading' })
    expect(mockDaemon.startAgentManual).toHaveBeenCalledWith('agent-1')
  })
})

// ── STOP ───────────────────────────────────────────────────────────

describe('POST /api/agents/[agentId]/stop', () => {
  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValue(null)

    const req = new NextRequest('http://localhost/api/agents/agent-1/stop', { method: 'POST' })
    const res = await stopPOST(req, makeParams('agent-1'))

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Unauthorized' })
  })

  it('returns 404 when workspace not found', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    mockDb.workspace.findFirst.mockResolvedValue(null)

    const req = new NextRequest('http://localhost/api/agents/agent-1/stop', { method: 'POST' })
    const res = await stopPOST(req, makeParams('agent-1'))

    expect(res.status).toBe(404)
  })

  it('returns 404 when agent not found', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    mockDb.workspace.findFirst.mockResolvedValue(MOCK_WORKSPACE)
    mockDb.agent.findFirst.mockResolvedValue(null)

    const req = new NextRequest('http://localhost/api/agents/agent-1/stop', { method: 'POST' })
    const res = await stopPOST(req, makeParams('agent-1'))

    expect(res.status).toBe(404)
  })

  it('stops agent, updates status to offline, and emits event', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    mockDb.workspace.findFirst.mockResolvedValue(MOCK_WORKSPACE)
    mockDb.agent.findFirst.mockResolvedValue(MOCK_AGENT)
    mockDb.agent.update.mockResolvedValue({})

    const req = new NextRequest('http://localhost/api/agents/agent-1/stop', { method: 'POST' })
    const res = await stopPOST(req, makeParams('agent-1'))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true })
    expect(mockDaemon.stopAgentManual).toHaveBeenCalledWith('agent-1')
    expect(mockDb.agent.update).toHaveBeenCalledWith({
      where: { id: 'agent-1' },
      data: { status: 'offline' },
    })
    expect(mockIO.emit).toHaveBeenCalledWith('agent:status', { agent_id: 'agent-1', status: 'offline' })
  })
})

// ── RESTART ────────────────────────────────────────────────────────

describe('POST /api/agents/[agentId]/restart', () => {
  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValue(null)

    const req = new NextRequest('http://localhost/api/agents/agent-1/restart', { method: 'POST' })
    const res = await restartPOST(req, makeParams('agent-1'))

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Unauthorized' })
  })

  it('returns 404 when workspace not found', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    mockDb.workspace.findFirst.mockResolvedValue(null)

    const req = new NextRequest('http://localhost/api/agents/agent-1/restart', { method: 'POST' })
    const res = await restartPOST(req, makeParams('agent-1'))

    expect(res.status).toBe(404)
  })

  it('returns 404 when agent not found', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    mockDb.workspace.findFirst.mockResolvedValue(MOCK_WORKSPACE)
    mockDb.agent.findFirst.mockResolvedValue(null)

    const req = new NextRequest('http://localhost/api/agents/agent-1/restart', { method: 'POST' })
    const res = await restartPOST(req, makeParams('agent-1'))

    expect(res.status).toBe(404)
  })

  it('updates status to loading, emits event, updates config, and restarts agent', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    mockDb.workspace.findFirst.mockResolvedValue(MOCK_WORKSPACE)
    mockDb.agent.findFirst.mockResolvedValue(MOCK_AGENT)
    mockDb.agent.update.mockResolvedValue({})

    const req = new NextRequest('http://localhost/api/agents/agent-1/restart', { method: 'POST' })
    const res = await restartPOST(req, makeParams('agent-1'))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true })
    expect(mockDb.agent.update).toHaveBeenCalledWith({
      where: { id: 'agent-1' },
      data: { status: 'loading' },
    })
    expect(mockIO.emit).toHaveBeenCalledWith('agent:status', { agent_id: 'agent-1', status: 'loading' })
    expect(mockDaemon.updateConfig).toHaveBeenCalledWith('agent-1', {
      model: 'anthropic/claude-sonnet-4-5',
      soulMd: 'soul content',
    })
    expect(mockDaemon.restartAgent).toHaveBeenCalledWith('agent-1')
  })
})
