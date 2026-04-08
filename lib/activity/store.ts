import { db } from '@/lib/db'
import type { AgentActivityEvent } from '@/types'

/** Persist an activity event to Postgres. Fire-and-forget — errors are logged, not thrown. */
export async function saveActivityEvent(agentId: string, event: AgentActivityEvent) {
  const { type, ...rest } = event
  try {
    await db.activityEvent.create({
      data: {
        agentId,
        type,
        payload: rest as any,
      },
    })
  } catch (err) {
    console.error('[Activity] Failed to persist event:', err)
  }
}

/** Fetch recent activity events for an agent, newest last. */
export async function getActivityEvents(agentId: string, limit = 200): Promise<AgentActivityEvent[]> {
  const rows = await db.activityEvent.findMany({
    where: { agentId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })
  // Reverse so oldest is first (chronological order)
  rows.reverse()
  return rows.map((r) => ({
    type: r.type,
    ...(r.payload as Record<string, any>),
  })) as AgentActivityEvent[]
}

/** Delete activity events older than the given TTL (in hours). Returns count deleted. */
export async function purgeOldActivityEvents(ttlHours = 72): Promise<number> {
  const cutoff = new Date(Date.now() - ttlHours * 60 * 60 * 1000)
  const result = await db.activityEvent.deleteMany({
    where: { createdAt: { lt: cutoff } },
  })
  return result.count
}
