import path from 'path'
import fs from 'fs'
import { exec } from 'child_process'
import { promisify } from 'util'
import { generateBranchName } from './git'

const execAsync = promisify(exec)
const MCP_BRIDGE_PATH = path.join(process.cwd(), 'server', 'mcp-bridge.ts')
const BASE_URL = process.env.NEXTAUTH_URL || 'http://localhost:3000'

interface SetupParams {
  project: { id: string; repoPath: string }
  task: { id: string; taskNumber: number; title: string }
  agentId: string
  agentInstructions?: string
  /** 'stash' auto-stashes changes, 'force' ignores dirty check */
  dirtyStrategy?: 'stash' | 'force'
}

interface SetupResult {
  worktreePath: string
  branchName: string
}

/**
 * Set up a task session in the actual project repo:
 * 1. Generate branch name
 * 2. Create and checkout the branch in the repo
 * 3. Write session-specific mcp.json
 * 4. Copy agent CLAUDE.md if provided
 */
export async function setupTaskWorktree(params: SetupParams): Promise<SetupResult> {
  const { project, task, agentId, agentInstructions, dirtyStrategy } = params

  const branchName = generateBranchName(task.taskNumber, task.title)
  const repoPath = project.repoPath

  // Ensure our session files are gitignored
  const gitignorePath = path.join(repoPath, '.gitignore')
  const ignoreEntries = ['mcp.json', 'CLAUDE.md']
  try {
    const existing = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, 'utf-8') : ''
    const missing = ignoreEntries.filter((e) => !existing.split('\n').some((l) => l.trim() === e))
    if (missing.length > 0) {
      fs.appendFileSync(gitignorePath, `\n# AgentSlack session files\n${missing.join('\n')}\n`)
    }
  } catch {}

  // Check if we're already on this task's branch (session restart)
  let currentBranch = ''
  try {
    const { stdout } = await execAsync('git rev-parse --abbrev-ref HEAD', { cwd: repoPath })
    currentBranch = stdout.trim()
  } catch {}

  if (currentBranch !== branchName) {
    // Switching branches — check for uncommitted changes (ignore our session files)
    const { stdout: status } = await execAsync(
      'git status --porcelain --ignore-submodules',
      { cwd: repoPath }
    )
    const userChanges = status
      .split('\n')
      .filter((line) => {
        const file = line.trim().split(/\s+/).pop() ?? ''
        return file !== '' && !ignoreEntries.includes(file) && file !== '.gitignore'
      })
    if (userChanges.length > 0) {
      if (dirtyStrategy === 'stash') {
        await execAsync(`git stash push -m "agentslack-auto-stash-${branchName}"`, { cwd: repoPath })
      } else if (dirtyStrategy === 'force') {
        // proceed without stashing — changes stay on current branch
      } else {
        const err = new Error(`Project repo has uncommitted changes in ${repoPath}`)
        ;(err as any).code = 'DIRTY_REPO'
        ;(err as any).repoPath = repoPath
        throw err
      }
    }

    // Create branch if it doesn't exist, then checkout
    try {
      await execAsync(`git checkout -b "${branchName}"`, { cwd: repoPath })
    } catch {
      // Branch may already exist, just checkout
      await execAsync(`git checkout "${branchName}"`, { cwd: repoPath })
    }
  }

  // Write session-specific mcp.json
  const mcpConfig = {
    mcpServers: {
      agentslack: {
        command: 'npx',
        args: ['tsx', MCP_BRIDGE_PATH],
        env: {
          AGENT_ID: agentId,
          TASK_ID: task.id,
          AGENTSLACK_INTERNAL_URL: BASE_URL,
        },
      },
    },
  }

  fs.writeFileSync(
    path.join(repoPath, 'mcp.json'),
    JSON.stringify(mcpConfig, null, 2)
  )

  // Write CLAUDE.md into the repo if agent has instructions
  if (agentInstructions) {
    fs.writeFileSync(
      path.join(repoPath, 'CLAUDE.md'),
      agentInstructions,
      'utf-8'
    )
  }

  return { worktreePath: repoPath, branchName }
}

/**
 * Clean up a task session — checkout back to main/master branch.
 */
export async function cleanupTaskWorktree(
  repoPath: string,
  _worktreePath: string
): Promise<void> {
  try {
    // Try to go back to main or master
    await execAsync('git checkout main', { cwd: repoPath })
  } catch {
    try {
      await execAsync('git checkout master', { cwd: repoPath })
    } catch {
      // Stay on current branch
    }
  }
}
