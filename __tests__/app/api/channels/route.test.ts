import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockGetServerSession, mockDb } = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  mockDb: {
    workspace: { findFirst: vi.fn() },
    channel: { findMany: vi.fn(), create: vi.fn() },
  },
}))

vi.mock('next-auth', () => ({ getServerSession: mockGetServerSession }))
vi.mock('@/lib/auth/config', () => ({ authOptions: {} }))
vi.mock('@/lib/db', () => ({ db: mockDb }))

import { GET, POST } from '@/app/api/channels/route'
import { NextRequest } from 'next/server'

const MOCK_SESSION = {
  user: { id: 'user-1', email: 'test@test.com', name: 'TestUser' },
  expires: '2099-01-01',
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/channels', () => {
  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValue(null)

    const req = new NextRequest('http://localhost/api/channels')
    const res = await GET(req)

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Unauthorized' })
  })

  it('returns 404 when workspace not found', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    mockDb.workspace.findFirst.mockResolvedValue(null)

    const req = new NextRequest('http://localhost/api/channels')
    const res = await GET(req)

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Workspace not found' })
  })

  it('returns channels list on success', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    mockDb.workspace.findFirst.mockResolvedValue({ id: 'ws-1', userId: 'user-1' })
    const channels = [
      { id: 'ch-1', name: 'general' },
      { id: 'ch-2', name: 'random' },
    ]
    mockDb.channel.findMany.mockResolvedValue(channels)

    const req = new NextRequest('http://localhost/api/channels')
    const res = await GET(req)

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(channels)
    expect(mockDb.channel.findMany).toHaveBeenCalledWith({
      where: { workspaceId: 'ws-1' },
      orderBy: { createdAt: 'asc' },
    })
  })
})

describe('POST /api/channels', () => {
  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValue(null)

    const req = new NextRequest('http://localhost/api/channels', {
      method: 'POST',
      body: JSON.stringify({ name: 'test' }),
    })
    const res = await POST(req)

    expect(res.status).toBe(401)
  })

  it('returns 400 when name is missing', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)

    const req = new NextRequest('http://localhost/api/channels', {
      method: 'POST',
      body: JSON.stringify({}),
    })
    const res = await POST(req)

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'name required' })
  })

  it('returns 404 when workspace not found', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    mockDb.workspace.findFirst.mockResolvedValue(null)

    const req = new NextRequest('http://localhost/api/channels', {
      method: 'POST',
      body: JSON.stringify({ name: 'new-channel' }),
    })
    const res = await POST(req)

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Workspace not found' })
  })

  it('creates channel and strips # prefix', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    mockDb.workspace.findFirst.mockResolvedValue({ id: 'ws-1', userId: 'user-1' })
    const created = { id: 'ch-new', name: 'announcements', workspaceId: 'ws-1' }
    mockDb.channel.create.mockResolvedValue(created)

    const req = new NextRequest('http://localhost/api/channels', {
      method: 'POST',
      body: JSON.stringify({ name: '#announcements' }),
    })
    const res = await POST(req)

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(created)
    expect(mockDb.channel.create).toHaveBeenCalledWith({
      data: {
        workspaceId: 'ws-1',
        name: 'announcements',
        description: null,
      },
    })
  })

  it('creates channel without # prefix unchanged', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    mockDb.workspace.findFirst.mockResolvedValue({ id: 'ws-1', userId: 'user-1' })
    const created = { id: 'ch-new', name: 'general', workspaceId: 'ws-1' }
    mockDb.channel.create.mockResolvedValue(created)

    const req = new NextRequest('http://localhost/api/channels', {
      method: 'POST',
      body: JSON.stringify({ name: 'general', description: 'Main channel' }),
    })
    const res = await POST(req)

    expect(res.status).toBe(200)
    expect(mockDb.channel.create).toHaveBeenCalledWith({
      data: {
        workspaceId: 'ws-1',
        name: 'general',
        description: 'Main channel',
      },
    })
  })
})
