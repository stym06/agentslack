'use client'

import { useState, useEffect } from 'react'
import { Bot, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useAgentProfile } from '@/components/agents/AgentProfileContext'

interface Agent {
  id: string
  name: string
  role: string | null
  status: string
}

export function ChannelAgentsPanel({ channelId }: { channelId: string }) {
  const [allAgents, setAllAgents] = useState<Agent[]>([])
  const [assignedAgentIds, setAssignedAgentIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
  const { openAgentProfile } = useAgentProfile()

  useEffect(() => {
    setLoading(true)
    setConfirming(null)
    Promise.all([
      fetch('/api/agents').then((r) => r.ok ? r.json() : []),
      fetch(`/api/channels/${channelId}/agents`).then((r) => r.ok ? r.json() : []),
    ])
      .then(([agents, assigned]) => {
        setAllAgents(Array.isArray(agents) ? agents : [])
        setAssignedAgentIds(new Set((assigned as Agent[]).map((a) => a.id)))
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [channelId])

  const handleToggle = async (agentId: string, isCurrentlyAssigned: boolean) => {
    setUpdating(agentId)
    try {
      if (isCurrentlyAssigned) {
        const res = await fetch(`/api/channels/${channelId}/agents/${agentId}`, { method: 'DELETE' })
        if (!res.ok) throw new Error('Failed')
        setAssignedAgentIds((prev) => { const next = new Set(prev); next.delete(agentId); return next })
      } else {
        const res = await fetch(`/api/channels/${channelId}/agents`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agent_id: agentId }),
        })
        if (!res.ok) throw new Error('Failed')
        setAssignedAgentIds((prev) => new Set(prev).add(agentId))
      }
    } catch (error) {
      console.error('Error toggling agent:', error)
    } finally {
      setUpdating(null)
      setConfirming(null)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const assigned = allAgents.filter((a) => assignedAgentIds.has(a.id))
  const available = allAgents.filter((a) => !assignedAgentIds.has(a.id))

  return (
    <div className="flex flex-1 flex-col overflow-y-auto items-center">
      <div className="w-full max-w-4xl">
      {/* Assigned agents */}
      <div className="border-b px-4 py-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          In this channel {assigned.length > 0 && <span className="normal-case font-normal">({assigned.length})</span>}
        </h3>
      </div>

      {assigned.length === 0 ? (
        <div className="px-4 py-6 text-center text-sm text-muted-foreground">
          No agents in this channel yet.
        </div>
      ) : (
        <div className="divide-y">
          {assigned.map((agent) => {
            const isUpdating = updating === agent.id
            const isConfirming = confirming === agent.id
            return (
              <div key={agent.id} className="flex items-center gap-3 px-4 py-3">
                <button
                  onClick={() => openAgentProfile(agent.id)}
                  className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-primary/10 hover:bg-primary/20 transition-colors"
                >
                  <Bot className="size-4 text-primary" />
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <button onClick={() => openAgentProfile(agent.id)} className="cursor-pointer text-sm font-medium hover:underline">
                      @{agent.name}
                    </button>
                    <span className={cn(
                      'size-1.5 rounded-full',
                      agent.status === 'online' && 'bg-green-500',
                      agent.status === 'busy' && 'bg-yellow-500',
                      agent.status === 'loading' && 'bg-blue-500 animate-pulse',
                      agent.status === 'offline' && 'bg-muted-foreground',
                    )} />
                  </div>
                  {agent.role && <p className="truncate text-xs text-muted-foreground">{agent.role}</p>}
                </div>
                {isConfirming ? (
                  <div className="flex shrink-0 gap-1.5">
                    <Button size="sm" variant="destructive" onClick={() => handleToggle(agent.id, true)} disabled={isUpdating}>
                      {isUpdating ? <Loader2 className="size-3.5 animate-spin" /> : 'Yes, remove'}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>Cancel</Button>
                  </div>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => setConfirming(agent.id)} className="shrink-0">
                    Remove
                  </Button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Available agents */}
      {available.length > 0 && (
        <>
          <div className="border-b border-t px-4 py-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Available to add {<span className="normal-case font-normal">({available.length})</span>}
            </h3>
          </div>
          <div className="divide-y">
            {available.map((agent) => {
              const isUpdating = updating === agent.id
              const isConfirming = confirming === agent.id
              return (
                <div key={agent.id} className="flex items-center gap-3 px-4 py-3">
                  <button
                    onClick={() => openAgentProfile(agent.id)}
                    className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-primary/10 hover:bg-primary/20 transition-colors"
                  >
                    <Bot className="size-4 text-primary" />
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <button onClick={() => openAgentProfile(agent.id)} className="cursor-pointer text-sm font-medium hover:underline">
                        @{agent.name}
                      </button>
                      <span className={cn(
                        'size-1.5 rounded-full',
                        agent.status === 'online' && 'bg-green-500',
                        agent.status === 'busy' && 'bg-yellow-500',
                        agent.status === 'loading' && 'bg-blue-500 animate-pulse',
                        agent.status === 'offline' && 'bg-muted-foreground',
                      )} />
                    </div>
                    {agent.role && <p className="truncate text-xs text-muted-foreground">{agent.role}</p>}
                  </div>
                  {isConfirming ? (
                    <div className="flex shrink-0 gap-1.5">
                      <Button size="sm" onClick={() => handleToggle(agent.id, false)} disabled={isUpdating}>
                        {isUpdating ? <Loader2 className="size-3.5 animate-spin" /> : 'Yes, add'}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>Cancel</Button>
                    </div>
                  ) : (
                    <Button size="sm" onClick={() => setConfirming(agent.id)} className="shrink-0">
                      Add
                    </Button>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}

      {allAgents.length === 0 && (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          No agents in workspace. Create one from the sidebar.
        </div>
      )}
      </div>
    </div>
  )
}
