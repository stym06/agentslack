import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params

  try {
    const agent = await db.agent.findFirst({
      where: { OR: [{ id: agentId }, { openclawId: agentId }] },
      select: { id: true },
    })

    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    const projects = await db.project.findMany({
      where: { status: 'active' },
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, repoPath: true, gitUrl: true, channelId: true },
    })

    return NextResponse.json({
      projects: projects.map((p) => ({
        id: p.id,
        name: p.name,
        repo_path: p.repoPath,
        git_url: p.gitUrl,
        channel_id: p.channelId,
      })),
    })
  } catch (error) {
    console.error('[Internal API] list-projects error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
