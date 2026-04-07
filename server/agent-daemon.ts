import { spawn, ChildProcess } from 'child_process'
import path from 'path'
import fs from 'fs'
import { listAgentSkills } from '../lib/agents/directory'

interface AgentConfig {
  id: string
  openclawId: string
  name: string
  model: string
  soulMd: string | null
  isAdmin: boolean
  dirPath: string
}

interface AgentProcess {
  process: ChildProcess
  agentId: string
  name: string
  buffer: string
  ready: boolean
  pendingMessages: string[]
}

interface SessionConfig {
  sessionId: string
  agentId: string
  taskId: string
  taskNumber: number
  taskTitle: string
  projectId: string
  worktreePath: string
  branchName: string
  channelId: string
  messageId: string // task's messageId = threadId for the task thread
}

interface AgentSessionProcess {
  config: SessionConfig
  process: ChildProcess
  buffer: string
  ready: boolean
  pendingMessages: string[]
}

const CLAUDE_CLI = process.env.CLAUDE_CLI_PATH || 'claude'
const BASE_URL = process.env.NEXTAUTH_URL || 'http://localhost:3000'
const MCP_BRIDGE_PATH = path.join(process.cwd(), 'server', 'mcp-bridge.ts')

function mapModelToCli(dbModel: string): string {
  const map: Record<string, string> = {
    'anthropic/claude-sonnet-4-5': 'sonnet',
    'anthropic/claude-sonnet-4-6': 'sonnet',
    'anthropic/claude-opus-4': 'opus',
    'anthropic/claude-opus-4-6': 'opus',
    'anthropic/claude-haiku-4-5': 'haiku',
    'anthropic/claude-haiku-3-5': 'haiku',
  }
  return map[dbModel] || 'sonnet'
}

function writeMcpConfig(agentId: string, dirPath: string): string {
  const configPath = path.join(dirPath, 'mcp.json')
  const config = {
    mcpServers: {
      agentslack: {
        command: 'npx',
        args: ['tsx', MCP_BRIDGE_PATH],
        env: {
          AGENT_ID: agentId,
          AGENTSLACK_INTERNAL_URL: BASE_URL,
        },
      },
    },
  }

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2))
  return configPath
}

function buildCommunicationRules(agent: AgentConfig): string {
  // Discover installed skills for this agent
  const skills = listAgentSkills(agent.id)
  let skillsSection = ''
  if (skills.length > 0) {
    const skillLines = skills.map((s) => {
      const desc = s.description ? ` — ${s.description}` : ''
      const tag = s.type === 'installed' ? ' (installed plugin)' : ' (custom command)'
      return `- ${s.name}${tag}${desc}`
    })
    skillsSection = `\n\n## Your Skills\nYou have the following skills available. Use them when relevant — you don't need to be told to look for them:\n${skillLines.join('\n')}`
  }

  return `## Communication Rules
You are an agent inside AgentSlack, a Slack-like workspace. You MUST use the agentslack MCP tools to communicate. NEVER respond with plain text — always use the send_message tool.

When you receive a message:
1. Read the [Channel: ...] and optional [Thread: ...] IDs from the message
2. Process the request
3. Use the send_message tool to reply, passing the channelId (and threadId if present)

Available tools:
- send_message(channelId, content, threadId?) — Send your reply to a channel or thread
- read_history(channelId, limit?, threadId?) — Read recent messages
- check_messages() — Check for new unread messages
- list_channels() — List channels you belong to
- list_agents() — List other agents in the workspace
- list_tasks(channelId, status?) — View task board for a channel
- create_tasks(channelId, tasks[]) — Create subtasks to decompose work
- claim_tasks(channelId, task_numbers) — Claim tasks before starting work
- unclaim_task(channelId, task_number) — Release a task you can no longer work on
- update_task_status(channelId, task_number, status) — Update task progress (todo, in_progress, in_review, done)

## Task Workflow
- Always claim a task before starting work on it to prevent duplicate effort
- Use create_tasks to break down large tasks into smaller subtasks
- Follow up on each task in its thread using send_message with the task's messageId as threadId
- Move to in_review when your work is ready for human review
- Only mark done for trivial tasks; let humans approve completion
- If you can no longer work on a task, unclaim it so someone else can pick it up${skillsSection}

If you receive a system warmup message like "[SYSTEM] warmup", respond with just "ready" (no tool call needed for warmup).`
}

function buildSessionRules(agent: AgentConfig, session: SessionConfig): string {
  return `## Communication Rules
You are an agent inside AgentSlack, a Slack-like workspace. You MUST use the agentslack MCP tools to communicate. NEVER respond with plain text — always use the send_message tool.

## Current Task
You are working on task #${session.taskNumber}: "${session.taskTitle}"
Your working directory is a git worktree on branch \`${session.branchName}\`.
Channel ID: ${session.channelId}
Thread ID: ${session.messageId}

Always communicate progress in the task thread using send_message with channelId="${session.channelId}" and threadId="${session.messageId}".

Available tools:
- send_message(channelId, content, threadId?) — Send your reply to a channel or thread
- read_history(channelId, limit?, threadId?) — Read recent messages
- check_messages() — Check for new unread messages
- list_channels() — List channels you belong to
- list_agents() — List other agents in the workspace
- get_task_context() — Get details about your current task, project, and branch
- list_tasks(channelId, status?) — View task board for a channel
- update_task_status(channelId, task_number, status) — Update task progress (todo, in_progress, in_review, done)

## Workflow
1. Read the task thread for context using read_history with threadId="${session.messageId}"
2. Work on the task in your worktree (branch: ${session.branchName})
3. Communicate progress in the task thread
4. When done, move task to in_review and ask the user for next steps
5. @mention the user in your thread messages when you need their input

If you receive a system warmup message like "[SYSTEM] warmup", respond with just "ready" (no tool call needed for warmup).`
}

// Callback for status changes
type StatusCallback = (agentId: string, status: 'loading' | 'online' | 'offline') => void
type SessionStatusCallback = (agentId: string, taskId: string, status: 'active' | 'terminated') => void

class AgentDaemon {
  private processes = new Map<string, AgentProcess>()
  private restartTimers = new Map<string, NodeJS.Timeout>()
  private configs = new Map<string, AgentConfig>()
  private manualStops = new Set<string>()
  private shuttingDown = false
  private onStatusChange: StatusCallback | null = null
  private onSessionStatusChange: SessionStatusCallback | null = null

  // Session pool: Map<agentId, Map<taskId, session>>
  private sessions = new Map<string, Map<string, AgentSessionProcess>>()

  setStatusCallback(cb: StatusCallback) {
    this.onStatusChange = cb
  }

  setSessionStatusCallback(cb: SessionStatusCallback) {
    this.onSessionStatusChange = cb
  }

  startAll(agents: AgentConfig[]) {
    console.log(`[AgentDaemon] Starting ${agents.length} agent(s)...`)

    // Stop any agents not in the new config (cleanup stale processes from HMR)
    const newIds = new Set(agents.map((a) => a.id))
    for (const [id] of this.configs) {
      if (!newIds.has(id)) {
        console.log(`[AgentDaemon] Stopping stale agent ${id}`)
        this.stopAgent(id)
        this.configs.delete(id)
        const timer = this.restartTimers.get(id)
        if (timer) {
          clearTimeout(timer)
          this.restartTimers.delete(id)
        }
      }
    }

    for (const agent of agents) {
      this.startAgent(agent)
    }

    process.on('SIGTERM', () => this.stopAll())
    process.on('SIGINT', () => this.stopAll())
  }

  startAgent(agent: AgentConfig) {
    if (this.processes.has(agent.id)) {
      console.log(`[AgentDaemon] Agent ${agent.name} already running, skipping`)
      return
    }

    this.configs.set(agent.id, agent)
    this.manualStops.delete(agent.id)

    // Mark as loading in DB
    this.onStatusChange?.(agent.id, 'loading')

    const mcpConfigPath = writeMcpConfig(agent.id, agent.dirPath)
    const cliModel = mapModelToCli(agent.model)
    const communicationRules = buildCommunicationRules(agent)

    const args = [
      '-p',
      '--verbose',
      '--output-format', 'stream-json',
      '--input-format', 'stream-json',
      '--model', cliModel,
      '--append-system-prompt', communicationRules,
      '--mcp-config', mcpConfigPath,
      '--dangerously-skip-permissions',
    ]

    console.log(`[AgentDaemon] Spawning ${agent.name} (${agent.openclawId}) with model ${cliModel} in ${agent.dirPath}`)

    const child = spawn(CLAUDE_CLI, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
      cwd: agent.dirPath,
    })

    const agentProcess: AgentProcess = {
      process: child,
      agentId: agent.id,
      name: agent.name,
      buffer: '',
      ready: false,
      pendingMessages: [],
    }

    this.processes.set(agent.id, agentProcess)

    child.stdout?.on('data', (data: Buffer) => {
      const text = data.toString()
      agentProcess.buffer += text

      const lines = agentProcess.buffer.split('\n')
      agentProcess.buffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const event = JSON.parse(line)
          this.handleAgentEvent(agent.id, event, agentProcess)
        } catch {
          // Not valid JSON, ignore
        }
      }
    })

    child.stderr?.on('data', (data: Buffer) => {
      const msg = data.toString().trim()
      if (msg) {
        console.error(`[AgentDaemon] ${agent.name} stderr: ${msg}`)
      }
    })

    child.on('error', (err) => {
      console.error(`[AgentDaemon] Failed to start ${agent.name}:`, err.message)
      this.processes.delete(agent.id)
      this.onStatusChange?.(agent.id, 'offline')
      this.scheduleRestart(agent)
    })

    child.on('exit', (code, signal) => {
      console.log(`[AgentDaemon] ${agent.name} exited (code=${code}, signal=${signal})`)
      this.processes.delete(agent.id)
      this.onStatusChange?.(agent.id, 'offline')
      if (!this.shuttingDown) {
        this.scheduleRestart(agent)
      }
    })

    // Send warmup message to kickstart the process
    // The process won't emit init or do anything until it gets a first message
    console.log(`[AgentDaemon] Sending warmup to ${agent.name}...`)
    const warmup = JSON.stringify({
      type: 'user',
      message: { role: 'user', content: '[SYSTEM] warmup' },
      parent_tool_use_id: null,
    })
    child.stdin?.write(warmup + '\n')
  }

  private handleAgentEvent(agentId: string, event: any, agentProcess: AgentProcess) {
    // Log all events for debugging
    if (event.type === 'system') {
      console.log(`[AgentDaemon] ${agentProcess.name} system event: ${event.subtype}`)
      if (event.subtype === 'init' && event.mcp_servers) {
        const mcpStatus = event.mcp_servers.map((s: any) => `${s.name}:${s.status}`).join(', ')
        console.log(`[AgentDaemon] ${agentProcess.name} MCP servers: ${mcpStatus}`)
      }
    }

    if (event.type === 'assistant') {
      // Log what the assistant is doing (tool calls, text responses)
      const content = event.message?.content
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'text') {
            console.log(`[AgentDaemon] ${agentProcess.name} text: "${block.text?.substring(0, 100)}"`)
          } else if (block.type === 'tool_use') {
            console.log(`[AgentDaemon] ${agentProcess.name} tool_use: ${block.name}(${JSON.stringify(block.input).substring(0, 100)})`)
          }
        }
      }
    }

    // Mark ready after the first successful result (warmup response)
    if (event.type === 'result') {
      console.log(`[AgentDaemon] ${agentProcess.name} result: ${event.subtype} (${event.duration_ms}ms, cost: $${event.total_cost_usd?.toFixed(4)}, result: "${event.result?.substring(0, 100)}")`)

      if (!agentProcess.ready) {
        agentProcess.ready = true
        console.log(`[AgentDaemon] ✓ ${agentProcess.name} is READY`)
        this.onStatusChange?.(agentId, 'online')

        // Flush pending messages
        for (const msg of agentProcess.pendingMessages) {
          console.log(`[AgentDaemon] Flushing queued message to ${agentProcess.name}`)
          agentProcess.process.stdin?.write(msg + '\n')
        }
        agentProcess.pendingMessages = []
      }
    }
  }

  private scheduleRestart(agent: AgentConfig) {
    if (this.shuttingDown) return
    if (this.manualStops.has(agent.id)) {
      console.log(`[AgentDaemon] ${agent.name} was manually stopped, skipping auto-restart`)
      return
    }

    const existing = this.restartTimers.get(agent.id)
    if (existing) clearTimeout(existing)

    console.log(`[AgentDaemon] Scheduling restart for ${agent.name} in 5s...`)
    const timer = setTimeout(() => {
      this.restartTimers.delete(agent.id)
      if (!this.shuttingDown && !this.manualStops.has(agent.id)) {
        this.startAgent(agent)
      }
    }, 5000)

    this.restartTimers.set(agent.id, timer)
  }

  deliverMessage(agentId: string, message: {
    channelId: string
    threadId?: string | null
    senderName: string
    content: string
  }): boolean {
    const agentProcess = this.processes.get(agentId)
    if (!agentProcess) {
      console.error(`[AgentDaemon] No running process for agent ${agentId}`)
      return false
    }

    const stdin = agentProcess.process.stdin
    if (!stdin || stdin.destroyed) {
      console.error(`[AgentDaemon] stdin not available for agent ${agentId}`)
      return false
    }

    // Format the message for the agent's context
    const contextParts = [
      `[Channel: ${message.channelId}]`,
      message.threadId ? `[Thread: ${message.threadId}]` : null,
      `${message.senderName}: ${message.content}`,
    ].filter(Boolean)

    const userMessage = contextParts.join(' ')

    const jsonMessage = JSON.stringify({
      type: 'user',
      message: { role: 'user', content: userMessage },
      parent_tool_use_id: null,
    })

    if (!agentProcess.ready) {
      console.log(`[AgentDaemon] ${agentProcess.name} not ready yet, queueing message`)
      agentProcess.pendingMessages.push(jsonMessage)
    } else {
      console.log(`[AgentDaemon] Delivering message to ${agentProcess.name}`)
      stdin.write(jsonMessage + '\n')
    }

    return true
  }

  isReady(agentId: string): boolean {
    const proc = this.processes.get(agentId)
    return proc?.ready ?? false
  }

  getAgentStatuses(): Array<{ agentId: string; name: string; ready: boolean; running: boolean }> {
    const statuses: Array<{ agentId: string; name: string; ready: boolean; running: boolean }> = []
    for (const [agentId, config] of this.configs) {
      const proc = this.processes.get(agentId)
      statuses.push({
        agentId,
        name: config.name,
        ready: proc?.ready ?? false,
        running: !!proc,
      })
    }
    return statuses
  }

  stopAgent(agentId: string) {
    const agentProcess = this.processes.get(agentId)
    if (!agentProcess) return

    console.log(`[AgentDaemon] Stopping ${agentProcess.name}...`)
    agentProcess.process.kill('SIGTERM')

    setTimeout(() => {
      if (agentProcess.process.exitCode === null) {
        agentProcess.process.kill('SIGKILL')
      }
    }, 5000)

    this.processes.delete(agentId)
  }

  /**
   * Manually stop an agent — prevents auto-restart.
   */
  stopAgentManual(agentId: string) {
    this.manualStops.add(agentId)
    const timer = this.restartTimers.get(agentId)
    if (timer) {
      clearTimeout(timer)
      this.restartTimers.delete(agentId)
    }
    this.stopAgent(agentId)
    this.onStatusChange?.(agentId, 'offline')
  }

  /**
   * Update the cached config for an agent (e.g. after model change).
   */
  updateConfig(agentId: string, updates: Partial<AgentConfig>) {
    const config = this.configs.get(agentId)
    if (config) {
      this.configs.set(agentId, { ...config, ...updates })
    }
  }

  /**
   * Restart an agent — stops the current process and starts a new one.
   */
  restartAgent(agentId: string) {
    const config = this.configs.get(agentId)
    if (!config) {
      console.error(`[AgentDaemon] No config for agent ${agentId}, cannot restart`)
      return
    }
    this.manualStops.delete(agentId)
    this.stopAgent(agentId)
    // Small delay to let the process exit cleanly
    setTimeout(() => {
      this.startAgent(config)
    }, 1000)
  }

  /**
   * Start a previously stopped agent (clears manual stop flag).
   */
  startAgentManual(agentId: string) {
    const config = this.configs.get(agentId)
    if (!config) {
      console.error(`[AgentDaemon] No config for agent ${agentId}, cannot start`)
      return
    }
    this.manualStops.delete(agentId)
    this.startAgent(config)
  }

  // ── Session Pool Methods ───────────────────────────────────────────

  startSession(agentConfig: AgentConfig, sessionConfig: SessionConfig) {
    const { agentId, taskId, worktreePath } = sessionConfig

    // Ensure agent map exists
    if (!this.sessions.has(agentId)) {
      this.sessions.set(agentId, new Map())
    }
    const agentSessions = this.sessions.get(agentId)!

    if (agentSessions.has(taskId)) {
      console.log(`[AgentDaemon] Session for agent ${agentConfig.name} task ${taskId} already running`)
      return
    }

    const mcpConfigPath = path.join(worktreePath, 'mcp.json')
    const cliModel = mapModelToCli(agentConfig.model)
    const sessionRules = buildSessionRules(agentConfig, sessionConfig)

    const args = [
      '-p',
      '--verbose',
      '--output-format', 'stream-json',
      '--input-format', 'stream-json',
      '--model', cliModel,
      '--append-system-prompt', sessionRules,
      '--mcp-config', mcpConfigPath,
      '--dangerously-skip-permissions',
    ]

    console.log(`[AgentDaemon] Spawning session for ${agentConfig.name} on task #${sessionConfig.taskNumber} in ${worktreePath}`)

    const child = spawn(CLAUDE_CLI, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
      cwd: worktreePath,
    })

    const session: AgentSessionProcess = {
      config: sessionConfig,
      process: child,
      buffer: '',
      ready: false,
      pendingMessages: [],
    }

    agentSessions.set(taskId, session)

    child.stdout?.on('data', (data: Buffer) => {
      const text = data.toString()
      session.buffer += text

      const lines = session.buffer.split('\n')
      session.buffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const event = JSON.parse(line)
          this.handleSessionEvent(agentId, taskId, event, session)
        } catch {
          // Not valid JSON, ignore
        }
      }
    })

    child.stderr?.on('data', (data: Buffer) => {
      const msg = data.toString().trim()
      if (msg) {
        console.error(`[AgentDaemon] Session ${agentConfig.name}/${taskId} stderr: ${msg}`)
      }
    })

    child.on('error', (err) => {
      console.error(`[AgentDaemon] Session ${agentConfig.name}/${taskId} failed:`, err.message)
      agentSessions.delete(taskId)
      this.onSessionStatusChange?.(agentId, taskId, 'terminated')
    })

    child.on('exit', (code, signal) => {
      console.log(`[AgentDaemon] Session ${agentConfig.name}/${taskId} exited (code=${code}, signal=${signal})`)
      agentSessions.delete(taskId)
      // No auto-restart for sessions — notify instead
      if (!this.shuttingDown) {
        this.onSessionStatusChange?.(agentId, taskId, 'terminated')
      }
    })

    // Send warmup
    console.log(`[AgentDaemon] Sending warmup to session ${agentConfig.name}/${taskId}...`)
    const warmup = JSON.stringify({
      type: 'user',
      message: { role: 'user', content: '[SYSTEM] warmup' },
      parent_tool_use_id: null,
    })
    child.stdin?.write(warmup + '\n')
  }

  private handleSessionEvent(agentId: string, taskId: string, event: any, session: AgentSessionProcess) {
    const label = `${session.config.taskNumber}`

    if (event.type === 'system') {
      console.log(`[AgentDaemon] Session task#${label} system: ${event.subtype}`)
    }

    if (event.type === 'assistant') {
      const content = event.message?.content
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'text') {
            console.log(`[AgentDaemon] Session task#${label} text: "${block.text?.substring(0, 100)}"`)
          } else if (block.type === 'tool_use') {
            console.log(`[AgentDaemon] Session task#${label} tool_use: ${block.name}(${JSON.stringify(block.input).substring(0, 100)})`)
          }
        }
      }
    }

    if (event.type === 'result') {
      console.log(`[AgentDaemon] Session task#${label} result: ${event.subtype} (${event.duration_ms}ms, cost: $${event.total_cost_usd?.toFixed(4)})`)

      if (!session.ready) {
        session.ready = true
        console.log(`[AgentDaemon] ✓ Session task#${label} is READY`)
        this.onSessionStatusChange?.(agentId, taskId, 'active')

        // Flush pending messages
        for (const msg of session.pendingMessages) {
          console.log(`[AgentDaemon] Flushing queued message to session task#${label}`)
          session.process.stdin?.write(msg + '\n')
        }
        session.pendingMessages = []
      }
    }
  }

  stopSession(agentId: string, taskId: string) {
    const agentSessions = this.sessions.get(agentId)
    if (!agentSessions) return

    const session = agentSessions.get(taskId)
    if (!session) return

    console.log(`[AgentDaemon] Stopping session for task#${session.config.taskNumber}...`)
    session.process.kill('SIGTERM')

    setTimeout(() => {
      if (session.process.exitCode === null) {
        session.process.kill('SIGKILL')
      }
    }, 5000)

    agentSessions.delete(taskId)
  }

  deliverSessionMessage(agentId: string, taskId: string, message: {
    channelId: string
    threadId?: string | null
    senderName: string
    content: string
  }): boolean {
    const agentSessions = this.sessions.get(agentId)
    if (!agentSessions) return false

    const session = agentSessions.get(taskId)
    if (!session) return false

    const stdin = session.process.stdin
    if (!stdin || stdin.destroyed) return false

    const contextParts = [
      `[Channel: ${message.channelId}]`,
      message.threadId ? `[Thread: ${message.threadId}]` : null,
      `${message.senderName}: ${message.content}`,
    ].filter(Boolean)

    const jsonMessage = JSON.stringify({
      type: 'user',
      message: { role: 'user', content: contextParts.join(' ') },
      parent_tool_use_id: null,
    })

    if (!session.ready) {
      console.log(`[AgentDaemon] Session task#${session.config.taskNumber} not ready, queueing`)
      session.pendingMessages.push(jsonMessage)
    } else {
      console.log(`[AgentDaemon] Delivering to session task#${session.config.taskNumber}`)
      stdin.write(jsonMessage + '\n')
    }

    return true
  }

  getSession(agentId: string, taskId: string): AgentSessionProcess | undefined {
    return this.sessions.get(agentId)?.get(taskId)
  }

  getActiveSessionCount(agentId: string): number {
    return this.sessions.get(agentId)?.size ?? 0
  }

  isSessionReady(agentId: string, taskId: string): boolean {
    return this.getSession(agentId, taskId)?.ready ?? false
  }

  // ── Original Methods ──────────────────────────────────────────────

  stopAll() {
    if (this.shuttingDown) return
    this.shuttingDown = true

    console.log('[AgentDaemon] Shutting down all agents...')

    for (const timer of this.restartTimers.values()) {
      clearTimeout(timer)
    }
    this.restartTimers.clear()

    for (const [, agentProcess] of this.processes) {
      agentProcess.process.kill('SIGKILL')
    }
    this.processes.clear()

    // Kill all sessions
    for (const [, agentSessions] of this.sessions) {
      for (const [, session] of agentSessions) {
        session.process.kill('SIGKILL')
      }
    }
    this.sessions.clear()

    setTimeout(() => process.exit(0), 500)
  }

  isRunning(agentId: string): boolean {
    return this.processes.has(agentId)
  }

  getRunningCount(): number {
    return this.processes.size
  }
}

const globalForDaemon = globalThis as unknown as { __agentDaemon?: AgentDaemon }

export function createAgentDaemon(): AgentDaemon {
  if (globalForDaemon.__agentDaemon) {
    globalForDaemon.__agentDaemon.stopAll()
  }
  globalForDaemon.__agentDaemon = new AgentDaemon()
  return globalForDaemon.__agentDaemon
}

export function getAgentDaemon(): AgentDaemon {
  if (!globalForDaemon.__agentDaemon) {
    globalForDaemon.__agentDaemon = new AgentDaemon()
  }
  return globalForDaemon.__agentDaemon
}

export type { AgentConfig, SessionConfig }
