import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/internal/agent/[agentId]/session-context?task_id=X
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  const { agentId } = await params
  const { searchParams } = new URL(req.url)
  const taskId = searchParams.get('task_id')

  if (!taskId) {
    return NextResponse.json({ error: 'task_id required' }, { status: 400 })
  }

  const session = await db.agentSession.findFirst({
    where: { agentId, taskId, status: 'active' },
    include: {
      task: true,
      project: true,
    },
  })

  if (!session) {
    return NextResponse.json({ error: 'No active session found' }, { status: 404 })
  }

  return NextResponse.json({
    session_id: session.id,
    task: {
      id: session.task.id,
      task_number: session.task.taskNumber,
      title: session.task.title,
      status: session.task.status,
      message_id: session.task.messageId,
      channel_id: session.task.channelId,
    },
    project: {
      id: session.project.id,
      name: session.project.name,
      repo_path: session.project.repoPath,
      git_url: session.project.gitUrl,
    },
    worktree_path: session.worktreePath,
    branch_name: session.branchName,
  })
}
