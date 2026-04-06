import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// Track last check time per agent (in-memory, resets on server restart)
const lastCheckMap = new Map<string, Date>()

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
        channelAgents: { select: { channelId: true } },
      },
    })

    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    const lastCheck = lastCheckMap.get(agent.id) || new Date(0)
    const now = new Date()

    // Get channels the agent belongs to
    const channelIds = agent.channelAgents.map((ca) => ca.channelId)

    if (channelIds.length === 0) {
      lastCheckMap.set(agent.id, now)
      return NextResponse.json({ messages: [] })
    }

    // Find new messages from users (not from this agent) since last check
    const newMessages = await db.message.findMany({
      where: {
        channelId: { in: channelIds },
        senderType: 'user',
        createdAt: { gt: lastCheck },
      },
      orderBy: { createdAt: 'asc' },
      take: 50,
    })

    // Resolve sender names
    const userIds = [...new Set(newMessages.map((m) => m.senderId))]
    const users = userIds.length > 0
      ? await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
      : []
    const nameMap = new Map(users.map((u) => [u.id, u.name || 'User']))

    const formatted = newMessages.map((m) => ({
      id: m.id,
      channelId: m.channelId,
      threadId: m.threadId,
      sender: nameMap.get(m.senderId) || 'User',
      content: m.content,
      timestamp: m.createdAt.toISOString(),
    }))

    lastCheckMap.set(agent.id, now)

    return NextResponse.json({ messages: formatted })
  } catch (error) {
    console.error('[Internal API] check-messages error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
