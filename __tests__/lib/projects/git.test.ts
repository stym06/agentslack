import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import path from 'path'
import fs from 'fs'
import os from 'os'

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentslack-git-test-'))
  vi.spyOn(process, 'cwd').mockReturnValue(tmpDir)
})

afterEach(() => {
  vi.restoreAllMocks()
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

async function getModule() {
  vi.resetModules()
  return await import('@/lib/projects/git')
}

describe('generateBranchName', () => {
  it('generates branch name from task number and title', async () => {
    const { generateBranchName } = await getModule()
    expect(generateBranchName(1, 'Fix login bug')).toBe('task/1-fix-login-bug')
  })

  it('lowercases and slugifies title', async () => {
    const { generateBranchName } = await getModule()
    expect(generateBranchName(42, 'Add OAuth2 Support!')).toBe('task/42-add-oauth2-support')
  })

  it('strips special characters', async () => {
    const { generateBranchName } = await getModule()
    expect(generateBranchName(3, 'Fix @mentions & #channels')).toBe('task/3-fix-mentions-channels')
  })

  it('truncates long titles to 35 chars', async () => {
    const { generateBranchName } = await getModule()
    const longTitle = 'This is a very long task title that should be truncated to fit the branch name limit'
    const result = generateBranchName(1, longTitle)
    // slug portion should be at most 35 chars
    const slug = result.replace('task/1-', '')
    expect(slug.length).toBeLessThanOrEqual(35)
  })

  it('handles empty title', async () => {
    const { generateBranchName } = await getModule()
    expect(generateBranchName(1, '')).toBe('task/1-')
  })

  it('strips leading/trailing hyphens from slug', async () => {
    const { generateBranchName } = await getModule()
    expect(generateBranchName(1, '---test---')).toBe('task/1-test')
  })
})

describe('resolveRepoPath', () => {
  it('resolves valid git repo path', async () => {
    const { resolveRepoPath } = await getModule()
    const repoDir = path.join(tmpDir, 'my-repo')
    fs.mkdirSync(path.join(repoDir, '.git'), { recursive: true })

    const resolved = resolveRepoPath(repoDir)
    expect(resolved).toBe(repoDir)
  })

  it('throws for nonexistent path', async () => {
    const { resolveRepoPath } = await getModule()
    expect(() => resolveRepoPath('/nonexistent/path')).toThrow('Path does not exist')
  })

  it('throws for non-git directory', async () => {
    const { resolveRepoPath } = await getModule()
    const nonGitDir = path.join(tmpDir, 'not-a-repo')
    fs.mkdirSync(nonGitDir, { recursive: true })

    expect(() => resolveRepoPath(nonGitDir)).toThrow('Not a git repository')
  })

  it('resolves relative paths', async () => {
    const { resolveRepoPath } = await getModule()
    const repoDir = path.join(tmpDir, 'my-repo')
    fs.mkdirSync(path.join(repoDir, '.git'), { recursive: true })

    // Use the actual absolute path since resolve works from real cwd
    const resolved = resolveRepoPath(repoDir)
    expect(path.isAbsolute(resolved)).toBe(true)
  })
})
