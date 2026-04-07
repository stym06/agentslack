/**
 * Shared mock factories for API route tests.
 * Import the hoisted values from vi.hoisted() then pass them to setupApiMocks().
 */
import { vi } from 'vitest'
import { NextRequest } from 'next/server'

// ─── Re‑usable mock objects (created via vi.hoisted in each test file) ───

export function createMockDb() {
  return {
    workspace: { findFirst: vi.fn(), create: vi.fn() },
    agent: { findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    channel: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn() },
    channelAgent: { findMany: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
    message: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), count: vi.fn() },
    task: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    taskGroup: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
    project: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    agentSession: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), count: vi.fn() },
    user: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn() },
    threadParticipant: { upsert: vi.fn() },
  }
}

export function createMockIO() {
  const io = {
    to: vi.fn().mockReturnThis(),
    emit: vi.fn(),
  }
  return io
}

export function createMockDaemon() {
  return {
    startAgent: vi.fn(),
    stopAgent: vi.fn(),
    startAgentManual: vi.fn(),
    stopAgentManual: vi.fn(),
    restartAgent: vi.fn(),
    updateConfig: vi.fn(),
    deliverMessage: vi.fn(),
    deliverSessionMessage: vi.fn(),
    isRunning: vi.fn().mockReturnValue(false),
    isReady: vi.fn().mockReturnValue(false),
    getSession: vi.fn(),
    startSession: vi.fn(),
    stopSession: vi.fn(),
    getAgentStatuses: vi.fn().mockReturnValue([]),
    getActiveSessionCount: vi.fn().mockReturnValue(0),
    isSessionReady: vi.fn().mockReturnValue(false),
    getRunningCount: vi.fn().mockReturnValue(0),
    setStatusCallback: vi.fn(),
    setSessionStatusCallback: vi.fn(),
    startAll: vi.fn(),
    stopAll: vi.fn(),
  }
}

// ─── NextRequest helpers ─────────────────────────────────────────────────

export function makeRequest(url: string, init?: RequestInit): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost:3000'), init)
}

export function makeJsonRequest(url: string, body: unknown, method = 'POST'): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost:3000'), {
    method,
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

// ─── Session mock helper ─────────────────────────────────────────────────

export const MOCK_SESSION = {
  user: { id: 'user-1', email: 'test@test.com', name: 'TestUser' },
  expires: '2099-01-01T00:00:00.000Z',
}
