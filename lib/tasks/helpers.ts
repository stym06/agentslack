import { db } from '@/lib/db'
import { getIO } from '@/server/socket-server'

/**
 * Get the next task number for a channel (auto-increment per channel)
 */
export async function getNextTaskNumber(channelId: string): Promise<number> {
  const lastTask = await db.task.findFirst({
    where: { channelId },
    orderBy: { taskNumber: 'desc' },
    select: { taskNumber: true },
  })
  return (lastTask?.taskNumber ?? 0) + 1
}

/**
 * Resolve a name for a task creator/claimer
 */
export async function resolveActorName(
  actorType: 'user' | 'agent',
  actorId: string,
): Promise<string> {
  if (actorType === 'user') {
    const user = await db.user.findUnique({
      where: { id: actorId },
      select: { name: true },
    })
    return user?.name ?? 'User'
  }
  const agent = await db.agent.findUnique({
    where: { id: actorId },
    select: { name: true },
  })
  return agent?.name ?? 'Agent'
}

/**
 * Emit a system message in the channel for task events
 */
export async function emitTaskSystemMessage(
  channelId: string,
  senderId: string,
  senderType: 'user' | 'agent',
  content: string,
) {
  const io = getIO()

  // Save as a system-style message
  const msg = await db.message.create({
    data: {
      channelId,
      senderType,
      senderId,
      content,
      metadata: { system: true, type: 'task_event' },
    },
  })

  const senderName = await resolveActorName(senderType, senderId)

  io.to(`channel:${channelId}`).emit('message:new', {
    ...msg,
    sender_name: senderName,
    sender_avatar: null,
  })
}

/**
 * Enrich task with creator/claimer names
 */
export async function enrichTask(task: {
  id: string
  channelId: string
  groupId?: string | null
  projectId?: string | null
  messageId: string
  taskNumber: number
  title: string
  body?: string | null
  status: string
  createdByType: string
  createdById: string
  claimedByType: string | null
  claimedById: string | null
  createdAt: Date
  updatedAt: Date
}) {
  const createdByName = await resolveActorName(
    task.createdByType as 'user' | 'agent',
    task.createdById,
  )
  const claimedByName = task.claimedById
    ? await resolveActorName(task.claimedByType as 'user' | 'agent', task.claimedById)
    : null

  return {
    id: task.id,
    channel_id: task.channelId,
    group_id: task.groupId ?? null,
    project_id: task.projectId ?? null,
    message_id: task.messageId,
    task_number: task.taskNumber,
    title: task.title,
    body: task.body ?? null,
    status: task.status,
    created_by_type: task.createdByType,
    created_by_id: task.createdById,
    claimed_by_type: task.claimedByType,
    claimed_by_id: task.claimedById,
    created_at: task.createdAt,
    updated_at: task.updatedAt,
    created_by_name: createdByName,
    claimed_by_name: claimedByName,
  }
}
