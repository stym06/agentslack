import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params
  const { searchParams } = new URL(req.url)
  const channelId = searchParams.get('channelId')
  const threadId = searchParams.get('threadId')
  const limit = parseInt(searchParams.get('limit') || '20', 10)

  if (!channelId) {
    return NextResponse.json({ error: 'channelId required' }, { status: 400 })
  }

  try {
    // Verify agent exists
    const agent = await db.agent.findFirst({
      where: {
        OR: [{ id: agentId }, { openclawId: agentId }],
      },
    })

    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    const where = threadId
      ? { threadId }
      : { channelId, threadId: null }

    const messages = await db.message.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    })

    // Resolve sender names
    const agentIds = [...new Set(messages.filter(m => m.senderType === 'agent').map(m => m.senderId))]
    const userIds = [...new Set(messages.filter(m => m.senderType === 'user').map(m => m.senderId))]

    const agents = agentIds.length > 0
      ? await db.agent.findMany({ where: { id: { in: agentIds } }, select: { id: true, name: true } })
      : []
    const users = userIds.length > 0
      ? await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
      : []

    const nameMap = new Map([
      ...agents.map((a) => [a.id, a.name] as const),
      ...users.map((u) => [u.id, u.name || 'User'] as const),
    ])

    const formatted = messages.reverse().map((m) => ({
      id: m.id,
      sender: nameMap.get(m.senderId) || (m.senderType === 'agent' ? 'Agent' : 'User'),
      senderType: m.senderType,
      content: m.content,
      timestamp: m.createdAt.toISOString(),
      threadId: m.threadId,
      replyCount: m.replyCount,
    }))

    return NextResponse.json({ messages: formatted })
  } catch (error) {
    console.error('[Internal API] read-history error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
