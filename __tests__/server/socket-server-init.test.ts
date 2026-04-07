import { describe, it, expect, vi, beforeEach } from 'vitest'

const { MockServer, mockOn } = vi.hoisted(() => {
  const mockOn = vi.fn()
  // Must be a class/function so `new Server(...)` works
  const MockServer = vi.fn().mockImplementation(function (this: any) {
    this.on = mockOn
    return this
  })
  return { MockServer, mockOn }
})

vi.mock('socket.io', () => ({ Server: MockServer }))

beforeEach(() => {
  vi.clearAllMocks()
  const g = globalThis as any
  delete g.__socketio
})

describe('initSocketServer', () => {
  it('creates a Server with correct CORS config', async () => {
    vi.resetModules()
    vi.doMock('socket.io', () => ({ Server: MockServer }))
    const g = globalThis as any
    delete g.__socketio

    const { initSocketServer } = await import('@/server/socket-server')
    const fakeHttp = {} as any
    initSocketServer(fakeHttp)

    expect(MockServer).toHaveBeenCalledWith(fakeHttp, {
      cors: {
        origin: expect.any(String),
        methods: ['GET', 'POST'],
      },
    })
  })

  it('sets up connection event handler', async () => {
    vi.resetModules()
    vi.doMock('socket.io', () => ({ Server: MockServer }))
    const g = globalThis as any
    delete g.__socketio

    const { initSocketServer } = await import('@/server/socket-server')
    const fakeHttp = {} as any
    initSocketServer(fakeHttp)

    expect(mockOn).toHaveBeenCalledWith('connection', expect.any(Function))
  })

  it('returns the io instance', async () => {
    vi.resetModules()
    vi.doMock('socket.io', () => ({ Server: MockServer }))
    const g = globalThis as any
    delete g.__socketio

    const { initSocketServer } = await import('@/server/socket-server')
    const fakeHttp = {} as any
    const io = initSocketServer(fakeHttp)

    expect(io).toBeDefined()
    expect(io.on).toBe(mockOn)
  })

  it('getIO returns the same instance after init', async () => {
    vi.resetModules()
    vi.doMock('socket.io', () => ({ Server: MockServer }))
    const g = globalThis as any
    delete g.__socketio

    const { initSocketServer, getIO } = await import('@/server/socket-server')
    const fakeHttp = {} as any
    const io = initSocketServer(fakeHttp)
    const io2 = getIO()

    expect(io2).toBe(io)
  })

  it('connection handler sets up socket event listeners', async () => {
    vi.resetModules()
    vi.doMock('socket.io', () => ({ Server: MockServer }))
    const g = globalThis as any
    delete g.__socketio

    const { initSocketServer } = await import('@/server/socket-server')
    const fakeHttp = {} as any
    initSocketServer(fakeHttp)

    // Get the connection handler
    const connectionHandler = mockOn.mock.calls.find(
      (call: any[]) => call[0] === 'connection'
    )?.[1]
    expect(connectionHandler).toBeDefined()

    const mockSocketOn = vi.fn()
    const mockJoin = vi.fn()
    const mockLeave = vi.fn()
    const mockSocket = {
      id: 'socket-123',
      on: mockSocketOn,
      join: mockJoin,
      leave: mockLeave,
    }

    connectionHandler(mockSocket)

    const eventNames = mockSocketOn.mock.calls.map((call: any[]) => call[0])
    expect(eventNames).toContain('channel:join')
    expect(eventNames).toContain('channel:leave')
    expect(eventNames).toContain('thread:join')
    expect(eventNames).toContain('thread:leave')
    expect(eventNames).toContain('disconnect')

    // Test channel:join
    const joinHandler = mockSocketOn.mock.calls.find((c: any[]) => c[0] === 'channel:join')?.[1]
    joinHandler('ch-1')
    expect(mockJoin).toHaveBeenCalledWith('channel:ch-1')

    // Test channel:leave
    const leaveHandler = mockSocketOn.mock.calls.find((c: any[]) => c[0] === 'channel:leave')?.[1]
    leaveHandler('ch-1')
    expect(mockLeave).toHaveBeenCalledWith('channel:ch-1')

    // Test thread:join
    const threadJoinHandler = mockSocketOn.mock.calls.find((c: any[]) => c[0] === 'thread:join')?.[1]
    threadJoinHandler('thread-1')
    expect(mockJoin).toHaveBeenCalledWith('thread:thread-1')

    // Test thread:leave
    const threadLeaveHandler = mockSocketOn.mock.calls.find((c: any[]) => c[0] === 'thread:leave')?.[1]
    threadLeaveHandler('thread-1')
    expect(mockLeave).toHaveBeenCalledWith('thread:thread-1')
  })
})
