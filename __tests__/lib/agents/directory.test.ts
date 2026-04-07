import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import path from 'path'
import fs from 'fs'
import os from 'os'

// Mock process.cwd() to use a temp directory
let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentslack-test-'))
  vi.spyOn(process, 'cwd').mockReturnValue(tmpDir)
})

afterEach(() => {
  vi.restoreAllMocks()
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

// Import after mocking so AGENTS_ROOT uses our tmpDir
async function getModule() {
  // Clear module cache for fresh imports
  vi.resetModules()
  return await import('@/lib/agents/directory')
}

describe('getAgentDir', () => {
  it('returns correct path under .agentslack/agents', async () => {
    const { getAgentDir } = await getModule()
    const result = getAgentDir('agent-123')
    expect(result).toBe(path.join(tmpDir, '.agentslack', 'agents', 'agent-123'))
  })
})

describe('ensureAgentDir', () => {
  it('creates directory structure with default CLAUDE.md', async () => {
    const { ensureAgentDir } = await getModule()
    const dirPath = ensureAgentDir('test-agent')

    expect(fs.existsSync(dirPath)).toBe(true)
    expect(fs.existsSync(path.join(dirPath, '.claude', 'commands'))).toBe(true)

    const claudeMd = fs.readFileSync(path.join(dirPath, 'CLAUDE.md'), 'utf-8')
    expect(claudeMd).toBe('You are an AI agent in AgentSlack.')
  })

  it('creates directory with custom instructions', async () => {
    const { ensureAgentDir } = await getModule()
    ensureAgentDir('test-agent', 'Custom instructions here')

    const claudeMd = fs.readFileSync(
      path.join(tmpDir, '.agentslack', 'agents', 'test-agent', 'CLAUDE.md'),
      'utf-8',
    )
    expect(claudeMd).toBe('Custom instructions here')
  })

  it('does not overwrite existing CLAUDE.md', async () => {
    const { ensureAgentDir } = await getModule()
    ensureAgentDir('test-agent', 'First')
    ensureAgentDir('test-agent', 'Second')

    const claudeMd = fs.readFileSync(
      path.join(tmpDir, '.agentslack', 'agents', 'test-agent', 'CLAUDE.md'),
      'utf-8',
    )
    expect(claudeMd).toBe('First')
  })
})

describe('getAgentMemoryDir', () => {
  it('returns mangled memory path', async () => {
    const { getAgentMemoryDir } = await getModule()
    const result = getAgentMemoryDir('agent-123')
    const agentDir = path.join(tmpDir, '.agentslack', 'agents', 'agent-123')
    const mangled = agentDir.replace(/\//g, '-').replace(/^-/, '-')
    expect(result).toBe(path.join(os.homedir(), '.claude', 'projects', mangled, 'memory'))
  })
})

describe('readAgentInstructions', () => {
  it('reads existing CLAUDE.md', async () => {
    const { ensureAgentDir, readAgentInstructions } = await getModule()
    ensureAgentDir('test-agent', 'My instructions')

    expect(readAgentInstructions('test-agent')).toBe('My instructions')
  })

  it('returns empty string when file does not exist', async () => {
    const { readAgentInstructions } = await getModule()
    expect(readAgentInstructions('nonexistent')).toBe('')
  })
})

describe('writeAgentInstructions', () => {
  it('writes CLAUDE.md and creates directory', async () => {
    const { writeAgentInstructions, readAgentInstructions } = await getModule()
    writeAgentInstructions('new-agent', 'New instructions')
    expect(readAgentInstructions('new-agent')).toBe('New instructions')
  })

  it('overwrites existing CLAUDE.md', async () => {
    const { ensureAgentDir, writeAgentInstructions, readAgentInstructions } = await getModule()
    ensureAgentDir('test-agent', 'Old')
    writeAgentInstructions('test-agent', 'Updated')
    expect(readAgentInstructions('test-agent')).toBe('Updated')
  })
})

describe('listAgentSkills', () => {
  it('returns empty array when no skills exist', async () => {
    const { ensureAgentDir, listAgentSkills } = await getModule()
    ensureAgentDir('test-agent')
    expect(listAgentSkills('test-agent')).toEqual([])
  })

  it('lists custom skills from .claude/commands/', async () => {
    const { ensureAgentDir, listAgentSkills } = await getModule()
    const dirPath = ensureAgentDir('test-agent')
    const commandsDir = path.join(dirPath, '.claude', 'commands')
    fs.writeFileSync(path.join(commandsDir, 'my-skill.md'), '# My Skill')

    const skills = listAgentSkills('test-agent')
    expect(skills).toHaveLength(1)
    expect(skills[0]).toEqual({
      name: 'my-skill',
      type: 'custom',
      filename: 'my-skill.md',
    })
  })

  it('lists installed skills from .agents/skills/', async () => {
    const { ensureAgentDir, listAgentSkills } = await getModule()
    const dirPath = ensureAgentDir('test-agent')
    const skillDir = path.join(dirPath, '.agents', 'skills', 'code-review')
    fs.mkdirSync(skillDir, { recursive: true })
    fs.writeFileSync(
      path.join(skillDir, 'SKILL.md'),
      '---\ndescription: Reviews code\n---\nContent',
    )

    const skills = listAgentSkills('test-agent')
    const installed = skills.filter((s) => s.type === 'installed')
    expect(installed).toHaveLength(1)
    expect(installed[0].name).toBe('code-review')
    expect(installed[0].description).toBe('Reviews code')
  })

  it('handles installed skills without SKILL.md', async () => {
    const { ensureAgentDir, listAgentSkills } = await getModule()
    const dirPath = ensureAgentDir('test-agent')
    const skillDir = path.join(dirPath, '.agents', 'skills', 'my-skill')
    fs.mkdirSync(skillDir, { recursive: true })

    const skills = listAgentSkills('test-agent')
    const installed = skills.filter((s) => s.type === 'installed')
    expect(installed).toHaveLength(1)
    expect(installed[0].description).toBeUndefined()
  })
})

describe('readAgentSkill', () => {
  it('reads custom skill', async () => {
    const { ensureAgentDir, writeAgentSkill, readAgentSkill } = await getModule()
    ensureAgentDir('test-agent')
    writeAgentSkill('test-agent', 'test.md', '# Test Skill')

    expect(readAgentSkill('test-agent', 'test.md', 'custom')).toBe('# Test Skill')
  })

  it('reads installed skill', async () => {
    const { ensureAgentDir, readAgentSkill } = await getModule()
    const dirPath = ensureAgentDir('test-agent')
    const skillDir = path.join(dirPath, '.agents', 'skills', 'review')
    fs.mkdirSync(skillDir, { recursive: true })
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), 'Skill content')

    expect(readAgentSkill('test-agent', 'review', 'installed')).toBe('Skill content')
  })

  it('returns null for nonexistent skill', async () => {
    const { readAgentSkill } = await getModule()
    expect(readAgentSkill('test-agent', 'nope.md', 'custom')).toBeNull()
  })
})

describe('writeAgentSkill', () => {
  it('writes skill file', async () => {
    const { writeAgentSkill, readAgentSkill } = await getModule()
    writeAgentSkill('test-agent', 'deploy.md', '# Deploy')
    expect(readAgentSkill('test-agent', 'deploy.md', 'custom')).toBe('# Deploy')
  })
})

describe('deleteAgentSkill', () => {
  it('deletes existing skill', async () => {
    const { writeAgentSkill, deleteAgentSkill, readAgentSkill } = await getModule()
    writeAgentSkill('test-agent', 'temp.md', 'temp')
    expect(deleteAgentSkill('test-agent', 'temp.md')).toBe(true)
    expect(readAgentSkill('test-agent', 'temp.md', 'custom')).toBeNull()
  })

  it('returns false for nonexistent skill', async () => {
    const { deleteAgentSkill } = await getModule()
    expect(deleteAgentSkill('test-agent', 'nope.md')).toBe(false)
  })
})

describe('readAgentMemory', () => {
  it('returns empty array when memory dir does not exist', async () => {
    const { readAgentMemory } = await getModule()
    expect(readAgentMemory('test-agent')).toEqual([])
  })
})

describe('clearAgentMemory', () => {
  it('returns false when memory dir does not exist', async () => {
    const { clearAgentMemory } = await getModule()
    expect(clearAgentMemory('test-agent')).toBe(false)
  })
})
