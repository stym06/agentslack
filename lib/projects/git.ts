import { exec } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import fs from 'fs'

const execAsync = promisify(exec)

const REPOS_ROOT = path.join(process.cwd(), '.agentslack', 'repos')
const WORKTREES_ROOT = path.join(process.cwd(), '.agentslack', 'worktrees')

/**
 * Clone a git repository to .agentslack/repos/{projectId}/
 */
export async function cloneRepo(projectId: string, gitUrl: string): Promise<string> {
  const targetDir = path.join(REPOS_ROOT, projectId)
  fs.mkdirSync(REPOS_ROOT, { recursive: true })

  await execAsync(`git clone ${gitUrl} ${targetDir}`)
  return targetDir
}

/**
 * Validate that a local path exists and is a git repo, return absolute path.
 */
export function resolveRepoPath(localPath: string): string {
  const resolved = path.resolve(localPath)

  if (!fs.existsSync(resolved)) {
    throw new Error(`Path does not exist: ${resolved}`)
  }

  const gitDir = path.join(resolved, '.git')
  if (!fs.existsSync(gitDir)) {
    throw new Error(`Not a git repository: ${resolved}`)
  }

  return resolved
}

/**
 * Create a git worktree for a task.
 * Returns the absolute path to the worktree.
 */
export async function createWorktree(
  repoPath: string,
  projectId: string,
  taskId: string,
  branchName: string
): Promise<string> {
  const worktreeDir = path.join(WORKTREES_ROOT, projectId, taskId)
  fs.mkdirSync(path.dirname(worktreeDir), { recursive: true })

  await execAsync(
    `git worktree add "${worktreeDir}" -b "${branchName}"`,
    { cwd: repoPath }
  )

  return worktreeDir
}

/**
 * Remove a git worktree.
 */
export async function removeWorktree(repoPath: string, worktreePath: string): Promise<void> {
  await execAsync(`git worktree remove "${worktreePath}" --force`, { cwd: repoPath })
}

/**
 * Generate a branch name from task number and title.
 * Format: task/{number}-{slugified-title} (max 50 chars)
 */
export function generateBranchName(taskNumber: number, title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 35)

  return `task/${taskNumber}-${slug}`
}

/**
 * Get status of a worktree (branch, uncommitted changes, ahead/behind).
 */
export async function getWorktreeStatus(worktreePath: string): Promise<{
  branch: string
  hasChanges: boolean
  ahead: number
  behind: number
}> {
  const { stdout: branchOut } = await execAsync('git rev-parse --abbrev-ref HEAD', {
    cwd: worktreePath,
  })
  const branch = branchOut.trim()

  const { stdout: statusOut } = await execAsync('git status --porcelain', {
    cwd: worktreePath,
  })
  const hasChanges = statusOut.trim().length > 0

  let ahead = 0
  let behind = 0
  try {
    const { stdout: abOut } = await execAsync(
      'git rev-list --left-right --count HEAD...@{upstream}',
      { cwd: worktreePath }
    )
    const parts = abOut.trim().split(/\s+/)
    ahead = parseInt(parts[0], 10) || 0
    behind = parseInt(parts[1], 10) || 0
  } catch {
    // No upstream configured — that's fine for new branches
  }

  return { branch, hasChanges, ahead, behind }
}
