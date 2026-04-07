import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/config'
import { db } from '@/lib/db'
import { getIO } from '@/server/socket-server'

// GET /api/projects/:projectId
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { projectId } = await params

  const project = await db.project.findUnique({
    where: { id: projectId },
  })

  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  return NextResponse.json(project)
}

// DELETE /api/projects/:projectId
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { projectId } = await params

  const project = await db.project.findUnique({
    where: { id: projectId },
  })

  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  // Check for active sessions before deleting
  const activeSessions = await db.agentSession.count({
    where: { projectId, status: 'active' },
  })

  if (activeSessions > 0) {
    return NextResponse.json(
      { error: 'Cannot delete project with active agent sessions' },
      { status: 409 }
    )
  }

  await db.project.delete({ where: { id: projectId } })

  const io = getIO()
  io.to(`channel:${project.channelId}`).emit('project:deleted' as any, {
    project_id: projectId,
    channel_id: project.channelId,
  })

  return NextResponse.json({ ok: true })
}
