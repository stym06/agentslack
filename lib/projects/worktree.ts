import path from 'path'
import fs from 'fs'
import { createWorktree, removeWorktree, generateBranchName } from './git'

const MCP_BRIDGE_PATH = path.join(process.cwd(), 'server', 'mcp-bridge.ts')
const BASE_URL = process.env.NEXTAUTH_URL || 'http://localhost:3000'

interface SetupParams {
  project: { id: string; repoPath: string }
  task: { id: string; taskNumber: number; title: string }
  agentId: string
  agentInstructions?: string
}

interface SetupResult {
  worktreePath: string
  branchName: string
}

/**
 * Set up a complete worktree for a task session:
 * 1. Generate branch name
 * 2. Create git worktree
 * 3. Write session-specific mcp.json
 * 4. Copy agent CLAUDE.md if provided
 */
export async function setupTaskWorktree(params: SetupParams): Promise<SetupResult> {
  const { project, task, agentId, agentInstructions } = params

  const branchName = generateBranchName(task.taskNumber, task.title)

  const worktreePath = await createWorktree(
    project.repoPath,
    project.id,
    task.id,
    branchName
  )

  // Write session-specific mcp.json with TASK_ID
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
    path.join(worktreePath, 'mcp.json'),
    JSON.stringify(mcpConfig, null, 2)
  )

  // Write CLAUDE.md into the worktree if agent has instructions
  if (agentInstructions) {
    fs.writeFileSync(
      path.join(worktreePath, 'CLAUDE.md'),
      agentInstructions,
      'utf-8'
    )
  }

  return { worktreePath, branchName }
}

/**
 * Clean up a task worktree.
 */
export async function cleanupTaskWorktree(
  repoPath: string,
  worktreePath: string
): Promise<void> {
  await removeWorktree(repoPath, worktreePath)
}
