import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import path from 'path'
import fs from 'fs'
import os from 'os'

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentslack-daemon-test-'))
  vi.spyOn(process, 'cwd').mockReturnValue(tmpDir)
})

afterEach(() => {
  vi.restoreAllMocks()
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

// We need to test the private functions that are used internally.
// Since they're not exported, we'll test through the module's behavior.
// For mapModelToCli and writeMcpConfig, we test indirectly.

// Test the exported functions
describe('AgentDaemon exports', () => {
  it('createAgentDaemon returns a daemon instance', async () => {
    vi.resetModules()

    // Mock the listAgentSkills dependency
    vi.doMock('@/lib/agents/directory', () => ({
      listAgentSkills: () => [],
    }))

    const { createAgentDaemon } = await import('@/server/agent-daemon')
    const daemon = createAgentDaemon()

    expect(daemon).toBeDefined()
    expect(daemon.getRunningCount()).toBe(0)
    expect(daemon.getAgentStatuses()).toEqual([])
  })

  it('getAgentDaemon returns singleton', async () => {
    vi.resetModules()

    vi.doMock('@/lib/agents/directory', () => ({
      listAgentSkills: () => [],
    }))

    const { getAgentDaemon } = await import('@/server/agent-daemon')
    const d1 = getAgentDaemon()
    const d2 = getAgentDaemon()
    expect(d1).toBe(d2)
  })

  it('isRunning returns false for unknown agent', async () => {
    vi.resetModules()

    vi.doMock('@/lib/agents/directory', () => ({
      listAgentSkills: () => [],
    }))

    const { getAgentDaemon } = await import('@/server/agent-daemon')
    const daemon = getAgentDaemon()
    expect(daemon.isRunning('nonexistent')).toBe(false)
  })

  it('isReady returns false for unknown agent', async () => {
    vi.resetModules()

    vi.doMock('@/lib/agents/directory', () => ({
      listAgentSkills: () => [],
    }))

    const { getAgentDaemon } = await import('@/server/agent-daemon')
    const daemon = getAgentDaemon()
    expect(daemon.isReady('nonexistent')).toBe(false)
  })

  it('deliverMessage returns false for unknown agent', async () => {
    vi.resetModules()

    vi.doMock('@/lib/agents/directory', () => ({
      listAgentSkills: () => [],
    }))

    const { getAgentDaemon } = await import('@/server/agent-daemon')
    const daemon = getAgentDaemon()
    const result = daemon.deliverMessage('nonexistent', {
      channelId: 'ch1',
      senderName: 'User',
      content: 'Hello',
    })
    expect(result).toBe(false)
  })

  it('getActiveSessionCount returns 0 for unknown agent', async () => {
    vi.resetModules()

    vi.doMock('@/lib/agents/directory', () => ({
      listAgentSkills: () => [],
    }))

    const { getAgentDaemon } = await import('@/server/agent-daemon')
    const daemon = getAgentDaemon()
    expect(daemon.getActiveSessionCount('nonexistent')).toBe(0)
  })

  it('isSessionReady returns false for unknown session', async () => {
    vi.resetModules()

    vi.doMock('@/lib/agents/directory', () => ({
      listAgentSkills: () => [],
    }))

    const { getAgentDaemon } = await import('@/server/agent-daemon')
    const daemon = getAgentDaemon()
    expect(daemon.isSessionReady('agent1', 'task1')).toBe(false)
  })

  it('getSession returns undefined for unknown session', async () => {
    vi.resetModules()

    vi.doMock('@/lib/agents/directory', () => ({
      listAgentSkills: () => [],
    }))

    const { getAgentDaemon } = await import('@/server/agent-daemon')
    const daemon = getAgentDaemon()
    expect(daemon.getSession('agent1', 'task1')).toBeUndefined()
  })

  it('stopAgent does nothing for unknown agent', async () => {
    vi.resetModules()

    vi.doMock('@/lib/agents/directory', () => ({
      listAgentSkills: () => [],
    }))

    const { createAgentDaemon } = await import('@/server/agent-daemon')
    const daemon = createAgentDaemon()
    // Should not throw
    expect(() => daemon.stopAgent('nonexistent')).not.toThrow()
  })

  it('stopAgentManual prevents auto-restart', async () => {
    vi.resetModules()

    vi.doMock('@/lib/agents/directory', () => ({
      listAgentSkills: () => [],
    }))

    const { createAgentDaemon } = await import('@/server/agent-daemon')
    const daemon = createAgentDaemon()

    const statusChanges: Array<{ id: string; status: string }> = []
    daemon.setStatusCallback((id, status) => statusChanges.push({ id, status }))

    daemon.stopAgentManual('agent1')
    expect(statusChanges).toEqual([{ id: 'agent1', status: 'offline' }])
  })

  it('deliverSessionMessage returns false for unknown agent', async () => {
    vi.resetModules()

    vi.doMock('@/lib/agents/directory', () => ({
      listAgentSkills: () => [],
    }))

    const { createAgentDaemon } = await import('@/server/agent-daemon')
    const daemon = createAgentDaemon()
    const result = daemon.deliverSessionMessage('agent1', 'task1', {
      channelId: 'ch1',
      senderName: 'User',
      content: 'Hello',
    })
    expect(result).toBe(false)
  })

  it('stopSession does nothing for unknown session', async () => {
    vi.resetModules()

    vi.doMock('@/lib/agents/directory', () => ({
      listAgentSkills: () => [],
    }))

    const { createAgentDaemon } = await import('@/server/agent-daemon')
    const daemon = createAgentDaemon()
    expect(() => daemon.stopSession('agent1', 'task1')).not.toThrow()
  })
})
