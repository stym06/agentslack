import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockDb, mockIO, mockGetNextTaskNumber, mockEnrichTask, mockEmitTaskSystemMessage } = vi.hoisted(() => {
  const mockEmit = vi.fn()
  const mockTo = vi.fn(() => ({ emit: mockEmit }))
  return {
    mockDb: {
      agent: { findUnique: vi.fn() },
      task: { findMany: vi.fn(), create: vi.fn() },
      taskGroup: { create: vi.fn() },
      message: { create: vi.fn() },
      project: { findFirst: vi.fn() },
    },
    mockIO: { to: mockTo, emit: mockEmit, _toEmit: mockEmit },
    mockGetNextTaskNumber: vi.fn().mockResolvedValue(1),
    mockEnrichTask: vi.fn(async (t: any) => ({
      id: t.id,
      channel_id: t.channelId,
      task_number: t.taskNumber,
      title: t.title,
      status: t.status,
    })),
    mockEmitTaskSystemMessage: vi.fn(),
  }
})

vi.mock('@/lib/db', () => ({ db: mockDb }))
vi.mock('@/server/socket-server', () => ({ getIO: () => mockIO }))
vi.mock('@/lib/tasks/helpers', () => ({
  getNextTaskNumber: mockGetNextTaskNumber,
  enrichTask: mockEnrichTask,
  emitTaskSystemMessage: mockEmitTaskSystemMessage,
}))

import { GET, POST } from '@/app/api/internal/agent/[agentId]/tasks/route'
import { NextRequest } from 'next/server'

function makeGetRequest(query: Record<string, string>) {
  const url = new URL('http://localhost/api/internal/agent/agent-1/tasks')
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v)
  return new NextRequest(url)
}

function makePostRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/internal/agent/agent-1/tasks', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/internal/agent/[agentId]/tasks', () => {
  it('returns all tasks globally when channelId is omitted', async () => {
    mockDb.task.findMany.mockResolvedValue([])
    const req = makeGetRequest({})
    const res = await GET(req, { params: Promise.resolve({ agentId: 'agent-1' }) })
    expect(res.status).toBe(200)
    expect(mockDb.task.findMany).toHaveBeenCalledWith({ where: {}, orderBy: { taskNumber: 'asc' } })
  })

  it('returns all tasks when status is all (default)', async () => {
    const tasks = [
      { id: 't1', channelId: 'ch-1', taskNumber: 1, title: 'Task 1', status: 'todo' },
      { id: 't2', channelId: 'ch-1', taskNumber: 2, title: 'Task 2', status: 'done' },
    ]
    mockDb.task.findMany.mockResolvedValue(tasks)

    const req = makeGetRequest({ channelId: 'ch-1' })
    const res = await GET(req, { params: Promise.resolve({ agentId: 'agent-1' }) })

    expect(res.status).toBe(200)
    expect(mockDb.task.findMany).toHaveBeenCalledWith({
      where: { channelId: 'ch-1' },
      orderBy: { taskNumber: 'asc' },
    })
    expect(mockEnrichTask).toHaveBeenCalledTimes(2)
  })

  it('filters by status when provided', async () => {
    mockDb.task.findMany.mockResolvedValue([])

    const req = makeGetRequest({ channelId: 'ch-1', status: 'todo' })
    await GET(req, { params: Promise.resolve({ agentId: 'agent-1' }) })

    expect(mockDb.task.findMany).toHaveBeenCalledWith({
      where: { channelId: 'ch-1', status: 'todo' },
      orderBy: { taskNumber: 'asc' },
    })
  })

  it('enriches all tasks and returns them', async () => {
    const tasks = [
      { id: 't1', channelId: 'ch-1', taskNumber: 1, title: 'Task 1', status: 'todo' },
    ]
    mockDb.task.findMany.mockResolvedValue(tasks)

    const req = makeGetRequest({ channelId: 'ch-1' })
    const res = await GET(req, { params: Promise.resolve({ agentId: 'agent-1' }) })

    const json = await res.json()
    expect(json.tasks).toEqual([
      { id: 't1', channel_id: 'ch-1', task_number: 1, title: 'Task 1', status: 'todo' },
    ])
  })
})

describe('POST /api/internal/agent/[agentId]/tasks', () => {
  it('returns 400 when channelId is missing', async () => {
    const req = makePostRequest({ tasks: [{ title: 'Task' }] })
    const res = await POST(req, { params: Promise.resolve({ agentId: 'agent-1' }) })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'channelId and tasks required' })
  })

  it('returns 400 when tasks array is empty', async () => {
    const req = makePostRequest({ channelId: 'ch-1', tasks: [] })
    const res = await POST(req, { params: Promise.resolve({ agentId: 'agent-1' }) })
    expect(res.status).toBe(400)
  })

  it('returns 400 when projectId is missing', async () => {
    const req = makePostRequest({ channelId: 'ch-1', tasks: [{ title: 'Task' }] })
    const res = await POST(req, { params: Promise.resolve({ agentId: 'agent-1' }) })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'projectId is required. Call list_projects to find available projects.' })
  })

  it('returns 404 when project not found', async () => {
    mockDb.project.findFirst.mockResolvedValue(null)

    const req = makePostRequest({ channelId: 'ch-1', projectId: 'bad-id', tasks: [{ title: 'Task' }] })
    const res = await POST(req, { params: Promise.resolve({ agentId: 'agent-1' }) })
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Project not found or not active' })
  })

  it('creates a single task without task group', async () => {
    mockDb.project.findFirst.mockResolvedValue({ id: 'proj-1', status: 'active' })
    mockDb.agent.findUnique.mockResolvedValue({ name: 'TestBot' })
    mockDb.message.create.mockResolvedValue({ id: 'msg-1' })
    mockDb.task.create.mockResolvedValue({
      id: 't1', channelId: 'ch-1', taskNumber: 1, title: 'Do thing', status: 'todo', messageId: 'msg-1',
    })
    mockGetNextTaskNumber.mockResolvedValue(1)

    const req = makePostRequest({ channelId: 'ch-1', projectId: 'proj-1', tasks: [{ title: 'Do thing' }] })
    const res = await POST(req, { params: Promise.resolve({ agentId: 'agent-1' }) })

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.tasks).toHaveLength(1)
    expect(json.tasks[0]).toEqual({ taskNumber: 1, messageId: 'msg-1', title: 'Do thing' })

    // No task group for single task without summary
    expect(mockDb.taskGroup.create).not.toHaveBeenCalled()

    // Verify projectId is passed to task creation
    expect(mockDb.task.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ projectId: 'proj-1' }),
    })
  })

  it('creates task group when multiple tasks', async () => {
    mockDb.project.findFirst.mockResolvedValue({ id: 'proj-1', status: 'active' })
    mockDb.agent.findUnique.mockResolvedValue({ name: 'TestBot' })
    mockDb.taskGroup.create.mockResolvedValue({ id: 'group-1' })
    mockDb.message.create.mockResolvedValueOnce({ id: 'msg-1' }).mockResolvedValueOnce({ id: 'msg-2' })
    mockDb.task.create
      .mockResolvedValueOnce({ id: 't1', channelId: 'ch-1', taskNumber: 1, title: 'Task A', status: 'todo', messageId: 'msg-1' })
      .mockResolvedValueOnce({ id: 't2', channelId: 'ch-1', taskNumber: 2, title: 'Task B', status: 'todo', messageId: 'msg-2' })
    mockGetNextTaskNumber.mockResolvedValueOnce(1).mockResolvedValueOnce(2)

    const req = makePostRequest({ channelId: 'ch-1', projectId: 'proj-1', tasks: [{ title: 'Task A' }, { title: 'Task B' }] })
    const res = await POST(req, { params: Promise.resolve({ agentId: 'agent-1' }) })

    expect(mockDb.taskGroup.create).toHaveBeenCalledWith({
      data: {
        channelId: 'ch-1',
        summary: 'Task A, Task B',
        createdByType: 'agent',
        createdById: 'agent-1',
      },
    })
    expect(res.status).toBe(200)
  })

  it('creates task group when summary is provided even for single task', async () => {
    mockDb.project.findFirst.mockResolvedValue({ id: 'proj-1', status: 'active' })
    mockDb.agent.findUnique.mockResolvedValue({ name: 'TestBot' })
    mockDb.taskGroup.create.mockResolvedValue({ id: 'group-1' })
    mockDb.message.create.mockResolvedValue({ id: 'msg-1' })
    mockDb.task.create.mockResolvedValue({
      id: 't1', channelId: 'ch-1', taskNumber: 1, title: 'Fix bug', status: 'todo', messageId: 'msg-1',
    })

    const req = makePostRequest({ channelId: 'ch-1', projectId: 'proj-1', tasks: [{ title: 'Fix bug' }], summary: 'Bugfix batch' })
    await POST(req, { params: Promise.resolve({ agentId: 'agent-1' }) })

    expect(mockDb.taskGroup.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ summary: 'Bugfix batch' }),
    })
  })

  it('emits task:created for each task', async () => {
    mockDb.project.findFirst.mockResolvedValue({ id: 'proj-1', status: 'active' })
    mockDb.agent.findUnique.mockResolvedValue({ name: 'TestBot' })
    mockDb.message.create.mockResolvedValue({ id: 'msg-1' })
    mockDb.task.create.mockResolvedValue({
      id: 't1', channelId: 'ch-1', taskNumber: 1, title: 'Task', status: 'todo', messageId: 'msg-1',
    })

    const req = makePostRequest({ channelId: 'ch-1', projectId: 'proj-1', tasks: [{ title: 'Task' }] })
    await POST(req, { params: Promise.resolve({ agentId: 'agent-1' }) })

    expect(mockIO.to).toHaveBeenCalledWith('channel:ch-1')
    expect(mockIO._toEmit).toHaveBeenCalledWith('task:created', expect.objectContaining({ id: 't1' }))
  })
})
