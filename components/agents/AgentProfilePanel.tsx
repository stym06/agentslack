'use client'

import { useEffect, useState } from 'react'
import { X, Bot, Clock, Cpu, Hash, CircleDot, Sparkles, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { useSocket } from '@/lib/socket/useSocket'
import { cn } from '@/lib/utils'
import type { Agent } from '@/types'
import { AgentProcessControls } from './AgentProcessControls'
import { AgentInstructionsEditor } from './AgentInstructionsEditor'
import { AgentSkillsPanel } from './AgentSkillsPanel'
import { AgentMemoryPanel } from './AgentMemoryPanel'
import { AgentActivityStream } from './AgentActivityStream'

type AgentProfile = {
  id: string
  name: string
  role: string | null
  avatar_url: string | null
  model: string
  status: Agent['status']
  createdAt?: string
  created_at?: string
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
    online: { label: 'Online', color: 'bg-green-500/15 text-green-400', dot: 'bg-green-500' },
    busy: { label: 'Busy', color: 'bg-yellow-500/15 text-yellow-400', dot: 'bg-yellow-500' },
    loading: { label: 'Starting', color: 'bg-blue-500/15 text-blue-400', dot: 'bg-blue-500 animate-pulse' },
    offline: { label: 'Offline', color: 'bg-muted text-muted-foreground', dot: 'bg-muted-foreground' },
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

const MODEL_OPTIONS = [
  { value: 'anthropic/claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
  { value: 'anthropic/claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
  { value: 'anthropic/claude-opus-4-6', label: 'Claude Opus 4.6' },
  { value: 'anthropic/claude-opus-4', label: 'Claude Opus 4' },
  { value: 'anthropic/claude-haiku-4-5', label: 'Claude Haiku 4.5' },
  { value: 'anthropic/claude-haiku-3-5', label: 'Claude Haiku 3.5' },
]

function formatModel(model: string) {
  return MODEL_OPTIONS.find((m) => m.value === model)?.label || model
}

function ModelDropdown({
  agentId,
  currentModel,
  onModelChanged,
}: {
  agentId: string
  currentModel: string
  onModelChanged: (model: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [pendingModel, setPendingModel] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const handleSelect = (model: string) => {
    setOpen(false)
    if (model === currentModel) return
    setPendingModel(model)
  }

  const handleConfirm = async () => {
    if (!pendingModel) return
    setSaving(true)
    try {
      const res = await fetch(`/api/agents/${agentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: pendingModel }),
      })
      if (!res.ok) throw new Error('Failed to update model')

      await fetch(`/api/agents/${agentId}/restart`, { method: 'POST' })
      onModelChanged(pendingModel)
    } catch (err) {
      console.error('Failed to change model:', err)
    } finally {
      setSaving(false)
      setPendingModel(null)
    }
  }

  return (
    <>
      <div className="relative">
        <button
          onClick={() => setOpen(!open)}
          disabled={saving}
          className="cursor-pointer inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-sm font-medium hover:bg-accent transition-colors disabled:opacity-50"
        >
          {saving ? 'Restarting...' : formatModel(currentModel)}
          <ChevronDown className="size-3 text-muted-foreground" />
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <div className="absolute left-0 top-full z-50 mt-1 w-48 overflow-hidden rounded-md border bg-popover shadow-lg">
              {MODEL_OPTIONS.map((m) => (
                <button
                  key={m.value}
                  onClick={() => handleSelect(m.value)}
                  className={cn(
                    'flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-accent',
                    currentModel === m.value && 'bg-accent font-medium',
                  )}
                >
                  {currentModel === m.value && (
                    <span className="size-1.5 rounded-full bg-primary" />
                  )}
                  <span className={currentModel === m.value ? '' : 'ml-[14px]'}>{m.label}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <Dialog open={!!pendingModel} onOpenChange={(isOpen) => { if (!isOpen) setPendingModel(null) }}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Change model</DialogTitle>
            <DialogDescription>
              Switch to <span className="font-medium text-foreground">{pendingModel ? formatModel(pendingModel) : ''}</span>? The agent will be restarted with the new model.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingModel(null)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleConfirm} disabled={saving}>
              {saving ? 'Restarting...' : 'Confirm & Restart'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function CollapsibleSection({
  title,
  defaultOpen = false,
  children,
}: {
  title: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full cursor-pointer items-center gap-1.5 py-1"
      >
        <ChevronDown className={cn('size-3.5 text-muted-foreground transition-transform', !open && '-rotate-90')} />
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </h4>
      </button>
      {open && <div className="mt-2">{children}</div>}
    </div>
  )
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
  const [activeTab, setActiveTab] = useState<'profile' | 'activity'>('profile')
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
    <div className="flex h-full flex-col bg-card">
      {/* Header with tabs */}
      <div className="flex h-[49px] items-center border-b px-4">
        <div className="flex gap-3">
          {(['profile', 'activity'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                'cursor-pointer text-sm font-medium capitalize transition-colors',
                activeTab === tab ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {tab}
            </button>
          ))}
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose} className="ml-auto">
          <X className="size-4" />
        </Button>
      </div>

      {activeTab === 'activity' ? (
        <AgentActivityStream agentId={agentId} />
      ) : loading ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="size-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
        </div>
      ) : !agent ? (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          Agent not found
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {/* Agent identity */}
          <div className="flex flex-col items-center px-6 pt-6 pb-4">
            <div className="flex size-[72px] items-center justify-center rounded-lg bg-primary/10">
              <Bot className="size-8 text-primary" />
            </div>
            <h3 className="mt-3 text-lg font-bold">{agent.name}</h3>
            {agent.role && (
              <p className="mt-0.5 text-sm text-muted-foreground">{agent.role}</p>
            )}
            <div className="mt-2">
              <StatusBadge status={agent.status} />
            </div>
          </div>

          {/* Process controls */}
          <div className="px-6 pb-4">
            <AgentProcessControls agentId={agentId} status={agent.status} />
          </div>

          <Separator />

          {/* Collapsible sections */}
          <div className="space-y-1 px-6 py-4">
            {/* Process info */}
            <CollapsibleSection title="Process" defaultOpen>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <CircleDot className="size-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Process:</span>
                  <span className={cn(
                    'font-medium',
                    agent.process.running ? 'text-green-400' : 'text-muted-foreground',
                  )}>
                    {agent.process.running ? 'Running' : 'Stopped'}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Sparkles className="size-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Ready:</span>
                  <span className={cn(
                    'font-medium',
                    agent.process.ready ? 'text-green-400' : 'text-yellow-400',
                  )}>
                    {agent.process.ready ? 'Yes' : 'No'}
                  </span>
                </div>
              </div>
            </CollapsibleSection>

            <Separator />

            {/* Model */}
            <div className="py-2">
              <div className="flex items-center gap-2 text-sm">
                <Cpu className="size-4 text-muted-foreground" />
                <span className="text-muted-foreground">Model:</span>
                <ModelDropdown
                  agentId={agentId}
                  currentModel={agent.model}
                  onModelChanged={(newModel) => setAgent((prev) => prev ? { ...prev, model: newModel } : prev)}
                />
              </div>
            </div>

            <Separator />

            {/* Instructions */}
            <CollapsibleSection title="Instructions" defaultOpen>
              <AgentInstructionsEditor agentId={agentId} />
            </CollapsibleSection>

            <Separator />

            {/* Skills */}
            <CollapsibleSection title="Skills">
              <AgentSkillsPanel agentId={agentId} />
            </CollapsibleSection>

            <Separator />

            {/* Memory */}
            <CollapsibleSection title="Memory">
              <AgentMemoryPanel agentId={agentId} />
            </CollapsibleSection>

            <Separator />

            {/* Channels */}
            {agent.channelAgents.length > 0 && (
              <>
                <CollapsibleSection title="Channels">
                  <div className="space-y-1">
                    {agent.channelAgents.map((ca) => (
                      <div key={ca.channel.id} className="flex items-center gap-2 text-sm">
                        <Hash className="size-3.5 text-muted-foreground" />
                        <span>{ca.channel.name}</span>
                      </div>
                    ))}
                  </div>
                </CollapsibleSection>
                <Separator />
              </>
            )}

            {/* Created */}
            <div className="flex items-center gap-2 py-2 text-sm">
              <Clock className="size-4 text-muted-foreground" />
              <span className="text-muted-foreground">Created:</span>
              <span>{formatDate(agent.createdAt || agent.created_at || '')}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
