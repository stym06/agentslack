import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    agent: { findFirst: vi.fn() },
    project: { findMany: vi.fn() },
  },
}))

vi.mock('@/lib/db', () => ({ db: mockDb }))

import { GET } from '@/app/api/internal/agent/[agentId]/list-projects/route'
import { NextRequest } from 'next/server'

beforeEach(() => {
  vi.clearAllMocks()
})

function makeParams(agentId: string) {
  return { params: Promise.resolve({ agentId }) }
}

describe('GET /api/internal/agent/[agentId]/list-projects', () => {
  it('returns 404 when agent not found', async () => {
    mockDb.agent.findFirst.mockResolvedValue(null)

    const req = new NextRequest('http://localhost/api/internal/agent/agent-1/list-projects')
    const res = await GET(req, makeParams('agent-1'))

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Agent not found' })
  })

  it('returns active projects', async () => {
    mockDb.agent.findFirst.mockResolvedValue({ id: 'agent-1' })
    mockDb.project.findMany.mockResolvedValue([
      { id: 'p1', name: 'MyProject', repoPath: '/repos/my', gitUrl: 'https://github.com/x/y', channelId: 'ch-1' },
      { id: 'p2', name: 'Other', repoPath: '/repos/other', gitUrl: null, channelId: null },
    ])

    const req = new NextRequest('http://localhost/api/internal/agent/agent-1/list-projects')
    const res = await GET(req, makeParams('agent-1'))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.projects).toEqual([
      { id: 'p1', name: 'MyProject', repo_path: '/repos/my', git_url: 'https://github.com/x/y', channel_id: 'ch-1' },
      { id: 'p2', name: 'Other', repo_path: '/repos/other', git_url: null, channel_id: null },
    ])

    expect(mockDb.project.findMany).toHaveBeenCalledWith({
      where: { status: 'active' },
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, repoPath: true, gitUrl: true, channelId: true },
    })
  })

  it('returns empty array when no projects', async () => {
    mockDb.agent.findFirst.mockResolvedValue({ id: 'agent-1' })
    mockDb.project.findMany.mockResolvedValue([])

    const req = new NextRequest('http://localhost/api/internal/agent/agent-1/list-projects')
    const res = await GET(req, makeParams('agent-1'))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.projects).toEqual([])
  })
})
