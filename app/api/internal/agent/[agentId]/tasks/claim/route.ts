import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getIO } from '@/server/socket-server'
import { enrichTask, emitTaskSystemMessage } from '@/lib/tasks/helpers'

// POST /api/internal/agent/[agentId]/tasks/claim
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  const { agentId } = await params
  const body = await req.json()
  const { channelId, task_numbers, message_ids } = body

  if (!channelId) {
    return NextResponse.json({ error: 'channelId required' }, { status: 400 })
  }
  if (!task_numbers?.length && !message_ids?.length) {
    return NextResponse.json({ error: 'task_numbers or message_ids required' }, { status: 400 })
  }

  const agent = await db.agent.findUnique({
    where: { id: agentId },
    select: { name: true },
  })
  const agentName = agent?.name ?? 'Agent'

  const io = getIO()
  const results = []

  // Claim by task numbers
  if (task_numbers?.length) {
    for (const num of task_numbers) {
      const task = await db.task.findUnique({
        where: { channelId_taskNumber: { channelId, taskNumber: num } },
      })
      if (!task) {
        results.push({ taskNumber: num, success: false, reason: 'not found' })
        continue
      }
      if (task.claimedById && task.claimedById !== agentId) {
        results.push({ taskNumber: num, success: false, reason: 'already claimed' })
        continue
      }

      const data: Record<string, unknown> = {
        claimedByType: 'agent',
        claimedById: agentId,
      }
      if (task.status === 'todo') data.status = 'in_progress'

      const updated = await db.task.update({ where: { id: task.id }, data })
      const enriched = await enrichTask(updated)
      io.to(`channel:${channelId}`).emit('task:updated' as any, enriched)

      results.push({
        taskNumber: num,
        messageId: task.messageId,
        success: true,
      })
    }
  }

  // Claim by message IDs (convert message to task if needed)
  if (message_ids?.length) {
    for (const msgId of message_ids) {
      // Find message by full ID
      const message = await db.message.findFirst({
        where: {
          id: msgId,
          channelId,
          threadId: null, // Only top-level messages
        },
      })
      if (!message) {
        results.push({ messageId: msgId, success: false, reason: 'message not found' })
        continue
      }

      let task = await db.task.findUnique({ where: { messageId: message.id } })
      if (task) {
        if (task.claimedById && task.claimedById !== agentId) {
          results.push({ messageId: msgId, taskNumber: task.taskNumber, success: false, reason: 'already claimed' })
          continue
        }
      } else {
        // Convert message to task
        const lastTask = await db.task.findFirst({
          where: { channelId },
          orderBy: { taskNumber: 'desc' },
          select: { taskNumber: true },
        })
        const taskNumber = (lastTask?.taskNumber ?? 0) + 1

        task = await db.task.create({
          data: {
            channelId,
            messageId: message.id,
            taskNumber,
            title: message.content.substring(0, 200),
            status: 'todo',
            createdByType: message.senderType,
            createdById: message.senderId,
          },
        })
      }

      const data: Record<string, unknown> = {
        claimedByType: 'agent',
        claimedById: agentId,
      }
      if (task.status === 'todo') data.status = 'in_progress'

      const updated = await db.task.update({ where: { id: task.id }, data })
      const enriched = await enrichTask(updated)
      io.to(`channel:${channelId}`).emit('task:updated' as any, enriched)

      results.push({
        taskNumber: updated.taskNumber,
        messageId: message.id,
        success: true,
      })
    }
  }

  // Emit system messages
  const claimed = results.filter((r) => r.success)
  if (claimed.length > 0) {
    const taskList = claimed.map((r) => `#${r.taskNumber}`).join(', ')
    await emitTaskSystemMessage(
      channelId,
      agentId,
      'agent',
      `${agentName} claimed ${taskList}`,
    )
  }

  return NextResponse.json({ results })
}
