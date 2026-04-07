'use client'

import { useState, useEffect } from 'react'
import { FolderGit2, Plus, Loader2, AlertCircle, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSocket } from '@/lib/socket/useSocket'
import { CreateProjectModal } from './CreateProjectModal'
import type { Project } from '@/types'

const STATUS_INDICATOR: Record<string, { color: string; label: string }> = {
  active: { color: 'bg-green-500', label: 'Active' },
  cloning: { color: 'bg-yellow-500', label: 'Cloning...' },
  error: { color: 'bg-red-500', label: 'Error' },
}

export function ProjectList({ channelId }: { channelId?: string }) {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const { socket } = useSocket()

  useEffect(() => {
    fetch(`/api/projects${channelId ? `?channel_id=${channelId}` : ''}`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        setProjects(Array.isArray(data) ? data : [])
        setLoading(false)
      })
      .catch(() => {
        setProjects([])
        setLoading(false)
      })
  }, [channelId])

  useEffect(() => {
    if (!socket) return

    const handleCreated = (project: Project) => {
      if (channelId && project.channel_id !== channelId) return
      setProjects((prev) => {
        if (prev.some((p) => p.id === project.id)) return prev
        return [project, ...prev]
      })
    }

    const handleUpdated = (project: Project) => {
      setProjects((prev) =>
        prev.map((p) => (p.id === project.id ? project : p)),
      )
    }

    const handleDeleted = (data: { project_id: string; channel_id: string }) => {
      if (channelId && data.channel_id !== channelId) return
      setProjects((prev) => prev.filter((p) => p.id !== data.project_id))
    }

    socket.on('project:created' as any, handleCreated)
    socket.on('project:updated' as any, handleUpdated)
    socket.on('project:deleted' as any, handleDeleted)

    return () => {
      socket.off('project:created' as any, handleCreated)
      socket.off('project:updated' as any, handleUpdated)
      socket.off('project:deleted' as any, handleDeleted)
    }
  }, [socket, channelId])

  const handleDelete = async (projectId: string) => {
    if (!confirm('Remove this project from the channel?')) return
    try {
      const res = await fetch(`/api/projects/${projectId}`, { method: 'DELETE' })
      if (res.ok) {
        setProjects((prev) => prev.filter((p) => p.id !== projectId))
      }
    } catch (err) {
      console.error('Failed to delete project:', err)
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden items-center">
      <div className="w-full max-w-4xl flex flex-col flex-1 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <FolderGit2 className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Projects</span>
            <span className="text-xs text-muted-foreground">({projects.length})</span>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="cursor-pointer inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Project
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
              Loading projects...
            </div>
          ) : projects.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <FolderGit2 className="h-8 w-8 opacity-40" />
              <p>No projects linked to this channel yet.</p>
              <button
                onClick={() => setShowCreate(true)}
                className="cursor-pointer text-primary hover:underline text-xs"
              >
                Add a project to get started
              </button>
            </div>
          ) : (
            <div className="divide-y">
              {projects.map((project) => {
                const indicator = STATUS_INDICATOR[project.status] || STATUS_INDICATOR.active
                return (
                  <div
                    key={project.id}
                    className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50"
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {project.status === 'cloning' ? (
                        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-yellow-500" />
                      ) : project.status === 'error' ? (
                        <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
                      ) : (
                        <span className={cn('h-2 w-2 shrink-0 rounded-full', indicator.color)} />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{project.name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {project.git_url || project.repo_path}
                        </p>
                      </div>
                    </div>
                    <span className={cn(
                      'rounded-full px-2 py-0.5 text-[11px] font-medium',
                      project.status === 'active' && 'bg-green-100 text-green-700',
                      project.status === 'cloning' && 'bg-yellow-100 text-yellow-700',
                      project.status === 'error' && 'bg-red-100 text-red-700',
                    )}>
                      {indicator.label}
                    </span>
                    <button
                      onClick={() => handleDelete(project.id)}
                      className="cursor-pointer rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                      title="Remove project"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {showCreate && (
          <CreateProjectModal
            channelId={channelId}
            onClose={() => setShowCreate(false)}
            onCreated={(project) => {
              setProjects((prev) => {
                if (prev.some((p) => p.id === project.id)) return prev
                return [project, ...prev]
              })
            }}
          />
        )}
      </div>
    </div>
  )
}
