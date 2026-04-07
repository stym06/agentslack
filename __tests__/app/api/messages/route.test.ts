import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const {
  mockGetServerSession,
  mockDb,
  mockGetIO,
  mockGetAgentDaemon,
  mockExtractMentions,
  mockBuildThreadContext,
  mockGetNextTaskNumber,
  mockEnrichTask,
  mockResolveActorName,
  mockSetupTaskWorktree,
  mockReadAgentInstructions,
} = vi.hoisted(() => {
  const mockEmit = vi.fn()
  const mockTo = vi.fn().mockReturnValue({ emit: mockEmit })
  const mockIO = { to: mockTo, emit: mockEmit }
  const mockDaemon = {
    startSession: vi.fn(),
    deliverSessionMessage: vi.fn(),
    deliverMessage: vi.fn(),
    getSession: vi.fn(),
    isReady: vi.fn(),
  }
  return {
    mockGetServerSession: vi.fn(),
    mockDb: {
      message: {
        findMany: vi.fn(),
        create: vi.fn(),
        count: vi.fn(),
        update: vi.fn(),
        findFirst: vi.fn(),
      },
      user: { findUnique: vi.fn(), findMany: vi.fn() },
      agent: { findMany: vi.fn(), update: vi.fn() },
      channelAgent: { findMany: vi.fn() },
      project: { findUnique: vi.fn() },
      task: { create: vi.fn(), findFirst: vi.fn() },
      taskGroup: { findFirst: vi.fn(), create: vi.fn() },
    },
    mockGetIO: vi.fn().mockReturnValue(mockIO),
    mockGetAgentDaemon: vi.fn().mockReturnValue(mockDaemon),
    mockExtractMentions: vi.fn().mockReturnValue([]),
    mockBuildThreadContext: vi.fn().mockReturnValue('thread context'),
    mockGetNextTaskNumber: vi.fn(),
    mockEnrichTask: vi.fn(),
    mockResolveActorName: vi.fn(),
    mockSetupTaskWorktree: vi.fn(),
    mockReadAgentInstructions: vi.fn(),
    mockIO,
    mockTo,
    mockEmit,
    mockDaemon,
  }
})

vi.mock('next-auth', () => ({ getServerSession: mockGetServerSession }))
vi.mock('@/lib/auth/config', () => ({ authOptions: {} }))
vi.mock('@/lib/db', () => ({ db: mockDb }))
vi.mock('@/server/socket-server', () => ({ getIO: mockGetIO }))
vi.mock('@/server/agent-daemon', () => ({ getAgentDaemon: mockGetAgentDaemon }))
vi.mock('@/lib/utils/mentions', () => ({
  extractMentions: mockExtractMentions,
  buildThreadContext: mockBuildThreadContext,
}))
vi.mock('@/lib/tasks/helpers', () => ({
  getNextTaskNumber: mockGetNextTaskNumber,
  enrichTask: mockEnrichTask,
  resolveActorName: mockResolveActorName,
}))
vi.mock('@/lib/projects/worktree', () => ({ setupTaskWorktree: mockSetupTaskWorktree }))
vi.mock('@/lib/agents/directory', () => ({ readAgentInstructions: mockReadAgentInstructions }))

import { GET, POST } from '@/app/api/messages/route'

const MOCK_SESSION = {
  user: { id: 'user-1', email: 'test@test.com', name: 'TestUser' },
  expires: '2099-01-01',
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/messages', () => {
  it('returns 401 if no session', async () => {
    mockGetServerSession.mockResolvedValue(null)
    const req = new NextRequest('http://localhost/api/messages?channel_id=ch-1')
    const res = await GET(req)
    expect(res.status).toBe(401)
  })

  it('returns 400 if no channel_id and no thread_id', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    const req = new NextRequest('http://localhost/api/messages')
    const res = await GET(req)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'channel_id or thread_id required' })
  })

  it('returns thread messages when thread_id is provided', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    const messages = [
      {
        id: 'msg-1', channelId: 'ch-1', threadId: 'thread-1', senderType: 'user',
        senderId: 'user-1', content: 'hello', metadata: null, replyCount: 0, createdAt: new Date(),
      },
      {
        id: 'msg-2', channelId: 'ch-1', threadId: 'thread-1', senderType: 'agent',
        senderId: 'agent-1', content: 'hi', metadata: null, replyCount: 0, createdAt: new Date(),
      },
    ]
    mockDb.message.findMany.mockResolvedValue(messages)
    mockDb.agent.findMany.mockResolvedValue([{ id: 'agent-1', name: 'Bot', avatarUrl: null }])
    mockDb.user.findMany.mockResolvedValue([{ id: 'user-1', name: 'TestUser', avatarUrl: null }])

    const req = new NextRequest('http://localhost/api/messages?thread_id=thread-1')
    const res = await GET(req)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveLength(2)
    expect(body[0].sender_name).toBe('TestUser')
    expect(body[1].sender_name).toBe('Bot')

    expect(mockDb.message.findMany).toHaveBeenCalledWith({
      where: { threadId: 'thread-1' },
      orderBy: { createdAt: 'asc' },
    })
  })

  it('returns channel messages filtering out tasks', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    const messages = [
      {
        id: 'msg-1', channelId: 'ch-1', threadId: null, senderType: 'user',
        senderId: 'user-1', content: 'hello', metadata: null, replyCount: 0, createdAt: new Date(),
      },
      {
        id: 'msg-2', channelId: 'ch-1', threadId: null, senderType: 'user',
        senderId: 'user-1', content: 'task msg', metadata: { isTask: true }, replyCount: 0, createdAt: new Date(),
      },
    ]
    mockDb.message.findMany.mockResolvedValue(messages)
    mockDb.user.findMany.mockResolvedValue([{ id: 'user-1', name: 'TestUser', avatarUrl: null }])

    const req = new NextRequest('http://localhost/api/messages?channel_id=ch-1')
    const res = await GET(req)

    expect(res.status).toBe(200)
    const body = await res.json()
    // Task message should be filtered out
    expect(body).toHaveLength(1)
    expect(body[0].content).toBe('hello')
  })

  it('returns 500 on DB error', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    mockDb.message.findMany.mockRejectedValue(new Error('DB error'))

    const req = new NextRequest('http://localhost/api/messages?channel_id=ch-1')
    const res = await GET(req)
    expect(res.status).toBe(500)
  })

  it('addSenderNames handles messages with no agents/users gracefully', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    const messages = [
      {
        id: 'msg-1', channelId: 'ch-1', threadId: null, senderType: 'user',
        senderId: 'user-unknown', content: 'hi', metadata: null, replyCount: 0, createdAt: new Date(),
      },
    ]
    mockDb.message.findMany.mockResolvedValue(messages)
    mockDb.user.findMany.mockResolvedValue([])

    const req = new NextRequest('http://localhost/api/messages?channel_id=ch-1')
    const res = await GET(req)

    const body = await res.json()
    expect(body[0].sender_name).toBe('You')
    expect(body[0].sender_avatar).toBeNull()
  })

  it('addSenderNames uses Agent fallback for unknown agent', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    const messages = [
      {
        id: 'msg-1', channelId: 'ch-1', threadId: 'thread-1', senderType: 'agent',
        senderId: 'agent-unknown', content: 'reply', metadata: null, replyCount: 0, createdAt: new Date(),
      },
    ]
    mockDb.message.findMany.mockResolvedValue(messages)
    mockDb.agent.findMany.mockResolvedValue([])

    const req = new NextRequest('http://localhost/api/messages?thread_id=thread-1')
    const res = await GET(req)

    const body = await res.json()
    expect(body[0].sender_name).toBe('Agent')
  })
})

describe('POST /api/messages', () => {
  it('returns 401 if no session', async () => {
    mockGetServerSession.mockResolvedValue(null)
    const req = new NextRequest('http://localhost/api/messages', {
      method: 'POST',
      body: JSON.stringify({ channel_id: 'ch-1', content: 'hi' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('returns 400 if channel_id missing', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    const req = new NextRequest('http://localhost/api/messages', {
      method: 'POST',
      body: JSON.stringify({ content: 'hi' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'channel_id and content required' })
  })

  it('returns 400 if content missing', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    const req = new NextRequest('http://localhost/api/messages', {
      method: 'POST',
      body: JSON.stringify({ channel_id: 'ch-1' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('creates message and emits to channel on success', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    const userMessage = {
      id: 'msg-1', channelId: 'ch-1', threadId: null, senderType: 'user',
      senderId: 'user-1', content: 'hello world', createdAt: new Date().toISOString(),
    }
    mockDb.message.create.mockResolvedValue(userMessage)
    mockDb.user.findUnique.mockResolvedValue({ name: 'TestUser', avatarUrl: '/avatar.png' })
    mockDb.channelAgent.findMany.mockResolvedValue([])

    const req = new NextRequest('http://localhost/api/messages', {
      method: 'POST',
      body: JSON.stringify({ channel_id: 'ch-1', content: 'hello world' }),
    })
    const res = await POST(req)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.message.id).toBe('msg-1')

    const io = mockGetIO()
    expect(io.to).toHaveBeenCalledWith('channel:ch-1')
  })

  it('handles thread messages with reply count update', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    const userMessage = {
      id: 'msg-2', channelId: 'ch-1', threadId: 'thread-1', senderType: 'user',
      senderId: 'user-1', content: 'reply', createdAt: new Date().toISOString(),
    }
    mockDb.message.create.mockResolvedValue(userMessage)
    mockDb.user.findUnique.mockResolvedValue({ name: 'TestUser', avatarUrl: null })
    mockDb.message.count.mockResolvedValue(3)
    mockDb.message.update.mockResolvedValue({ ...userMessage, replyCount: 3 })
    mockDb.channelAgent.findMany.mockResolvedValue([])

    const req = new NextRequest('http://localhost/api/messages', {
      method: 'POST',
      body: JSON.stringify({ channel_id: 'ch-1', content: 'reply', thread_id: 'thread-1' }),
    })
    const res = await POST(req)

    expect(res.status).toBe(200)
    expect(mockDb.message.count).toHaveBeenCalledWith({ where: { threadId: 'thread-1' } })
    expect(mockDb.message.update).toHaveBeenCalledWith({
      where: { id: 'thread-1' },
      data: { replyCount: 3 },
    })
  })

  it('uses fallback sender name when user not found', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    const userMessage = {
      id: 'msg-1', channelId: 'ch-1', threadId: null, senderType: 'user',
      senderId: 'user-1', content: 'hi', createdAt: new Date().toISOString(),
    }
    mockDb.message.create.mockResolvedValue(userMessage)
    mockDb.user.findUnique.mockResolvedValue(null)
    mockDb.channelAgent.findMany.mockResolvedValue([])

    const req = new NextRequest('http://localhost/api/messages', {
      method: 'POST',
      body: JSON.stringify({ channel_id: 'ch-1', content: 'hi' }),
    })
    const res = await POST(req)

    expect(res.status).toBe(200)
    const io = mockGetIO()
    expect(io.to).toHaveBeenCalledWith('channel:ch-1')
  })

  it('returns 500 on DB error', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    mockDb.message.create.mockRejectedValue(new Error('DB error'))

    const req = new NextRequest('http://localhost/api/messages', {
      method: 'POST',
      body: JSON.stringify({ channel_id: 'ch-1', content: 'hi' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(500)
  })
})

// Helper to flush the async deliverToAgents call
function flushAsync() {
  return new Promise((resolve) => setTimeout(resolve, 50))
}

describe('POST /api/messages — deliverToAgents paths', () => {
  function setupPostMocks() {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    const userMessage = {
      id: 'msg-1', channelId: 'ch-1', threadId: null, senderType: 'user',
      senderId: 'user-1', content: '@bot hello', createdAt: new Date().toISOString(),
    }
    mockDb.message.create.mockResolvedValue(userMessage)
    mockDb.user.findUnique.mockResolvedValue({ name: 'TestUser', avatarUrl: null })
    return userMessage
  }

  it('delivers to @mentioned agents in channel', async () => {
    setupPostMocks()
    mockExtractMentions.mockReturnValue(['bot'])
    mockDb.channelAgent.findMany.mockResolvedValue([
      { agent: { id: 'agent-1', name: 'bot', openclawId: 'bot', model: 'anthropic/claude-sonnet-4-5', soulMd: '', isAdmin: false } },
    ])
    const mockDaemon = mockGetAgentDaemon()
    mockDaemon.isReady.mockReturnValue(true)
    mockDaemon.deliverMessage.mockReturnValue(true)
    mockDb.agent.update.mockResolvedValue({})
    mockDb.task.findFirst.mockResolvedValue(null)
    // For addSenderNames in thread context building (top-level msg gets threadId = userMessage.id)
    mockDb.message.findMany.mockResolvedValue([])
    mockDb.agent.findMany.mockResolvedValue([])
    mockDb.user.findMany.mockResolvedValue([])

    const req = new NextRequest('http://localhost/api/messages', {
      method: 'POST',
      body: JSON.stringify({ channel_id: 'ch-1', content: '@bot hello' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)

    await flushAsync()

    // Top-level messages get threadId = userMessage.id, so thread context is built
    expect(mockDaemon.deliverMessage).toHaveBeenCalledWith('agent-1', expect.objectContaining({
      channelId: 'ch-1',
      senderName: 'TestUser',
    }))
  })

  it('warns when mentioned agent not in channel', async () => {
    setupPostMocks()
    mockExtractMentions.mockReturnValue(['outsider'])
    mockDb.channelAgent.findMany.mockResolvedValue([])
    // Agent exists but not in channel
    mockDb.agent.findMany.mockResolvedValue([{ name: 'outsider' }])
    // The system message create
    mockDb.message.create
      .mockResolvedValueOnce({
        id: 'msg-1', channelId: 'ch-1', threadId: null, senderType: 'user',
        senderId: 'user-1', content: '@outsider hello', createdAt: new Date().toISOString(),
      })
      .mockResolvedValueOnce({
        id: 'sys-1', channelId: 'ch-1', senderType: 'user', senderId: 'user-1',
        content: '@outsider is not a member', metadata: { system: true },
      })

    const req = new NextRequest('http://localhost/api/messages', {
      method: 'POST',
      body: JSON.stringify({ channel_id: 'ch-1', content: '@outsider hello' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)

    await flushAsync()

    // Should have created system warning message
    expect(mockDb.message.create).toHaveBeenCalledTimes(2)
  })

  it('routes to last agent in thread when no mentions', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    const userMessage = {
      id: 'msg-2', channelId: 'ch-1', threadId: 'thread-1', senderType: 'user',
      senderId: 'user-1', content: 'follow up', createdAt: new Date().toISOString(),
    }
    mockDb.message.create.mockResolvedValue(userMessage)
    mockDb.user.findUnique.mockResolvedValue({ name: 'TestUser', avatarUrl: null })
    mockDb.message.count.mockResolvedValue(2)
    mockDb.message.update.mockResolvedValue({ ...userMessage, replyCount: 2 })

    mockExtractMentions.mockReturnValue([])
    const agentInChannel = { agent: { id: 'agent-1', name: 'bot', openclawId: 'bot', model: 'anthropic/claude-sonnet-4-5', soulMd: '', isAdmin: false } }
    mockDb.channelAgent.findMany.mockResolvedValue([agentInChannel])
    mockDb.message.findFirst.mockResolvedValue({ senderId: 'agent-1', senderType: 'agent' })
    mockDb.task.findFirst.mockResolvedValue(null)

    const mockDaemon = mockGetAgentDaemon()
    mockDaemon.isReady.mockReturnValue(true)
    mockDaemon.deliverMessage.mockReturnValue(true)
    mockDaemon.getSession.mockReturnValue(undefined)
    mockDb.agent.update.mockResolvedValue({})
    // For thread context
    mockDb.message.findMany.mockResolvedValue([])
    mockDb.agent.findMany.mockResolvedValue([])
    mockDb.user.findMany.mockResolvedValue([])

    const req = new NextRequest('http://localhost/api/messages', {
      method: 'POST',
      body: JSON.stringify({ channel_id: 'ch-1', content: 'follow up', thread_id: 'thread-1' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)

    await flushAsync()

    expect(mockDaemon.deliverMessage).toHaveBeenCalled()
  })

  it('skips agent that is not ready', async () => {
    setupPostMocks()
    mockExtractMentions.mockReturnValue(['bot'])
    mockDb.channelAgent.findMany.mockResolvedValue([
      { agent: { id: 'agent-1', name: 'bot', openclawId: 'bot' } },
    ])
    const mockDaemon = mockGetAgentDaemon()
    mockDaemon.isReady.mockReturnValue(false)
    mockDb.task.findFirst.mockResolvedValue(null)

    const req = new NextRequest('http://localhost/api/messages', {
      method: 'POST',
      body: JSON.stringify({ channel_id: 'ch-1', content: '@bot hello' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)

    await flushAsync()

    expect(mockDaemon.deliverMessage).not.toHaveBeenCalled()
  })

  it('resets agent status when delivery fails', async () => {
    setupPostMocks()
    mockExtractMentions.mockReturnValue(['bot'])
    mockDb.channelAgent.findMany.mockResolvedValue([
      { agent: { id: 'agent-1', name: 'bot', openclawId: 'bot' } },
    ])
    const mockDaemon = mockGetAgentDaemon()
    mockDaemon.isReady.mockReturnValue(true)
    mockDaemon.deliverMessage.mockReturnValue(false)
    mockDb.agent.update.mockResolvedValue({})
    mockDb.task.findFirst.mockResolvedValue(null)

    const req = new NextRequest('http://localhost/api/messages', {
      method: 'POST',
      body: JSON.stringify({ channel_id: 'ch-1', content: '@bot hello' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)

    await flushAsync()

    // Agent status should be reset to online after failed delivery
    expect(mockDb.agent.update).toHaveBeenCalledWith({
      where: { id: 'agent-1' },
      data: { status: 'online' },
    })
  })

  it('routes to task session when thread has active session', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    const userMessage = {
      id: 'msg-2', channelId: 'ch-1', threadId: 'thread-1', senderType: 'user',
      senderId: 'user-1', content: '@bot update', createdAt: new Date().toISOString(),
    }
    mockDb.message.create.mockResolvedValue(userMessage)
    mockDb.user.findUnique.mockResolvedValue({ name: 'TestUser', avatarUrl: null })
    mockDb.message.count.mockResolvedValue(2)
    mockDb.message.update.mockResolvedValue({ ...userMessage, replyCount: 2 })

    mockExtractMentions.mockReturnValue(['bot'])
    mockDb.channelAgent.findMany.mockResolvedValue([
      { agent: { id: 'agent-1', name: 'bot', openclawId: 'bot' } },
    ])
    mockDb.task.findFirst.mockResolvedValue({ id: 'task-1', messageId: 'thread-1' })

    const mockDaemon = mockGetAgentDaemon()
    mockDaemon.getSession.mockReturnValue({ ready: true })
    mockDaemon.deliverSessionMessage.mockReturnValue(true)

    const req = new NextRequest('http://localhost/api/messages', {
      method: 'POST',
      body: JSON.stringify({ channel_id: 'ch-1', content: '@bot update', thread_id: 'thread-1' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)

    await flushAsync()

    expect(mockDaemon.deliverSessionMessage).toHaveBeenCalledWith('agent-1', 'task-1', expect.objectContaining({
      channelId: 'ch-1',
      threadId: 'thread-1',
    }))
    // Should NOT call deliverMessage (used session instead)
    expect(mockDaemon.deliverMessage).not.toHaveBeenCalled()
  })

  it('auto-creates task when project is attached to top-level message', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    const userMessage = {
      id: 'msg-1', channelId: 'ch-1', threadId: null, senderType: 'user',
      senderId: 'user-1', content: '@bot build feature', createdAt: new Date().toISOString(),
    }
    mockDb.message.create
      .mockResolvedValueOnce(userMessage) // user message
      .mockResolvedValueOnce({ id: 'task-msg-1', channelId: 'ch-1' }) // task message
      .mockResolvedValueOnce({ id: 'sys-msg-1', channelId: 'ch-1' }) // system message
    mockDb.user.findUnique.mockResolvedValue({ name: 'TestUser', avatarUrl: null })

    mockExtractMentions.mockReturnValue(['bot'])
    mockDb.channelAgent.findMany.mockResolvedValue([
      { agent: { id: 'agent-1', name: 'bot', openclawId: 'bot', model: 'anthropic/claude-sonnet-4-5', soulMd: '', isAdmin: false } },
    ])
    mockDb.project.findUnique.mockResolvedValue({ id: 'proj-1', name: 'MyProject', status: 'active', repoPath: '/repo' })
    mockDb.taskGroup.findFirst.mockResolvedValue(null)
    mockDb.taskGroup.create.mockResolvedValue({ id: 'tg-1' })
    mockGetNextTaskNumber.mockResolvedValue(1)
    mockDb.task.create.mockResolvedValue({
      id: 'task-1', channelId: 'ch-1', taskNumber: 1, title: 'build feature',
    })
    mockReadAgentInstructions.mockReturnValue('instructions')
    mockSetupTaskWorktree.mockResolvedValue({ worktreePath: '/wt', branchName: 'task-1' })
    mockDb.agentSession = {
      ...mockDb.agentSession,
      create: vi.fn().mockResolvedValue({ id: 'sess-1', createdAt: new Date() }),
    } as any
    mockEnrichTask.mockResolvedValue({ id: 'task-1', enriched: true })
    mockResolveActorName.mockResolvedValue('TestUser')

    const mockDaemon = mockGetAgentDaemon()

    const req = new NextRequest('http://localhost/api/messages', {
      method: 'POST',
      body: JSON.stringify({ channel_id: 'ch-1', content: '@bot build feature', project_id: 'proj-1' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)

    await flushAsync()

    expect(mockDb.task.create).toHaveBeenCalled()
    expect(mockDaemon.startSession).toHaveBeenCalled()
    expect(mockDaemon.deliverSessionMessage).toHaveBeenCalled()
    expect(mockEnrichTask).toHaveBeenCalled()
  })

  it('returns early when no agents to deliver to', async () => {
    setupPostMocks()
    mockExtractMentions.mockReturnValue([])
    mockDb.channelAgent.findMany.mockResolvedValue([])

    const mockDaemon = mockGetAgentDaemon()

    const req = new NextRequest('http://localhost/api/messages', {
      method: 'POST',
      body: JSON.stringify({ channel_id: 'ch-1', content: 'hello' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)

    await flushAsync()

    expect(mockDaemon.deliverMessage).not.toHaveBeenCalled()
  })
})
