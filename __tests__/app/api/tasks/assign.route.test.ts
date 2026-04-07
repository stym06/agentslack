import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const {
  mockGetServerSession,
  mockDb,
  mockGetIO,
  mockDaemon,
  mockSetupTaskWorktree,
  mockReadAgentInstructions,
  mockEnrichTask,
  mockEmitTaskSystemMessage,
} = vi.hoisted(() => {
  const mockEmit = vi.fn()
  const mockTo = vi.fn().mockReturnValue({ emit: mockEmit })
  const mockIO = { to: mockTo, emit: mockEmit }
  return {
    mockGetServerSession: vi.fn(),
    mockDb: {
      task: { findUnique: vi.fn(), update: vi.fn() },
      agentSession: { findFirst: vi.fn(), create: vi.fn() },
      agent: { findUnique: vi.fn() },
      project: { findUnique: vi.fn() },
    },
    mockGetIO: vi.fn().mockReturnValue(mockIO),
    mockDaemon: {
      startSession: vi.fn(),
      deliverSessionMessage: vi.fn(),
    },
    mockSetupTaskWorktree: vi.fn(),
    mockReadAgentInstructions: vi.fn(),
    mockEnrichTask: vi.fn(),
    mockEmitTaskSystemMessage: vi.fn(),
    mockIO,
    mockTo,
    mockEmit,
  }
})

vi.mock('next-auth', () => ({ getServerSession: mockGetServerSession }))
vi.mock('@/lib/auth/config', () => ({ authOptions: {} }))
vi.mock('@/lib/db', () => ({ db: mockDb }))
vi.mock('@/server/socket-server', () => ({ getIO: mockGetIO }))
vi.mock('@/server/agent-daemon', () => ({ getAgentDaemon: () => mockDaemon }))
vi.mock('@/lib/projects/worktree', () => ({ setupTaskWorktree: mockSetupTaskWorktree }))
vi.mock('@/lib/agents/directory', () => ({ readAgentInstructions: mockReadAgentInstructions }))
vi.mock('@/lib/tasks/helpers', () => ({
  enrichTask: mockEnrichTask,
  emitTaskSystemMessage: mockEmitTaskSystemMessage,
}))

import { POST } from '@/app/api/tasks/[taskId]/assign/route'

const MOCK_SESSION = {
  user: { id: 'user-1', email: 'test@test.com', name: 'TestUser' },
  expires: '2099-01-01',
}

function makeReq(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/tasks/task-1/assign', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

const PARAMS = { params: Promise.resolve({ taskId: 'task-1' }) }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('POST /api/tasks/[taskId]/assign', () => {
  it('returns 401 if not authenticated', async () => {
    mockGetServerSession.mockResolvedValue(null)
    const res = await POST(makeReq({ agent_id: 'a-1', project_id: 'p-1' }), PARAMS)
    expect(res.status).toBe(401)
  })

  it('returns 400 if agent_id missing', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    const res = await POST(makeReq({ project_id: 'p-1' }), PARAMS)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'agent_id and project_id required' })
  })

  it('returns 400 if project_id missing', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    const res = await POST(makeReq({ agent_id: 'a-1' }), PARAMS)
    expect(res.status).toBe(400)
  })

  it('returns 404 if task not found', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    mockDb.task.findUnique.mockResolvedValue(null)
    const res = await POST(makeReq({ agent_id: 'a-1', project_id: 'p-1' }), PARAMS)
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Task not found' })
  })

  it('returns 409 if task already has active session', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    mockDb.task.findUnique.mockResolvedValue({ id: 'task-1', channelId: 'ch-1', messageId: 'msg-1', taskNumber: 1, title: 'Test' })
    mockDb.agentSession.findFirst.mockResolvedValue({ id: 'session-1' })
    const res = await POST(makeReq({ agent_id: 'a-1', project_id: 'p-1' }), PARAMS)
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'Task already has an active session' })
  })

  it('returns 404 if agent not found', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    mockDb.task.findUnique.mockResolvedValue({ id: 'task-1' })
    mockDb.agentSession.findFirst.mockResolvedValue(null)
    mockDb.agent.findUnique.mockResolvedValue(null)
    const res = await POST(makeReq({ agent_id: 'a-1', project_id: 'p-1' }), PARAMS)
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Agent not found' })
  })

  it('returns 404 if project not found', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    mockDb.task.findUnique.mockResolvedValue({ id: 'task-1' })
    mockDb.agentSession.findFirst.mockResolvedValue(null)
    mockDb.agent.findUnique.mockResolvedValue({ id: 'a-1', name: 'Bot', openclawId: 'bot', model: 'anthropic/claude-sonnet-4-5', soulMd: null, isAdmin: false })
    mockDb.project.findUnique.mockResolvedValue(null)
    const res = await POST(makeReq({ agent_id: 'a-1', project_id: 'p-1' }), PARAMS)
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Project not found' })
  })

  it('returns 400 if project is not active', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    mockDb.task.findUnique.mockResolvedValue({ id: 'task-1' })
    mockDb.agentSession.findFirst.mockResolvedValue(null)
    mockDb.agent.findUnique.mockResolvedValue({ id: 'a-1', name: 'Bot' })
    mockDb.project.findUnique.mockResolvedValue({ id: 'p-1', status: 'archived', name: 'Proj' })
    const res = await POST(makeReq({ agent_id: 'a-1', project_id: 'p-1' }), PARAMS)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Project is not active (status: archived)' })
  })

  it('happy path: assigns task, starts session, emits events', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)

    const task = { id: 'task-1', channelId: 'ch-1', messageId: 'msg-1', taskNumber: 1, title: 'Do stuff' }
    const agent = { id: 'a-1', openclawId: 'bot', name: 'Bot', model: 'anthropic/claude-sonnet-4-5', soulMd: 'soul', isAdmin: false }
    const project = { id: 'p-1', status: 'active', name: 'MyProject', repoPath: '/repo' }
    const agentSession = { id: 'sess-1', createdAt: new Date() }

    mockDb.task.findUnique.mockResolvedValue(task)
    mockDb.agentSession.findFirst.mockResolvedValue(null)
    mockDb.agent.findUnique.mockResolvedValue(agent)
    mockDb.project.findUnique.mockResolvedValue(project)
    mockReadAgentInstructions.mockReturnValue('instructions')
    mockSetupTaskWorktree.mockResolvedValue({ worktreePath: '/wt/path', branchName: 'task-1-do-stuff' })
    mockDb.agentSession.create.mockResolvedValue(agentSession)
    mockDb.task.update.mockResolvedValue({ ...task, claimedById: 'a-1', status: 'in_progress' })
    mockEnrichTask.mockResolvedValue({ ...task, enriched: true })
    mockEmitTaskSystemMessage.mockResolvedValue(undefined)

    const res = await POST(makeReq({ agent_id: 'a-1', project_id: 'p-1' }), PARAMS)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.task.enriched).toBe(true)
    expect(body.worktree_path).toBe('/wt/path')
    expect(body.branch_name).toBe('task-1-do-stuff')

    expect(mockDaemon.startSession).toHaveBeenCalled()
    expect(mockDaemon.deliverSessionMessage).toHaveBeenCalledWith('a-1', 'task-1', expect.objectContaining({
      channelId: 'ch-1',
      threadId: 'msg-1',
    }))
    expect(mockEnrichTask).toHaveBeenCalled()
    expect(mockEmitTaskSystemMessage).toHaveBeenCalled()
  })
})
