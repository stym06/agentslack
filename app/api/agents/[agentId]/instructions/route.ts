import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/config'
import { db } from '@/lib/db'
import { readAgentInstructions, writeAgentInstructions } from '@/lib/agents/directory'

async function verifyAgentAccess(agentId: string, userId: string) {
  const workspace = await db.workspace.findFirst({ where: { userId } })
  if (!workspace) return null
  const agent = await db.agent.findFirst({ where: { id: agentId, workspaceId: workspace.id } })
  return agent
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { agentId } = await params
  const agent = await verifyAgentAccess(agentId, session.user.id)
  if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 })

  const content = readAgentInstructions(agentId)
  return NextResponse.json({ content })
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { agentId } = await params
  const agent = await verifyAgentAccess(agentId, session.user.id)
  if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 })

  const { content } = await req.json()
  if (typeof content !== 'string') {
    return NextResponse.json({ error: 'content is required' }, { status: 400 })
  }

  writeAgentInstructions(agentId, content)

  // Sync to DB as cache
  await db.agent.update({ where: { id: agentId }, data: { soulMd: content } })

  return NextResponse.json({ success: true })
}
