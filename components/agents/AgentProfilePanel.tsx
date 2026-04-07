'use client'

import { useEffect, useState } from 'react'
import { X, Bot, Clock, Cpu, Hash, Sparkles, CircleDot } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { useSocket } from '@/lib/socket/useSocket'
import { cn } from '@/lib/utils'
import type { Agent } from '@/types'

type AgentProfile = {
  id: string
  name: string
  role: string | null
  avatar_url: string | null
  model: string
  status: Agent['status']
  // Prisma returns camelCase, but we accept both forms
  createdAt?: string
  created_at?: string
  soulMd?: string | null
  soul_md?: string | null
  process: {
    running: boolean
    ready: boolean
  }
  channelAgents: Array<{
    channel: { id: string; name: string }
  }>
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; color: string; dot: string }> = {
    online: { label: 'Online', color: 'bg-green-500/10 text-green-700', dot: 'bg-green-500' },
    busy: { label: 'Busy', color: 'bg-yellow-500/10 text-yellow-700', dot: 'bg-yellow-500' },
    loading: { label: 'Starting', color: 'bg-blue-500/10 text-blue-700', dot: 'bg-blue-500 animate-pulse' },
    offline: { label: 'Offline', color: 'bg-gray-500/10 text-gray-500', dot: 'bg-gray-400' },
  }
  const c = config[status] || config.offline

  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium', c.color)}>
      <span className={cn('size-1.5 rounded-full', c.dot)} />
      {c.label}
    </span>
  )
}

function formatDate(date: string | Date) {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatModel(model: string) {
  const names: Record<string, string> = {
    'anthropic/claude-sonnet-4-5': 'Claude Sonnet 4.5',
    'anthropic/claude-sonnet-4-6': 'Claude Sonnet 4.6',
    'anthropic/claude-opus-4': 'Claude Opus 4',
    'anthropic/claude-opus-4-6': 'Claude Opus 4.6',
    'anthropic/claude-haiku-4-5': 'Claude Haiku 4.5',
    'anthropic/claude-haiku-3-5': 'Claude Haiku 3.5',
  }
  return names[model] || model
}

export function AgentProfilePanel({
  agentId,
  onClose,
}: {
  agentId: string
  onClose: () => void
}) {
  const [agent, setAgent] = useState<AgentProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const { socket } = useSocket()

  useEffect(() => {
    setLoading(true)
    fetch(`/api/agents/${agentId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        setAgent(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [agentId])

  // Listen for real-time status updates
  useEffect(() => {
    if (!socket || !agent) return
    const handleStatus = (data: { agent_id: string; status: string }) => {
      if (data.agent_id === agentId) {
        setAgent((prev) => prev ? { ...prev, status: data.status as Agent['status'] } : prev)
      }
    }
    socket.on('agent:status', handleStatus)
    return () => { socket.off('agent:status', handleStatus) }
  }, [socket, agent, agentId])

  return (
    <div className="flex h-full flex-col bg-white">
      {/* Header */}
      <div className="flex h-[49px] items-center justify-between border-b px-4">
        <h2 className="text-sm font-bold">Profile</h2>
        <Button variant="ghost" size="iconSm" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="size-6 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />
        </div>
      ) : !agent ? (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          Agent not found
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {/* Agent identity */}
          <div className="flex flex-col items-center px-6 py-6">
            <div className="flex size-[72px] items-center justify-center rounded-lg bg-[#5E2C5F]/10">
              <Bot className="size-8 text-[#5E2C5F]" />
            </div>
            <h3 className="mt-3 text-lg font-bold">{agent.name}</h3>
            {agent.role && (
              <p className="mt-0.5 text-sm text-muted-foreground">{agent.role}</p>
            )}
            <div className="mt-2">
              <StatusBadge status={agent.status} />
            </div>
          </div>

          <Separator />

          {/* Details */}
          <div className="space-y-4 px-6 py-4">
            {/* Process info */}
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Process
              </h4>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <CircleDot className="size-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Process:</span>
                  <span className={cn(
                    'font-medium',
                    agent.process.running ? 'text-green-600' : 'text-gray-400',
                  )}>
                    {agent.process.running ? 'Running' : 'Stopped'}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Sparkles className="size-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Ready:</span>
                  <span className={cn(
                    'font-medium',
                    agent.process.ready ? 'text-green-600' : 'text-yellow-600',
                  )}>
                    {agent.process.ready ? 'Yes' : 'No'}
                  </span>
                </div>
              </div>
            </div>

            <Separator />

            {/* Model */}
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Model
              </h4>
              <div className="flex items-center gap-2 text-sm">
                <Cpu className="size-4 text-muted-foreground" />
                <span>{formatModel(agent.model)}</span>
              </div>
            </div>

            <Separator />

            {/* Channels */}
            {agent.channelAgents.length > 0 && (
              <>
                <div>
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Channels
                  </h4>
                  <div className="space-y-1">
                    {agent.channelAgents.map((ca) => (
                      <div key={ca.channel.id} className="flex items-center gap-2 text-sm">
                        <Hash className="size-3.5 text-muted-foreground" />
                        <span>{ca.channel.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <Separator />
              </>
            )}

            {/* Created */}
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Created
              </h4>
              <div className="flex items-center gap-2 text-sm">
                <Clock className="size-4 text-muted-foreground" />
                <span>{formatDate(agent.createdAt || agent.created_at || '')}</span>
              </div>
            </div>

            {/* Instructions */}
            {(agent.soulMd || agent.soul_md) && (
              <>
                <Separator />
                <div>
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Instructions
                  </h4>
                  <p className="whitespace-pre-wrap text-sm text-muted-foreground leading-relaxed">
                    {agent.soulMd || agent.soul_md}
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
