import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/config'
import { db } from '@/lib/db'
import { listAgentSkills, writeAgentSkill } from '@/lib/agents/directory'

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

  const skills = listAgentSkills(agentId)
  return NextResponse.json({ skills })
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { agentId } = await params
  const agent = await verifyAgentAccess(agentId, session.user.id)
  if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 })

  const { filename, content } = await req.json()
  if (!filename || typeof content !== 'string') {
    return NextResponse.json({ error: 'filename and content required' }, { status: 400 })
  }

  // Sanitize and ensure .md extension
  const baseName = filename.replace(/\.md$/, '').replace(/[^a-zA-Z0-9_-]/g, '')
  const safeName = baseName + '.md'
  writeAgentSkill(agentId, safeName, content)

  return NextResponse.json({ success: true, filename: safeName })
}
