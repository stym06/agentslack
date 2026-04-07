import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockDb, mockProvisionUserWorkspace } = vi.hoisted(() => ({
  mockDb: {
    user: { findUnique: vi.fn(), create: vi.fn() },
  },
  mockProvisionUserWorkspace: vi.fn(),
}))

vi.mock('@/lib/db', () => ({ db: mockDb }))
vi.mock('@/lib/auth/provision', () => ({
  provisionUserWorkspace: mockProvisionUserWorkspace,
}))

import { authOptions } from '@/lib/auth/config'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('CredentialsProvider authorize', () => {
  const credProvider = authOptions.providers[0] as any
  const authorize = credProvider.options.authorize

  it('returns null when no email provided', async () => {
    const result = await authorize({})
    expect(result).toBeNull()
  })

  it('returns null when credentials is undefined', async () => {
    const result = await authorize(undefined)
    expect(result).toBeNull()
  })

  it('finds existing user and returns it', async () => {
    const existingUser = { id: 'u-1', email: 'test@example.com', name: 'Test' }
    mockDb.user.findUnique.mockResolvedValue(existingUser)

    const result = await authorize({ email: 'test@example.com', password: 'pass' })

    expect(mockDb.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'test@example.com' },
    })
    expect(mockDb.user.create).not.toHaveBeenCalled()
    expect(result).toEqual({ id: 'u-1', email: 'test@example.com', name: 'Test' })
  })

  it('creates new user on first login', async () => {
    mockDb.user.findUnique.mockResolvedValue(null)
    const newUser = { id: 'u-2', email: 'new@example.com', name: 'new' }
    mockDb.user.create.mockResolvedValue(newUser)

    const result = await authorize({ email: 'new@example.com', password: 'pass' })

    expect(mockDb.user.create).toHaveBeenCalledWith({
      data: {
        email: 'new@example.com',
        name: 'new',
      },
    })
    expect(result).toEqual({ id: 'u-2', email: 'new@example.com', name: 'new' })
  })
})

describe('callbacks', () => {
  describe('signIn', () => {
    it('calls provisionUserWorkspace when user has id', async () => {
      mockProvisionUserWorkspace.mockResolvedValue({})

      const result = await authOptions.callbacks!.signIn!({
        user: { id: 'u-1', email: 'test@test.com', name: 'Test' },
        account: null,
        profile: undefined,
        email: undefined,
        credentials: undefined,
      } as any)

      expect(mockProvisionUserWorkspace).toHaveBeenCalledWith('u-1')
      expect(result).toBe(true)
    })

    it('returns true even without user id', async () => {
      const result = await authOptions.callbacks!.signIn!({
        user: { id: '', email: 'test@test.com' },
        account: null,
        profile: undefined,
        email: undefined,
        credentials: undefined,
      } as any)

      expect(mockProvisionUserWorkspace).not.toHaveBeenCalled()
      expect(result).toBe(true)
    })
  })

  describe('jwt', () => {
    it('adds user.id to token when user is present', async () => {
      const token = { sub: 'sub-1' }
      const user = { id: 'u-1', email: 'test@test.com' }

      const result = await authOptions.callbacks!.jwt!({
        token,
        user,
        account: null,
        trigger: 'signIn',
      } as any)

      expect(result).toEqual({ sub: 'sub-1', id: 'u-1' })
    })

    it('returns token unchanged when no user', async () => {
      const token = { sub: 'sub-1', id: 'u-1' }

      const result = await authOptions.callbacks!.jwt!({
        token,
        user: undefined,
        account: null,
        trigger: 'update',
      } as any)

      expect(result).toEqual({ sub: 'sub-1', id: 'u-1' })
    })
  })

  describe('session', () => {
    it('adds token.id to session.user', async () => {
      const session = { user: { email: 'test@test.com', name: 'Test' }, expires: '2099-01-01' }
      const token = { id: 'u-1', sub: 'sub-1' }

      const result = await authOptions.callbacks!.session!({
        session,
        token,
        trigger: 'update',
      } as any)

      expect(result.user.id).toBe('u-1')
    })

    it('returns session unchanged when no session.user', async () => {
      const session = { user: undefined, expires: '2099-01-01' }
      const token = { id: 'u-1' }

      const result = await authOptions.callbacks!.session!({
        session,
        token,
        trigger: 'update',
      } as any)

      expect(result.user).toBeUndefined()
    })
  })
})
