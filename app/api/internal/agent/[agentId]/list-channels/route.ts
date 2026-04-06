import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params

  try {
    const agent = await db.agent.findFirst({
      where: {
        OR: [{ id: agentId }, { openclawId: agentId }],
      },
      include: {
        channelAgents: {
          include: {
            channel: {
              select: { id: true, name: true, description: true, channelType: true },
            },
          },
        },
      },
    })

    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    const channels = agent.channelAgents.map((ca) => ca.channel)

    return NextResponse.json({ channels })
  } catch (error) {
    console.error('[Internal API] list-channels error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
