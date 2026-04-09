import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/config'
import { db } from '@/lib/db'
import { getIO } from '@/server/socket-server'
import { getAgentDaemon } from '@/server/agent-daemon'
import { extractMentions, buildThreadContext } from '@/lib/utils/mentions'
import { getNextTaskNumber, enrichTask, resolveActorName } from '@/lib/tasks/helpers'
import { setupTaskWorktree } from '@/lib/projects/worktree'
import { readAgentInstructions } from '@/lib/agents/directory'
import type { SessionConfig } from '@/server/agent-daemon'

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
  const { channel_id, content, thread_id, project_id } = body

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
    const isTopLevel = !thread_id
    deliverToAgents(channel_id, content, replyThreadId, user?.name ?? 'User', session.user.id, project_id || null, isTopLevel).catch((err) =>
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
  senderName: string = 'User',
  userId?: string,
  projectId?: string | null,
  isTopLevel: boolean = false,
) {
  const io = getIO()
  const daemon = getAgentDaemon()

  // Look up all workspace agents (any agent can be called from any channel)
  const allAgents = await db.agent.findMany()

  // Deliver to @mentioned agents, or if in a thread with no mentions,
  // deliver to the last agent who sent a message in that thread
  const mentions = extractMentions(userMessageContent)

  let agentsToDeliver = allAgents.filter((agent) =>
    mentions.some(
      (m) =>
        agent.name.toLowerCase() === m ||
        agent.openclawId.toLowerCase() === m,
    ),
  )

  // Thread reply with no mention → route to last agent in thread
  if (agentsToDeliver.length === 0 && threadId) {
    const lastAgentMessage = await db.message.findFirst({
      where: { threadId, senderType: 'agent' },
      orderBy: { createdAt: 'desc' },
    })
    if (lastAgentMessage) {
      const match = allAgents.find((a) => a.id === lastAgentMessage.senderId)
      if (match) agentsToDeliver = [match]
    }
  }

  if (agentsToDeliver.length === 0) return

  // Auto-create task + session when a project is attached to a top-level message
  if (projectId && userId && isTopLevel) {
    const project = await db.project.findUnique({ where: { id: projectId } })
    if (project && project.status === 'active') {
      // Get or create a TaskGroup for this project so tasks group under the project name
      let projectGroup = await db.taskGroup.findFirst({
        where: { channelId, summary: project.name },
      })
      if (!projectGroup) {
        projectGroup = await db.taskGroup.create({
          data: {
            channelId,
            summary: project.name,
            createdByType: 'user',
            createdById: userId,
          },
        })
      }

      for (const agent of agentsToDeliver) {
        try {
          // Create a task message
          const taskNumber = await getNextTaskNumber(channelId)
          const taskMessage = await db.message.create({
            data: {
              channelId,
              senderType: 'user',
              senderId: userId,
              content: userMessageContent,
              metadata: { isTask: true },
            },
          })

          const task = await db.task.create({
            data: {
              channelId,
              projectId: project.id,
              groupId: projectGroup.id,
              messageId: taskMessage.id,
              taskNumber,
              title: userMessageContent.replace(/@\w+/g, '').trim().slice(0, 100) || `Task #${taskNumber}`,
              status: 'in_progress',
              createdByType: 'user',
              createdById: userId,
              claimedByType: 'agent',
              claimedById: agent.id,
            },
          })

          // Set up worktree + session
          const agentInstructions = readAgentInstructions(agent.id)
          const { worktreePath, branchName } = await setupTaskWorktree({
            project: { id: project.id, repoPath: project.repoPath },
            task: { id: task.id, taskNumber: task.taskNumber, title: task.title },
            agentId: agent.id,
            agentInstructions: agentInstructions || undefined,
          })

          const agentSession = await db.agentSession.create({
            data: {
              agentId: agent.id,
              taskId: task.id,
              projectId: project.id,
              worktreePath,
              branchName,
              status: 'active',
            },
          })

          const sessionConfig: SessionConfig = {
            sessionId: agentSession.id,
            agentId: agent.id,
            taskId: task.id,
            taskNumber: task.taskNumber,
            taskTitle: task.title,
            projectId: project.id,
            worktreePath,
            branchName,
            channelId,
            messageId: taskMessage.id,
          }

          const agentConfig = {
            id: agent.id,
            openclawId: agent.openclawId,
            name: agent.name,
            model: agent.model,
            soulMd: agent.soulMd,
            isAdmin: agent.isAdmin,
            dirPath: worktreePath,
          }

          daemon.startSession(agentConfig, sessionConfig)

          // Deliver the user's actual message to the session
          // It will queue in pendingMessages until warmup completes
          daemon.deliverSessionMessage(agent.id, task.id, {
            channelId,
            threadId: taskMessage.id,
            senderName,
            content: userMessageContent,
          })

          // Emit routing indicator — channel level (no threadId) for typing indicator
          io.to(`channel:${channelId}`).emit('agent:routing', {
            channelId,
            threadId: null,
            agentId: agent.id,
            agentName: agent.name,
          })
          // Also emit for the thread so it shows when thread panel opens
          io.to(`thread:${taskMessage.id}`).emit('agent:routing', {
            channelId,
            threadId: taskMessage.id,
            agentId: agent.id,
            agentName: agent.name,
          })

          // Emit task created event
          const enriched = await enrichTask(task)
          io.to(`channel:${channelId}`).emit('task:created' as any, {
            ...enriched,
            group_summary: project.name,
          })
          io.to(`channel:${channelId}`).emit('session:started' as any, {
            id: agentSession.id,
            agent_id: agent.id,
            task_id: task.id,
            project_id: project.id,
            worktree_path: worktreePath,
            branch_name: branchName,
            status: 'active',
            created_at: agentSession.createdAt,
            completed_at: null,
          })

          // Emit system message with task reference metadata for clickable link
          const sysMsg = await db.message.create({
            data: {
              channelId,
              senderType: 'user',
              senderId: userId,
              content: `Created and assigned #${taskNumber} to @${agent.name} (project: ${project.name}, branch: \`${branchName}\`)`,
              metadata: {
                system: true,
                type: 'task_event',
                taskRef: {
                  task_number: taskNumber,
                  message_id: taskMessage.id,
                  title: task.title,
                },
              },
            },
          })

          const sysActorName = await resolveActorName('user', userId)
          io.to(`channel:${channelId}`).emit('message:new', {
            ...sysMsg,
            sender_name: sysActorName,
            sender_avatar: null,
          })
        } catch (err: any) {
          console.error(`[Messages] Failed to auto-assign project task to ${agent.name}:`, err)
          const sysMsg = await db.message.create({
            data: {
              channelId,
              senderType: 'user',
              senderId: userId,
              content: err?.message || 'Failed to start task session',
              metadata: { system: true, type: 'warning' },
            },
          })
          io.to(`channel:${channelId}`).emit('message:new', { ...sysMsg, sender_name: 'System', sender_avatar: null })
        }
      }
      return // Don't fall through to normal delivery — session handles it
    }
  }

  // Check if this thread is a task thread with an active session
  let taskForThread: { id: string; messageId: string } | null = null
  if (threadId) {
    taskForThread = await db.task.findFirst({
      where: { messageId: threadId },
      select: { id: true, messageId: true },
    })
  }

  for (const agent of agentsToDeliver) {
    // Route to task session if this is a task thread
    if (taskForThread) {
      let session = daemon.getSession(agent.id, taskForThread.id)

      // If no active session but task has a project, auto-restart the session
      if (!session) {
        const fullTask = await db.task.findUnique({ where: { id: taskForThread.id }, include: { project: true } })
        if (fullTask?.projectId && fullTask.project && fullTask.project.status === 'active') {
          try {
            const agentInstructions = readAgentInstructions(agent.id)
            const { worktreePath, branchName } = await setupTaskWorktree({
              project: { id: fullTask.project.id, repoPath: fullTask.project.repoPath },
              task: { id: fullTask.id, taskNumber: fullTask.taskNumber, title: fullTask.title },
              agentId: agent.id,
              agentInstructions: agentInstructions || undefined,
            })

            // Terminate any stale sessions for this task
            await db.agentSession.updateMany({
              where: { taskId: fullTask.id, status: 'active' },
              data: { status: 'terminated', completedAt: new Date() },
            })

            const agentSession = await db.agentSession.create({
              data: {
                agentId: agent.id,
                taskId: fullTask.id,
                projectId: fullTask.project.id,
                worktreePath,
                branchName,
                status: 'active',
              },
            })

            const sessionConfig: SessionConfig = {
              sessionId: agentSession.id,
              agentId: agent.id,
              taskId: fullTask.id,
              taskNumber: fullTask.taskNumber,
              taskTitle: fullTask.title,
              projectId: fullTask.project.id,
              worktreePath,
              branchName,
              channelId,
              messageId: fullTask.messageId,
            }

            daemon.startSession(
              { id: agent.id, openclawId: agent.openclawId, name: agent.name, model: agent.model, soulMd: agent.soulMd, isAdmin: agent.isAdmin, dirPath: worktreePath },
              sessionConfig,
            )

            session = daemon.getSession(agent.id, fullTask.id)
            console.log(`[Messages] Auto-restarted session for ${agent.name} on task #${fullTask.taskNumber}`)
          } catch (err: any) {
            console.error(`[Messages] Failed to auto-restart session for ${agent.name}:`, err)
            const sysMsg = await db.message.create({
              data: {
                channelId,
                senderType: 'user',
                senderId: '00000000-0000-0000-0000-000000000000',
                content: err?.message || 'Failed to restart task session',
                metadata: { system: true, type: 'warning' },
              },
            })
            io.to(`channel:${channelId}`).emit('message:new', { ...sysMsg, sender_name: 'System', sender_avatar: null })
          }
        }
      }

      if (session) {
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

        const delivered = daemon.deliverSessionMessage(agent.id, taskForThread.id, {
          channelId,
          threadId,
          senderName,
          content: userMessageContent,
        })

        if (!delivered) {
          console.error(`Failed to deliver to session for agent ${agent.name} task ${taskForThread.id}`)
        }
        continue // Skip main process delivery
      }

    }

    // Fallback: deliver to main process (no task/project context)
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
