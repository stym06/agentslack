import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/config'
import { db } from '@/lib/db'
import { getIO } from '@/server/socket-server'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: messageId } = await params

  if (!messageId) {
    return NextResponse.json(
      { error: 'Message ID required' },
      { status: 400 }
    )
  }

  try {
    // Fetch message by ID from database
    const message = await db.message.findUnique({
      where: { id: messageId },
    })

    if (!message) {
      return NextResponse.json(
        { error: 'Message not found' },
        { status: 404 }
      )
    }

    // Join with agents/users to get sender details
    let senderName = 'Unknown'
    let senderAvatar: string | null = null

    if (message.senderType === 'agent') {
      const agent = await db.agent.findUnique({
        where: { id: message.senderId },
        select: { name: true, avatarUrl: true },
      })
      if (agent) {
        senderName = agent.name
        senderAvatar = agent.avatarUrl
      }
    } else if (message.senderType === 'user') {
      const user = await db.user.findUnique({
        where: { id: message.senderId },
        select: { name: true, avatarUrl: true },
      })
      if (user) {
        senderName = user.name ?? 'User'
        senderAvatar = user.avatarUrl
      }
    }

    // Return message JSON with sender details
    return NextResponse.json({
      ...message,
      sender_name: senderName,
      sender_avatar: senderAvatar,
    })
  } catch (error) {
    console.error('Error fetching message:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: messageId } = await params

  const message = await db.message.findUnique({ where: { id: messageId } })
  if (!message) {
    return NextResponse.json({ error: 'Message not found' }, { status: 404 })
  }

  // Delete thread participants, replies, associated task, then the message
  await db.threadParticipant.deleteMany({ where: { threadId: messageId } })
  await db.message.deleteMany({ where: { threadId: messageId } })
  await db.task.deleteMany({ where: { messageId } })
  await db.message.delete({ where: { id: messageId } })

  const io = getIO()
  io.to(`channel:${message.channelId}`).emit('message:deleted' as any, { id: messageId })
  if (message.threadId) {
    io.to(`thread:${message.threadId}`).emit('message:deleted' as any, { id: messageId })
  }

  return NextResponse.json({ success: true })
}
