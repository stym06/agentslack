import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/config'
import { db } from '@/lib/db'
import { readAgentMemory, clearAgentMemory } from '@/lib/agents/directory'

async function verifyAgentAccess(agentId: string, userId: string) {
  const workspace = await db.workspace.findFirst({ where: { userId } })
  if (!workspace) return null
  return db.agent.findFirst({ where: { id: agentId, workspaceId: workspace.id } })
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

  const entries = readAgentMemory(agentId)
  return NextResponse.json({ entries })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { agentId } = await params
  const agent = await verifyAgentAccess(agentId, session.user.id)
  if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 })

  clearAgentMemory(agentId)
  return NextResponse.json({ success: true })
}
