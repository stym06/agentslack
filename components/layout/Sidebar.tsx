'use client'

import { useEffect, useState } from 'react'
import { signOut } from 'next-auth/react'
import { Hash, ChevronDown, Plus, Bot, LogOut } from 'lucide-react'
import type { Channel, Agent } from '@/types'
import { CreateAgentModal } from '@/components/agents/CreateAgentModal'
import { CreateChannelModal } from '@/components/channels/CreateChannelModal'
import { useSocket } from '@/lib/socket/useSocket'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Hint } from '@/components/hint'
import { cn } from '@/lib/utils'

export function Sidebar({
  activeChannelId,
  onChannelSelect,
  onAgentSelect,
  channels,
  agents,
  onAgentsChange,
}: {
  activeChannelId: string | null
  onChannelSelect: (id: string) => void
  onAgentSelect: (agentId: string) => void
  channels: Channel[]
  agents: Agent[]
  onAgentsChange: (agents: Agent[]) => void
}) {
  const [showAgentModal, setShowAgentModal] = useState(false)
  const [showChannelModal, setShowChannelModal] = useState(false)
  const [channelsOpen, setChannelsOpen] = useState(true)
  const [agentsOpen, setAgentsOpen] = useState(true)
  const { socket } = useSocket()

  useEffect(() => {
    if (!socket) return
    const handleStatus = (data: { agent_id: string; status: string }) => {
      onAgentsChange(
        agents.map((a) =>
          a.id === data.agent_id ? { ...a, status: data.status as Agent['status'] } : a,
        ),
      )
    }
    socket.on('agent:status', handleStatus)
    return () => {
      socket.off('agent:status', handleStatus)
    }
  }, [socket, agents, onAgentsChange])

  function statusDot(status: string) {
    switch (status) {
      case 'online':
        return 'bg-green-500'
      case 'busy':
        return 'bg-yellow-500'
      case 'loading':
        return 'bg-blue-500 animate-pulse'
      default:
        return 'bg-gray-400'
    }
  }

  return (
    <div className="flex h-full flex-col bg-[#5E2C5F]">
      {/* Workspace header */}
      <div className="flex h-[49px] items-center justify-between px-4">
        <h1 className="truncate text-lg font-bold text-white">AgentSlack</h1>
      </div>

      <Separator className="bg-white/10" />

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {/* Channels section */}
        <div className="mt-1">
          <div className="group flex items-center px-2">
            <Button
              onClick={() => setChannelsOpen(!channelsOpen)}
              variant="transparent"
              className="size-6 shrink-0 p-0.5 text-sm text-[#F9EDFFCC]"
            >
              <ChevronDown className={cn('size-4 transition-transform', !channelsOpen && '-rotate-90')} />
            </Button>
            <span className="ml-1 text-sm font-medium text-[#F9EDFFCC]">Channels</span>
            <Hint label="New Channel" side="top">
              <Button
                onClick={() => setShowChannelModal(true)}
                variant="transparent"
                size="iconSm"
                className="ml-auto size-6 shrink-0 p-0.5 text-[#F9EDFFCC] opacity-0 transition-opacity group-hover:opacity-100"
              >
                <Plus className="size-4" />
              </Button>
            </Hint>
          </div>

          {channelsOpen &&
            channels.map((channel) => (
              <Button
                key={channel.id}
                variant="transparent"
                size="sm"
                onClick={() => onChannelSelect(channel.id)}
                className={cn(
                  'flex h-7 w-full items-center justify-start gap-1.5 px-[18px] text-sm font-normal text-[#F9EDFFCC]',
                  activeChannelId === channel.id && 'bg-white/90 text-[#481349] hover:bg-white/90',
                )}
              >
                <Hash className="size-3.5 shrink-0" />
                <span className="truncate">{channel.name}</span>
              </Button>
            ))}
        </div>

        {/* Agents section */}
        <div className="mt-3">
          <div className="group flex items-center px-2">
            <Button
              onClick={() => setAgentsOpen(!agentsOpen)}
              variant="transparent"
              className="size-6 shrink-0 p-0.5 text-sm text-[#F9EDFFCC]"
            >
              <ChevronDown className={cn('size-4 transition-transform', !agentsOpen && '-rotate-90')} />
            </Button>
            <span className="ml-1 text-sm font-medium text-[#F9EDFFCC]">Agents</span>
            <Hint label="Create Agent" side="top">
              <Button
                onClick={() => setShowAgentModal(true)}
                variant="transparent"
                size="iconSm"
                className="ml-auto size-6 shrink-0 p-0.5 text-[#F9EDFFCC] opacity-0 transition-opacity group-hover:opacity-100"
              >
                <Plus className="size-4" />
              </Button>
            </Hint>
          </div>

          {agentsOpen &&
            agents
              .filter((agent) => agent.status !== 'offline')
              .map((agent) => (
                <button
                  key={agent.id}
                  onClick={() => onAgentSelect(agent.id)}
                  className="flex h-7 w-full items-center gap-1.5 px-[18px] text-sm text-[#F9EDFFCC] hover:bg-white/10 rounded cursor-pointer transition-colors"
                >
                  <span className={cn('size-2 shrink-0 rounded-full', statusDot(agent.status))} />
                  <Bot className="size-3.5 shrink-0 opacity-70" />
                  <span className={cn('truncate', agent.status === 'loading' && 'opacity-60')}>
                    {agent.name}
                  </span>
                  {agent.status === 'loading' && (
                    <span className="ml-auto text-[10px] opacity-50">Starting...</span>
                  )}
                </button>
              ))}
        </div>
      </div>

      {/* Footer */}
      <Separator className="bg-white/10" />
      <div className="p-2">
        <Button
          onClick={() => signOut()}
          variant="transparent"
          size="sm"
          className="w-full justify-start gap-2 text-sm text-[#F9EDFFCC]"
        >
          <LogOut className="size-4" />
          Logout
        </Button>
      </div>

      {/* Modals */}
      {showAgentModal && <CreateAgentModal onClose={() => setShowAgentModal(false)} />}
      {showChannelModal && <CreateChannelModal onClose={() => setShowChannelModal(false)} />}
    </div>
  )
}
