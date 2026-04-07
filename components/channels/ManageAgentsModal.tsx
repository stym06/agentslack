'use client'

import { useState, useEffect } from 'react'

interface Agent {
  id: string
  name: string
  role: string | null
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
  const [assignedAgentIds, setAssignedAgentIds] = useState<Set<string>>(
    new Set()
  )
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState<string | null>(null)

  useEffect(() => {
    loadData()
  }, [channelId])

  const loadData = async () => {
    try {
      // Fetch all workspace agents
      const agentsRes = await fetch('/api/agents')
      if (!agentsRes.ok) throw new Error('Failed to fetch agents')
      const agents = await agentsRes.json()

      // Fetch assigned agents for this channel
      const assignedRes = await fetch(`/api/channels/${channelId}/agents`)
      if (!assignedRes.ok) throw new Error('Failed to fetch assigned agents')
      const assignedAgents = await assignedRes.json()

      setAllAgents(agents)
      setAssignedAgentIds(new Set(assignedAgents.map((a: Agent) => a.id)))
      setLoading(false)
    } catch (error) {
      console.error('Error loading agents:', error)
      alert('Failed to load agents')
      setLoading(false)
    }
  }

  const handleToggle = async (agentId: string, isCurrentlyAssigned: boolean) => {
    setUpdating(agentId)

    try {
      if (isCurrentlyAssigned) {
        // Unassign
        const res = await fetch(
          `/api/channels/${channelId}/agents/${agentId}`,
          {
            method: 'DELETE',
          }
        )

        if (!res.ok) throw new Error('Failed to unassign agent')

        setAssignedAgentIds((prev) => {
          const next = new Set(prev)
          next.delete(agentId)
          return next
        })
      } else {
        // Assign
        const res = await fetch(`/api/channels/${channelId}/agents`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agent_id: agentId }),
        })

        if (!res.ok) throw new Error('Failed to assign agent')

        setAssignedAgentIds((prev) => {
          const next = new Set(prev)
          next.add(agentId)
          return next
        })
      }
    } catch (error) {
      console.error('Error toggling agent assignment:', error)
      alert('Failed to update agent assignment')
    } finally {
      setUpdating(null)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gray-800 p-6 rounded-lg w-[500px] max-h-[600px] flex flex-col">
        <h2 className="text-xl font-bold text-white mb-4">Manage Agents</h2>

        {loading ? (
          <div className="text-gray-400 text-center py-8">Loading...</div>
        ) : allAgents.length === 0 ? (
          <div className="text-gray-400 text-center py-8">
            No agents available. Create an agent first.
          </div>
        ) : (
          <div className="overflow-y-auto flex-1 mb-4">
            {allAgents.map((agent) => {
              const isAssigned = assignedAgentIds.has(agent.id)
              const isUpdating = updating === agent.id

              return (
                <label
                  key={agent.id}
                  className="flex items-center p-3 rounded hover:bg-gray-700 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={isAssigned}
                    onChange={() => handleToggle(agent.id, isAssigned)}
                    disabled={isUpdating}
                    className="mr-3 h-4 w-4 text-blue-600 focus:ring-blue-500 rounded disabled:opacity-50"
                  />
                  <div className="flex-1">
                    <div className="text-white font-medium">{agent.name}</div>
                    {agent.role && (
                      <div className="text-sm text-gray-400">{agent.role}</div>
                    )}
                  </div>
                  {isUpdating && (
                    <div className="text-sm text-gray-400">Updating...</div>
                  )}
                </label>
              )
            })}
          </div>
        )}

        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="cursor-pointer px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
