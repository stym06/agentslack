'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { Sidebar } from './Sidebar'
import { MainPane } from './MainPane'
import { AgentProfilePanel } from '@/components/agents/AgentProfilePanel'
import { AgentProfileProvider } from '@/components/agents/AgentProfileContext'
import type { Agent, Channel } from '@/types'

export function DashboardLayout() {
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null)
  const [channels, setChannels] = useState<Channel[]>([])
  const [agents, setAgents] = useState<Agent[]>([])
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/channels')
      .then((res) => res.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : []
        setChannels(list)
        if (list.length > 0 && !activeChannelId) {
          setActiveChannelId(list[0].id)
        }
      })
      .catch(console.error)
  }, [])

  useEffect(() => {
    fetch('/api/agents')
      .then((res) => res.ok ? res.json() : [])
      .then((data) => setAgents(Array.isArray(data) ? data : []))
      .catch(() => setAgents([]))
  }, [])

  const openAgentProfileByName = useCallback((name: string) => {
    const agent = agents.find((a) => a.name.toLowerCase() === name.toLowerCase())
    if (agent) setSelectedAgentId(agent.id)
  }, [agents])

  const profileContext = useMemo(() => ({
    openAgentProfile: (agentId: string) => setSelectedAgentId(agentId),
    openAgentProfileByName,
  }), [openAgentProfileByName])

  return (
    <AgentProfileProvider value={profileContext}>
      <div className="flex h-full overflow-hidden">
        <div className="w-60 shrink-0">
          <Sidebar
            activeChannelId={activeChannelId}
            onChannelSelect={setActiveChannelId}
            onAgentSelect={(id) => setSelectedAgentId((prev) => prev === id ? null : id)}
            channels={channels}
            agents={agents}
            onAgentsChange={setAgents}
          />
        </div>
        <div className="flex-1 min-w-0">
          <MainPane channelId={activeChannelId} channels={channels} />
        </div>
        {selectedAgentId && (
          <>
            <div className="w-px shrink-0 bg-border" />
            <div className="w-[340px] shrink-0 overflow-hidden">
              <AgentProfilePanel
                agentId={selectedAgentId}
                onClose={() => setSelectedAgentId(null)}
              />
            </div>
          </>
        )}
      </div>
    </AgentProfileProvider>
  )
}
