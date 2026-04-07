import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.mock factories are hoisted — use vi.hoisted to define mocks
const { mockDb, mockIO } = vi.hoisted(() => {
  const mockDb = {
    task: { findFirst: vi.fn() },
    user: { findUnique: vi.fn() },
    agent: { findUnique: vi.fn() },
    message: { create: vi.fn() },
  }
  const mockIO = {
    to: vi.fn().mockReturnThis(),
    emit: vi.fn(),
  }
  return { mockDb, mockIO }
})

vi.mock('@/lib/db', () => ({ db: mockDb }))
vi.mock('@/server/socket-server', () => ({ getIO: () => mockIO }))

import { getNextTaskNumber, resolveActorName, enrichTask } from '@/lib/tasks/helpers'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getNextTaskNumber', () => {
  it('returns 1 when no tasks exist', async () => {
    mockDb.task.findFirst.mockResolvedValue(null)
    const result = await getNextTaskNumber('ch-1')
    expect(result).toBe(1)
    expect(mockDb.task.findFirst).toHaveBeenCalledWith({
      where: { channelId: 'ch-1' },
      orderBy: { taskNumber: 'desc' },
      select: { taskNumber: true },
    })
  })

  it('returns next number after last task', async () => {
    mockDb.task.findFirst.mockResolvedValue({ taskNumber: 5 })
    const result = await getNextTaskNumber('ch-1')
    expect(result).toBe(6)
  })
})

describe('resolveActorName', () => {
  it('resolves user name', async () => {
    mockDb.user.findUnique.mockResolvedValue({ name: 'Alice' })
    const result = await resolveActorName('user', 'u-1')
    expect(result).toBe('Alice')
  })

  it('returns "User" when user not found', async () => {
    mockDb.user.findUnique.mockResolvedValue(null)
    const result = await resolveActorName('user', 'unknown')
    expect(result).toBe('User')
  })

  it('resolves agent name', async () => {
    mockDb.agent.findUnique.mockResolvedValue({ name: 'CodeBot' })
    const result = await resolveActorName('agent', 'a-1')
    expect(result).toBe('CodeBot')
  })

  it('returns "Agent" when agent not found', async () => {
    mockDb.agent.findUnique.mockResolvedValue(null)
    const result = await resolveActorName('agent', 'unknown')
    expect(result).toBe('Agent')
  })
})

describe('enrichTask', () => {
  it('enriches task with creator and claimer names', async () => {
    mockDb.user.findUnique.mockResolvedValue({ name: 'Alice' })
    mockDb.agent.findUnique.mockResolvedValue({ name: 'CodeBot' })

    const task = {
      id: 't-1',
      channelId: 'ch-1',
      groupId: 'g-1',
      projectId: 'p-1',
      messageId: 'm-1',
      taskNumber: 3,
      title: 'Fix bug',
      status: 'in_progress',
      createdByType: 'user',
      createdById: 'u-1',
      claimedByType: 'agent' as const,
      claimedById: 'a-1',
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-02'),
    }

    const result = await enrichTask(task)

    expect(result).toEqual({
      id: 't-1',
      channel_id: 'ch-1',
      group_id: 'g-1',
      project_id: 'p-1',
      message_id: 'm-1',
      task_number: 3,
      title: 'Fix bug',
      status: 'in_progress',
      created_by_type: 'user',
      created_by_id: 'u-1',
      claimed_by_type: 'agent',
      claimed_by_id: 'a-1',
      created_at: task.createdAt,
      updated_at: task.updatedAt,
      created_by_name: 'Alice',
      claimed_by_name: 'CodeBot',
    })
  })

  it('handles unclaimed task', async () => {
    mockDb.user.findUnique.mockResolvedValue({ name: 'Alice' })

    const task = {
      id: 't-1',
      channelId: 'ch-1',
      groupId: null,
      projectId: null,
      messageId: 'm-1',
      taskNumber: 1,
      title: 'Open task',
      status: 'todo',
      createdByType: 'user',
      createdById: 'u-1',
      claimedByType: null,
      claimedById: null,
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
    }

    const result = await enrichTask(task)
    expect(result.claimed_by_name).toBeNull()
    expect(result.group_id).toBeNull()
    expect(result.project_id).toBeNull()
  })
})
