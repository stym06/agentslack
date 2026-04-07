'use client'

import { useEffect, useState } from 'react'
import { signOut } from 'next-auth/react'
import { Hash, ChevronDown, Plus, Bot, LogOut, ListTodo, FolderGit2 } from 'lucide-react'
import type { Channel, Agent } from '@/types'
import { CreateAgentModal } from '@/components/agents/CreateAgentModal'
import { CreateChannelModal } from '@/components/channels/CreateChannelModal'
import { useSocket } from '@/lib/socket/useSocket'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Hint } from '@/components/hint'
import { cn } from '@/lib/utils'

export type ActiveView = 'channel' | 'tasks' | 'projects'

export function Sidebar({
  activeChannelId,
  activeView,
  onChannelSelect,
  onViewSelect,
  onAgentSelect,
  channels,
  agents,
  onAgentsChange,
}: {
  activeChannelId: string | null
  activeView: ActiveView
  onChannelSelect: (id: string) => void
  onViewSelect: (view: ActiveView) => void
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
        return 'bg-muted-foreground'
    }
  }

  const navItem = (view: ActiveView, label: string, Icon: typeof ListTodo) => (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => onViewSelect(view)}
      className={cn(
        'flex h-7 w-full items-center justify-start gap-1.5 px-[18px] text-sm font-normal text-sidebar-foreground',
        activeView === view && 'bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent',
      )}
    >
      <Icon className="size-3.5 shrink-0" />
      <span>{label}</span>
    </Button>
  )

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      {/* Workspace header */}
      <div className="flex h-[49px] items-center justify-between px-4">
        <h1 className="truncate text-lg font-bold">AgentSlack</h1>
      </div>

      <Separator className="bg-sidebar-border" />

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {/* Global views */}
        {navItem('tasks', 'Tasks', ListTodo)}
        {navItem('projects', 'Projects', FolderGit2)}

        {/* Channels section */}
        <div className="mt-3">
          <div className="group flex items-center px-2">
            <Button
              onClick={() => setChannelsOpen(!channelsOpen)}
              variant="ghost"
              className="size-6 shrink-0 p-0.5 text-sm text-sidebar-foreground"
            >
              <ChevronDown className={cn('size-4 transition-transform', !channelsOpen && '-rotate-90')} />
            </Button>
            <span className="ml-1 text-sm font-medium text-sidebar-foreground">Channels</span>
            <Hint label="New Channel" side="top">
              <Button
                onClick={() => setShowChannelModal(true)}
                variant="ghost"
                size="icon-sm"
                className="ml-auto size-6 shrink-0 p-0.5 text-sidebar-foreground opacity-0 transition-opacity group-hover:opacity-100"
              >
                <Plus className="size-4" />
              </Button>
            </Hint>
          </div>

          {channelsOpen &&
            channels.map((channel) => (
              <Button
                key={channel.id}
                variant="ghost"
                size="sm"
                onClick={() => onChannelSelect(channel.id)}
                className={cn(
                  'flex h-7 w-full items-center justify-start gap-1.5 px-[18px] text-sm font-normal text-sidebar-foreground',
                  activeView === 'channel' && activeChannelId === channel.id && 'bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent',
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
              variant="ghost"
              className="size-6 shrink-0 p-0.5 text-sm text-sidebar-foreground"
            >
              <ChevronDown className={cn('size-4 transition-transform', !agentsOpen && '-rotate-90')} />
            </Button>
            <span className="ml-1 text-sm font-medium text-sidebar-foreground">Agents</span>
            <Hint label="Create Agent" side="top">
              <Button
                onClick={() => setShowAgentModal(true)}
                variant="ghost"
                size="icon-sm"
                className="ml-auto size-6 shrink-0 p-0.5 text-sidebar-foreground opacity-0 transition-opacity group-hover:opacity-100"
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
                  className="flex h-7 w-full items-center gap-1.5 px-[18px] text-sm text-sidebar-foreground hover:bg-sidebar-accent rounded cursor-pointer transition-colors"
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
      <Separator className="bg-sidebar-border" />
      <div className="p-2">
        <Button
          onClick={() => signOut()}
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-sm text-sidebar-foreground"
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
