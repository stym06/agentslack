import { describe, it, expect, vi } from 'vitest'

vi.mock('next-auth/middleware', () => ({
  withAuth: vi.fn().mockReturnValue('mocked-middleware'),
}))

describe('middleware', () => {
  it('exports config with correct matcher patterns', async () => {
    const { config } = await import('@/middleware')

    expect(config).toBeDefined()
    expect(config.matcher).toEqual([
      '/dashboard/:path*',
      '/api/messages/:path*',
      '/api/agents/:path*',
      '/api/channels/:path*',
    ])
  })

  it('exports default middleware', async () => {
    const mod = await import('@/middleware')
    expect(mod.default).toBeDefined()
  })
})
