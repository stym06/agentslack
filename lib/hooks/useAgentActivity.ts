'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSocket } from '@/lib/socket/useSocket'
import type { AgentActivityEvent } from '@/types'

const MAX_EVENTS = 200

export function useAgentActivity(agentId: string) {
  const { socket, isConnected } = useSocket()
  const [events, setEvents] = useState<AgentActivityEvent[]>([])

  useEffect(() => {
    if (!isConnected) return
    socket.emit('agent:join', agentId)

    const handler = (data: { agent_id: string; event: AgentActivityEvent }) => {
      if (data.agent_id !== agentId) return
      setEvents((prev) => {
        const next = [...prev, data.event]
        return next.length > MAX_EVENTS ? next.slice(-MAX_EVENTS) : next
      })
    }

    socket.on('agent:activity', handler as any)
    return () => {
      socket.off('agent:activity', handler as any)
      socket.emit('agent:leave', agentId)
    }
  }, [isConnected, socket, agentId])

  const clearEvents = useCallback(() => setEvents([]), [])

  return { events, clearEvents }
}
