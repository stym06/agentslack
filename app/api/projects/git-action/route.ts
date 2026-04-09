import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/config'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

// POST /api/projects/git-action — Stash or create new branch for a dirty repo
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { repo_path, action } = await req.json()

  if (!repo_path || !action) {
    return NextResponse.json({ error: 'repo_path and action required' }, { status: 400 })
  }

  if (action !== 'stash' && action !== 'new_branch') {
    return NextResponse.json({ error: 'action must be "stash" or "new_branch"' }, { status: 400 })
  }

  try {
    if (action === 'stash') {
      await execAsync('git stash push -m "agentslack-stash"', { cwd: repo_path })
      return NextResponse.json({ success: true, message: 'Changes stashed successfully' })
    }

    if (action === 'new_branch') {
      const branchName = `agentslack-wip-${Date.now()}`
      await execAsync(`git checkout -b "${branchName}"`, { cwd: repo_path })
      await execAsync('git add -A', { cwd: repo_path })
      await execAsync(`git commit -m "WIP: save uncommitted changes"`, { cwd: repo_path })
      await execAsync('git checkout -', { cwd: repo_path })
      return NextResponse.json({ success: true, message: `Changes saved to branch ${branchName}` })
    }
  } catch (err: any) {
    console.error('[GitAction] Failed:', err)
    return NextResponse.json({ error: err.message || 'Git operation failed' }, { status: 500 })
  }
}
