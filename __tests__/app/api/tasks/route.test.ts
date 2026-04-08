import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockGetServerSession, mockDb, mockIO, mockGetNextTaskNumber, mockEnrichTask } = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  mockDb: {
    task: { findMany: vi.fn(), create: vi.fn() },
    taskGroup: { findMany: vi.fn() },
    message: { create: vi.fn(), count: vi.fn(), findUnique: vi.fn() },
    project: { findFirst: vi.fn() },
    user: { findUnique: vi.fn() },
  },
  mockIO: {
    to: vi.fn().mockReturnThis(),
    emit: vi.fn(),
  },
  mockGetNextTaskNumber: vi.fn(),
  mockEnrichTask: vi.fn(async (t: any) => ({
    id: t.id,
    channel_id: t.channelId,
    task_number: t.taskNumber,
    title: t.title,
    status: t.status,
    message_id: t.messageId,
    created_by_name: 'TestUser',
    claimed_by_name: null,
  })),
}))

vi.mock('next-auth', () => ({ getServerSession: mockGetServerSession }))
vi.mock('@/lib/auth/config', () => ({ authOptions: {} }))
vi.mock('@/lib/db', () => ({ db: mockDb }))
vi.mock('@/server/socket-server', () => ({ getIO: () => mockIO }))
vi.mock('@/lib/tasks/helpers', () => ({
  getNextTaskNumber: mockGetNextTaskNumber,
  enrichTask: mockEnrichTask,
}))

import { GET, POST } from '@/app/api/tasks/route'
import { NextRequest } from 'next/server'

const MOCK_SESSION = {
  user: { id: 'user-1', email: 'test@test.com', name: 'TestUser' },
  expires: '2099-01-01',
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetNextTaskNumber.mockResolvedValue(1)
})

describe('GET /api/tasks', () => {
  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValue(null)

    const req = new NextRequest('http://localhost/api/tasks?channel_id=ch-1')
    const res = await GET(req)

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Unauthorized' })
  })

  it('returns all tasks when channel_id is omitted', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    mockDb.task.findMany.mockResolvedValue([])
    mockDb.taskGroup.findMany.mockResolvedValue([])

    const req = new NextRequest('http://localhost/api/tasks')
    const res = await GET(req)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.tasks).toEqual([])
    expect(body.groups).toEqual([])
    expect(mockDb.task.findMany).toHaveBeenCalledWith({
      where: {},
      orderBy: { taskNumber: 'asc' },
      include: { message: true, group: true },
    })
  })

  it('returns enriched tasks and groups', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    const tasks = [
      {
        id: 't-1',
        channelId: 'ch-1',
        taskNumber: 1,
        title: 'Fix bug',
        status: 'todo',
        messageId: 'msg-1',
        groupId: 'g-1',
        message: { id: 'msg-1' },
        group: { summary: 'Bug fixes' },
      },
    ]
    mockDb.task.findMany.mockResolvedValue(tasks)
    mockDb.message.count.mockResolvedValue(3)
    const groups = [{ id: 'g-1', channelId: 'ch-1', summary: 'Bug fixes', createdAt: new Date() }]
    mockDb.taskGroup.findMany.mockResolvedValue(groups)

    const req = new NextRequest('http://localhost/api/tasks?channel_id=ch-1')
    const res = await GET(req)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.tasks).toHaveLength(1)
    expect(body.tasks[0].id).toBe('t-1')
    expect(body.tasks[0].group_id).toBe('g-1')
    expect(body.tasks[0].group_summary).toBe('Bug fixes')
    expect(body.tasks[0].comment_count).toBe(3)
    expect(body.groups).toHaveLength(1)
    expect(body.groups[0].id).toBe('g-1')
    expect(body.groups[0].summary).toBe('Bug fixes')
    expect(mockEnrichTask).toHaveBeenCalledWith(tasks[0])
    expect(mockDb.task.findMany).toHaveBeenCalledWith({
      where: { channelId: 'ch-1' },
      orderBy: { taskNumber: 'asc' },
      include: { message: true, group: true },
    })
  })

  it('filters by status when provided', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    mockDb.task.findMany.mockResolvedValue([])
    mockDb.taskGroup.findMany.mockResolvedValue([])

    const req = new NextRequest('http://localhost/api/tasks?channel_id=ch-1&status=done')
    const res = await GET(req)

    expect(res.status).toBe(200)
    expect(mockDb.task.findMany).toHaveBeenCalledWith({
      where: { channelId: 'ch-1', status: 'done' },
      orderBy: { taskNumber: 'asc' },
      include: { message: true, group: true },
    })
  })
})

describe('POST /api/tasks', () => {
  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValue(null)

    const req = new NextRequest('http://localhost/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ channel_id: 'ch-1', title: 'New task' }),
    })
    const res = await POST(req)

    expect(res.status).toBe(401)
  })

  it('returns 400 when channel_id or title is missing', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)

    const req = new NextRequest('http://localhost/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ channel_id: 'ch-1' }),
    })
    const res = await POST(req)

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'channel_id and title required' })
  })

  it('returns 400 when project_id is missing', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)

    const req = new NextRequest('http://localhost/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ channel_id: 'ch-1', title: 'A task' }),
    })
    const res = await POST(req)

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'project_id is required' })
  })

  it('returns 404 when project not found', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    mockDb.project.findFirst.mockResolvedValue(null)

    const req = new NextRequest('http://localhost/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ channel_id: 'ch-1', title: 'A task', project_id: 'bad-id' }),
    })
    const res = await POST(req)

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Project not found or not active' })
  })

  it('creates message and task with project_id, emits task:created', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    mockGetNextTaskNumber.mockResolvedValue(1)
    mockDb.project.findFirst.mockResolvedValue({ id: 'proj-1', status: 'active' })
    const createdMessage = { id: 'msg-new', channelId: 'ch-1', content: 'Build feature' }
    mockDb.message.create.mockResolvedValue(createdMessage)
    const createdTask = {
      id: 't-new',
      channelId: 'ch-1',
      projectId: 'proj-1',
      messageId: 'msg-new',
      taskNumber: 1,
      title: 'Build feature',
      status: 'todo',
    }
    mockDb.task.create.mockResolvedValue(createdTask)
    mockDb.user.findUnique.mockResolvedValue({ name: 'TestUser', avatarUrl: null })

    const req = new NextRequest('http://localhost/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ channel_id: 'ch-1', title: 'Build feature', project_id: 'proj-1' }),
    })
    const res = await POST(req)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.id).toBe('t-new')

    expect(mockDb.task.create).toHaveBeenCalledWith({
      data: {
        channelId: 'ch-1',
        projectId: 'proj-1',
        groupId: null,
        messageId: 'msg-new',
        taskNumber: 1,
        title: 'Build feature',
        status: 'todo',
        createdByType: 'user',
        createdById: 'user-1',
      },
    })
    expect(mockIO.to).toHaveBeenCalledWith('channel:ch-1')
    expect(mockIO.emit).toHaveBeenCalledWith('task:created', expect.objectContaining({ id: 't-new' }))
  })

  it('reuses existing message when message_id is provided', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    mockGetNextTaskNumber.mockResolvedValue(1)
    mockDb.project.findFirst.mockResolvedValue({ id: 'proj-1', status: 'active' })
    mockDb.message.findUnique.mockResolvedValue({ id: 'existing-msg', channelId: 'ch-1', content: 'hello' })
    mockDb.task.create.mockResolvedValue({
      id: 't-new',
      channelId: 'ch-1',
      projectId: 'proj-1',
      messageId: 'existing-msg',
      taskNumber: 1,
      title: 'From message',
      status: 'todo',
    })
    mockDb.user.findUnique.mockResolvedValue({ name: 'TestUser', avatarUrl: null })

    const req = new NextRequest('http://localhost/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ channel_id: 'ch-1', title: 'From message', project_id: 'proj-1', message_id: 'existing-msg' }),
    })
    const res = await POST(req)

    expect(res.status).toBe(200)
    expect(mockDb.message.create).not.toHaveBeenCalled()
    expect(mockDb.task.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ messageId: 'existing-msg', projectId: 'proj-1' }),
    })
  })

  it('returns 404 when message_id is invalid', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    mockDb.project.findFirst.mockResolvedValue({ id: 'proj-1', status: 'active' })
    mockDb.message.findUnique.mockResolvedValue(null)

    const req = new NextRequest('http://localhost/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ channel_id: 'ch-1', title: 'Bad msg', project_id: 'proj-1', message_id: 'nope' }),
    })
    const res = await POST(req)

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Message not found' })
  })

  it('passes group_id when provided', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    mockGetNextTaskNumber.mockResolvedValue(2)
    mockDb.project.findFirst.mockResolvedValue({ id: 'proj-1', status: 'active' })
    mockDb.message.create.mockResolvedValue({ id: 'msg-2' })
    mockDb.task.create.mockResolvedValue({
      id: 't-2',
      channelId: 'ch-1',
      messageId: 'msg-2',
      taskNumber: 2,
      title: 'Grouped task',
      status: 'todo',
    })
    mockDb.user.findUnique.mockResolvedValue({ name: 'TestUser', avatarUrl: null })

    const req = new NextRequest('http://localhost/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ channel_id: 'ch-1', title: 'Grouped task', group_id: 'g-1', project_id: 'proj-1' }),
    })
    const res = await POST(req)

    expect(res.status).toBe(200)
    expect(mockDb.task.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ groupId: 'g-1', projectId: 'proj-1' }),
    })
  })
})
