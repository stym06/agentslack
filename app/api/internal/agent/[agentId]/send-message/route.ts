import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getIO } from '@/server/socket-server'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params

  try {
    const { channelId, content, threadId } = await req.json()

    console.log(`[send-message] Agent ${agentId} sending to channel=${channelId} thread=${threadId} content="${content?.substring(0, 50)}"`)

    if (!channelId || !content) {
      return NextResponse.json(
        { error: 'channelId and content required' },
        { status: 400 }
      )
    }

    // Look up agent by DB id or openclawId
    const agent = await db.agent.findFirst({
      where: {
        OR: [{ id: agentId }, { openclawId: agentId }],
      },
    })

    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    // Save agent message to DB
    const message = await db.message.create({
      data: {
        channelId,
        threadId: threadId || null,
        senderType: 'agent',
        senderId: agent.id,
        content,
        metadata: { status: 'complete' },
      },
    })

    // Push via Socket.io
    const io = getIO()
    const messagePayload = {
      ...message,
      sender_name: agent.name,
      sender_avatar: agent.avatarUrl ?? null,
    }

    io.to(`channel:${channelId}`).emit('message:new', messagePayload)

    if (threadId) {
      io.to(`thread:${threadId}`).emit('message:new', messagePayload)

      // Update reply count from actual count
      const replyCount = await db.message.count({ where: { threadId } })
      const updated = await db.message.update({
        where: { id: threadId },
        data: { replyCount },
      })
      io.to(`channel:${channelId}`).emit('message:reply_count', {
        message_id: threadId,
        reply_count: updated.replyCount,
      })

      // Add to thread participants
      await db.threadParticipant.upsert({
        where: {
          threadId_agentId: { threadId, agentId: agent.id },
        },
        update: {},
        create: { threadId, agentId: agent.id },
      })
    }

    // Mark agent as online (it just responded)
    await db.agent.update({
      where: { id: agent.id },
      data: { status: 'online' },
    })
    io.emit('agent:status', { agent_id: agent.id, status: 'online' })

    return NextResponse.json({ success: true, message_id: message.id })
  } catch (error) {
    console.error('[Internal API] send-message error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
