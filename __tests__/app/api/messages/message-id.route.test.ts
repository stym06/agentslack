import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockGetServerSession, mockDb } = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  mockDb: {
    message: { findUnique: vi.fn() },
    agent: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}))

vi.mock('next-auth', () => ({ getServerSession: mockGetServerSession }))
vi.mock('@/lib/auth/config', () => ({ authOptions: {} }))
vi.mock('@/lib/db', () => ({ db: mockDb }))

import { GET } from '@/app/api/messages/[id]/route'
import { NextRequest } from 'next/server'

const MOCK_SESSION = {
  user: { id: 'user-1', email: 'test@test.com', name: 'TestUser' },
  expires: '2099-01-01',
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/messages/[id]', () => {
  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValue(null)

    const req = new NextRequest('http://localhost/api/messages/msg-1')
    const res = await GET(req, { params: Promise.resolve({ id: 'msg-1' }) })

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Unauthorized' })
  })

  it('returns 404 when message not found', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    mockDb.message.findUnique.mockResolvedValue(null)

    const req = new NextRequest('http://localhost/api/messages/msg-1')
    const res = await GET(req, { params: Promise.resolve({ id: 'msg-1' }) })

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Message not found' })
  })

  it('resolves sender name for agent type', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    const message = {
      id: 'msg-1',
      channelId: 'ch-1',
      senderType: 'agent',
      senderId: 'agent-1',
      content: 'hello',
    }
    mockDb.message.findUnique.mockResolvedValue(message)
    mockDb.agent.findUnique.mockResolvedValue({ name: 'CodeBot', avatarUrl: 'https://img/bot.png' })

    const req = new NextRequest('http://localhost/api/messages/msg-1')
    const res = await GET(req, { params: Promise.resolve({ id: 'msg-1' }) })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.sender_name).toBe('CodeBot')
    expect(body.sender_avatar).toBe('https://img/bot.png')
    expect(body.id).toBe('msg-1')
    expect(mockDb.agent.findUnique).toHaveBeenCalledWith({
      where: { id: 'agent-1' },
      select: { name: true, avatarUrl: true },
    })
  })

  it('resolves sender name for user type', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    const message = {
      id: 'msg-2',
      channelId: 'ch-1',
      senderType: 'user',
      senderId: 'user-1',
      content: 'hi there',
    }
    mockDb.message.findUnique.mockResolvedValue(message)
    mockDb.user.findUnique.mockResolvedValue({ name: 'Alice', avatarUrl: 'https://img/alice.png' })

    const req = new NextRequest('http://localhost/api/messages/msg-2')
    const res = await GET(req, { params: Promise.resolve({ id: 'msg-2' }) })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.sender_name).toBe('Alice')
    expect(body.sender_avatar).toBe('https://img/alice.png')
    expect(mockDb.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      select: { name: true, avatarUrl: true },
    })
  })

  it('returns "Unknown" sender when agent not found', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    const message = {
      id: 'msg-3',
      senderType: 'agent',
      senderId: 'gone-agent',
      content: 'x',
    }
    mockDb.message.findUnique.mockResolvedValue(message)
    mockDb.agent.findUnique.mockResolvedValue(null)

    const req = new NextRequest('http://localhost/api/messages/msg-3')
    const res = await GET(req, { params: Promise.resolve({ id: 'msg-3' }) })

    const body = await res.json()
    expect(body.sender_name).toBe('Unknown')
    expect(body.sender_avatar).toBeNull()
  })

  it('returns "User" when user has no name', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    const message = {
      id: 'msg-4',
      senderType: 'user',
      senderId: 'user-2',
      content: 'hey',
    }
    mockDb.message.findUnique.mockResolvedValue(message)
    mockDb.user.findUnique.mockResolvedValue({ name: null, avatarUrl: null })

    const req = new NextRequest('http://localhost/api/messages/msg-4')
    const res = await GET(req, { params: Promise.resolve({ id: 'msg-4' }) })

    const body = await res.json()
    expect(body.sender_name).toBe('User')
  })
})
