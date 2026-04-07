import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/config'
import { db } from '@/lib/db'
import { readAgentSkill, writeAgentSkill, deleteAgentSkill } from '@/lib/agents/directory'

async function verifyAgentAccess(agentId: string, userId: string) {
  const workspace = await db.workspace.findFirst({ where: { userId } })
  if (!workspace) return null
  return db.agent.findFirst({ where: { id: agentId, workspaceId: workspace.id } })
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string; filename: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { agentId, filename } = await params
  const agent = await verifyAgentAccess(agentId, session.user.id)
  if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 })

  const type = req.nextUrl.searchParams.get('type') === 'installed' ? 'installed' : 'custom'
  const content = readAgentSkill(agentId, filename, type as 'installed' | 'custom')
  if (content === null) return NextResponse.json({ error: 'Skill not found' }, { status: 404 })

  return NextResponse.json({ filename, content, type })
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string; filename: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { agentId, filename } = await params
  const agent = await verifyAgentAccess(agentId, session.user.id)
  if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 })

  const { content } = await req.json()
  if (typeof content !== 'string') {
    return NextResponse.json({ error: 'content is required' }, { status: 400 })
  }

  // Only custom skills can be edited
  writeAgentSkill(agentId, filename, content)
  return NextResponse.json({ success: true })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string; filename: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { agentId, filename } = await params
  const agent = await verifyAgentAccess(agentId, session.user.id)
  if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 })

  // Only custom skills can be deleted
  const deleted = deleteAgentSkill(agentId, filename)
  if (!deleted) return NextResponse.json({ error: 'Skill not found' }, { status: 404 })

  return NextResponse.json({ success: true })
}
