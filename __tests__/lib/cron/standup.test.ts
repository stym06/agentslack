import { describe, it, expect, vi } from 'vitest'

vi.mock('node-cron', () => ({
  default: {
    schedule: vi.fn(),
  },
}))

import cron from 'node-cron'
import { startStandupCron } from '@/lib/cron/standup'

describe('startStandupCron', () => {
  it('schedules a cron job at 9 AM daily', () => {
    startStandupCron()
    expect(cron.schedule).toHaveBeenCalledWith('0 9 * * *', expect.any(Function))
  })
})
