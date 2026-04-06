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
      select: { id: true, workspaceId: true },
    })

    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    const agents = await db.agent.findMany({
      where: {
        workspaceId: agent.workspaceId,
        id: { not: agent.id },
      },
      select: {
        id: true,
        openclawId: true,
        name: true,
        role: true,
        isAdmin: true,
        status: true,
      },
    })

    return NextResponse.json({ agents })
  } catch (error) {
    console.error('[Internal API] list-agents error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
