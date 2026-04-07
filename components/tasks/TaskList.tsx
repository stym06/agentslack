'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, ArrowRight, ChevronDown, MessageSquare, GitBranch } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Task, TaskGroup } from '@/types'
import { useSocket } from '@/lib/socket/useSocket'
import { AssignAgentDropdown } from './AssignAgentDropdown'

const STATUS_FILTERS = ['all', 'todo', 'in_progress', 'in_review', 'done'] as const
const STATUS_LABELS: Record<string, string> = {
  all: 'All',
  todo: 'Todo',
  in_progress: 'In Progress',
  in_review: 'In Review',
  done: 'Done',
}
const STATUS_COLORS: Record<string, string> = {
  todo: 'bg-muted text-muted-foreground',
  in_progress: 'bg-blue-500/15 text-blue-400',
  in_review: 'bg-yellow-500/15 text-yellow-400',
  done: 'bg-green-500/15 text-green-400',
}

function StatusDropdown({
  taskId,
  status,
  onStatusChange,
}: {
  taskId: string
  status: string
  onStatusChange: (newStatus: string) => void
}) {
  const [open, setOpen] = useState(false)

  const handleChange = async (newStatus: string) => {
    setOpen(false)
    if (newStatus === status) return
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (res.ok) {
        onStatusChange(newStatus)
      }
    } catch (err) {
      console.error('Failed to update status:', err)
    }
  }

  return (
    <div className="relative">
      <button
        onClick={(e) => {
          e.stopPropagation()
          setOpen(!open)
        }}
        className={cn(
          'flex cursor-pointer items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors hover:ring-1 hover:ring-ring',
          STATUS_COLORS[status] || 'bg-muted text-muted-foreground',
        )}
      >
        {STATUS_LABELS[status] || status}
        <ChevronDown className="h-3 w-3" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-50 mt-1 w-36 overflow-hidden rounded-md border bg-popover shadow-lg">
            {(['todo', 'in_progress', 'in_review', 'done'] as const).map((s) => (
              <button
                key={s}
                onClick={(e) => {
                  e.stopPropagation()
                  handleChange(s)
                }}
                className={cn(
                  'flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-accent',
                  status === s && 'bg-accent',
                )}
              >
                <span
                  className={cn(
                    'inline-block h-2 w-2 rounded-full',
                    s === 'todo' && 'bg-muted-foreground',
                    s === 'in_progress' && 'bg-blue-500',
                    s === 'in_review' && 'bg-yellow-500',
                    s === 'done' && 'bg-green-500',
                  )}
                />
                {STATUS_LABELS[s]}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function TaskRow({
  task,
  channelId,
  onOpenTask,
  setTasks,
  indent,
}: {
  task: Task
  channelId?: string
  onOpenTask?: (messageId: string) => void
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>
  indent?: boolean
}) {
  return (
    <div
      className={cn(
        'flex w-full items-center gap-3 py-2.5 pr-4 transition-colors hover:bg-muted/50',
        indent ? 'pl-10' : 'px-4',
      )}
    >
      <span className="text-xs font-mono text-muted-foreground">#{task.task_number}</span>
      <StatusDropdown
        taskId={task.id}
        status={task.status}
        onStatusChange={(newStatus) => {
          setTasks((prev) =>
            prev.map((t) => (t.id === task.id ? { ...t, status: newStatus as Task['status'] } : t)),
          )
        }}
      />
      <span
        onClick={() => onOpenTask?.(task.message_id)}
        className="flex-1 cursor-pointer truncate text-sm font-medium hover:underline"
      >
        {task.title}
      </span>
      {task.project_id && (
        <span className="flex items-center gap-0.5 text-xs text-muted-foreground" title="Has project worktree">
          <GitBranch className="h-3 w-3" />
        </span>
      )}
      {(task.comment_count ?? 0) > 0 && (
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <MessageSquare className="h-3 w-3" />
          {task.comment_count}
        </span>
      )}
      {task.claimed_by_name ? (
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <ArrowRight className="h-3 w-3" />
          @{task.claimed_by_name}
        </span>
      ) : (
        <AssignAgentDropdown
          taskId={task.id}
          channelId={channelId}
          currentAgentId={task.claimed_by_id}
        />
      )}
      {task.created_by_name && (
        <span className="text-xs text-muted-foreground">by @{task.created_by_name}</span>
      )}
    </div>
  )
}

interface TaskListProps {
  channelId?: string
  onOpenTask?: (messageId: string) => void
}

export function TaskList({ channelId, onOpenTask }: TaskListProps) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [groups, setGroups] = useState<TaskGroup[]>([])
  const [filter, setFilter] = useState<string>('all')
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [creating, setCreating] = useState(false)
  const [expandedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const { socket } = useSocket()

  const fetchTasks = useCallback(() => {
    const params = new URLSearchParams({ status: filter })
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
  }, [channelId, filter])

  useEffect(() => {
    setLoading(true)
    fetchTasks()
  }, [fetchTasks])

  // Listen for real-time task updates
  useEffect(() => {
    if (!socket) return

    const handleTaskCreated = (task: Task & { channel_id: string }) => {
      if (channelId && task.channel_id !== channelId) return
      setTasks((prev) => {
        if (prev.some((t) => t.id === task.id)) return prev
        return [...prev, task]
      })
      // If the task has a group_id we don't know about, refetch groups
      if (task.group_id) {
        // Auto-expand the group
        setCollapsedGroups((prev) => {
          const next = new Set(prev)
          next.add(task.group_id!)
          return next
        })
        setGroups((prev) => {
          if (prev.some((g) => g.id === task.group_id)) return prev
          // Refetch groups
          const rp = new URLSearchParams({ status: 'all' })
          if (channelId) rp.set('channel_id', channelId)
          fetch(`/api/tasks?${rp}`)
            .then((res) => res.ok ? res.json() : { groups: [] })
            .then((data) => {
              if (Array.isArray(data.groups)) setGroups(data.groups)
            })
            .catch(() => {})
          return prev
        })
      }
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

    socket.on('task:created' as any, handleTaskCreated)
    socket.on('task:updated' as any, handleTaskUpdated)

    return () => {
      socket.off('task:created' as any, handleTaskCreated)
      socket.off('task:updated' as any, handleTaskUpdated)
    }
  }, [socket, channelId])

  const handleCreate = async () => {
    if (!newTitle.trim()) return
    setCreating(true)
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel_id: channelId, title: newTitle.trim() }),
      })
      if (res.ok) {
        const task = await res.json()
        setTasks((prev) => [...prev, task])
        setNewTitle('')
        setShowCreate(false)
        onOpenTask?.(task.message_id)
      }
    } catch (err) {
      console.error('Failed to create task:', err)
    } finally {
      setCreating(false)
    }
  }

  const filteredTasks = filter === 'all' ? tasks : tasks.filter((t) => t.status === filter)

  // Group tasks: grouped ones under their group, ungrouped at top
  const ungrouped = filteredTasks.filter((t) => !t.group_id)
  const grouped = groups
    .map((g) => ({
      ...g,
      tasks: filteredTasks.filter((t) => t.group_id === g.id),
    }))
    .filter((g) => g.tasks.length > 0)

  const toggleGroup = (groupId: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(groupId)) next.delete(groupId)
      else next.add(groupId)
      return next
    })
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden items-center">
      <div className="w-full max-w-4xl flex flex-col flex-1 overflow-hidden">
      {/* Filter pills + New Task */}
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <div className="flex gap-1">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={cn(
                'cursor-pointer rounded-full px-3 py-1 text-xs font-medium transition-colors',
                filter === s
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
              )}
            >
              {STATUS_LABELS[s]}
            </button>
          ))}
        </div>
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
        <div className="flex items-center gap-2 border-b bg-muted/30 px-4 py-3">
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
            disabled={creating || !newTitle.trim()}
            className="cursor-pointer rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {creating ? 'Creating...' : 'Create'}
          </button>
          <button
            onClick={() => setShowCreate(false)}
            className="cursor-pointer rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-secondary"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Task list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
            Loading tasks...
          </div>
        ) : filteredTasks.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
            No tasks yet. Create one to get started!
          </div>
        ) : (
          <div>
            {/* Ungrouped tasks */}
            {ungrouped.length > 0 && (
              <div className="border-t">
                <button
                  onClick={() => toggleGroup('__ungrouped')}
                  className="flex w-full cursor-pointer items-center gap-2 px-4 py-2.5 text-left transition-colors hover:bg-muted/30"
                >
                  <ChevronDown
                    className={cn(
                      'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
                      !expandedGroups.has('__ungrouped') && '-rotate-90',
                    )}
                  />
                  <span className="text-sm font-semibold text-muted-foreground">Ungrouped</span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {ungrouped.filter((t) => t.status === 'done').length}/{ungrouped.length} done
                  </span>
                </button>
                {expandedGroups.has('__ungrouped') && (
                  <div className="divide-y border-t">
                    {ungrouped.map((task) => (
                      <TaskRow key={task.id} task={task} channelId={channelId} onOpenTask={onOpenTask} setTasks={setTasks} indent />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Grouped tasks */}
            {grouped.map((group) => {
              const isExpanded = expandedGroups.has(group.id)
              const doneCount = group.tasks.filter((t) => t.status === 'done').length
              return (
                <div key={group.id} className="border-t">
                  <button
                    onClick={() => toggleGroup(group.id)}
                    className="flex w-full cursor-pointer items-center gap-2 px-4 py-2.5 text-left transition-colors hover:bg-muted/30"
                  >
                    <ChevronDown
                      className={cn(
                        'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
                        !isExpanded && '-rotate-90',
                      )}
                    />
                    <span className="text-sm font-semibold">{group.summary}</span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {doneCount}/{group.tasks.length} done
                    </span>
                    {/* Progress bar */}
                    <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-green-500 transition-all"
                        style={{ width: `${group.tasks.length > 0 ? (doneCount / group.tasks.length) * 100 : 0}%` }}
                      />
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="divide-y border-t">
                      {group.tasks.map((task) => (
                        <TaskRow key={task.id} task={task} channelId={channelId} onOpenTask={onOpenTask} setTasks={setTasks} indent />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
      </div>
    </div>
  )
}
