'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, MessageSquare, GitBranch, FolderGit2, User } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Task, TaskGroup, Project } from '@/types'
import { useSocket } from '@/lib/socket/useSocket'
import { AssignAgentDropdown } from './AssignAgentDropdown'

const COLUMNS = ['todo', 'in_progress', 'in_review', 'done'] as const
const COLUMN_LABELS: Record<string, string> = {
  todo: 'Todo',
  in_progress: 'In Progress',
  in_review: 'In Review',
  done: 'Done',
}
const COLUMN_DOT_COLORS: Record<string, string> = {
  todo: 'bg-muted-foreground',
  in_progress: 'bg-blue-500',
  in_review: 'bg-yellow-500',
  done: 'bg-green-500',
}
const CARD_ACCENT: Record<string, string> = {
  todo: 'border-l-muted-foreground/40',
  in_progress: 'border-l-blue-500/60',
  in_review: 'border-l-yellow-500/60',
  done: 'border-l-green-500/60',
}

function TaskCard({
  task,
  channelId,
  onOpenTaskDetail,
  onOpenTask,
  onOpenTaskThread,
  setTasks,
}: {
  task: Task
  channelId?: string
  onOpenTaskDetail?: (taskId: string) => void
  onOpenTask?: (messageId: string) => void
  onOpenTaskThread?: (channelId: string, messageId: string) => void
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>
}) {
  const handleClick = () => {
    if (onOpenTaskDetail) onOpenTaskDetail(task.id)
    else if (onOpenTask) onOpenTask(task.message_id)
    else if (onOpenTaskThread && task.channel_id) onOpenTaskThread(task.channel_id, task.message_id)
  }

  return (
    <div
      onClick={handleClick}
      className={cn(
        'cursor-pointer rounded-md border border-l-[3px] bg-card p-3 transition-colors hover:bg-accent/50',
        CARD_ACCENT[task.status] || 'border-l-muted-foreground/40',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-mono text-muted-foreground">#{task.task_number}</span>
        <div className="flex items-center gap-1.5 shrink-0">
          {task.project_id && (
            <GitBranch className="size-3 text-muted-foreground" />
          )}
          {(task.comment_count ?? 0) > 0 && (
            <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
              <MessageSquare className="size-3" />
              {task.comment_count}
            </span>
          )}
        </div>
      </div>
      <p className="mt-1.5 text-sm font-medium leading-snug">{task.title}</p>
      {task.body && (
        <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{task.body}</p>
      )}
      <div className="mt-2.5 flex items-center justify-between">
        {task.claimed_by_name ? (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <User className="size-3" />
            @{task.claimed_by_name}
          </span>
        ) : (
          <AssignAgentDropdown
            taskId={task.id}
            channelId={channelId}
            currentAgentId={task.claimed_by_id}
          />
        )}
        {task.group_summary && (
          <span className="truncate text-[10px] text-muted-foreground/60 max-w-[100px]" title={task.group_summary}>
            {task.group_summary}
          </span>
        )}
      </div>
    </div>
  )
}

interface TaskListProps {
  channelId?: string
  onOpenTask?: (messageId: string) => void
  onOpenTaskThread?: (channelId: string, messageId: string) => void
  onOpenTaskDetail?: (taskId: string) => void
}

export function TaskList({ channelId, onOpenTask, onOpenTaskThread, onOpenTaskDetail }: TaskListProps) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [groups, setGroups] = useState<TaskGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [creating, setCreating] = useState(false)
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [projectsLoaded, setProjectsLoaded] = useState(false)
  const [showProjectDropdown, setShowProjectDropdown] = useState(false)
  const [filterProjectId, setFilterProjectId] = useState<string | null>(null)
  const [showFilterDropdown, setShowFilterDropdown] = useState(false)
  const { socket } = useSocket()

  // Load projects on mount
  useEffect(() => {
    fetch('/api/projects')
      .then((r) => r.ok ? r.json() : [])
      .then((data) => {
        setProjects((Array.isArray(data) ? data : []).filter((p: Project) => p.status === 'active'))
        setProjectsLoaded(true)
      })
      .catch(() => setProjectsLoaded(true))
  }, [])

  const fetchTasks = useCallback(() => {
    const params = new URLSearchParams({ status: 'all' })
    if (channelId) params.set('channel_id', channelId)
    fetch(`/api/tasks?${params}`)
      .then((res) => res.ok ? res.json() : { tasks: [], groups: [] })
      .then((data) => {
        setTasks(Array.isArray(data.tasks) ? data.tasks : Array.isArray(data) ? data : [])
        setGroups(Array.isArray(data.groups) ? data.groups : [])
        setLoading(false)
      })
      .catch(() => {
        setTasks([])
        setGroups([])
        setLoading(false)
      })
  }, [channelId])

  useEffect(() => {
    setLoading(true)
    fetchTasks()
  }, [fetchTasks])

  useEffect(() => {
    if (!socket) return

    const handleTaskCreated = (task: Task & { channel_id: string }) => {
      if (channelId && task.channel_id !== channelId) return
      setTasks((prev) => {
        if (prev.some((t) => t.id === task.id)) return prev
        return [...prev, task]
      })
    }

    const handleTaskUpdated = (task: Task & { channel_id: string }) => {
      if (channelId && task.channel_id !== channelId) return
      setTasks((prev) => {
        const idx = prev.findIndex((t) => t.id === task.id)
        if (idx >= 0) {
          const updated = [...prev]
          updated[idx] = task
          return updated
        }
        return [...prev, task]
      })
    }

    const handleTaskDeleted = (data: { id: string }) => {
      setTasks((prev) => prev.filter((t) => t.id !== data.id))
    }

    socket.on('task:created' as any, handleTaskCreated)
    socket.on('task:updated' as any, handleTaskUpdated)
    socket.on('task:deleted' as any, handleTaskDeleted)

    return () => {
      socket.off('task:created' as any, handleTaskCreated)
      socket.off('task:updated' as any, handleTaskUpdated)
      socket.off('task:deleted' as any, handleTaskDeleted)
    }
  }, [socket, channelId])


  const handleCreate = async () => {
    if (!newTitle.trim() || !selectedProject) return
    setCreating(true)
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel_id: channelId, title: newTitle.trim(), project_id: selectedProject.id }),
      })
      if (res.ok) {
        const task = await res.json()
        setTasks((prev) => [...prev, task])
        setNewTitle('')
        setSelectedProject(null)
        setShowCreate(false)
        onOpenTask?.(task.message_id)
      }
    } catch (err) {
      console.error('Failed to create task:', err)
    } finally {
      setCreating(false)
    }
  }

  const filteredTasks = filterProjectId ? tasks.filter((t) => t.project_id === filterProjectId) : tasks
  const tasksByStatus = (status: string) => filteredTasks.filter((t) => t.status === status)

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 border-b px-4 py-3">
        {/* Project filter */}
        <div className="relative">
          <button
            onClick={() => setShowFilterDropdown(!showFilterDropdown)}
            className={cn(
              'inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
              filterProjectId
                ? 'border-primary/30 bg-primary/10 text-primary'
                : 'border-border bg-background text-muted-foreground hover:bg-accent',
            )}
          >
            <FolderGit2 className="size-3" />
            {filterProjectId
              ? projects.find((p) => p.id === filterProjectId)?.name ?? 'Project'
              : 'All Projects'}
          </button>
          {showFilterDropdown && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowFilterDropdown(false)} />
              <div className="absolute left-0 top-full z-50 mt-1 w-56 overflow-hidden rounded-md border bg-popover shadow-lg">
                <button
                  onClick={() => { setFilterProjectId(null); setShowFilterDropdown(false) }}
                  className={cn(
                    'flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-accent',
                    !filterProjectId && 'bg-accent',
                  )}
                >
                  All Projects
                </button>
                {projects.map((project) => (
                  <button
                    key={project.id}
                    onClick={() => { setFilterProjectId(project.id); setShowFilterDropdown(false) }}
                    className={cn(
                      'flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-accent',
                      filterProjectId === project.id && 'bg-accent',
                    )}
                  >
                    <span className="h-2 w-2 shrink-0 rounded-full bg-green-500" />
                    <span className="truncate">{project.name}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <span className="text-xs text-muted-foreground">{filteredTasks.length} tasks</span>

        {channelId && (
          <div className="ml-auto">
            <button
              onClick={() => setShowCreate(true)}
              className="cursor-pointer inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="h-3.5 w-3.5" />
              New Task
            </button>
          </div>
        )}
      </div>

      {/* Create task inline */}
      {showCreate && (
        <div className="flex flex-col gap-2 border-b bg-muted/30 px-4 py-3">
          <div className="flex items-center gap-2">
            <input
              type="text"
              autoFocus
              placeholder="Task title..."
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate()
                if (e.key === 'Escape') setShowCreate(false)
              }}
              className="flex-1 rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              onClick={handleCreate}
              disabled={creating || !newTitle.trim() || !selectedProject}
              className="cursor-pointer rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {creating ? 'Creating...' : 'Create'}
            </button>
            <button
              onClick={() => { setShowCreate(false); setSelectedProject(null) }}
              className="cursor-pointer rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-secondary"
            >
              Cancel
            </button>
          </div>
          <div className="relative">
            <button
              onClick={() => setShowProjectDropdown(!showProjectDropdown)}
              className={cn(
                'inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors',
                selectedProject
                  ? 'border-green-500/30 bg-green-500/10 text-green-400'
                  : 'border-border bg-background text-muted-foreground hover:bg-accent',
              )}
            >
              <FolderGit2 className="size-3" />
              {selectedProject ? selectedProject.name : 'Select project...'}
            </button>
            {showProjectDropdown && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowProjectDropdown(false)} />
                <div className="absolute left-0 top-full z-50 mt-1 w-56 overflow-hidden rounded-md border bg-popover shadow-lg">
                  <div className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">
                    Select project
                  </div>
                  {!projectsLoaded ? (
                    <div className="px-3 py-3 text-xs text-muted-foreground">Loading...</div>
                  ) : projects.length === 0 ? (
                    <div className="px-3 py-3 text-xs text-muted-foreground">No active projects</div>
                  ) : (
                    projects.map((project) => (
                      <button
                        key={project.id}
                        onClick={() => {
                          setSelectedProject(project)
                          setShowProjectDropdown(false)
                        }}
                        className={cn(
                          'flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-accent',
                          selectedProject?.id === project.id && 'bg-accent',
                        )}
                      >
                        <span className="h-2 w-2 shrink-0 rounded-full bg-green-500" />
                        <span className="truncate">{project.name}</span>
                      </button>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Kanban Board */}
      <div className="flex-1 overflow-hidden p-4">
        {loading ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Loading tasks...
          </div>
        ) : (
          <div className="mx-auto flex h-full gap-3 min-w-0 w-full max-w-5xl">
            {COLUMNS.map((status) => {
              const columnTasks = tasksByStatus(status)
              return (
                <div key={status} className="flex h-full min-w-0 flex-1 flex-col rounded-lg bg-muted/30">
                  {/* Column header */}
                  <div className="flex items-center gap-2 px-3 py-2.5">
                    <span className={cn('size-2 rounded-full', COLUMN_DOT_COLORS[status])} />
                    <span className="text-xs font-semibold">{COLUMN_LABELS[status]}</span>
                    <span className="ml-auto rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                      {columnTasks.length}
                    </span>
                  </div>

                  {/* Cards */}
                  <div className="flex-1 space-y-2 overflow-y-auto px-2 pb-2">
                    {columnTasks.length === 0 ? (
                      <div className="flex h-20 items-center justify-center rounded-md border border-dashed border-border/50 text-xs text-muted-foreground/50">
                        No tasks
                      </div>
                    ) : (
                      columnTasks.map((task) => (
                        <TaskCard
                          key={task.id}
                          task={task}
                          channelId={channelId}
                          onOpenTaskDetail={onOpenTaskDetail}
                          onOpenTask={onOpenTask}
                          onOpenTaskThread={onOpenTaskThread}
                          setTasks={setTasks}
                        />
                      ))
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
