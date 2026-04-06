import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getIO } from '@/server/socket-server'
import { getNextTaskNumber, enrichTask, emitTaskSystemMessage } from '@/lib/tasks/helpers'

// GET /api/internal/agent/[agentId]/tasks?channelId=X&status=all
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  const { agentId } = await params
  const { searchParams } = new URL(req.url)
  const channelId = searchParams.get('channelId')
  const status = searchParams.get('status') || 'all'

  if (!channelId) {
    return NextResponse.json({ error: 'channelId required' }, { status: 400 })
  }

  const where: Record<string, unknown> = { channelId }
  if (status !== 'all') {
    where.status = status
  }

  const tasks = await db.task.findMany({
    where,
    orderBy: { taskNumber: 'asc' },
  })

  const enriched = await Promise.all(tasks.map(enrichTask))
  return NextResponse.json({ tasks: enriched })
}

// POST /api/internal/agent/[agentId]/tasks — Agent creates tasks
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  const { agentId } = await params
  const body = await req.json()
  const { channelId, tasks: taskDefs, summary } = body

  if (!channelId || !taskDefs?.length) {
    return NextResponse.json({ error: 'channelId and tasks required' }, { status: 400 })
  }

  const agent = await db.agent.findUnique({
    where: { id: agentId },
    select: { name: true },
  })
  const agentName = agent?.name ?? 'Agent'

  const io = getIO()
  const created = []

  // Create a task group if multiple tasks or summary provided
  let groupId: string | null = null
  if (taskDefs.length > 1 || summary) {
    const groupSummary = summary || taskDefs.map((t: { title: string }) => t.title).join(', ')
    const group = await db.taskGroup.create({
      data: {
        channelId,
        summary: groupSummary,
        createdByType: 'agent',
        createdById: agentId,
      },
    })
    groupId = group.id
  }

  for (const taskDef of taskDefs) {
    const taskNumber = await getNextTaskNumber(channelId)

    const message = await db.message.create({
      data: {
        channelId,
        senderType: 'agent',
        senderId: agentId,
        content: taskDef.title,
        metadata: { isTask: true },
      },
    })

    const task = await db.task.create({
      data: {
        channelId,
        groupId,
        messageId: message.id,
        taskNumber,
        title: taskDef.title,
        status: 'todo',
        createdByType: 'agent',
        createdById: agentId,
      },
    })

    const enriched = await enrichTask(task)
    io.to(`channel:${channelId}`).emit('task:created' as any, enriched)

    created.push({
      taskNumber: task.taskNumber,
      messageId: message.id,
      title: task.title,
    })
  }

  return NextResponse.json({ tasks: created })
}
