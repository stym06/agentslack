'use client'

import { useState, useEffect } from 'react'
import { UserPlus, Loader2, GitBranch, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import type { Agent, Project } from '@/types'

interface AssignAgentDropdownProps {
  taskId: string
  channelId?: string
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
  const [step, setStep] = useState<'agent' | 'project' | 'dirty'>('agent')
  const [agents, setAgents] = useState<Agent[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null)
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [dirtyRepoPath, setDirtyRepoPath] = useState<string | null>(null)
  const [assigning, setAssigning] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return

    setLoading(true)
    Promise.all([
      fetch('/api/agents').then((r) => r.json()),
      fetch('/api/projects').then((r) => r.json()),
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
  }, [open])

  const handleSelectAgent = (agentId: string) => {
    setSelectedAgent(agentId)
    if (projects.length === 1) {
      handleAssign(agentId, projects[0].id)
    } else if (projects.length === 0) {
      setOpen(false)
    } else {
      setStep('project')
    }
  }

  const handleAssign = async (agentId: string, projectId: string, dirtyStrategy?: string) => {
    setAssigning(true)
    setSelectedProjectId(projectId)
    try {
      const res = await fetch(`/api/tasks/${taskId}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_id: agentId,
          project_id: projectId,
          ...(dirtyStrategy && { dirty_strategy: dirtyStrategy }),
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed' }))
        if (err.error === 'dirty_repo') {
          setDirtyRepoPath(err.repo_path)
          setStep('dirty')
          setAssigning(false)
          return
        }
        throw new Error(err.error || err.message)
      }

      onAssigned?.()
      resetAndClose()
    } catch (err) {
      console.error('Failed to assign:', err)
      alert(err instanceof Error ? err.message : 'Failed to assign task')
      setAssigning(false)
    }
  }

  const handleDirtyChoice = (strategy: 'stash' | 'force') => {
    if (!selectedAgent || !selectedProjectId) return
    handleAssign(selectedAgent, selectedProjectId, strategy)
  }

  const resetAndClose = () => {
    setOpen(false)
    setStep('agent')
    setSelectedAgent(null)
    setSelectedProjectId(null)
    setDirtyRepoPath(null)
    setAssigning(false)
  }

  if (currentAgentId) {
    return null
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
          <div className="fixed inset-0 z-40" onClick={resetAndClose} />
          <div className="absolute right-0 top-full z-50 mt-1 w-64 overflow-hidden rounded-md border bg-popover shadow-lg">
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
            ) : step === 'dirty' ? (
              <div className="flex flex-col gap-3 p-4">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-yellow-500" />
                  <div>
                    <p className="text-sm font-medium">Uncommitted changes</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      The project repo has uncommitted changes:
                    </p>
                    <code className="mt-1 block truncate rounded bg-muted px-2 py-1 text-[11px] text-muted-foreground">
                      {dirtyRepoPath}
                    </code>
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Button
                    size="sm"
                    onClick={() => handleDirtyChoice('stash')}
                    className="w-full justify-start text-xs"
                  >
                    <GitBranch className="mr-1.5 size-3" />
                    Stash changes & continue
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDirtyChoice('force')}
                    className="w-full justify-start text-xs"
                  >
                    <GitBranch className="mr-1.5 size-3" />
                    Keep changes on current branch
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={resetAndClose}
                    className="w-full justify-start text-xs text-muted-foreground"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : step === 'agent' ? (
              <>
                <div className="px-3 py-2 text-xs font-medium text-muted-foreground border-b">
                  Assign to agent
                </div>
                {agents.length === 0 ? (
                  <div className="px-3 py-3 text-xs text-muted-foreground">
                    No agents available
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
                          agent.status === 'offline' && 'bg-muted-foreground',
                          agent.status === 'loading' && 'bg-blue-500',
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
