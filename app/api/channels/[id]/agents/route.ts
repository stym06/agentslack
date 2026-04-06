import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/config'
import { db } from '@/lib/db'

// GET /api/channels/[id]/agents - Get all agents assigned to a channel
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { id: channelId } = await params

    // Verify channel exists and user has access
    const channel = await db.channel.findUnique({
      where: { id: channelId },
      include: { workspace: true },
    })

    if (!channel) {
      return NextResponse.json(
        { error: 'Channel not found' },
        { status: 404 }
      )
    }

    // Verify user owns this workspace
    if (channel.workspace.userId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Fetch all assigned agents with agent details
    const channelAgents = await db.channelAgent.findMany({
      where: { channelId },
      include: {
        agent: true,
      },
    })

    const agents = channelAgents.map((ca) => ca.agent)

    return NextResponse.json(agents)
  } catch (error) {
    console.error('Error fetching channel agents:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST /api/channels/[id]/agents - Assign an agent to a channel
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { id: channelId } = await params
    const body = await req.json()
    const { agent_id } = body

    if (!agent_id) {
      return NextResponse.json(
        { error: 'agent_id required' },
        { status: 400 }
      )
    }

    // Verify channel exists and user has access
    const channel = await db.channel.findUnique({
      where: { id: channelId },
      include: { workspace: true },
    })

    if (!channel) {
      return NextResponse.json(
        { error: 'Channel not found' },
        { status: 404 }
      )
    }

    if (channel.workspace.userId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Verify agent exists and belongs to same workspace
    const agent = await db.agent.findUnique({
      where: { id: agent_id },
    })

    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    if (agent.workspaceId !== channel.workspaceId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Create assignment (upsert to handle duplicates)
    const channelAgent = await db.channelAgent.upsert({
      where: {
        channelId_agentId: {
          channelId,
          agentId: agent_id,
        },
      },
      create: {
        channelId,
        agentId: agent_id,
      },
      update: {},
    })

    return NextResponse.json({ success: true, channelAgent })
  } catch (error) {
    console.error('Error assigning agent to channel:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
