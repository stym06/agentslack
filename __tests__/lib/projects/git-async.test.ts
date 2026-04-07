import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import path from 'path'
import fs from 'fs'
import os from 'os'

const { mockExecAsync } = vi.hoisted(() => ({
  mockExecAsync: vi.fn(),
}))

vi.mock('child_process', () => ({ exec: vi.fn() }))
vi.mock('util', async (importOriginal) => {
  const orig = await importOriginal<typeof import('util')>()
  return { ...orig, promisify: () => mockExecAsync }
})

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentslack-git-async-'))
  vi.spyOn(process, 'cwd').mockReturnValue(tmpDir)
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

async function getModule() {
  vi.resetModules()
  // Re-apply mocks after resetModules
  vi.mock('child_process', () => ({ exec: vi.fn() }))
  vi.mock('util', async (importOriginal) => {
    const orig = await importOriginal<typeof import('util')>()
    return { ...orig, promisify: () => mockExecAsync }
  })
  return await import('@/lib/projects/git')
}

describe('cloneRepo', () => {
  it('creates REPOS_ROOT directory and calls git clone', async () => {
    mockExecAsync.mockResolvedValue({ stdout: '', stderr: '' })
    const { cloneRepo } = await getModule()

    const result = await cloneRepo('proj-1', 'https://github.com/test/repo.git')

    const expectedDir = path.join(tmpDir, '.agentslack', 'repos', 'proj-1')
    expect(result).toBe(expectedDir)
    expect(mockExecAsync).toHaveBeenCalledWith(
      `git clone https://github.com/test/repo.git ${expectedDir}`,
    )
    // Verify REPOS_ROOT was created
    expect(fs.existsSync(path.join(tmpDir, '.agentslack', 'repos'))).toBe(true)
  })

  it('propagates exec errors', async () => {
    mockExecAsync.mockRejectedValue(new Error('clone failed'))
    const { cloneRepo } = await getModule()

    await expect(cloneRepo('proj-1', 'bad-url')).rejects.toThrow('clone failed')
  })
})

describe('createWorktree', () => {
  it('creates parent dir and calls git worktree add', async () => {
    mockExecAsync.mockResolvedValue({ stdout: '', stderr: '' })
    const { createWorktree } = await getModule()

    const result = await createWorktree('/repo', 'proj-1', 'task-1', 'task/1-fix')

    const expectedDir = path.join(tmpDir, '.agentslack', 'worktrees', 'proj-1', 'task-1')
    expect(result).toBe(expectedDir)
    expect(mockExecAsync).toHaveBeenCalledWith(
      `git worktree add "${expectedDir}" -b "task/1-fix"`,
      { cwd: '/repo' },
    )
    // Verify parent directory was created
    expect(fs.existsSync(path.join(tmpDir, '.agentslack', 'worktrees', 'proj-1'))).toBe(true)
  })
})

describe('removeWorktree', () => {
  it('calls git worktree remove --force', async () => {
    mockExecAsync.mockResolvedValue({ stdout: '', stderr: '' })
    const { removeWorktree } = await getModule()

    await removeWorktree('/repo', '/worktrees/proj-1/task-1')

    expect(mockExecAsync).toHaveBeenCalledWith(
      'git worktree remove "/worktrees/proj-1/task-1" --force',
      { cwd: '/repo' },
    )
  })
})

describe('getWorktreeStatus', () => {
  it('returns branch, changes status, and ahead/behind with upstream', async () => {
    mockExecAsync
      .mockResolvedValueOnce({ stdout: 'task/1-fix\n', stderr: '' })
      .mockResolvedValueOnce({ stdout: ' M file.ts\n', stderr: '' })
      .mockResolvedValueOnce({ stdout: '3\t1\n', stderr: '' })

    const { getWorktreeStatus } = await getModule()
    const result = await getWorktreeStatus('/worktree/path')

    expect(result).toEqual({
      branch: 'task/1-fix',
      hasChanges: true,
      ahead: 3,
      behind: 1,
    })
    expect(mockExecAsync).toHaveBeenCalledWith('git rev-parse --abbrev-ref HEAD', {
      cwd: '/worktree/path',
    })
    expect(mockExecAsync).toHaveBeenCalledWith('git status --porcelain', {
      cwd: '/worktree/path',
    })
    expect(mockExecAsync).toHaveBeenCalledWith(
      'git rev-list --left-right --count HEAD...@{upstream}',
      { cwd: '/worktree/path' },
    )
  })

  it('returns zero ahead/behind when no upstream configured', async () => {
    mockExecAsync
      .mockResolvedValueOnce({ stdout: 'main\n', stderr: '' })
      .mockResolvedValueOnce({ stdout: '', stderr: '' })
      .mockRejectedValueOnce(new Error('no upstream'))

    const { getWorktreeStatus } = await getModule()
    const result = await getWorktreeStatus('/worktree/path')

    expect(result).toEqual({
      branch: 'main',
      hasChanges: false,
      ahead: 0,
      behind: 0,
    })
  })

  it('handles clean working directory', async () => {
    mockExecAsync
      .mockResolvedValueOnce({ stdout: 'feature\n', stderr: '' })
      .mockResolvedValueOnce({ stdout: '  \n', stderr: '' })
      .mockResolvedValueOnce({ stdout: '0\t0\n', stderr: '' })

    const { getWorktreeStatus } = await getModule()
    const result = await getWorktreeStatus('/worktree/path')

    expect(result.hasChanges).toBe(false)
    expect(result.ahead).toBe(0)
    expect(result.behind).toBe(0)
  })
})
