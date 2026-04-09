import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/config'
import { db } from '@/lib/db'
import { getIO } from '@/server/socket-server'
import { getNextTaskNumber, enrichTask } from '@/lib/tasks/helpers'

// GET /api/tasks?channel_id=X&status=all
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const channelId = searchParams.get('channel_id')
  const status = searchParams.get('status') || 'all'

  // channel_id is optional — omit for global task list
  const where: Record<string, unknown> = {}
  if (channelId) {
    where.channelId = channelId
  }
  if (status !== 'all') {
    where.status = status
  }

  const tasks = await db.task.findMany({
    where,
    orderBy: { taskNumber: 'asc' },
    include: { message: true, group: true },
  })

  const enriched = await Promise.all(
    tasks.map(async (t) => {
      const base = await enrichTask(t)
      const commentCount = t.message ? await db.message.count({ where: { threadId: t.messageId } }) : 0
      return { ...base, group_id: t.groupId, group_summary: t.group?.summary ?? null, comment_count: commentCount }
    }),
  )

  // Also fetch groups
  const groupWhere: Record<string, unknown> = {}
  if (channelId) groupWhere.channelId = channelId
  const groups = await db.taskGroup.findMany({
    where: groupWhere,
    orderBy: { createdAt: 'asc' },
  })

  return NextResponse.json({ tasks: enriched, groups })
}

// POST /api/tasks — Create a task from the UI
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { channel_id, title, group_id, project_id, message_id, body: taskBody } = body

  if (!channel_id || !title) {
    return NextResponse.json({ error: 'channel_id and title required' }, { status: 400 })
  }

  if (!project_id) {
    return NextResponse.json({ error: 'project_id is required' }, { status: 400 })
  }

  // Verify project exists
  const project = await db.project.findFirst({ where: { id: project_id, status: 'active' } })
  if (!project) {
    return NextResponse.json({ error: 'Project not found or not active' }, { status: 404 })
  }

  const taskNumber = await getNextTaskNumber(channel_id)

  // Reuse existing message if provided, otherwise create one
  let messageId: string
  if (message_id) {
    const existing = await db.message.findUnique({ where: { id: message_id } })
    if (!existing) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 })
    }
    messageId = existing.id
  } else {
    const message = await db.message.create({
      data: {
        channelId: channel_id,
        senderType: 'user',
        senderId: session.user.id,
        content: title,
        metadata: { isTask: true },
      },
    })
    messageId = message.id
  }

  const task = await db.task.create({
    data: {
      channelId: channel_id,
      projectId: project_id,
      groupId: group_id || null,
      messageId,
      taskNumber,
      title,
      body: taskBody || null,
      status: 'todo',
      createdByType: 'user',
      createdById: session.user.id,
    },
  })

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { name: true, avatarUrl: true },
  })

  const io = getIO()
  const enriched = await enrichTask(task)

  // Only emit task event, no chat message
  io.to(`channel:${channel_id}`).emit('task:created' as any, enriched)

  return NextResponse.json(enriched)
}
