import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockDb, mockIO } = vi.hoisted(() => {
  const mockIO = {
    to: vi.fn().mockReturnThis(),
    emit: vi.fn(),
  }
  const mockDb = {
    user: { findUnique: vi.fn() },
    agent: { findUnique: vi.fn() },
    message: { create: vi.fn() },
  }
  return { mockDb, mockIO }
})

vi.mock('@/lib/db', () => ({ db: mockDb }))
vi.mock('@/server/socket-server', () => ({ getIO: () => mockIO }))

import { emitTaskSystemMessage } from '@/lib/tasks/helpers'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('emitTaskSystemMessage', () => {
  it('creates a message in the DB with system metadata', async () => {
    const createdMsg = {
      id: 'msg-1',
      channelId: 'ch-1',
      senderType: 'user',
      senderId: 'u-1',
      content: 'User claimed task',
      metadata: { system: true, type: 'task_event' },
    }
    mockDb.message.create.mockResolvedValue(createdMsg)
    mockDb.user.findUnique.mockResolvedValue({ name: 'Alice' })

    await emitTaskSystemMessage('ch-1', 'u-1', 'user', 'User claimed task')

    expect(mockDb.message.create).toHaveBeenCalledWith({
      data: {
        channelId: 'ch-1',
        senderType: 'user',
        senderId: 'u-1',
        content: 'User claimed task',
        metadata: { system: true, type: 'task_event' },
      },
    })
  })

  it('resolves user actor name and emits message:new via socket', async () => {
    const createdMsg = {
      id: 'msg-1',
      channelId: 'ch-1',
      senderType: 'user',
      senderId: 'u-1',
      content: 'Status changed',
      metadata: { system: true, type: 'task_event' },
    }
    mockDb.message.create.mockResolvedValue(createdMsg)
    mockDb.user.findUnique.mockResolvedValue({ name: 'Alice' })

    await emitTaskSystemMessage('ch-1', 'u-1', 'user', 'Status changed')

    expect(mockDb.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'u-1' },
      select: { name: true },
    })
    expect(mockIO.to).toHaveBeenCalledWith('channel:ch-1')
    expect(mockIO.emit).toHaveBeenCalledWith('message:new', {
      ...createdMsg,
      sender_name: 'Alice',
      sender_avatar: null,
    })
  })

  it('resolves agent actor name when senderType is agent', async () => {
    const createdMsg = {
      id: 'msg-2',
      channelId: 'ch-2',
      senderType: 'agent',
      senderId: 'a-1',
      content: 'Agent completed task',
      metadata: { system: true, type: 'task_event' },
    }
    mockDb.message.create.mockResolvedValue(createdMsg)
    mockDb.agent.findUnique.mockResolvedValue({ name: 'CodeBot' })

    await emitTaskSystemMessage('ch-2', 'a-1', 'agent', 'Agent completed task')

    expect(mockDb.agent.findUnique).toHaveBeenCalledWith({
      where: { id: 'a-1' },
      select: { name: true },
    })
    expect(mockIO.emit).toHaveBeenCalledWith('message:new', {
      ...createdMsg,
      sender_name: 'CodeBot',
      sender_avatar: null,
    })
  })

  it('falls back to "User" when user not found', async () => {
    mockDb.message.create.mockResolvedValue({
      id: 'msg-3',
      channelId: 'ch-1',
      senderType: 'user',
      senderId: 'u-unknown',
      content: 'test',
      metadata: { system: true, type: 'task_event' },
    })
    mockDb.user.findUnique.mockResolvedValue(null)

    await emitTaskSystemMessage('ch-1', 'u-unknown', 'user', 'test')

    expect(mockIO.emit).toHaveBeenCalledWith(
      'message:new',
      expect.objectContaining({ sender_name: 'User' }),
    )
  })

  it('falls back to "Agent" when agent not found', async () => {
    mockDb.message.create.mockResolvedValue({
      id: 'msg-4',
      channelId: 'ch-1',
      senderType: 'agent',
      senderId: 'a-unknown',
      content: 'test',
      metadata: { system: true, type: 'task_event' },
    })
    mockDb.agent.findUnique.mockResolvedValue(null)

    await emitTaskSystemMessage('ch-1', 'a-unknown', 'agent', 'test')

    expect(mockIO.emit).toHaveBeenCalledWith(
      'message:new',
      expect.objectContaining({ sender_name: 'Agent' }),
    )
  })
})
