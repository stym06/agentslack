import { describe, it, expect, vi } from 'vitest'

describe('getIO', () => {
  it('throws when socket.io is not initialized', async () => {
    vi.resetModules()

    // Clear any existing global
    const g = globalThis as any
    delete g.__socketio

    const { getIO } = await import('@/server/socket-server')
    expect(() => getIO()).toThrow('Socket.io not initialized')
  })
})
