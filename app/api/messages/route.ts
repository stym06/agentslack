import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/config'
import { db } from '@/lib/db'
import { getIO } from '@/server/socket-server'
import { getAgentDaemon } from '@/server/agent-daemon'
import { extractMentions, buildThreadContext } from '@/lib/utils/mentions'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const channelId = searchParams.get('channel_id')
  const threadId = searchParams.get('thread_id')

  if (!channelId && !threadId) {
    return NextResponse.json(
      { error: 'channel_id or thread_id required' },
      { status: 400 }
    )
  }

  try {
    if (threadId) {
      const results = await db.message.findMany({
        where: { threadId },
        orderBy: { createdAt: 'asc' },
      })
      const messagesWithNames = await addSenderNames(results)
      return NextResponse.json(messagesWithNames)
    }

    const allMessages = await db.message.findMany({
      where: {
        channelId: channelId!,
        threadId: null,
      },
      orderBy: { createdAt: 'asc' },
    })
    // Filter out task messages in JS
    const results = allMessages.filter(
      (m) => !(m.metadata as Record<string, unknown>)?.isTask,
    )

    const messagesWithNames = await addSenderNames(results)
    return NextResponse.json(messagesWithNames)
  } catch (error) {
    console.error('Error fetching messages:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { channel_id, content, thread_id } = body

  if (!channel_id || !content) {
    return NextResponse.json(
      { error: 'channel_id and content required' },
      { status: 400 }
    )
  }

  try {
    // 1. Save user message to database
    const userMessage = await db.message.create({
      data: {
        channelId: channel_id,
        threadId: thread_id || null,
        senderType: 'user',
        senderId: session.user.id,
        content,
      },
    })

    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: { name: true, avatarUrl: true },
    })

    // 2. Push user message to frontend via Socket.io
    const io = getIO()
    io.to(`channel:${channel_id}`).emit('message:new', {
      ...userMessage,
      sender_name: user?.name ?? 'You',
      sender_avatar: user?.avatarUrl ?? null,
    })

    if (thread_id) {
      io.to(`thread:${thread_id}`).emit('message:new', {
        ...userMessage,
        sender_name: user?.name ?? 'You',
        sender_avatar: user?.avatarUrl ?? null,
      })

      const replyCount = await db.message.count({ where: { threadId: thread_id } })
      const updated = await db.message.update({
        where: { id: thread_id },
        data: { replyCount },
      })
      io.to(`channel:${channel_id}`).emit('message:reply_count', {
        message_id: thread_id,
        reply_count: updated.replyCount,
      })
    }

    // 3. Deliver to agent(s) via Agent Daemon
    // If this is a top-level message, tell agents to reply in its thread
    const replyThreadId = thread_id || userMessage.id
    deliverToAgents(channel_id, content, replyThreadId, user?.name ?? 'User').catch((err) =>
      console.error('Error delivering to agents:', err)
    )

    return NextResponse.json({ success: true, message: userMessage })
  } catch (error) {
    console.error('Error sending message:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

async function deliverToAgents(
  channelId: string,
  userMessageContent: string,
  threadId?: string | null,
  senderName: string = 'User'
) {
  const io = getIO()
  const daemon = getAgentDaemon()

  const channelAgents = await db.channelAgent.findMany({
    where: { channelId },
    include: { agent: true },
  })

  // Deliver to @mentioned agents, or if in a thread with no mentions,
  // deliver to the last agent who sent a message in that thread
  const mentions = extractMentions(userMessageContent)

  let agentsToDeliver = channelAgents.filter((ca) =>
    mentions.some(
      (m) =>
        ca.agent.name.toLowerCase() === m ||
        ca.agent.openclawId.toLowerCase() === m,
    ),
  )

  // Thread reply with no mention → route to last agent in thread
  if (agentsToDeliver.length === 0 && threadId) {
    const lastAgentMessage = await db.message.findFirst({
      where: { threadId, senderType: 'agent' },
      orderBy: { createdAt: 'desc' },
    })
    if (lastAgentMessage) {
      const match = channelAgents.find((ca) => ca.agent.id === lastAgentMessage.senderId)
      if (match) agentsToDeliver = [match]
    }
  }

  if (agentsToDeliver.length === 0) return

  for (const ca of agentsToDeliver) {
    const agent = ca.agent

    if (!daemon.isReady(agent.id)) {
      console.warn(`Agent ${agent.name} is not ready yet, skipping`)
      continue
    }

    // Mark agent as busy and notify clients
    await db.agent.update({
      where: { id: agent.id },
      data: { status: 'busy' },
    })
    io.emit('agent:status', { agent_id: agent.id, status: 'busy' })
    io.to(`channel:${channelId}`).emit('agent:routing', {
      channelId,
      threadId: threadId || null,
      agentId: agent.id,
      agentName: agent.name,
    })
    if (threadId) {
      io.to(`thread:${threadId}`).emit('agent:routing', {
        channelId,
        threadId,
        agentId: agent.id,
        agentName: agent.name,
      })
    }

    // Build context for threads
    let messageToSend = userMessageContent
    if (threadId) {
      const threadMessages = await db.message.findMany({
        where: { threadId },
        orderBy: { createdAt: 'asc' },
      })
      const messagesWithNames = await addSenderNames(threadMessages)
      const threadContext = buildThreadContext(messagesWithNames)
      messageToSend = `${threadContext}\n\nNew message: ${userMessageContent}`
    }

    const delivered = daemon.deliverMessage(agent.id, {
      channelId,
      threadId,
      senderName,
      content: messageToSend,
    })

    if (!delivered) {
      console.error(`Failed to deliver message to agent ${agent.name}`)
      await db.agent.update({
        where: { id: agent.id },
        data: { status: 'online' },
      })
      io.emit('agent:status', { agent_id: agent.id, status: 'online' })
    }
  }
}

async function addSenderNames(
  messages: Array<Record<string, unknown> & {
    id: string
    channelId: string
    threadId: string | null
    senderType: string
    senderId: string
    content: string
    metadata: unknown
    replyCount: number
    createdAt: Date
  }>
) {
  const agentIds = [
    ...new Set(
      messages.filter((m) => m.senderType === 'agent').map((m) => m.senderId)
    ),
  ]
  const userIds = [
    ...new Set(
      messages.filter((m) => m.senderType === 'user').map((m) => m.senderId)
    ),
  ]

  const agents =
    agentIds.length > 0
      ? await db.agent.findMany({
          where: { id: { in: agentIds } },
          select: { id: true, name: true, avatarUrl: true },
        })
      : []

  const users =
    userIds.length > 0
      ? await db.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true, avatarUrl: true },
        })
      : []

  const agentMap = new Map(agents.map((a) => [a.id, a]))
  const userMap = new Map(users.map((u) => [u.id, u]))

  return messages.map((msg) => {
    if (msg.senderType === 'agent') {
      const agent = agentMap.get(msg.senderId)
      return {
        ...msg,
        sender_name: agent?.name ?? 'Agent',
        sender_avatar: agent?.avatarUrl ?? null,
      }
    }
    const user = userMap.get(msg.senderId)
    return {
      ...msg,
      sender_name: user?.name ?? 'You',
      sender_avatar: user?.avatarUrl ?? null,
    }
  })
}
