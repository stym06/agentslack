import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/config'
import { db } from '@/lib/db'
import { getIO } from '@/server/socket-server'
import { getAgentDaemon } from '@/server/agent-daemon'
import { setupTaskWorktree } from '@/lib/projects/worktree'
import { readAgentInstructions } from '@/lib/agents/directory'
import { enrichTask, emitTaskSystemMessage } from '@/lib/tasks/helpers'
import type { SessionConfig } from '@/server/agent-daemon'

// POST /api/tasks/[taskId]/assign — Assign a task to an agent with a project
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> },
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { taskId } = await params
  const body = await req.json()
  const { agent_id, project_id, dirty_strategy } = body

  if (!agent_id || !project_id) {
    return NextResponse.json(
      { error: 'agent_id and project_id required' },
      { status: 400 },
    )
  }

  // Validate task
  const task = await db.task.findUnique({ where: { id: taskId } })
  if (!task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 })
  }

  // Check for existing active session on this task
  const existingSession = await db.agentSession.findFirst({
    where: { taskId, status: 'active' },
  })
  if (existingSession) {
    return NextResponse.json(
      { error: 'Task already has an active session' },
      { status: 409 },
    )
  }

  // Validate agent
  const agent = await db.agent.findUnique({ where: { id: agent_id } })
  if (!agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
  }

  // Validate project
  const project = await db.project.findUnique({ where: { id: project_id } })
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }
  if (project.status !== 'active') {
    return NextResponse.json(
      { error: `Project is not active (status: ${project.status})` },
      { status: 400 },
    )
  }

  // Set up worktree
  const agentInstructions = readAgentInstructions(agent.id)
  let worktreePath: string
  let branchName: string
  try {
    const result = await setupTaskWorktree({
      project: { id: project.id, repoPath: project.repoPath },
      task: { id: task.id, taskNumber: task.taskNumber, title: task.title },
      agentId: agent.id,
      agentInstructions: agentInstructions || undefined,
      dirtyStrategy: dirty_strategy || undefined,
    })
    worktreePath = result.worktreePath
    branchName = result.branchName
  } catch (err: any) {
    if (err.code === 'DIRTY_REPO') {
      return NextResponse.json(
        { error: 'dirty_repo', message: err.message, repo_path: err.repoPath },
        { status: 409 },
      )
    }
    throw err
  }

  // Create session record
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

  // Update task
  const updatedTask = await db.task.update({
    where: { id: task.id },
    data: {
      claimedById: agent.id,
      claimedByType: 'agent',
      projectId: project.id,
      status: 'in_progress',
    },
  })

  // Start CLI session
  const daemon = getAgentDaemon()
  const sessionConfig: SessionConfig = {
    sessionId: agentSession.id,
    agentId: agent.id,
    taskId: task.id,
    taskNumber: task.taskNumber,
    taskTitle: task.title,
    projectId: project.id,
    worktreePath,
    branchName,
    channelId: task.channelId,
    messageId: task.messageId,
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

  // Deliver the task content to the session so the agent knows what to work on
  daemon.deliverSessionMessage(agent.id, task.id, {
    channelId: task.channelId,
    threadId: task.messageId,
    senderName: 'System',
    content: `You have been assigned task #${task.taskNumber}: "${task.title}". Read the task thread for context, then begin working.`,
  })

  // Emit events
  const io = getIO()

  // Emit routing indicator for typing indicator
  io.to(`channel:${task.channelId}`).emit('agent:routing', {
    channelId: task.channelId,
    threadId: null,
    agentId: agent.id,
    agentName: agent.name,
  })
  io.to(`thread:${task.messageId}`).emit('agent:routing', {
    channelId: task.channelId,
    threadId: task.messageId,
    agentId: agent.id,
    agentName: agent.name,
  })
  const enriched = await enrichTask(updatedTask)
  io.to(`channel:${task.channelId}`).emit('task:updated' as any, enriched)
  io.to(`channel:${task.channelId}`).emit('session:started' as any, {
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

  await emitTaskSystemMessage(
    task.channelId,
    session.user.id,
    'user',
    `Assigned #${task.taskNumber} "${task.title}" to @${agent.name} (project: ${project.name}, branch: \`${branchName}\`)`,
  )

  return NextResponse.json({
    task: enriched,
    session: agentSession,
    worktree_path: worktreePath,
    branch_name: branchName,
  })
}
