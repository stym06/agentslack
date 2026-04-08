import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import path from 'path'
import fs from 'fs'
import os from 'os'

let tmpDir: string

const mockExecAsync = vi.fn()

vi.mock('child_process', () => ({
  exec: vi.fn(),
}))

vi.mock('util', () => ({
  promisify: () => mockExecAsync,
}))

vi.mock('./git', () => ({
  generateBranchName: (num: number, title: string) =>
    `task/${num}-${title.toLowerCase().replace(/\s+/g, '-')}`,
}))

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentslack-worktree-test-'))
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('setupTaskWorktree', () => {
  it('generates correct branch name and writes mcp.json and CLAUDE.md', async () => {
    vi.resetModules()

    vi.doMock('@/lib/projects/git', () => ({
      generateBranchName: (num: number, title: string) =>
        `task/${num}-${title.toLowerCase().replace(/\s+/g, '-')}`,
    }))

    // Mock execAsync: rev-parse returns a different branch, status returns clean, checkout succeeds
    const localExec = vi.fn()
      .mockResolvedValueOnce({ stdout: 'main\n' }) // git rev-parse
      .mockResolvedValueOnce({ stdout: '' }) // git status --porcelain
      .mockResolvedValueOnce({ stdout: '' }) // git checkout -b

    vi.doMock('util', () => ({
      promisify: () => localExec,
    }))

    // Use tmpDir as the repo path
    const { setupTaskWorktree } = await import('@/lib/projects/worktree')

    const result = await setupTaskWorktree({
      project: { id: 'proj-1', repoPath: tmpDir },
      task: { id: 'task-1', taskNumber: 5, title: 'Fix login' },
      agentId: 'agent-1',
      agentInstructions: 'Be helpful',
    })

    expect(result.branchName).toBe('task/5-fix-login')
    expect(result.worktreePath).toBe(tmpDir)

    // Check mcp.json was written
    const mcpJson = JSON.parse(fs.readFileSync(path.join(tmpDir, 'mcp.json'), 'utf-8'))
    expect(mcpJson.mcpServers.agentslack.env.AGENT_ID).toBe('agent-1')
    expect(mcpJson.mcpServers.agentslack.env.TASK_ID).toBe('task-1')

    // Check CLAUDE.md was written
    const claudeMd = fs.readFileSync(path.join(tmpDir, 'CLAUDE.md'), 'utf-8')
    expect(claudeMd).toBe('Be helpful')
  })

  it('skips CLAUDE.md when no instructions provided', async () => {
    vi.resetModules()

    vi.doMock('@/lib/projects/git', () => ({
      generateBranchName: () => 'task/1-test',
    }))

    const localExec = vi.fn()
      .mockResolvedValueOnce({ stdout: 'main\n' })
      .mockResolvedValueOnce({ stdout: '' })
      .mockResolvedValueOnce({ stdout: '' })

    vi.doMock('util', () => ({
      promisify: () => localExec,
    }))

    const { setupTaskWorktree } = await import('@/lib/projects/worktree')

    const result = await setupTaskWorktree({
      project: { id: 'proj-1', repoPath: tmpDir },
      task: { id: 'task-1', taskNumber: 1, title: 'Test' },
      agentId: 'agent-1',
    })

    expect(fs.existsSync(path.join(result.worktreePath, 'CLAUDE.md'))).toBe(false)
  })
})

describe('cleanupTaskWorktree', () => {
  it('checks out main branch on cleanup', async () => {
    vi.resetModules()

    const localExec = vi.fn().mockResolvedValueOnce({ stdout: '' })

    vi.doMock('util', () => ({
      promisify: () => localExec,
    }))

    vi.doMock('@/lib/projects/git', () => ({
      generateBranchName: () => '',
    }))

    const { cleanupTaskWorktree } = await import('@/lib/projects/worktree')
    await cleanupTaskWorktree('/repos/myrepo', '/worktrees/proj/task')

    expect(localExec).toHaveBeenCalledWith('git checkout main', { cwd: '/repos/myrepo' })
  })
})
