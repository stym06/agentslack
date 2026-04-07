import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import path from 'path'
import fs from 'fs'
import os from 'os'

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentslack-worktree-test-'))
  vi.spyOn(process, 'cwd').mockReturnValue(tmpDir)
})

afterEach(() => {
  vi.restoreAllMocks()
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('setupTaskWorktree', () => {
  it('generates correct branch name and writes mcp.json and CLAUDE.md', async () => {
    vi.resetModules()

    // Mock createWorktree to just create the directory
    vi.doMock('@/lib/projects/git', () => ({
      generateBranchName: (num: number, title: string) => `task/${num}-${title.toLowerCase().replace(/\s+/g, '-')}`,
      createWorktree: async (_repoPath: string, projectId: string, taskId: string) => {
        const worktreeDir = path.join(tmpDir, '.agentslack', 'worktrees', projectId, taskId)
        fs.mkdirSync(worktreeDir, { recursive: true })
        return worktreeDir
      },
      removeWorktree: vi.fn(),
    }))

    const { setupTaskWorktree } = await import('@/lib/projects/worktree')

    const result = await setupTaskWorktree({
      project: { id: 'proj-1', repoPath: '/repos/myrepo' },
      task: { id: 'task-1', taskNumber: 5, title: 'Fix login' },
      agentId: 'agent-1',
      agentInstructions: 'Be helpful',
    })

    expect(result.branchName).toBe('task/5-fix-login')
    expect(result.worktreePath).toContain('worktrees')

    // Check mcp.json was written
    const mcpJson = JSON.parse(fs.readFileSync(path.join(result.worktreePath, 'mcp.json'), 'utf-8'))
    expect(mcpJson.mcpServers.agentslack.env.AGENT_ID).toBe('agent-1')
    expect(mcpJson.mcpServers.agentslack.env.TASK_ID).toBe('task-1')

    // Check CLAUDE.md was written
    const claudeMd = fs.readFileSync(path.join(result.worktreePath, 'CLAUDE.md'), 'utf-8')
    expect(claudeMd).toBe('Be helpful')
  })

  it('skips CLAUDE.md when no instructions provided', async () => {
    vi.resetModules()

    vi.doMock('@/lib/projects/git', () => ({
      generateBranchName: () => 'task/1-test',
      createWorktree: async (_repoPath: string, projectId: string, taskId: string) => {
        const worktreeDir = path.join(tmpDir, '.agentslack', 'worktrees', projectId, taskId)
        fs.mkdirSync(worktreeDir, { recursive: true })
        return worktreeDir
      },
      removeWorktree: vi.fn(),
    }))

    const { setupTaskWorktree } = await import('@/lib/projects/worktree')

    const result = await setupTaskWorktree({
      project: { id: 'proj-1', repoPath: '/repos/myrepo' },
      task: { id: 'task-1', taskNumber: 1, title: 'Test' },
      agentId: 'agent-1',
    })

    expect(fs.existsSync(path.join(result.worktreePath, 'CLAUDE.md'))).toBe(false)
  })
})

describe('cleanupTaskWorktree', () => {
  it('calls removeWorktree with correct args', async () => {
    vi.resetModules()

    const mockRemoveWorktree = vi.fn()
    vi.doMock('@/lib/projects/git', () => ({
      generateBranchName: () => '',
      createWorktree: vi.fn(),
      removeWorktree: mockRemoveWorktree,
    }))

    const { cleanupTaskWorktree } = await import('@/lib/projects/worktree')
    await cleanupTaskWorktree('/repos/myrepo', '/worktrees/proj/task')

    expect(mockRemoveWorktree).toHaveBeenCalledWith('/repos/myrepo', '/worktrees/proj/task')
  })
})
