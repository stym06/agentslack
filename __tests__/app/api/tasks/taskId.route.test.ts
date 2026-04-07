import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockGetServerSession, mockDb, mockIO, mockEnrichTask, mockEmitTaskSystemMessage } =
  vi.hoisted(() => ({
    mockGetServerSession: vi.fn(),
    mockDb: {
      task: { findUnique: vi.fn(), update: vi.fn() },
      user: { findUnique: vi.fn() },
    },
    mockIO: {
      to: vi.fn().mockReturnThis(),
      emit: vi.fn(),
    },
    mockEnrichTask: vi.fn(),
    mockEmitTaskSystemMessage: vi.fn(),
  }))

vi.mock('next-auth', () => ({ getServerSession: mockGetServerSession }))
vi.mock('@/lib/auth/config', () => ({ authOptions: {} }))
vi.mock('@/lib/db', () => ({ db: mockDb }))
vi.mock('@/server/socket-server', () => ({ getIO: () => mockIO }))
vi.mock('@/lib/tasks/helpers', () => ({
  enrichTask: mockEnrichTask,
  emitTaskSystemMessage: mockEmitTaskSystemMessage,
}))

import { PATCH } from '@/app/api/tasks/[taskId]/route'
import { NextRequest } from 'next/server'

const MOCK_SESSION = {
  user: { id: 'user-1', email: 'test@test.com', name: 'TestUser' },
  expires: '2099-01-01',
}

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/tasks/task-1', {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

function makeParams(taskId = 'task-1') {
  return { params: Promise.resolve({ taskId }) }
}

const MOCK_TASK = {
  id: 'task-1',
  channelId: 'ch-1',
  taskNumber: 5,
  title: 'Fix bug',
  status: 'todo',
  createdByType: 'user',
  createdById: 'user-1',
  claimedByType: null,
  claimedById: null,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-02'),
}

beforeEach(() => {
  vi.clearAllMocks()
  mockEmitTaskSystemMessage.mockResolvedValue(undefined)
})

describe('PATCH /api/tasks/[taskId]', () => {
  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValue(null)

    const res = await PATCH(makeRequest({ status: 'done' }), makeParams())

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Unauthorized' })
  })

  it('returns 404 when task not found', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    mockDb.task.findUnique.mockResolvedValue(null)

    const res = await PATCH(makeRequest({ status: 'done' }), makeParams())

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Task not found' })
  })

  it('updates status and emits task:updated and system message', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    mockDb.task.findUnique.mockResolvedValue(MOCK_TASK)
    const updatedTask = { ...MOCK_TASK, status: 'in_progress' }
    mockDb.task.update.mockResolvedValue(updatedTask)
    const enriched = { ...updatedTask, created_by_name: 'TestUser', claimed_by_name: null }
    mockEnrichTask.mockResolvedValue(enriched)
    mockDb.user.findUnique.mockResolvedValue({ name: 'TestUser' })

    const res = await PATCH(makeRequest({ status: 'in_progress' }), makeParams())

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.id).toBe(enriched.id)
    expect(body.status).toBe(enriched.status)
    expect(body.created_by_name).toBe(enriched.created_by_name)

    expect(mockDb.task.update).toHaveBeenCalledWith({
      where: { id: 'task-1' },
      data: { status: 'in_progress' },
    })
    expect(mockIO.to).toHaveBeenCalledWith('channel:ch-1')
    expect(mockIO.emit).toHaveBeenCalledWith('task:updated', enriched)
    expect(mockEmitTaskSystemMessage).toHaveBeenCalledWith(
      'ch-1',
      'user-1',
      'user',
      'TestUser moved #5 "Fix bug" to in progress',
    )
  })

  it('does not emit status system message when status unchanged', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    mockDb.task.findUnique.mockResolvedValue(MOCK_TASK)
    mockDb.task.update.mockResolvedValue(MOCK_TASK)
    mockEnrichTask.mockResolvedValue({ ...MOCK_TASK })
    mockDb.user.findUnique.mockResolvedValue({ name: 'TestUser' })

    await PATCH(makeRequest({ status: 'todo' }), makeParams())

    // emitTaskSystemMessage should not be called for status (same status)
    expect(mockEmitTaskSystemMessage).not.toHaveBeenCalled()
  })

  it('claims a task and auto-transitions from todo to in_progress', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    mockDb.task.findUnique.mockResolvedValue(MOCK_TASK)
    const updatedTask = { ...MOCK_TASK, claimedByType: 'user', claimedById: 'user-1', status: 'in_progress' }
    mockDb.task.update.mockResolvedValue(updatedTask)
    mockEnrichTask.mockResolvedValue(updatedTask)
    mockDb.user.findUnique.mockResolvedValue({ name: 'TestUser' })

    const res = await PATCH(makeRequest({ claim: true }), makeParams())

    expect(res.status).toBe(200)
    expect(mockDb.task.update).toHaveBeenCalledWith({
      where: { id: 'task-1' },
      data: {
        claimedByType: 'user',
        claimedById: 'user-1',
        status: 'in_progress',
      },
    })
    expect(mockEmitTaskSystemMessage).toHaveBeenCalledWith(
      'ch-1',
      'user-1',
      'user',
      'TestUser claimed #5 "Fix bug"',
    )
  })

  it('returns 409 when task already claimed by another user', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    const claimedTask = { ...MOCK_TASK, claimedById: 'other-user', claimedByType: 'user' }
    mockDb.task.findUnique.mockResolvedValue(claimedTask)

    const res = await PATCH(makeRequest({ claim: true }), makeParams())

    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'Task already claimed' })
  })

  it('allows re-claiming by the same user', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    const selfClaimed = { ...MOCK_TASK, claimedById: 'user-1', claimedByType: 'user', status: 'in_progress' }
    mockDb.task.findUnique.mockResolvedValue(selfClaimed)
    mockDb.task.update.mockResolvedValue(selfClaimed)
    mockEnrichTask.mockResolvedValue(selfClaimed)
    mockDb.user.findUnique.mockResolvedValue({ name: 'TestUser' })

    const res = await PATCH(makeRequest({ claim: true }), makeParams())

    expect(res.status).toBe(200)
  })

  it('unclaims a task', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    const claimedTask = { ...MOCK_TASK, claimedById: 'user-1', claimedByType: 'user' }
    mockDb.task.findUnique.mockResolvedValue(claimedTask)
    const updatedTask = { ...MOCK_TASK, claimedByType: null, claimedById: null }
    mockDb.task.update.mockResolvedValue(updatedTask)
    mockEnrichTask.mockResolvedValue(updatedTask)
    mockDb.user.findUnique.mockResolvedValue({ name: 'TestUser' })

    const res = await PATCH(makeRequest({ claim: false }), makeParams())

    expect(res.status).toBe(200)
    expect(mockDb.task.update).toHaveBeenCalledWith({
      where: { id: 'task-1' },
      data: {
        claimedByType: null,
        claimedById: null,
      },
    })
    expect(mockEmitTaskSystemMessage).toHaveBeenCalledWith(
      'ch-1',
      'user-1',
      'user',
      'TestUser unclaimed #5 "Fix bug"',
    )
  })

  it('handles both status change and claim together', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    mockDb.task.findUnique.mockResolvedValue(MOCK_TASK)
    const updatedTask = { ...MOCK_TASK, status: 'done', claimedByType: 'user', claimedById: 'user-1' }
    mockDb.task.update.mockResolvedValue(updatedTask)
    mockEnrichTask.mockResolvedValue(updatedTask)
    mockDb.user.findUnique.mockResolvedValue({ name: 'TestUser' })

    const res = await PATCH(makeRequest({ status: 'done', claim: true }), makeParams())

    expect(res.status).toBe(200)
    // Both status and claim system messages should be emitted
    expect(mockEmitTaskSystemMessage).toHaveBeenCalledTimes(2)
    expect(mockEmitTaskSystemMessage).toHaveBeenCalledWith(
      'ch-1',
      'user-1',
      'user',
      expect.stringContaining('moved #5'),
    )
    expect(mockEmitTaskSystemMessage).toHaveBeenCalledWith(
      'ch-1',
      'user-1',
      'user',
      expect.stringContaining('claimed #5'),
    )
  })

  it('falls back to "User" when user name not found', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    mockDb.task.findUnique.mockResolvedValue(MOCK_TASK)
    mockDb.task.update.mockResolvedValue({ ...MOCK_TASK, status: 'done' })
    mockEnrichTask.mockResolvedValue({ ...MOCK_TASK, status: 'done' })
    mockDb.user.findUnique.mockResolvedValue(null)

    await PATCH(makeRequest({ status: 'done' }), makeParams())

    expect(mockEmitTaskSystemMessage).toHaveBeenCalledWith(
      'ch-1',
      'user-1',
      'user',
      'User moved #5 "Fix bug" to done',
    )
  })
})
