import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AgentActivityEvent } from '@/types'

const mockCreate = vi.fn()
const mockFindMany = vi.fn()
const mockDeleteMany = vi.fn()

vi.mock('@/lib/db', () => ({
  db: {
    activityEvent: {
      create: (...args: any[]) => mockCreate(...args),
      findMany: (...args: any[]) => mockFindMany(...args),
      deleteMany: (...args: any[]) => mockDeleteMany(...args),
    },
  },
}))

import { saveActivityEvent, getActivityEvents, purgeOldActivityEvents } from '@/lib/activity/store'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('saveActivityEvent', () => {
  it('persists a tool_use event with correct shape', async () => {
    mockCreate.mockResolvedValue({})
    const event: AgentActivityEvent = {
      type: 'tool_use',
      toolName: 'Bash',
      input: '{"command":"ls"}',
      timestamp: 1000,
    }

    await saveActivityEvent('agent-1', event)

    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        agentId: 'agent-1',
        type: 'tool_use',
        payload: { toolName: 'Bash', input: '{"command":"ls"}', timestamp: 1000 },
      },
    })
  })

  it('persists a result event', async () => {
    mockCreate.mockResolvedValue({})
    const event: AgentActivityEvent = {
      type: 'result',
      subtype: 'success',
      durationMs: 5000,
      totalCostUsd: 0.12,
      timestamp: 2000,
    }

    await saveActivityEvent('agent-2', event)

    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        agentId: 'agent-2',
        type: 'result',
        payload: { subtype: 'success', durationMs: 5000, totalCostUsd: 0.12, timestamp: 2000 },
      },
    })
  })

  it('does not throw on db error', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockCreate.mockRejectedValue(new Error('db down'))

    await expect(saveActivityEvent('agent-1', {
      type: 'text',
      text: 'hello',
      timestamp: 1000,
    })).resolves.toBeUndefined()

    expect(consoleSpy).toHaveBeenCalled()
    consoleSpy.mockRestore()
  })
})

describe('getActivityEvents', () => {
  it('returns events in chronological order', async () => {
    mockFindMany.mockResolvedValue([
      { type: 'result', payload: { subtype: 'success', durationMs: 100, totalCostUsd: null, timestamp: 3000 }, createdAt: new Date() },
      { type: 'tool_use', payload: { toolName: 'Read', input: '{}', timestamp: 2000 }, createdAt: new Date() },
      { type: 'text', payload: { text: 'hi', timestamp: 1000 }, createdAt: new Date() },
    ])

    const events = await getActivityEvents('agent-1', 100)

    // Reversed from desc to asc
    expect(events).toHaveLength(3)
    expect(events[0]).toEqual({ type: 'text', text: 'hi', timestamp: 1000 })
    expect(events[1]).toEqual({ type: 'tool_use', toolName: 'Read', input: '{}', timestamp: 2000 })
    expect(events[2]).toEqual({ type: 'result', subtype: 'success', durationMs: 100, totalCostUsd: null, timestamp: 3000 })

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { agentId: 'agent-1' },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
  })

  it('defaults to limit 200', async () => {
    mockFindMany.mockResolvedValue([])
    await getActivityEvents('agent-1')
    expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({ take: 200 }))
  })
})

describe('purgeOldActivityEvents', () => {
  it('deletes events older than given TTL', async () => {
    mockDeleteMany.mockResolvedValue({ count: 5 })
    const before = Date.now()

    const count = await purgeOldActivityEvents(48)

    expect(count).toBe(5)
    const call = mockDeleteMany.mock.calls[0][0]
    const cutoff = call.where.createdAt.lt as Date
    // Cutoff should be ~48h ago
    const expectedCutoff = before - 48 * 60 * 60 * 1000
    expect(Math.abs(cutoff.getTime() - expectedCutoff)).toBeLessThan(1000)
  })

  it('defaults to 72h TTL', async () => {
    mockDeleteMany.mockResolvedValue({ count: 0 })
    const before = Date.now()

    await purgeOldActivityEvents()

    const call = mockDeleteMany.mock.calls[0][0]
    const cutoff = call.where.createdAt.lt as Date
    const expectedCutoff = before - 72 * 60 * 60 * 1000
    expect(Math.abs(cutoff.getTime() - expectedCutoff)).toBeLessThan(1000)
  })
})
