import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockGetServerSession, mockDb, mockListAgentSkills, mockWriteAgentSkill } = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  mockDb: {
    workspace: { findFirst: vi.fn() },
    agent: { findFirst: vi.fn() },
  },
  mockListAgentSkills: vi.fn(),
  mockWriteAgentSkill: vi.fn(),
}))

vi.mock('next-auth', () => ({ getServerSession: mockGetServerSession }))
vi.mock('@/lib/auth/config', () => ({ authOptions: {} }))
vi.mock('@/lib/db', () => ({ db: mockDb }))
vi.mock('@/lib/agents/directory', () => ({
  listAgentSkills: mockListAgentSkills,
  writeAgentSkill: mockWriteAgentSkill,
}))

import { GET, POST } from '@/app/api/agents/[agentId]/skills/route'
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

describe('GET /api/agents/[agentId]/skills', () => {
  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValue(null)

    const req = new NextRequest('http://localhost/api/agents/agent-1/skills')
    const res = await GET(req, makeParams('agent-1'))

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Unauthorized' })
  })

  it('returns 404 when agent not found', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    mockDb.workspace.findFirst.mockResolvedValue(MOCK_WORKSPACE)
    mockDb.agent.findFirst.mockResolvedValue(null)

    const req = new NextRequest('http://localhost/api/agents/agent-1/skills')
    const res = await GET(req, makeParams('agent-1'))

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Agent not found' })
  })

  it('returns skills list on success', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    mockDb.workspace.findFirst.mockResolvedValue(MOCK_WORKSPACE)
    mockDb.agent.findFirst.mockResolvedValue(MOCK_AGENT)
    const skills = [{ filename: 'skill-one.md', type: 'custom' }]
    mockListAgentSkills.mockReturnValue(skills)

    const req = new NextRequest('http://localhost/api/agents/agent-1/skills')
    const res = await GET(req, makeParams('agent-1'))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ skills })
    expect(mockListAgentSkills).toHaveBeenCalledWith('agent-1')
  })
})

describe('POST /api/agents/[agentId]/skills', () => {
  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValue(null)

    const req = new NextRequest('http://localhost/api/agents/agent-1/skills', {
      method: 'POST',
      body: JSON.stringify({ filename: 'test.md', content: 'content' }),
    })
    const res = await POST(req, makeParams('agent-1'))

    expect(res.status).toBe(401)
  })

  it('returns 404 when agent not found', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    mockDb.workspace.findFirst.mockResolvedValue(MOCK_WORKSPACE)
    mockDb.agent.findFirst.mockResolvedValue(null)

    const req = new NextRequest('http://localhost/api/agents/agent-1/skills', {
      method: 'POST',
      body: JSON.stringify({ filename: 'test.md', content: 'content' }),
    })
    const res = await POST(req, makeParams('agent-1'))

    expect(res.status).toBe(404)
  })

  it('returns 400 when filename is missing', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    mockDb.workspace.findFirst.mockResolvedValue(MOCK_WORKSPACE)
    mockDb.agent.findFirst.mockResolvedValue(MOCK_AGENT)

    const req = new NextRequest('http://localhost/api/agents/agent-1/skills', {
      method: 'POST',
      body: JSON.stringify({ content: 'content' }),
    })
    const res = await POST(req, makeParams('agent-1'))

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'filename and content required' })
  })

  it('returns 400 when content is not a string', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    mockDb.workspace.findFirst.mockResolvedValue(MOCK_WORKSPACE)
    mockDb.agent.findFirst.mockResolvedValue(MOCK_AGENT)

    const req = new NextRequest('http://localhost/api/agents/agent-1/skills', {
      method: 'POST',
      body: JSON.stringify({ filename: 'test.md', content: 123 }),
    })
    const res = await POST(req, makeParams('agent-1'))

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'filename and content required' })
  })

  it('sanitizes filename and writes skill on success', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    mockDb.workspace.findFirst.mockResolvedValue(MOCK_WORKSPACE)
    mockDb.agent.findFirst.mockResolvedValue(MOCK_AGENT)

    const req = new NextRequest('http://localhost/api/agents/agent-1/skills', {
      method: 'POST',
      body: JSON.stringify({ filename: 'my-skill.md', content: '# Skill content' }),
    })
    const res = await POST(req, makeParams('agent-1'))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, filename: 'my-skill.md' })
    expect(mockWriteAgentSkill).toHaveBeenCalledWith('agent-1', 'my-skill.md', '# Skill content')
  })

  it('sanitizes special characters from filename', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    mockDb.workspace.findFirst.mockResolvedValue(MOCK_WORKSPACE)
    mockDb.agent.findFirst.mockResolvedValue(MOCK_AGENT)

    const req = new NextRequest('http://localhost/api/agents/agent-1/skills', {
      method: 'POST',
      body: JSON.stringify({ filename: 'my skill!@#$.md', content: 'content' }),
    })
    const res = await POST(req, makeParams('agent-1'))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.filename).toBe('myskill.md')
    expect(mockWriteAgentSkill).toHaveBeenCalledWith('agent-1', 'myskill.md', 'content')
  })

  it('adds .md extension if not present', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    mockDb.workspace.findFirst.mockResolvedValue(MOCK_WORKSPACE)
    mockDb.agent.findFirst.mockResolvedValue(MOCK_AGENT)

    const req = new NextRequest('http://localhost/api/agents/agent-1/skills', {
      method: 'POST',
      body: JSON.stringify({ filename: 'my-skill', content: 'content' }),
    })
    const res = await POST(req, makeParams('agent-1'))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.filename).toBe('my-skill.md')
  })
})
