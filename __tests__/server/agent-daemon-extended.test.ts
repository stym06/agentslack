import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'events'
import { PassThrough } from 'stream'
import path from 'path'
import fs from 'fs'
import os from 'os'

const { mockSpawn } = vi.hoisted(() => {
  const mockSpawn = vi.fn()
  return { mockSpawn }
})

vi.mock('child_process', () => ({ spawn: mockSpawn }))

function createMockChild() {
  const child = new EventEmitter() as any
  child.stdin = new PassThrough()
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.kill = vi.fn()
  child.exitCode = null
  child.pid = 12345
  return child
}

const AGENT_CONFIG = {
  id: 'agent-1',
  openclawId: 'test-agent',
  name: 'TestAgent',
  model: 'anthropic/claude-sonnet-4-5',
  soulMd: 'You are a test agent',
  isAdmin: false,
  dirPath: '',
}

const SESSION_CONFIG = {
  sessionId: 'sess-1',
  agentId: 'agent-1',
  taskId: 'task-1',
  taskNumber: 42,
  taskTitle: 'Test task',
  projectId: 'proj-1',
  worktreePath: '',
  branchName: 'task-42-test',
  channelId: 'ch-1',
  messageId: 'msg-1',
}

let tmpDir: string

beforeEach(() => {
  vi.clearAllMocks()
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'daemon-ext-'))
  AGENT_CONFIG.dirPath = tmpDir
  SESSION_CONFIG.worktreePath = tmpDir
  // Clear the global singleton to avoid stopAll calling process.exit
  const g = globalThis as any
  delete g.__agentDaemon
})

afterEach(() => {
  vi.restoreAllMocks()
  // Clear daemon to prevent process.exit from stopAll
  const g = globalThis as any
  delete g.__agentDaemon
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('AgentDaemon startAgent', () => {
  it('spawns a child process and writes warmup to stdin', async () => {
    vi.resetModules()
    vi.doMock('child_process', () => ({ spawn: mockSpawn }))
    vi.doMock('@/lib/agents/directory', () => ({ listAgentSkills: () => [] }))
    const g = globalThis as any
    delete g.__agentDaemon

    const mockChild = createMockChild()
    // Capture stdin writes before spawn
    const writes: string[] = []
    mockChild.stdin.on('data', (data: Buffer) => writes.push(data.toString()))
    mockSpawn.mockReturnValue(mockChild)

    const { getAgentDaemon } = await import('@/server/agent-daemon')
    const daemon = getAgentDaemon()

    daemon.startAgent(AGENT_CONFIG)

    expect(mockSpawn).toHaveBeenCalled()
    expect(daemon.isRunning('agent-1')).toBe(true)
    expect(daemon.isReady('agent-1')).toBe(false)

    // Warmup should have been written
    expect(writes.length).toBeGreaterThanOrEqual(1)
    const warmupMsg = JSON.parse(writes[0].trim())
    expect(warmupMsg.type).toBe('user')
    expect(warmupMsg.message.content).toBe('[SYSTEM] warmup')
  })

  it('marks agent as ready after result event and flushes pending messages', async () => {
    vi.resetModules()
    vi.doMock('child_process', () => ({ spawn: mockSpawn }))
    vi.doMock('@/lib/agents/directory', () => ({ listAgentSkills: () => [] }))
    const g = globalThis as any
    delete g.__agentDaemon

    const mockChild = createMockChild()
    // Listen for stdin writes BEFORE spawn so we capture everything
    const writes: string[] = []
    mockChild.stdin.on('data', (data: Buffer) => writes.push(data.toString()))
    mockSpawn.mockReturnValue(mockChild)

    const { getAgentDaemon } = await import('@/server/agent-daemon')
    const daemon = getAgentDaemon()

    const statusChanges: Array<{ id: string; status: string }> = []
    daemon.setStatusCallback((id, status) => statusChanges.push({ id, status }))

    daemon.startAgent(AGENT_CONFIG)

    // writes[0] is the warmup
    const beforeCount = writes.length

    // Deliver a message before ready — it should be queued
    const delivered = daemon.deliverMessage('agent-1', {
      channelId: 'ch-1',
      senderName: 'User',
      content: 'hello before ready',
    })
    expect(delivered).toBe(true)
    // No new writes yet (message is queued, not written)
    expect(writes.length).toBe(beforeCount)

    // Simulate result event (warmup response)
    const resultEvent = JSON.stringify({
      type: 'result',
      subtype: 'success',
      duration_ms: 100,
      total_cost_usd: 0.001,
      result: 'ready',
    })
    mockChild.stdout.emit('data', Buffer.from(resultEvent + '\n'))

    expect(daemon.isReady('agent-1')).toBe(true)
    expect(statusChanges).toContainEqual({ id: 'agent-1', status: 'online' })

    // The pending message should have been flushed to stdin
    expect(writes.length).toBeGreaterThan(beforeCount)
  })

  it('does not start duplicate agent', async () => {
    vi.resetModules()
    vi.doMock('child_process', () => ({ spawn: mockSpawn }))
    vi.doMock('@/lib/agents/directory', () => ({ listAgentSkills: () => [] }))
    const g = globalThis as any
    delete g.__agentDaemon

    const mockChild = createMockChild()
    mockSpawn.mockReturnValue(mockChild)

    const { getAgentDaemon } = await import('@/server/agent-daemon')
    const daemon = getAgentDaemon()

    daemon.startAgent(AGENT_CONFIG)
    daemon.startAgent(AGENT_CONFIG) // second call should skip

    expect(mockSpawn).toHaveBeenCalledTimes(1)
  })

  it('handles agent exit and schedules restart', async () => {
    vi.resetModules()
    vi.doMock('child_process', () => ({ spawn: mockSpawn }))
    vi.doMock('@/lib/agents/directory', () => ({ listAgentSkills: () => [] }))
    vi.useFakeTimers()
    const g = globalThis as any
    delete g.__agentDaemon

    const mockChild = createMockChild()
    mockSpawn.mockReturnValue(mockChild)

    const { getAgentDaemon } = await import('@/server/agent-daemon')
    const daemon = getAgentDaemon()

    const statusChanges: Array<{ id: string; status: string }> = []
    daemon.setStatusCallback((id, status) => statusChanges.push({ id, status }))

    daemon.startAgent(AGENT_CONFIG)

    // Simulate agent exit
    mockChild.emit('exit', 1, null)

    expect(daemon.isRunning('agent-1')).toBe(false)
    expect(statusChanges).toContainEqual({ id: 'agent-1', status: 'offline' })

    // A new child for the restart
    const mockChild2 = createMockChild()
    mockSpawn.mockReturnValue(mockChild2)

    // Advance timer to trigger restart (5s)
    vi.advanceTimersByTime(5000)

    // Should have spawned again
    expect(mockSpawn).toHaveBeenCalledTimes(2)

    vi.useRealTimers()
  })

  it('handles agent error', async () => {
    vi.resetModules()
    vi.doMock('child_process', () => ({ spawn: mockSpawn }))
    vi.doMock('@/lib/agents/directory', () => ({ listAgentSkills: () => [] }))
    const g = globalThis as any
    delete g.__agentDaemon

    const mockChild = createMockChild()
    mockSpawn.mockReturnValue(mockChild)

    const { getAgentDaemon } = await import('@/server/agent-daemon')
    const daemon = getAgentDaemon()

    daemon.startAgent(AGENT_CONFIG)
    mockChild.emit('error', new Error('spawn failed'))

    expect(daemon.isRunning('agent-1')).toBe(false)
  })

  it('deliverMessage returns true and writes to stdin when ready', async () => {
    vi.resetModules()
    vi.doMock('child_process', () => ({ spawn: mockSpawn }))
    vi.doMock('@/lib/agents/directory', () => ({ listAgentSkills: () => [] }))
    const g = globalThis as any
    delete g.__agentDaemon

    const mockChild = createMockChild()
    const writes: string[] = []
    mockChild.stdin.on('data', (data: Buffer) => writes.push(data.toString()))
    mockSpawn.mockReturnValue(mockChild)

    const { getAgentDaemon } = await import('@/server/agent-daemon')
    const daemon = getAgentDaemon()

    daemon.startAgent(AGENT_CONFIG)

    // Mark ready
    const resultEvent = JSON.stringify({ type: 'result', subtype: 'success', duration_ms: 100, total_cost_usd: 0.001, result: 'ready' })
    mockChild.stdout.emit('data', Buffer.from(resultEvent + '\n'))

    const beforeCount = writes.length
    const delivered = daemon.deliverMessage('agent-1', {
      channelId: 'ch-1',
      threadId: 'thread-1',
      senderName: 'Alice',
      content: 'Hello agent',
    })

    expect(delivered).toBe(true)
    expect(writes.length).toBeGreaterThan(beforeCount)
    const parsed = JSON.parse(writes[writes.length - 1].trim())
    expect(parsed.message.content).toContain('[Channel: ch-1]')
    expect(parsed.message.content).toContain('[Thread: thread-1]')
    expect(parsed.message.content).toContain('Alice: Hello agent')
  })
})

describe('AgentDaemon skills in communication rules', () => {
  it('includes skills section when agent has skills', async () => {
    vi.resetModules()
    vi.doMock('child_process', () => ({ spawn: mockSpawn }))
    vi.doMock('@/lib/agents/directory', () => ({
      listAgentSkills: vi.fn().mockReturnValue([
        { name: 'code-review', type: 'installed', description: 'Reviews code' },
      ]),
    }))
    const g = globalThis as any
    delete g.__agentDaemon

    const mockChild = createMockChild()
    mockSpawn.mockReturnValue(mockChild)

    const { getAgentDaemon } = await import('@/server/agent-daemon')
    const daemon = getAgentDaemon()
    daemon.startAgent(AGENT_CONFIG)

    const spawnArgs = mockSpawn.mock.calls[0][1]
    const systemPromptIdx = spawnArgs.indexOf('--append-system-prompt')
    const systemPrompt = spawnArgs[systemPromptIdx + 1]
    expect(systemPrompt).toContain('Your Skills')
    expect(systemPrompt).toContain('code-review')
  })
})

describe('AgentDaemon model mapping', () => {
  it('maps opus model correctly', async () => {
    vi.resetModules()
    vi.doMock('child_process', () => ({ spawn: mockSpawn }))
    vi.doMock('@/lib/agents/directory', () => ({ listAgentSkills: () => [] }))
    const g = globalThis as any
    delete g.__agentDaemon

    const mockChild = createMockChild()
    mockSpawn.mockReturnValue(mockChild)

    const { getAgentDaemon } = await import('@/server/agent-daemon')
    const daemon = getAgentDaemon()
    daemon.startAgent({ ...AGENT_CONFIG, model: 'anthropic/claude-opus-4' })

    const spawnArgs = mockSpawn.mock.calls[0][1]
    const modelIdx = spawnArgs.indexOf('--model')
    expect(spawnArgs[modelIdx + 1]).toBe('opus')
  })

  it('defaults to sonnet for unknown model', async () => {
    vi.resetModules()
    vi.doMock('child_process', () => ({ spawn: mockSpawn }))
    vi.doMock('@/lib/agents/directory', () => ({ listAgentSkills: () => [] }))
    const g = globalThis as any
    delete g.__agentDaemon

    const mockChild = createMockChild()
    mockSpawn.mockReturnValue(mockChild)

    const { getAgentDaemon } = await import('@/server/agent-daemon')
    const daemon = getAgentDaemon()
    daemon.startAgent({ ...AGENT_CONFIG, model: 'unknown/model' })

    const spawnArgs = mockSpawn.mock.calls[0][1]
    const modelIdx = spawnArgs.indexOf('--model')
    expect(spawnArgs[modelIdx + 1]).toBe('sonnet')
  })
})

describe('AgentDaemon writeMcpConfig', () => {
  it('writes mcp.json in agent dirPath when starting', async () => {
    vi.resetModules()
    vi.doMock('child_process', () => ({ spawn: mockSpawn }))
    vi.doMock('@/lib/agents/directory', () => ({ listAgentSkills: () => [] }))
    const g = globalThis as any
    delete g.__agentDaemon

    const mockChild = createMockChild()
    mockSpawn.mockReturnValue(mockChild)

    const { getAgentDaemon } = await import('@/server/agent-daemon')
    const daemon = getAgentDaemon()
    daemon.startAgent(AGENT_CONFIG)

    const configPath = path.join(tmpDir, 'mcp.json')
    expect(fs.existsSync(configPath)).toBe(true)
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    expect(config.mcpServers.agentslack.env.AGENT_ID).toBe('agent-1')
  })
})

describe('AgentDaemon stopAgent / restartAgent / startAgentManual / updateConfig', () => {
  it('stopAgent kills the process', async () => {
    vi.resetModules()
    vi.doMock('child_process', () => ({ spawn: mockSpawn }))
    vi.doMock('@/lib/agents/directory', () => ({ listAgentSkills: () => [] }))
    const g = globalThis as any
    delete g.__agentDaemon

    const mockChild = createMockChild()
    mockSpawn.mockReturnValue(mockChild)

    const { getAgentDaemon } = await import('@/server/agent-daemon')
    const daemon = getAgentDaemon()

    daemon.startAgent(AGENT_CONFIG)
    expect(daemon.isRunning('agent-1')).toBe(true)

    daemon.stopAgent('agent-1')
    expect(daemon.isRunning('agent-1')).toBe(false)
    expect(mockChild.kill).toHaveBeenCalledWith('SIGTERM')
  })

  it('restartAgent stops and restarts agent', async () => {
    vi.resetModules()
    vi.doMock('child_process', () => ({ spawn: mockSpawn }))
    vi.doMock('@/lib/agents/directory', () => ({ listAgentSkills: () => [] }))
    vi.useFakeTimers()
    const g = globalThis as any
    delete g.__agentDaemon

    const mockChild1 = createMockChild()
    const mockChild2 = createMockChild()
    mockSpawn.mockReturnValueOnce(mockChild1).mockReturnValueOnce(mockChild2)

    const { getAgentDaemon } = await import('@/server/agent-daemon')
    const daemon = getAgentDaemon()

    daemon.startAgent(AGENT_CONFIG)
    expect(mockSpawn).toHaveBeenCalledTimes(1)

    daemon.restartAgent('agent-1')
    // After stop, process deleted; restart is on a 1s timeout
    vi.advanceTimersByTime(1000)

    expect(mockSpawn).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })

  it('restartAgent does nothing for unknown agent', async () => {
    vi.resetModules()
    vi.doMock('child_process', () => ({ spawn: mockSpawn }))
    vi.doMock('@/lib/agents/directory', () => ({ listAgentSkills: () => [] }))
    const g = globalThis as any
    delete g.__agentDaemon

    const { getAgentDaemon } = await import('@/server/agent-daemon')
    const daemon = getAgentDaemon()
    daemon.restartAgent('nonexistent') // should not throw
    expect(mockSpawn).not.toHaveBeenCalled()
  })

  it('startAgentManual starts a stopped agent', async () => {
    vi.resetModules()
    vi.doMock('child_process', () => ({ spawn: mockSpawn }))
    vi.doMock('@/lib/agents/directory', () => ({ listAgentSkills: () => [] }))
    const g = globalThis as any
    delete g.__agentDaemon

    const mockChild1 = createMockChild()
    const mockChild2 = createMockChild()
    mockSpawn.mockReturnValueOnce(mockChild1).mockReturnValueOnce(mockChild2)

    const { getAgentDaemon } = await import('@/server/agent-daemon')
    const daemon = getAgentDaemon()

    daemon.startAgent(AGENT_CONFIG)
    daemon.stopAgentManual('agent-1')
    daemon.startAgentManual('agent-1')

    expect(mockSpawn).toHaveBeenCalledTimes(2)
  })

  it('startAgentManual does nothing for unknown agent', async () => {
    vi.resetModules()
    vi.doMock('child_process', () => ({ spawn: mockSpawn }))
    vi.doMock('@/lib/agents/directory', () => ({ listAgentSkills: () => [] }))
    const g = globalThis as any
    delete g.__agentDaemon

    const { getAgentDaemon } = await import('@/server/agent-daemon')
    const daemon = getAgentDaemon()
    daemon.startAgentManual('nonexistent')
    expect(mockSpawn).not.toHaveBeenCalled()
  })

  it('updateConfig updates the cached config', async () => {
    vi.resetModules()
    vi.doMock('child_process', () => ({ spawn: mockSpawn }))
    vi.doMock('@/lib/agents/directory', () => ({ listAgentSkills: () => [] }))
    const g = globalThis as any
    delete g.__agentDaemon

    const mockChild = createMockChild()
    mockSpawn.mockReturnValue(mockChild)

    const { getAgentDaemon } = await import('@/server/agent-daemon')
    const daemon = getAgentDaemon()
    daemon.startAgent(AGENT_CONFIG)

    daemon.updateConfig('agent-1', { model: 'anthropic/claude-opus-4' })

    // Verify by checking getAgentStatuses still works
    const statuses = daemon.getAgentStatuses()
    expect(statuses).toHaveLength(1)
    expect(statuses[0].agentId).toBe('agent-1')
  })

  it('getAgentStatuses returns correct info', async () => {
    vi.resetModules()
    vi.doMock('child_process', () => ({ spawn: mockSpawn }))
    vi.doMock('@/lib/agents/directory', () => ({ listAgentSkills: () => [] }))
    const g = globalThis as any
    delete g.__agentDaemon

    const mockChild = createMockChild()
    mockSpawn.mockReturnValue(mockChild)

    const { getAgentDaemon } = await import('@/server/agent-daemon')
    const daemon = getAgentDaemon()
    daemon.startAgent(AGENT_CONFIG)

    const statuses = daemon.getAgentStatuses()
    expect(statuses).toEqual([{
      agentId: 'agent-1',
      name: 'TestAgent',
      ready: false,
      running: true,
    }])
  })

  it('stopAgentManual prevents auto-restart after exit', async () => {
    vi.resetModules()
    vi.doMock('child_process', () => ({ spawn: mockSpawn }))
    vi.doMock('@/lib/agents/directory', () => ({ listAgentSkills: () => [] }))
    vi.useFakeTimers()
    const g = globalThis as any
    delete g.__agentDaemon

    const mockChild = createMockChild()
    mockSpawn.mockReturnValue(mockChild)

    const { getAgentDaemon } = await import('@/server/agent-daemon')
    const daemon = getAgentDaemon()
    daemon.startAgent(AGENT_CONFIG)
    daemon.stopAgentManual('agent-1')

    // Even after 5s, should NOT restart
    vi.advanceTimersByTime(10000)
    expect(mockSpawn).toHaveBeenCalledTimes(1) // only the initial start

    vi.useRealTimers()
  })
})

describe('AgentDaemon startAll', () => {
  it('starts multiple agents and cleans stale ones', async () => {
    vi.resetModules()
    vi.doMock('child_process', () => ({ spawn: mockSpawn }))
    vi.doMock('@/lib/agents/directory', () => ({ listAgentSkills: () => [] }))
    const g = globalThis as any
    delete g.__agentDaemon

    const mockChild = createMockChild()
    mockSpawn.mockReturnValue(mockChild)

    const { getAgentDaemon } = await import('@/server/agent-daemon')
    const daemon = getAgentDaemon()

    const agents = [
      { ...AGENT_CONFIG, id: 'agent-1', name: 'Agent1' },
      { ...AGENT_CONFIG, id: 'agent-2', name: 'Agent2' },
    ]

    daemon.startAll(agents)
    expect(mockSpawn).toHaveBeenCalledTimes(2)
    expect(daemon.getRunningCount()).toBe(2)
  })
})

describe('AgentDaemon handleAgentEvent types', () => {
  it('handles system events with init subtype', async () => {
    vi.resetModules()
    vi.doMock('child_process', () => ({ spawn: mockSpawn }))
    vi.doMock('@/lib/agents/directory', () => ({ listAgentSkills: () => [] }))
    const g = globalThis as any
    delete g.__agentDaemon

    const mockChild = createMockChild()
    mockSpawn.mockReturnValue(mockChild)

    const { getAgentDaemon } = await import('@/server/agent-daemon')
    const daemon = getAgentDaemon()
    daemon.startAgent(AGENT_CONFIG)

    // Emit system init event
    const systemEvent = JSON.stringify({
      type: 'system',
      subtype: 'init',
      mcp_servers: [{ name: 'agentslack', status: 'connected' }],
    })
    mockChild.stdout.emit('data', Buffer.from(systemEvent + '\n'))
    // Should not throw, just logs
  })

  it('handles assistant events with text and tool_use', async () => {
    vi.resetModules()
    vi.doMock('child_process', () => ({ spawn: mockSpawn }))
    vi.doMock('@/lib/agents/directory', () => ({ listAgentSkills: () => [] }))
    const g = globalThis as any
    delete g.__agentDaemon

    const mockChild = createMockChild()
    mockSpawn.mockReturnValue(mockChild)

    const { getAgentDaemon } = await import('@/server/agent-daemon')
    const daemon = getAgentDaemon()
    daemon.startAgent(AGENT_CONFIG)

    const assistantEvent = JSON.stringify({
      type: 'assistant',
      message: {
        content: [
          { type: 'text', text: 'Hello world' },
          { type: 'tool_use', name: 'send_message', input: { channelId: 'ch-1' } },
        ],
      },
    })
    mockChild.stdout.emit('data', Buffer.from(assistantEvent + '\n'))
    // Should not throw
  })

  it('handles stderr output', async () => {
    vi.resetModules()
    vi.doMock('child_process', () => ({ spawn: mockSpawn }))
    vi.doMock('@/lib/agents/directory', () => ({ listAgentSkills: () => [] }))
    const g = globalThis as any
    delete g.__agentDaemon

    const mockChild = createMockChild()
    mockSpawn.mockReturnValue(mockChild)

    const { getAgentDaemon } = await import('@/server/agent-daemon')
    const daemon = getAgentDaemon()
    daemon.startAgent(AGENT_CONFIG)

    // Emit stderr data
    mockChild.stderr.emit('data', Buffer.from('some error\n'))
    // Should not throw
  })
})

describe('AgentDaemon stopSession', () => {
  it('stops a running session', async () => {
    vi.resetModules()
    vi.doMock('child_process', () => ({ spawn: mockSpawn }))
    vi.doMock('@/lib/agents/directory', () => ({ listAgentSkills: () => [] }))
    const g = globalThis as any
    delete g.__agentDaemon

    const mockChild = createMockChild()
    mockSpawn.mockReturnValue(mockChild)

    const { getAgentDaemon } = await import('@/server/agent-daemon')
    const daemon = getAgentDaemon()
    fs.writeFileSync(path.join(tmpDir, 'mcp.json'), '{}')

    daemon.startSession(AGENT_CONFIG, SESSION_CONFIG)
    expect(daemon.getActiveSessionCount('agent-1')).toBe(1)

    daemon.stopSession('agent-1', 'task-1')
    expect(daemon.getActiveSessionCount('agent-1')).toBe(0)
    expect(mockChild.kill).toHaveBeenCalledWith('SIGTERM')
  })
})

describe('AgentDaemon sessions', () => {
  it('startSession spawns a new process', async () => {
    vi.resetModules()
    vi.doMock('child_process', () => ({ spawn: mockSpawn }))
    vi.doMock('@/lib/agents/directory', () => ({ listAgentSkills: () => [] }))
    const g = globalThis as any
    delete g.__agentDaemon

    const mockChild = createMockChild()
    mockSpawn.mockReturnValue(mockChild)

    const { getAgentDaemon } = await import('@/server/agent-daemon')
    const daemon = getAgentDaemon()

    // Write mcp.json that startSession expects
    fs.writeFileSync(path.join(tmpDir, 'mcp.json'), '{}')

    daemon.startSession(AGENT_CONFIG, SESSION_CONFIG)

    expect(mockSpawn).toHaveBeenCalled()
    expect(daemon.getActiveSessionCount('agent-1')).toBe(1)
  })

  it('deliverSessionMessage queues when not ready then flushes on result', async () => {
    vi.resetModules()
    vi.doMock('child_process', () => ({ spawn: mockSpawn }))
    vi.doMock('@/lib/agents/directory', () => ({ listAgentSkills: () => [] }))
    const g = globalThis as any
    delete g.__agentDaemon

    const mockChild = createMockChild()
    const writes: string[] = []
    mockChild.stdin.on('data', (data: Buffer) => writes.push(data.toString()))
    mockSpawn.mockReturnValue(mockChild)

    const { getAgentDaemon } = await import('@/server/agent-daemon')
    const daemon = getAgentDaemon()
    fs.writeFileSync(path.join(tmpDir, 'mcp.json'), '{}')

    daemon.startSession(AGENT_CONFIG, SESSION_CONFIG)

    // Deliver before ready
    const delivered = daemon.deliverSessionMessage('agent-1', 'task-1', {
      channelId: 'ch-1',
      threadId: 'msg-1',
      senderName: 'User',
      content: 'work on this',
    })
    expect(delivered).toBe(true)
    expect(daemon.isSessionReady('agent-1', 'task-1')).toBe(false)

    const beforeCount = writes.length

    // Simulate result event to mark ready
    const resultEvent = JSON.stringify({ type: 'result', subtype: 'success', duration_ms: 50, total_cost_usd: 0.001 })
    mockChild.stdout.emit('data', Buffer.from(resultEvent + '\n'))

    expect(daemon.isSessionReady('agent-1', 'task-1')).toBe(true)
    // Pending message should have been flushed
    expect(writes.length).toBeGreaterThan(beforeCount)
  })

  it('session exit triggers session status callback', async () => {
    vi.resetModules()
    vi.doMock('child_process', () => ({ spawn: mockSpawn }))
    vi.doMock('@/lib/agents/directory', () => ({ listAgentSkills: () => [] }))
    const g = globalThis as any
    delete g.__agentDaemon

    const mockChild = createMockChild()
    mockSpawn.mockReturnValue(mockChild)

    const { getAgentDaemon } = await import('@/server/agent-daemon')
    const daemon = getAgentDaemon()
    fs.writeFileSync(path.join(tmpDir, 'mcp.json'), '{}')

    const sessionStatusChanges: Array<{ agentId: string; taskId: string; status: string }> = []
    daemon.setSessionStatusCallback((agentId, taskId, status) =>
      sessionStatusChanges.push({ agentId, taskId, status })
    )

    daemon.startSession(AGENT_CONFIG, SESSION_CONFIG)

    mockChild.emit('exit', 0, null)

    expect(sessionStatusChanges).toContainEqual({
      agentId: 'agent-1',
      taskId: 'task-1',
      status: 'terminated',
    })
  })
})
