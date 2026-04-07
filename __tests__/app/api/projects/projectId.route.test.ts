import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockGetServerSession, mockDb, mockIO } = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  mockDb: {
    project: { findUnique: vi.fn(), delete: vi.fn() },
    agentSession: { count: vi.fn() },
  },
  mockIO: {
    to: vi.fn().mockReturnThis(),
    emit: vi.fn(),
  },
}))

vi.mock('next-auth', () => ({ getServerSession: mockGetServerSession }))
vi.mock('@/lib/auth/config', () => ({ authOptions: {} }))
vi.mock('@/lib/db', () => ({ db: mockDb }))
vi.mock('@/server/socket-server', () => ({ getIO: () => mockIO }))

import { GET, DELETE } from '@/app/api/projects/[projectId]/route'
import { NextRequest } from 'next/server'

const MOCK_SESSION = {
  user: { id: 'user-1', email: 'test@test.com', name: 'TestUser' },
  expires: '2099-01-01',
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/projects/[projectId]', () => {
  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValue(null)

    const req = new NextRequest('http://localhost/api/projects/p-1')
    const res = await GET(req, { params: Promise.resolve({ projectId: 'p-1' }) })

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Unauthorized' })
  })

  it('returns 404 when project not found', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    mockDb.project.findUnique.mockResolvedValue(null)

    const req = new NextRequest('http://localhost/api/projects/p-missing')
    const res = await GET(req, { params: Promise.resolve({ projectId: 'p-missing' }) })

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Project not found' })
  })

  it('returns project on success', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    const project = {
      id: 'p-1',
      channelId: 'ch-1',
      name: 'my-project',
      repoPath: '/repos/my-project',
      status: 'active',
    }
    mockDb.project.findUnique.mockResolvedValue(project)

    const req = new NextRequest('http://localhost/api/projects/p-1')
    const res = await GET(req, { params: Promise.resolve({ projectId: 'p-1' }) })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(project)
    expect(mockDb.project.findUnique).toHaveBeenCalledWith({ where: { id: 'p-1' } })
  })
})

describe('DELETE /api/projects/[projectId]', () => {
  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValue(null)

    const req = new NextRequest('http://localhost/api/projects/p-1', { method: 'DELETE' })
    const res = await DELETE(req, { params: Promise.resolve({ projectId: 'p-1' }) })

    expect(res.status).toBe(401)
  })

  it('returns 404 when project not found', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    mockDb.project.findUnique.mockResolvedValue(null)

    const req = new NextRequest('http://localhost/api/projects/p-missing', { method: 'DELETE' })
    const res = await DELETE(req, { params: Promise.resolve({ projectId: 'p-missing' }) })

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Project not found' })
  })

  it('returns 409 when project has active sessions', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    mockDb.project.findUnique.mockResolvedValue({
      id: 'p-1',
      channelId: 'ch-1',
      name: 'proj',
    })
    mockDb.agentSession.count.mockResolvedValue(2)

    const req = new NextRequest('http://localhost/api/projects/p-1', { method: 'DELETE' })
    const res = await DELETE(req, { params: Promise.resolve({ projectId: 'p-1' }) })

    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'Cannot delete project with active agent sessions' })
    expect(mockDb.agentSession.count).toHaveBeenCalledWith({
      where: { projectId: 'p-1', status: 'active' },
    })
  })

  it('deletes project and emits project:deleted', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    mockDb.project.findUnique.mockResolvedValue({
      id: 'p-1',
      channelId: 'ch-1',
      name: 'proj',
    })
    mockDb.agentSession.count.mockResolvedValue(0)

    const req = new NextRequest('http://localhost/api/projects/p-1', { method: 'DELETE' })
    const res = await DELETE(req, { params: Promise.resolve({ projectId: 'p-1' }) })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(mockDb.project.delete).toHaveBeenCalledWith({ where: { id: 'p-1' } })
    expect(mockIO.to).toHaveBeenCalledWith('channel:ch-1')
    expect(mockIO.emit).toHaveBeenCalledWith('project:deleted', {
      project_id: 'p-1',
      channel_id: 'ch-1',
    })
  })
})
