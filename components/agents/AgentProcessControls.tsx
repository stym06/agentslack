'use client'

import { useState } from 'react'
import { Play, Square, RotateCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function AgentProcessControls({
  agentId,
  status,
}: {
  agentId: string
  status: string
}) {
  const [loading, setLoading] = useState(false)

  const action = async (endpoint: string) => {
    setLoading(true)
    try {
      await fetch(`/api/agents/${agentId}/${endpoint}`, { method: 'POST' })
    } catch (err) {
      console.error(`Failed to ${endpoint} agent:`, err)
    } finally {
      setLoading(false)
    }
  }

  const isOnline = status === 'online' || status === 'busy'
  const isOffline = status === 'offline'
  const isLoading = status === 'loading'

  return (
    <div className="flex gap-2">
      {isOffline && (
        <Button
          size="sm"
          onClick={() => action('start')}
          disabled={loading}
          className="flex-1 gap-1.5"
        >
          <Play className="size-3.5" />
          Start
        </Button>
      )}
      {(isOnline || isLoading) && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => action('restart')}
          disabled={loading}
          className="flex-1 gap-1.5"
        >
          <RotateCw className="size-3.5" />
          Restart
        </Button>
      )}
      {(isOnline || isLoading) && (
        <Button
          size="sm"
          variant="destructive"
          onClick={() => action('stop')}
          disabled={loading}
          className="flex-1 gap-1.5"
        >
          <Square className="size-3.5" />
          Stop
        </Button>
      )}
    </div>
  )
}
