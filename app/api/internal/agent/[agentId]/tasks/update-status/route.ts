import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getIO } from '@/server/socket-server'
import { getAgentDaemon } from '@/server/agent-daemon'
import { enrichTask, emitTaskSystemMessage } from '@/lib/tasks/helpers'

const VALID_STATUSES = ['todo', 'in_progress', 'in_review', 'done']

// POST /api/internal/agent/[agentId]/tasks/update-status
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  const { agentId } = await params
  const body = await req.json()
  const { channelId, task_number, status } = body

  if (!channelId || !task_number || !status) {
    return NextResponse.json(
      { error: 'channelId, task_number, and status required' },
      { status: 400 },
    )
  }

  if (!VALID_STATUSES.includes(status)) {
    return NextResponse.json(
      { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` },
      { status: 400 },
    )
  }

  const task = await db.task.findUnique({
    where: { channelId_taskNumber: { channelId, taskNumber: task_number } },
  })

  if (!task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 })
  }

  if (task.claimedById !== agentId) {
    return NextResponse.json({ error: 'You must be the assignee to update status' }, { status: 403 })
  }

  const updated = await db.task.update({
    where: { id: task.id },
    data: { status },
  })

  const enriched = await enrichTask(updated)
  const io = getIO()
  io.to(`channel:${channelId}`).emit('task:updated' as any, enriched)

  const agent = await db.agent.findUnique({
    where: { id: agentId },
    select: { name: true },
  })
  const statusLabel = status.replace('_', ' ')
  await emitTaskSystemMessage(
    channelId,
    agentId,
    'agent',
    `${agent?.name ?? 'Agent'} moved #${task.taskNumber} "${task.title}" to ${statusLabel}`,
  )

  // Handle session lifecycle on status transitions
  if (status === 'done') {
    // Stop the session CLI, mark session completed, keep worktree
    const activeSession = await db.agentSession.findFirst({
      where: { agentId, taskId: task.id, status: 'active' },
    })

    if (activeSession) {
      const daemon = getAgentDaemon()
      daemon.stopSession(agentId, task.id)

      await db.agentSession.update({
        where: { id: activeSession.id },
        data: { status: 'completed', completedAt: new Date() },
      })

      io.to(`channel:${channelId}`).emit('session:stopped' as any, {
        session_id: activeSession.id,
        agent_id: agentId,
        task_id: task.id,
      })
    }
  }

  return NextResponse.json({ success: true, task: enriched })
}
