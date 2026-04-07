import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    agentSession: { findFirst: vi.fn() },
  },
}))

vi.mock('@/lib/db', () => ({ db: mockDb }))

import { GET } from '@/app/api/internal/agent/[agentId]/session-context/route'
import { NextRequest } from 'next/server'

function makeRequest(query: Record<string, string>) {
  const url = new URL('http://localhost/api/internal/agent/agent-1/session-context')
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v)
  return new NextRequest(url)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/internal/agent/[agentId]/session-context', () => {
  it('returns 400 when task_id is missing', async () => {
    const req = makeRequest({})
    const res = await GET(req, { params: Promise.resolve({ agentId: 'agent-1' }) })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'task_id required' })
  })

  it('returns 404 when no active session found', async () => {
    mockDb.agentSession.findFirst.mockResolvedValue(null)

    const req = makeRequest({ task_id: 'task-1' })
    const res = await GET(req, { params: Promise.resolve({ agentId: 'agent-1' }) })

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'No active session found' })
  })

  it('queries for active session with task and project include', async () => {
    mockDb.agentSession.findFirst.mockResolvedValue(null)

    const req = makeRequest({ task_id: 'task-1' })
    await GET(req, { params: Promise.resolve({ agentId: 'agent-1' }) })

    expect(mockDb.agentSession.findFirst).toHaveBeenCalledWith({
      where: { agentId: 'agent-1', taskId: 'task-1', status: 'active' },
      include: { task: true, project: true },
    })
  })

  it('returns session, task, and project data', async () => {
    mockDb.agentSession.findFirst.mockResolvedValue({
      id: 'session-1',
      worktreePath: '/tmp/wt',
      branchName: 'feat/thing',
      task: {
        id: 'task-1',
        taskNumber: 5,
        title: 'Fix the bug',
        status: 'in_progress',
        messageId: 'msg-1',
        channelId: 'ch-1',
      },
      project: {
        id: 'proj-1',
        name: 'MyProject',
        repoPath: '/repos/myproj',
        gitUrl: 'https://github.com/org/repo.git',
      },
    })

    const req = makeRequest({ task_id: 'task-1' })
    const res = await GET(req, { params: Promise.resolve({ agentId: 'agent-1' }) })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      session_id: 'session-1',
      task: {
        id: 'task-1',
        task_number: 5,
        title: 'Fix the bug',
        status: 'in_progress',
        message_id: 'msg-1',
        channel_id: 'ch-1',
      },
      project: {
        id: 'proj-1',
        name: 'MyProject',
        repo_path: '/repos/myproj',
        git_url: 'https://github.com/org/repo.git',
      },
      worktree_path: '/tmp/wt',
      branch_name: 'feat/thing',
    })
  })
})
