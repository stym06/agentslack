import path from 'path'
import fs from 'fs'
import os from 'os'

const AGENTS_ROOT = path.join(process.cwd(), '.agentslack', 'agents')

/**
 * Get the directory path for an agent.
 */
export function getAgentDir(agentId: string): string {
  return path.join(AGENTS_ROOT, agentId)
}

/**
 * Ensure the agent directory exists with the required structure.
 * Creates CLAUDE.md with initialInstructions if it doesn't exist yet.
 * Returns the directory path.
 */
export function ensureAgentDir(agentId: string, initialInstructions?: string): string {
  const dirPath = getAgentDir(agentId)
  fs.mkdirSync(path.join(dirPath, '.claude', 'commands'), { recursive: true })

  const claudeMdPath = path.join(dirPath, 'CLAUDE.md')
  if (!fs.existsSync(claudeMdPath)) {
    const content = initialInstructions || `You are an AI agent in AgentSlack.`
    fs.writeFileSync(claudeMdPath, content, 'utf-8')
  }

  return dirPath
}

/**
 * Compute the path where Claude Code stores memory for this agent.
 * Claude Code mangles the cwd path: replaces path separators with dashes,
 * strips leading separator → ~/.claude/projects/{mangled}/memory/
 */
export function getAgentMemoryDir(agentId: string): string {
  const dirPath = getAgentDir(agentId)
  // Claude Code mangles: /Users/foo/bar → -Users-foo-bar
  const mangled = dirPath.replace(/\//g, '-').replace(/^-/, '-')
  return path.join(os.homedir(), '.claude', 'projects', mangled, 'memory')
}

/**
 * Read the CLAUDE.md instructions for an agent.
 * Returns empty string if the file doesn't exist.
 */
export function readAgentInstructions(agentId: string): string {
  const claudeMdPath = path.join(getAgentDir(agentId), 'CLAUDE.md')
  try {
    return fs.readFileSync(claudeMdPath, 'utf-8')
  } catch {
    return ''
  }
}

/**
 * Write CLAUDE.md instructions for an agent.
 * Creates the directory if it doesn't exist.
 */
export function writeAgentInstructions(agentId: string, content: string): void {
  const dirPath = ensureAgentDir(agentId)
  fs.writeFileSync(path.join(dirPath, 'CLAUDE.md'), content, 'utf-8')
}

export type SkillInfo = {
  name: string
  type: 'installed' | 'custom'
  /** For installed: directory name. For custom: filename (e.g., my-skill.md) */
  filename: string
  description?: string
}

/**
 * List all skills for an agent.
 * - Installed skills live in .agents/skills/{name}/SKILL.md (synced via Claude Code)
 * - Custom skills live in .claude/commands/{name}.md (user-created)
 */
export function listAgentSkills(agentId: string): SkillInfo[] {
  const dirPath = getAgentDir(agentId)
  const skills: SkillInfo[] = []

  // Installed skills from .agents/skills/
  const installedDir = path.join(dirPath, '.agents', 'skills')
  try {
    const entries = fs.readdirSync(installedDir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const skillMdPath = path.join(installedDir, entry.name, 'SKILL.md')
      let description: string | undefined
      try {
        const content = fs.readFileSync(skillMdPath, 'utf-8')
        // Extract description from frontmatter
        const match = content.match(/^---\n[\s\S]*?description:\s*(.+)\n[\s\S]*?---/)
        if (match) description = match[1].trim()
      } catch { /* no SKILL.md */ }
      skills.push({
        name: entry.name,
        type: 'installed',
        filename: entry.name,
        description,
      })
    }
  } catch { /* directory doesn't exist yet */ }

  // Custom skills from .claude/commands/
  const commandsDir = path.join(dirPath, '.claude', 'commands')
  try {
    const files = fs.readdirSync(commandsDir).filter((f) => f.endsWith('.md'))
    for (const f of files) {
      skills.push({
        name: f.replace(/\.md$/, ''),
        type: 'custom',
        filename: f,
      })
    }
  } catch { /* directory doesn't exist yet */ }

  return skills
}

/**
 * Read a skill's content.
 * For installed skills: reads SKILL.md from .agents/skills/{name}/
 * For custom skills: reads from .claude/commands/{filename}
 */
export function readAgentSkill(agentId: string, filename: string, type: 'installed' | 'custom' = 'custom'): string | null {
  const dirPath = getAgentDir(agentId)
  const filePath = type === 'installed'
    ? path.join(dirPath, '.agents', 'skills', filename, 'SKILL.md')
    : path.join(dirPath, '.claude', 'commands', filename)
  try {
    return fs.readFileSync(filePath, 'utf-8')
  } catch {
    return null
  }
}

/**
 * Write a custom skill file.
 */
export function writeAgentSkill(agentId: string, filename: string, content: string): void {
  const commandsDir = path.join(getAgentDir(agentId), '.claude', 'commands')
  fs.mkdirSync(commandsDir, { recursive: true })
  fs.writeFileSync(path.join(commandsDir, filename), content, 'utf-8')
}

/**
 * Delete a custom skill file.
 */
export function deleteAgentSkill(agentId: string, filename: string): boolean {
  const filePath = path.join(getAgentDir(agentId), '.claude', 'commands', filename)
  try {
    fs.unlinkSync(filePath)
    return true
  } catch {
    return false
  }
}

/**
 * Read memory entries from the Claude Code memory directory.
 */
export function readAgentMemory(agentId: string): Array<{ filename: string; content: string }> {
  const memDir = getAgentMemoryDir(agentId)
  try {
    const files = fs.readdirSync(memDir).filter((f) => f.endsWith('.md'))
    return files.map((f) => ({
      filename: f,
      content: fs.readFileSync(path.join(memDir, f), 'utf-8'),
    }))
  } catch {
    return []
  }
}

/**
 * Clear all memory entries for an agent.
 */
export function clearAgentMemory(agentId: string): boolean {
  const memDir = getAgentMemoryDir(agentId)
  try {
    const files = fs.readdirSync(memDir)
    for (const f of files) {
      fs.unlinkSync(path.join(memDir, f))
    }
    return true
  } catch {
    return false
  }
}
