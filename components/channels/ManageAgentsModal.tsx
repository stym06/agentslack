'use client'

import { useState, useEffect } from 'react'
import { Bot, Loader2, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

interface Agent {
  id: string
  name: string
  role: string | null
  status: string
}

interface ManageAgentsModalProps {
  channelId: string
  onClose: () => void
}

export function ManageAgentsModal({
  channelId,
  onClose,
}: ManageAgentsModalProps) {
  const [allAgents, setAllAgents] = useState<Agent[]>([])
  const [assignedAgentIds, setAssignedAgentIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)

  useEffect(() => {
    loadData()
  }, [channelId])

  const loadData = async () => {
    try {
      const [agentsRes, assignedRes] = await Promise.all([
        fetch('/api/agents'),
        fetch(`/api/channels/${channelId}/agents`),
      ])

      if (!agentsRes.ok || !assignedRes.ok) throw new Error('Failed to fetch')

      const agents = await agentsRes.json()
      const assignedAgents = await assignedRes.json()

      setAllAgents(agents)
      setAssignedAgentIds(new Set(assignedAgents.map((a: Agent) => a.id)))
      setLoading(false)
    } catch (error) {
      console.error('Error loading agents:', error)
      setLoading(false)
    }
  }

  const handleToggle = async (agentId: string, isCurrentlyAssigned: boolean) => {
    setUpdating(agentId)
    try {
      if (isCurrentlyAssigned) {
        const res = await fetch(`/api/channels/${channelId}/agents/${agentId}`, { method: 'DELETE' })
        if (!res.ok) throw new Error('Failed to unassign agent')
        setAssignedAgentIds((prev) => { const next = new Set(prev); next.delete(agentId); return next })
      } else {
        const res = await fetch(`/api/channels/${channelId}/agents`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agent_id: agentId }),
        })
        if (!res.ok) throw new Error('Failed to assign agent')
        setAssignedAgentIds((prev) => new Set(prev).add(agentId))
      }
    } catch (error) {
      console.error('Error toggling agent assignment:', error)
    } finally {
      setUpdating(null)
    }
  }

  const assignedCount = assignedAgentIds.size

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Users className="size-5 text-muted-foreground" />
            <DialogTitle>Manage Agents</DialogTitle>
          </div>
          <DialogDescription>
            Choose which agents can participate in this channel.
            {assignedCount > 0 && (
              <span className="ml-1 font-medium text-foreground">{assignedCount} assigned</span>
            )}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : allAgents.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No agents available. Create an agent first.
          </div>
        ) : (
          <div className="max-h-[360px] overflow-y-auto -mx-2">
            {allAgents.map((agent) => {
              const isAssigned = assignedAgentIds.has(agent.id)
              const isUpdating = updating === agent.id

              return (
                <div
                  key={agent.id}
                  className="flex items-center gap-3 rounded-md px-3 py-2.5"
                >
                  {/* Agent icon */}
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10">
                    <Bot className="size-4 text-primary" />
                  </div>

                  {/* Agent info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">@{agent.name}</span>
                      {agent.status && agent.status !== 'offline' && (
                        <span className={cn(
                          'size-1.5 rounded-full',
                          agent.status === 'online' && 'bg-green-500',
                          agent.status === 'busy' && 'bg-yellow-500',
                          agent.status === 'loading' && 'bg-blue-500 animate-pulse',
                        )} />
                      )}
                    </div>
                    {agent.role && (
                      <p className="truncate text-xs text-muted-foreground">{agent.role}</p>
                    )}
                  </div>

                  {/* Action buttons */}
                  {confirming === agent.id ? (
                    <div className="flex shrink-0 gap-1.5">
                      <Button
                        size="sm"
                        variant={isAssigned ? 'destructive' : 'default'}
                        onClick={() => { setConfirming(null); handleToggle(agent.id, isAssigned) }}
                        disabled={isUpdating}
                      >
                        {isUpdating ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : isAssigned ? (
                          'Yes, remove'
                        ) : (
                          'Yes, add'
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setConfirming(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant={isAssigned ? 'outline' : 'default'}
                      onClick={() => setConfirming(agent.id)}
                      className="shrink-0"
                    >
                      {isAssigned ? 'Remove' : 'Add'}
                    </Button>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
