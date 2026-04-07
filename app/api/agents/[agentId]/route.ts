import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/config'
import { db } from '@/lib/db'
import { getAgentDaemon } from '@/server/agent-daemon'

// PUT /api/agents/[agentId] — Update agent fields
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { agentId } = await params
  const body = await req.json()

  const workspace = await db.workspace.findFirst({
    where: { userId: session.user.id },
  })
  if (!workspace) {
    return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
  }

  const agent = await db.agent.findFirst({
    where: { id: agentId, workspaceId: workspace.id },
  })
  if (!agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
  }

  const data: Record<string, unknown> = {}
  if (body.model) data.model = body.model

  const updated = await db.agent.update({
    where: { id: agentId },
    data,
  })

  return NextResponse.json(updated)
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { agentId } = await params

  try {
    const workspace = await db.workspace.findFirst({
      where: { userId: session.user.id },
    })

    if (!workspace) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
    }

    const agent = await db.agent.findFirst({
      where: { id: agentId, workspaceId: workspace.id },
      include: {
        channelAgents: {
          include: {
            channel: { select: { id: true, name: true } },
          },
        },
      },
    })

    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    // Get process info from daemon
    const daemon = getAgentDaemon()
    const isRunning = daemon.isRunning(agentId)
    const isReady = daemon.isReady(agentId)

    return NextResponse.json({
      ...agent,
      process: {
        running: isRunning,
        ready: isReady,
      },
    })
  } catch (error) {
    console.error('Error fetching agent:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
