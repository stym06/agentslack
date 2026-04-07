import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockGetServerSession, mockDb, mockIO, mockResolveRepoPath, mockCloneRepo } = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  mockDb: {
    project: { findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
  },
  mockIO: {
    to: vi.fn().mockReturnThis(),
    emit: vi.fn(),
  },
  mockResolveRepoPath: vi.fn(),
  mockCloneRepo: vi.fn(),
}))

vi.mock('next-auth', () => ({ getServerSession: mockGetServerSession }))
vi.mock('@/lib/auth/config', () => ({ authOptions: {} }))
vi.mock('@/lib/db', () => ({ db: mockDb }))
vi.mock('@/server/socket-server', () => ({ getIO: () => mockIO }))
vi.mock('@/lib/projects/git', () => ({
  resolveRepoPath: mockResolveRepoPath,
  cloneRepo: mockCloneRepo,
}))

import { GET, POST } from '@/app/api/projects/route'
import { NextRequest } from 'next/server'

const MOCK_SESSION = {
  user: { id: 'user-1', email: 'test@test.com', name: 'TestUser' },
  expires: '2099-01-01',
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/projects', () => {
  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValue(null)

    const req = new NextRequest('http://localhost/api/projects?channel_id=ch-1')
    const res = await GET(req)

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Unauthorized' })
  })

  it('returns all projects when channel_id is omitted', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    mockDb.project.findMany.mockResolvedValue([])

    const req = new NextRequest('http://localhost/api/projects')
    const res = await GET(req)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual([])
    expect(mockDb.project.findMany).toHaveBeenCalledWith({
      where: {},
      orderBy: { createdAt: 'desc' },
    })
  })

  it('returns serialized projects', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    const projects = [
      {
        id: 'p-1',
        channelId: 'ch-1',
        name: 'my-project',
        repoPath: '/repos/my-project',
        gitUrl: null,
        status: 'active',
        createdAt: new Date('2025-01-01'),
      },
    ]
    mockDb.project.findMany.mockResolvedValue(projects)

    const req = new NextRequest('http://localhost/api/projects?channel_id=ch-1')
    const res = await GET(req)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual([
      {
        id: 'p-1',
        channel_id: 'ch-1',
        name: 'my-project',
        repo_path: '/repos/my-project',
        git_url: null,
        status: 'active',
        created_at: '2025-01-01T00:00:00.000Z',
      },
    ])
    expect(mockDb.project.findMany).toHaveBeenCalledWith({
      where: { channelId: 'ch-1' },
      orderBy: { createdAt: 'desc' },
    })
  })
})

describe('POST /api/projects', () => {
  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValue(null)

    const req = new NextRequest('http://localhost/api/projects', {
      method: 'POST',
      body: JSON.stringify({ channel_id: 'ch-1', name: 'proj' }),
    })
    const res = await POST(req)

    expect(res.status).toBe(401)
  })

  it('returns 400 when name is missing', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)

    const req = new NextRequest('http://localhost/api/projects', {
      method: 'POST',
      body: JSON.stringify({ channel_id: 'ch-1' }),
    })
    const res = await POST(req)

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'name required' })
  })

  it('returns 400 when neither repo_path nor git_url provided', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)

    const req = new NextRequest('http://localhost/api/projects', {
      method: 'POST',
      body: JSON.stringify({ channel_id: 'ch-1', name: 'proj' }),
    })
    const res = await POST(req)

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Either repo_path or git_url is required' })
  })

  it('creates project with local repo_path', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    mockResolveRepoPath.mockReturnValue('/resolved/path')
    const createdProject = {
      id: 'p-1',
      channelId: 'ch-1',
      name: 'my-proj',
      repoPath: '/resolved/path',
      gitUrl: null,
      status: 'active',
      createdAt: new Date('2025-01-01'),
    }
    mockDb.project.create.mockResolvedValue(createdProject)

    const req = new NextRequest('http://localhost/api/projects', {
      method: 'POST',
      body: JSON.stringify({ channel_id: 'ch-1', name: 'my-proj', repo_path: '~/my-proj' }),
    })
    const res = await POST(req)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('active')
    expect(body.repo_path).toBe('/resolved/path')
    expect(mockResolveRepoPath).toHaveBeenCalledWith('~/my-proj')
    expect(mockDb.project.create).toHaveBeenCalledWith({
      data: {
        channelId: 'ch-1',
        name: 'my-proj',
        repoPath: '/resolved/path',
        status: 'active',
      },
    })
    expect(mockIO.to).toHaveBeenCalledWith('channel:ch-1')
    expect(mockIO.emit).toHaveBeenCalledWith('project:created', expect.objectContaining({ id: 'p-1' }))
  })

  it('returns 400 when resolveRepoPath throws', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    mockResolveRepoPath.mockImplementation(() => {
      throw new Error('Path does not exist')
    })

    const req = new NextRequest('http://localhost/api/projects', {
      method: 'POST',
      body: JSON.stringify({ channel_id: 'ch-1', name: 'bad-proj', repo_path: '/invalid' }),
    })
    const res = await POST(req)

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Path does not exist' })
  })

  it('creates project with git_url and status cloning', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION)
    mockCloneRepo.mockResolvedValue('/cloned/path')
    const createdProject = {
      id: 'p-2',
      channelId: 'ch-1',
      name: 'remote-proj',
      repoPath: '',
      gitUrl: 'https://github.com/test/repo.git',
      status: 'cloning',
      createdAt: new Date('2025-01-01'),
    }
    const updatedProject = {
      ...createdProject,
      repoPath: '/cloned/path',
      status: 'active',
    }
    mockDb.project.create.mockResolvedValue(createdProject)
    mockDb.project.update.mockResolvedValue(updatedProject)

    const req = new NextRequest('http://localhost/api/projects', {
      method: 'POST',
      body: JSON.stringify({ channel_id: 'ch-1', name: 'remote-proj', git_url: 'https://github.com/test/repo.git' }),
    })
    const res = await POST(req)

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.status).toBe('cloning')
    expect(body.git_url).toBe('https://github.com/test/repo.git')
    expect(mockCloneRepo).toHaveBeenCalledWith('p-2', 'https://github.com/test/repo.git')
    expect(mockDb.project.create).toHaveBeenCalledWith({
      data: {
        channelId: 'ch-1',
        name: 'remote-proj',
        repoPath: '',
        gitUrl: 'https://github.com/test/repo.git',
        status: 'cloning',
      },
    })
  })
})
