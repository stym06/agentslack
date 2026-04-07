import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockGetServerSession, mockDb, mockReadAgentSkill, mockWriteAgentSkill, mockDeleteAgentSkill } = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  mockDb: {
    workspace: { findFirst: vi.fn() },
    agent: { findFirst: vi.fn() },
  },
  mockReadAgentSkill: vi.fn(),
  mockWriteAgentSkill: vi.fn(),
  mockDeleteAgentSkill: vi.fn(),
}))

vi.mock('next-auth', () => ({ getServerSession: mockGetServerSession }))
vi.mock('@/lib/auth/config', () => ({ authOptions: {} }))
vi.mock('@/lib/db', () => ({ db: mockDb }))
vi.mock('@/lib/agents/directory', () => ({
  readAgentSkill: mockReadAgentSkill,
  writeAgentSkill: mockWriteAgentSkill,
  deleteAgentSkill: mockDeleteAgentSkill,
}))

import { GET, PUT, DELETE } from '@/app/api/agents/[agentId]/skills/[filename]/route'
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

function makeParams(agentId: string, filename: string) {
  return { params: Promise.resolve({ agentId, filename }) }
}

describe('GET /api/agents/[agentId]/skills/[filename]', () => {
  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValue(null)

    const req = new NextRequest('http://localhost/api/agents/agent-1/skills/test.md')
    const res = await GET(req, makeParams('agent-1', 'test.md'))

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Unauthorized' })
  })

  it('returns 404 when agent not found', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    mockDb.workspace.findFirst.mockResolvedValue(MOCK_WORKSPACE)
    mockDb.agent.findFirst.mockResolvedValue(null)

    const req = new NextRequest('http://localhost/api/agents/agent-1/skills/test.md')
    const res = await GET(req, makeParams('agent-1', 'test.md'))

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Agent not found' })
  })

  it('returns 404 when skill not found', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    mockDb.workspace.findFirst.mockResolvedValue(MOCK_WORKSPACE)
    mockDb.agent.findFirst.mockResolvedValue(MOCK_AGENT)
    mockReadAgentSkill.mockReturnValue(null)

    const req = new NextRequest('http://localhost/api/agents/agent-1/skills/nonexistent.md')
    const res = await GET(req, makeParams('agent-1', 'nonexistent.md'))

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Skill not found' })
  })

  it('returns skill content with default type "custom"', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    mockDb.workspace.findFirst.mockResolvedValue(MOCK_WORKSPACE)
    mockDb.agent.findFirst.mockResolvedValue(MOCK_AGENT)
    mockReadAgentSkill.mockReturnValue('# My Skill')

    const req = new NextRequest('http://localhost/api/agents/agent-1/skills/test.md')
    const res = await GET(req, makeParams('agent-1', 'test.md'))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ filename: 'test.md', content: '# My Skill', type: 'custom' })
    expect(mockReadAgentSkill).toHaveBeenCalledWith('agent-1', 'test.md', 'custom')
  })

  it('passes type "installed" from searchParams', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    mockDb.workspace.findFirst.mockResolvedValue(MOCK_WORKSPACE)
    mockDb.agent.findFirst.mockResolvedValue(MOCK_AGENT)
    mockReadAgentSkill.mockReturnValue('# Installed Skill')

    const req = new NextRequest('http://localhost/api/agents/agent-1/skills/test.md?type=installed')
    const res = await GET(req, makeParams('agent-1', 'test.md'))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ filename: 'test.md', content: '# Installed Skill', type: 'installed' })
    expect(mockReadAgentSkill).toHaveBeenCalledWith('agent-1', 'test.md', 'installed')
  })
})

describe('PUT /api/agents/[agentId]/skills/[filename]', () => {
  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValue(null)

    const req = new NextRequest('http://localhost/api/agents/agent-1/skills/test.md', {
      method: 'PUT',
      body: JSON.stringify({ content: 'updated' }),
    })
    const res = await PUT(req, makeParams('agent-1', 'test.md'))

    expect(res.status).toBe(401)
  })

  it('returns 404 when agent not found', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    mockDb.workspace.findFirst.mockResolvedValue(MOCK_WORKSPACE)
    mockDb.agent.findFirst.mockResolvedValue(null)

    const req = new NextRequest('http://localhost/api/agents/agent-1/skills/test.md', {
      method: 'PUT',
      body: JSON.stringify({ content: 'updated' }),
    })
    const res = await PUT(req, makeParams('agent-1', 'test.md'))

    expect(res.status).toBe(404)
  })

  it('returns 400 when content is not a string', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    mockDb.workspace.findFirst.mockResolvedValue(MOCK_WORKSPACE)
    mockDb.agent.findFirst.mockResolvedValue(MOCK_AGENT)

    const req = new NextRequest('http://localhost/api/agents/agent-1/skills/test.md', {
      method: 'PUT',
      body: JSON.stringify({ content: 42 }),
    })
    const res = await PUT(req, makeParams('agent-1', 'test.md'))

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'content is required' })
  })

  it('writes skill and returns success', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    mockDb.workspace.findFirst.mockResolvedValue(MOCK_WORKSPACE)
    mockDb.agent.findFirst.mockResolvedValue(MOCK_AGENT)

    const req = new NextRequest('http://localhost/api/agents/agent-1/skills/test.md', {
      method: 'PUT',
      body: JSON.stringify({ content: 'updated content' }),
    })
    const res = await PUT(req, makeParams('agent-1', 'test.md'))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true })
    expect(mockWriteAgentSkill).toHaveBeenCalledWith('agent-1', 'test.md', 'updated content')
  })
})

describe('DELETE /api/agents/[agentId]/skills/[filename]', () => {
  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValue(null)

    const req = new NextRequest('http://localhost/api/agents/agent-1/skills/test.md', { method: 'DELETE' })
    const res = await DELETE(req, makeParams('agent-1', 'test.md'))

    expect(res.status).toBe(401)
  })

  it('returns 404 when agent not found', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    mockDb.workspace.findFirst.mockResolvedValue(MOCK_WORKSPACE)
    mockDb.agent.findFirst.mockResolvedValue(null)

    const req = new NextRequest('http://localhost/api/agents/agent-1/skills/test.md', { method: 'DELETE' })
    const res = await DELETE(req, makeParams('agent-1', 'test.md'))

    expect(res.status).toBe(404)
  })

  it('returns 404 when skill does not exist (deleteAgentSkill returns false)', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    mockDb.workspace.findFirst.mockResolvedValue(MOCK_WORKSPACE)
    mockDb.agent.findFirst.mockResolvedValue(MOCK_AGENT)
    mockDeleteAgentSkill.mockReturnValue(false)

    const req = new NextRequest('http://localhost/api/agents/agent-1/skills/test.md', { method: 'DELETE' })
    const res = await DELETE(req, makeParams('agent-1', 'test.md'))

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Skill not found' })
    expect(mockDeleteAgentSkill).toHaveBeenCalledWith('agent-1', 'test.md')
  })

  it('deletes skill and returns success', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    mockDb.workspace.findFirst.mockResolvedValue(MOCK_WORKSPACE)
    mockDb.agent.findFirst.mockResolvedValue(MOCK_AGENT)
    mockDeleteAgentSkill.mockReturnValue(true)

    const req = new NextRequest('http://localhost/api/agents/agent-1/skills/test.md', { method: 'DELETE' })
    const res = await DELETE(req, makeParams('agent-1', 'test.md'))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true })
    expect(mockDeleteAgentSkill).toHaveBeenCalledWith('agent-1', 'test.md')
  })
})
