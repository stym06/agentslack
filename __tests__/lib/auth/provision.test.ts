import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockDb } = vi.hoisted(() => {
  const mockDb = {
    workspace: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    channel: {
      create: vi.fn(),
    },
  }
  return { mockDb }
})

vi.mock('@/lib/db', () => ({ db: mockDb }))

import { provisionUserWorkspace } from '@/lib/auth/provision'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('provisionUserWorkspace', () => {
  it('returns existing workspace if one exists', async () => {
    const existingWorkspace = { id: 'ws-1', userId: 'u-1', name: 'My Workspace' }
    mockDb.workspace.findFirst.mockResolvedValue(existingWorkspace)

    const result = await provisionUserWorkspace('u-1')
    expect(result).toEqual(existingWorkspace)
    expect(mockDb.workspace.create).not.toHaveBeenCalled()
    expect(mockDb.channel.create).not.toHaveBeenCalled()
  })

  it('creates workspace with default channels for new user', async () => {
    mockDb.workspace.findFirst.mockResolvedValue(null)
    const newWorkspace = { id: 'ws-new', userId: 'u-1', name: 'My Workspace' }
    mockDb.workspace.create.mockResolvedValue(newWorkspace)
    mockDb.channel.create.mockResolvedValue({})

    const result = await provisionUserWorkspace('u-1')

    expect(result).toEqual(newWorkspace)
    expect(mockDb.workspace.create).toHaveBeenCalledWith({
      data: { userId: 'u-1', name: 'My Workspace' },
    })

    expect(mockDb.channel.create).toHaveBeenCalledTimes(2)

    const firstCall = mockDb.channel.create.mock.calls[0][0]
    expect(firstCall.data.name).toBe('general')
    expect(firstCall.data.description).toBe('General discussion')

    const secondCall = mockDb.channel.create.mock.calls[1][0]
    expect(secondCall.data.name).toBe('daily-standup')
    expect(secondCall.data.channelType).toBe('standup')
  })
})
