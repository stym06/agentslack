import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/config'
import { db } from '@/lib/db'
import { getAgentDaemon } from '@/server/agent-daemon'
import { getIO } from '@/server/socket-server'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { agentId } = await params

  const workspace = await db.workspace.findFirst({ where: { userId: session.user.id } })
  if (!workspace) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })

  const agent = await db.agent.findFirst({ where: { id: agentId, workspaceId: workspace.id } })
  if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 })

  await db.agent.update({ where: { id: agentId }, data: { status: 'loading' } })
  getIO().emit('agent:status', { agent_id: agentId, status: 'loading' })

  const daemon = getAgentDaemon()
  daemon.startAgentManual(agentId)

  return NextResponse.json({ success: true })
}
