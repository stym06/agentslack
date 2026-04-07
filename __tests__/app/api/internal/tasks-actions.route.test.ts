import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockDb, mockIO, mockEnrichTask, mockEmitTaskSystemMessage, mockDaemon } = vi.hoisted(() => {
  const mockEmit = vi.fn()
  const mockTo = vi.fn(() => ({ emit: mockEmit }))
  return {
    mockDb: {
      agent: { findUnique: vi.fn() },
      task: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
      message: { findFirst: vi.fn() },
      agentSession: { findFirst: vi.fn(), update: vi.fn() },
    },
    mockIO: { to: mockTo, emit: mockEmit, _toEmit: mockEmit },
    mockEnrichTask: vi.fn(async (t: any) => ({
      id: t.id,
      channel_id: t.channelId,
      task_number: t.taskNumber,
      title: t.title,
      status: t.status,
    })),
    mockEmitTaskSystemMessage: vi.fn(),
    mockDaemon: { stopSession: vi.fn() },
  }
})

vi.mock('@/lib/db', () => ({ db: mockDb }))
vi.mock('@/server/socket-server', () => ({ getIO: () => mockIO }))
vi.mock('@/server/agent-daemon', () => ({ getAgentDaemon: () => mockDaemon }))
vi.mock('@/lib/tasks/helpers', () => ({
  enrichTask: mockEnrichTask,
  emitTaskSystemMessage: mockEmitTaskSystemMessage,
}))

import { POST as claimPOST } from '@/app/api/internal/agent/[agentId]/tasks/claim/route'
import { POST as unclaimPOST } from '@/app/api/internal/agent/[agentId]/tasks/unclaim/route'
import { POST as updateStatusPOST } from '@/app/api/internal/agent/[agentId]/tasks/update-status/route'
import { NextRequest } from 'next/server'

function makeRequest(url: string, body: Record<string, unknown>) {
  return new NextRequest(url, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

const PARAMS = { params: Promise.resolve({ agentId: 'agent-1' }) }

beforeEach(() => {
  vi.clearAllMocks()
  mockDb.agent.findUnique.mockResolvedValue({ name: 'TestBot' })
})

// ─── CLAIM ──────────────────────────────────────────────

describe('POST /api/internal/agent/[agentId]/tasks/claim', () => {
  const url = 'http://localhost/api/internal/agent/agent-1/tasks/claim'

  it('returns 400 when channelId is missing', async () => {
    const req = makeRequest(url, { task_numbers: [1] })
    const res = await claimPOST(req, PARAMS)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'channelId required' })
  })

  it('returns 400 when neither task_numbers nor message_ids provided', async () => {
    const req = makeRequest(url, { channelId: 'ch-1' })
    const res = await claimPOST(req, PARAMS)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'task_numbers or message_ids required' })
  })

  it('claims task by task number', async () => {
    const task = { id: 't1', channelId: 'ch-1', taskNumber: 1, title: 'Task 1', status: 'todo', claimedById: null, messageId: 'msg-1' }
    mockDb.task.findUnique.mockResolvedValue(task)
    const updatedTask = { ...task, status: 'in_progress', claimedById: 'agent-1', claimedByType: 'agent' }
    mockDb.task.update.mockResolvedValue(updatedTask)

    const req = makeRequest(url, { channelId: 'ch-1', task_numbers: [1] })
    const res = await claimPOST(req, PARAMS)

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.results[0]).toEqual({ taskNumber: 1, messageId: 'msg-1', success: true })

    expect(mockDb.task.update).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { claimedByType: 'agent', claimedById: 'agent-1', status: 'in_progress' },
    })
  })

  it('reports already-claimed task by another agent', async () => {
    mockDb.task.findUnique.mockResolvedValue({
      id: 't1', channelId: 'ch-1', taskNumber: 1, status: 'in_progress', claimedById: 'other-agent',
    })

    const req = makeRequest(url, { channelId: 'ch-1', task_numbers: [1] })
    const res = await claimPOST(req, PARAMS)

    const json = await res.json()
    expect(json.results[0]).toEqual({ taskNumber: 1, success: false, reason: 'already claimed' })
  })

  it('reports not-found task number', async () => {
    mockDb.task.findUnique.mockResolvedValue(null)

    const req = makeRequest(url, { channelId: 'ch-1', task_numbers: [99] })
    const res = await claimPOST(req, PARAMS)

    const json = await res.json()
    expect(json.results[0]).toEqual({ taskNumber: 99, success: false, reason: 'not found' })
  })

  it('converts message to task when claiming by message_id', async () => {
    // No existing task for message
    mockDb.task.findUnique
      .mockResolvedValueOnce(null) // first call: findUnique by messageId
    mockDb.message.findFirst.mockResolvedValue({
      id: 'msg-1', channelId: 'ch-1', content: 'Please fix this', senderType: 'user', senderId: 'u1', threadId: null,
    })
    mockDb.task.findFirst.mockResolvedValue({ taskNumber: 3 }) // last task number
    const newTask = { id: 't-new', channelId: 'ch-1', taskNumber: 4, title: 'Please fix this', status: 'todo', messageId: 'msg-1' }
    mockDb.task.create.mockResolvedValue(newTask)
    const updatedTask = { ...newTask, status: 'in_progress', claimedById: 'agent-1' }
    mockDb.task.update.mockResolvedValue(updatedTask)

    const req = makeRequest(url, { channelId: 'ch-1', message_ids: ['msg-1'] })
    const res = await claimPOST(req, PARAMS)

    const json = await res.json()
    expect(json.results[0]).toEqual({ taskNumber: 4, messageId: 'msg-1', success: true })

    expect(mockDb.task.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        channelId: 'ch-1',
        messageId: 'msg-1',
        taskNumber: 4,
        title: 'Please fix this',
        status: 'todo',
        createdByType: 'user',
        createdById: 'u1',
      }),
    })
  })

  it('emits system message for claimed tasks', async () => {
    const task = { id: 't1', channelId: 'ch-1', taskNumber: 1, title: 'Task 1', status: 'todo', claimedById: null, messageId: 'msg-1' }
    mockDb.task.findUnique.mockResolvedValue(task)
    mockDb.task.update.mockResolvedValue({ ...task, status: 'in_progress', claimedById: 'agent-1' })

    const req = makeRequest(url, { channelId: 'ch-1', task_numbers: [1] })
    await claimPOST(req, PARAMS)

    expect(mockEmitTaskSystemMessage).toHaveBeenCalledWith(
      'ch-1',
      'agent-1',
      'agent',
      'TestBot claimed #1',
    )
  })
})

// ─── UNCLAIM ────────────────────────────────────────────

describe('POST /api/internal/agent/[agentId]/tasks/unclaim', () => {
  const url = 'http://localhost/api/internal/agent/agent-1/tasks/unclaim'

  it('returns 400 when channelId or task_number missing', async () => {
    const req = makeRequest(url, { channelId: 'ch-1' })
    const res = await unclaimPOST(req, PARAMS)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'channelId and task_number required' })
  })

  it('returns 404 when task not found', async () => {
    mockDb.task.findUnique.mockResolvedValue(null)

    const req = makeRequest(url, { channelId: 'ch-1', task_number: 99 })
    const res = await unclaimPOST(req, PARAMS)
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Task not found' })
  })

  it('returns 403 when agent is not the claimant', async () => {
    mockDb.task.findUnique.mockResolvedValue({
      id: 't1', claimedById: 'other-agent', taskNumber: 1,
    })

    const req = makeRequest(url, { channelId: 'ch-1', task_number: 1 })
    const res = await unclaimPOST(req, PARAMS)
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'You are not the claimant' })
  })

  it('resets task to todo and emits update', async () => {
    const task = { id: 't1', channelId: 'ch-1', taskNumber: 1, title: 'Task 1', status: 'in_progress', claimedById: 'agent-1' }
    mockDb.task.findUnique.mockResolvedValue(task)
    const updated = { ...task, claimedByType: null, claimedById: null, status: 'todo' }
    mockDb.task.update.mockResolvedValue(updated)

    const req = makeRequest(url, { channelId: 'ch-1', task_number: 1 })
    const res = await unclaimPOST(req, PARAMS)

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true })

    expect(mockDb.task.update).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { claimedByType: null, claimedById: null, status: 'todo' },
    })

    expect(mockEmitTaskSystemMessage).toHaveBeenCalledWith(
      'ch-1',
      'agent-1',
      'agent',
      'TestBot unclaimed #1 "Task 1"',
    )
  })
})

// ─── UPDATE-STATUS ──────────────────────────────────────

describe('POST /api/internal/agent/[agentId]/tasks/update-status', () => {
  const url = 'http://localhost/api/internal/agent/agent-1/tasks/update-status'

  it('returns 400 when required fields missing', async () => {
    const req = makeRequest(url, { channelId: 'ch-1', task_number: 1 })
    const res = await updateStatusPOST(req, PARAMS)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'channelId, task_number, and status required' })
  })

  it('returns 400 for invalid status', async () => {
    const req = makeRequest(url, { channelId: 'ch-1', task_number: 1, status: 'invalid' })
    const res = await updateStatusPOST(req, PARAMS)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({
      error: 'Invalid status. Must be one of: todo, in_progress, in_review, done',
    })
  })

  it('returns 404 when task not found', async () => {
    mockDb.task.findUnique.mockResolvedValue(null)

    const req = makeRequest(url, { channelId: 'ch-1', task_number: 1, status: 'done' })
    const res = await updateStatusPOST(req, PARAMS)
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Task not found' })
  })

  it('returns 403 when agent is not the assignee', async () => {
    mockDb.task.findUnique.mockResolvedValue({
      id: 't1', claimedById: 'other-agent', taskNumber: 1,
    })

    const req = makeRequest(url, { channelId: 'ch-1', task_number: 1, status: 'in_review' })
    const res = await updateStatusPOST(req, PARAMS)
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'You must be the assignee to update status' })
  })

  it('updates status and emits task:updated', async () => {
    const task = { id: 't1', channelId: 'ch-1', taskNumber: 1, title: 'Task 1', status: 'in_progress', claimedById: 'agent-1' }
    mockDb.task.findUnique.mockResolvedValue(task)
    const updated = { ...task, status: 'in_review' }
    mockDb.task.update.mockResolvedValue(updated)

    const req = makeRequest(url, { channelId: 'ch-1', task_number: 1, status: 'in_review' })
    const res = await updateStatusPOST(req, PARAMS)

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.success).toBe(true)

    expect(mockDb.task.update).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { status: 'in_review' },
    })

    expect(mockIO.to).toHaveBeenCalledWith('channel:ch-1')
    expect(mockIO._toEmit).toHaveBeenCalledWith('task:updated', expect.objectContaining({ id: 't1' }))

    expect(mockEmitTaskSystemMessage).toHaveBeenCalledWith(
      'ch-1',
      'agent-1',
      'agent',
      'TestBot moved #1 "Task 1" to in review',
    )
  })

  it('handles done status: stops session and marks completed', async () => {
    const task = { id: 't1', channelId: 'ch-1', taskNumber: 1, title: 'Task 1', status: 'in_progress', claimedById: 'agent-1' }
    mockDb.task.findUnique.mockResolvedValue(task)
    mockDb.task.update.mockResolvedValue({ ...task, status: 'done' })
    mockDb.agentSession.findFirst.mockResolvedValue({ id: 'session-1' })
    mockDb.agentSession.update.mockResolvedValue({})

    const req = makeRequest(url, { channelId: 'ch-1', task_number: 1, status: 'done' })
    const res = await updateStatusPOST(req, PARAMS)

    expect(res.status).toBe(200)

    expect(mockDaemon.stopSession).toHaveBeenCalledWith('agent-1', 't1')
    expect(mockDb.agentSession.update).toHaveBeenCalledWith({
      where: { id: 'session-1' },
      data: { status: 'completed', completedAt: expect.any(Date) },
    })

    expect(mockIO._toEmit).toHaveBeenCalledWith('session:stopped', {
      session_id: 'session-1',
      agent_id: 'agent-1',
      task_id: 't1',
    })
  })

  it('does not stop session when status is done but no active session exists', async () => {
    const task = { id: 't1', channelId: 'ch-1', taskNumber: 1, title: 'Task 1', status: 'in_progress', claimedById: 'agent-1' }
    mockDb.task.findUnique.mockResolvedValue(task)
    mockDb.task.update.mockResolvedValue({ ...task, status: 'done' })
    mockDb.agentSession.findFirst.mockResolvedValue(null)

    const req = makeRequest(url, { channelId: 'ch-1', task_number: 1, status: 'done' })
    await updateStatusPOST(req, PARAMS)

    expect(mockDaemon.stopSession).not.toHaveBeenCalled()
    expect(mockDb.agentSession.update).not.toHaveBeenCalled()
  })
})
