import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/config'
import { db } from '@/lib/db'
import { getIO } from '@/server/socket-server'
import { enrichTask, emitTaskSystemMessage } from '@/lib/tasks/helpers'

// GET /api/tasks/[taskId] — Get task detail with enrichment
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> },
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { taskId } = await params
  const task = await db.task.findUnique({
    where: { id: taskId },
    include: { group: true },
  })
  if (!task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 })
  }

  const enriched = await enrichTask(task)
  const commentCount = await db.message.count({ where: { threadId: task.messageId } })
  return NextResponse.json({
    ...enriched,
    group_summary: task.group?.summary ?? null,
    comment_count: commentCount,
  })
}

// PATCH /api/tasks/[taskId] — Update task status or claim/unclaim
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> },
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { taskId } = await params
  const body = await req.json()
  const { status, claim } = body // claim: true to claim, false to unclaim

  const task = await db.task.findUnique({ where: { id: taskId } })
  if (!task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 })
  }

  const data: Record<string, unknown> = {}

  if (status) {
    data.status = status
  }

  if (claim === true) {
    if (task.claimedById && task.claimedById !== session.user.id) {
      return NextResponse.json({ error: 'Task already claimed' }, { status: 409 })
    }
    data.claimedByType = 'user'
    data.claimedById = session.user.id
    if (task.status === 'todo') {
      data.status = 'in_progress'
    }
  } else if (claim === false) {
    data.claimedByType = null
    data.claimedById = null
  }

  const updated = await db.task.update({
    where: { id: taskId },
    data,
  })

  const enriched = await enrichTask(updated)
  const io = getIO()
  io.to(`channel:${task.channelId}`).emit('task:updated' as any, enriched)

  // Emit system message for status changes
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { name: true },
  })
  const userName = user?.name ?? 'User'

  if (status && status !== task.status) {
    const statusLabel = status.replace('_', ' ')
    await emitTaskSystemMessage(
      task.channelId,
      session.user.id,
      'user',
      `${userName} moved #${task.taskNumber} "${task.title}" to ${statusLabel}`,
    )
  }
  if (claim === true) {
    await emitTaskSystemMessage(
      task.channelId,
      session.user.id,
      'user',
      `${userName} claimed #${task.taskNumber} "${task.title}"`,
    )
  }
  if (claim === false) {
    await emitTaskSystemMessage(
      task.channelId,
      session.user.id,
      'user',
      `${userName} unclaimed #${task.taskNumber} "${task.title}"`,
    )
  }

  return NextResponse.json(enriched)
}

// DELETE /api/tasks/[taskId] — Delete a task
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> },
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { taskId } = await params
  const task = await db.task.findUnique({ where: { id: taskId } })
  if (!task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 })
  }

  // Delete sessions, thread participants, thread replies, task, then the backing message
  await db.agentSession.deleteMany({ where: { taskId } })
  await db.threadParticipant.deleteMany({ where: { threadId: task.messageId } })
  await db.message.deleteMany({ where: { threadId: task.messageId } })
  await db.task.delete({ where: { id: taskId } })
  await db.message.delete({ where: { id: task.messageId } })

  const io = getIO()
  io.to(`channel:${task.channelId}`).emit('task:deleted' as any, { id: taskId })

  return NextResponse.json({ success: true })
}
