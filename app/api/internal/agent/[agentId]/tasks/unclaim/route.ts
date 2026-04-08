import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getIO } from '@/server/socket-server'
import { enrichTask, emitTaskSystemMessage } from '@/lib/tasks/helpers'

// POST /api/internal/agent/[agentId]/tasks/unclaim
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  const { agentId } = await params
  const body = await req.json()
  const { channelId, task_number, taskId } = body

  if (!taskId && (!channelId || !task_number)) {
    return NextResponse.json({ error: 'taskId or (channelId + task_number) required' }, { status: 400 })
  }

  const task = taskId
    ? await db.task.findUnique({ where: { id: taskId } })
    : await db.task.findUnique({ where: { channelId_taskNumber: { channelId, taskNumber: task_number } } })

  if (!task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 })
  }

  if (task.claimedById !== agentId) {
    return NextResponse.json({ error: 'You are not the claimant' }, { status: 403 })
  }

  const updated = await db.task.update({
    where: { id: task.id },
    data: {
      claimedByType: null,
      claimedById: null,
      status: 'todo',
    },
  })

  const enriched = await enrichTask(updated)
  const io = getIO()
  io.to(`channel:${channelId}`).emit('task:updated' as any, enriched)

  const agent = await db.agent.findUnique({
    where: { id: agentId },
    select: { name: true },
  })
  await emitTaskSystemMessage(
    channelId,
    agentId,
    'agent',
    `${agent?.name ?? 'Agent'} unclaimed #${task.taskNumber} "${task.title}"`,
  )

  return NextResponse.json({ success: true })
}
