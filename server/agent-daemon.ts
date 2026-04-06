import { spawn, ChildProcess } from 'child_process'
import path from 'path'
import fs from 'fs'
import os from 'os'

interface AgentConfig {
  id: string
  openclawId: string
  name: string
  model: string
  soulMd: string | null
  isAdmin: boolean
}

interface AgentProcess {
  process: ChildProcess
  agentId: string
  name: string
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

function writeMcpConfig(agentId: string): string {
  const configDir = path.join(os.tmpdir(), 'agentslack-mcp')
  fs.mkdirSync(configDir, { recursive: true })

  const configPath = path.join(configDir, `${agentId}.json`)
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

function buildSystemPrompt(agent: AgentConfig): string {
  const basePrompt = agent.soulMd || (agent.isAdmin
    ? 'You are AdminBot, the workspace coordinator.'
    : `You are ${agent.name}, an AI agent.`)

  return `${basePrompt}

## Communication Rules
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
- If you can no longer work on a task, unclaim it so someone else can pick it up

If you receive a system warmup message like "[SYSTEM] warmup", respond with just "ready" (no tool call needed for warmup).`
}

// Callback for status changes
type StatusCallback = (agentId: string, status: 'loading' | 'online' | 'offline') => void

class AgentDaemon {
  private processes = new Map<string, AgentProcess>()
  private restartTimers = new Map<string, NodeJS.Timeout>()
  private configs = new Map<string, AgentConfig>()
  private shuttingDown = false
  private onStatusChange: StatusCallback | null = null

  setStatusCallback(cb: StatusCallback) {
    this.onStatusChange = cb
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

    // Mark as loading in DB
    this.onStatusChange?.(agent.id, 'loading')

    const mcpConfigPath = writeMcpConfig(agent.id)
    const cliModel = mapModelToCli(agent.model)
    const systemPrompt = buildSystemPrompt(agent)

    const args = [
      '-p',
      '--verbose',
      '--output-format', 'stream-json',
      '--input-format', 'stream-json',
      '--model', cliModel,
      '--system-prompt', systemPrompt,
      '--mcp-config', mcpConfigPath,
      '--dangerously-skip-permissions',
    ]

    console.log(`[AgentDaemon] Spawning ${agent.name} (${agent.openclawId}) with model ${cliModel}`)

    const child = spawn(CLAUDE_CLI, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
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

    const existing = this.restartTimers.get(agent.id)
    if (existing) clearTimeout(existing)

    console.log(`[AgentDaemon] Scheduling restart for ${agent.name} in 5s...`)
    const timer = setTimeout(() => {
      this.restartTimers.delete(agent.id)
      if (!this.shuttingDown) {
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

export type { AgentConfig }
