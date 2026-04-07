import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/config'
import { db } from '@/lib/db'
import { getIO } from '@/server/socket-server'
import { cloneRepo, resolveRepoPath } from '@/lib/projects/git'

function serializeProject(p: { id: string; channelId: string; name: string; repoPath: string; gitUrl: string | null; status: string; createdAt: Date }) {
  return {
    id: p.id,
    channel_id: p.channelId,
    name: p.name,
    repo_path: p.repoPath,
    git_url: p.gitUrl,
    status: p.status,
    created_at: p.createdAt,
  }
}

// GET /api/projects?channel_id=X
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const channelId = searchParams.get('channel_id')

  if (!channelId) {
    return NextResponse.json({ error: 'channel_id required' }, { status: 400 })
  }

  const projects = await db.project.findMany({
    where: { channelId },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(projects.map(serializeProject))
}

// POST /api/projects
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { channel_id, name, repo_path, git_url } = body

  if (!channel_id || !name) {
    return NextResponse.json({ error: 'channel_id and name required' }, { status: 400 })
  }

  if (!repo_path && !git_url) {
    return NextResponse.json({ error: 'Either repo_path or git_url is required' }, { status: 400 })
  }

  const io = getIO()

  if (repo_path) {
    // Local path: validate and create immediately
    let resolvedPath: string
    try {
      resolvedPath = resolveRepoPath(repo_path)
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }

    const project = await db.project.create({
      data: {
        channelId: channel_id,
        name,
        repoPath: resolvedPath,
        status: 'active',
      },
    })

    const serialized = serializeProject(project)
    io.to(`channel:${channel_id}`).emit('project:created' as any, serialized)
    return NextResponse.json(serialized)
  }

  // Git URL: create with cloning status, clone async
  const project = await db.project.create({
    data: {
      channelId: channel_id,
      name,
      repoPath: '', // will be set after clone
      gitUrl: git_url,
      status: 'cloning',
    },
  })

  const serialized = serializeProject(project)
  io.to(`channel:${channel_id}`).emit('project:created' as any, serialized)

  // Clone asynchronously
  cloneRepo(project.id, git_url)
    .then(async (clonedPath) => {
      const updated = await db.project.update({
        where: { id: project.id },
        data: { repoPath: clonedPath, status: 'active' },
      })
      io.to(`channel:${channel_id}`).emit('project:updated' as any, serializeProject(updated))
    })
    .catch(async (err) => {
      console.error(`[Projects] Clone failed for ${project.id}:`, err.message)
      const updated = await db.project.update({
        where: { id: project.id },
        data: { status: 'error' },
      })
      io.to(`channel:${channel_id}`).emit('project:updated' as any, serializeProject(updated))
    })

  return NextResponse.json(serialized, { status: 201 })
}
