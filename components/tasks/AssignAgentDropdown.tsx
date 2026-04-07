'use client'

import { useState, useEffect } from 'react'
import { UserPlus, Loader2, GitBranch } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Agent, Project } from '@/types'

interface AssignAgentDropdownProps {
  taskId: string
  channelId: string
  currentAgentId?: string | null
  onAssigned?: () => void
}

export function AssignAgentDropdown({
  taskId,
  channelId,
  currentAgentId,
  onAssigned,
}: AssignAgentDropdownProps) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<'agent' | 'project'>('agent')
  const [agents, setAgents] = useState<Agent[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null)
  const [assigning, setAssigning] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return

    setLoading(true)
    Promise.all([
      fetch(`/api/channels/${channelId}/agents`).then((r) => r.json()),
      fetch(`/api/projects?channel_id=${channelId}`).then((r) => r.json()),
    ])
      .then(([agentsData, projectsData]) => {
        const agentList = Array.isArray(agentsData)
          ? agentsData
          : Array.isArray(agentsData.agents)
            ? agentsData.agents
            : []
        setAgents(agentList)
        setProjects(Array.isArray(projectsData) ? projectsData.filter((p: Project) => p.status === 'active') : [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [open, channelId])

  const handleSelectAgent = (agentId: string) => {
    setSelectedAgent(agentId)
    if (projects.length === 1) {
      // Auto-select sole project
      handleAssign(agentId, projects[0].id)
    } else if (projects.length === 0) {
      // No projects — can't assign with worktree
      setOpen(false)
    } else {
      setStep('project')
    }
  }

  const handleAssign = async (agentId: string, projectId: string) => {
    setAssigning(true)
    try {
      const res = await fetch(`/api/tasks/${taskId}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_id: agentId, project_id: projectId }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed' }))
        throw new Error(err.error)
      }

      onAssigned?.()
    } catch (err) {
      console.error('Failed to assign:', err)
      alert(err instanceof Error ? err.message : 'Failed to assign task')
    } finally {
      setAssigning(false)
      setOpen(false)
      setStep('agent')
      setSelectedAgent(null)
    }
  }

  if (currentAgentId) {
    return null // Already assigned, don't show
  }

  return (
    <div className="relative">
      <button
        onClick={(e) => {
          e.stopPropagation()
          setOpen(!open)
        }}
        className="cursor-pointer rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        title="Assign to agent"
      >
        <UserPlus className="h-3.5 w-3.5" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => { setOpen(false); setStep('agent') }} />
          <div className="absolute right-0 top-full z-50 mt-1 w-52 overflow-hidden rounded-md border bg-popover shadow-lg">
            {loading ? (
              <div className="flex items-center justify-center gap-2 px-3 py-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading...
              </div>
            ) : assigning ? (
              <div className="flex items-center justify-center gap-2 px-3 py-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Assigning...
              </div>
            ) : step === 'agent' ? (
              <>
                <div className="px-3 py-2 text-xs font-medium text-muted-foreground border-b">
                  Assign to agent
                </div>
                {agents.length === 0 ? (
                  <div className="px-3 py-3 text-xs text-muted-foreground">
                    No agents in this channel
                  </div>
                ) : (
                  agents.map((agent) => (
                    <button
                      key={agent.id}
                      onClick={(e) => {
                        e.stopPropagation()
                        handleSelectAgent(agent.id)
                      }}
                      className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
                    >
                      <span
                        className={cn(
                          'h-2 w-2 rounded-full',
                          agent.status === 'online' && 'bg-green-500',
                          agent.status === 'busy' && 'bg-yellow-500',
                          agent.status === 'offline' && 'bg-gray-400',
                          agent.status === 'loading' && 'bg-blue-400',
                        )}
                      />
                      <span className="truncate">@{agent.name}</span>
                      {agent.role && (
                        <span className="text-xs text-muted-foreground truncate ml-auto">
                          {agent.role}
                        </span>
                      )}
                    </button>
                  ))
                )}
              </>
            ) : (
              <>
                <div className="px-3 py-2 text-xs font-medium text-muted-foreground border-b flex items-center gap-1">
                  <GitBranch className="h-3 w-3" />
                  Select project
                </div>
                {projects.map((project) => (
                  <button
                    key={project.id}
                    onClick={(e) => {
                      e.stopPropagation()
                      handleAssign(selectedAgent!, project.id)
                    }}
                    className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
                  >
                    <span className="h-2 w-2 shrink-0 rounded-full bg-green-500" />
                    <span className="truncate">{project.name}</span>
                  </button>
                ))}
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
