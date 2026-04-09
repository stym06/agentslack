'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { ArrowLeft, GitBranch, User, Bot, ChevronDown, X, Trash2 } from 'lucide-react'
import { AssignAgentDropdown } from './AssignAgentDropdown'
import { useSocket } from '@/lib/socket/useSocket'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Message } from '@/components/message'
import { EditorWithMentions } from '@/components/editor-with-mentions'
import { cn } from '@/lib/utils'
import type { Task } from '@/types'

const STATUS_COLORS: Record<string, string> = {
  todo: 'bg-muted text-muted-foreground',
  in_progress: 'bg-blue-500/15 text-blue-400',
  in_review: 'bg-yellow-500/15 text-yellow-400',
  done: 'bg-green-500/15 text-green-400',
}

const STATUS_LABELS: Record<string, string> = {
  todo: 'Todo',
  in_progress: 'In Progress',
  in_review: 'In Review',
  done: 'Done',
}

type MessagePayload = {
  id: string
  channelId: string
  threadId: string | null
  senderType: string
  senderId: string
  content: string
  metadata: Record<string, unknown> | null
  replyCount: number
  createdAt: string
  sender_name?: string
  sender_avatar?: string | null
}

const STATUS_DOTS: Record<string, string> = {
  todo: 'bg-muted-foreground',
  in_progress: 'bg-blue-500',
  in_review: 'bg-yellow-500',
  done: 'bg-green-500',
}

function TaskStatusDropdown({
  status,
  onChange,
}: {
  status: string
  onChange: (s: string) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          'flex cursor-pointer items-center gap-2 rounded-lg px-3 py-1 text-sm font-medium transition-colors hover:bg-accent',
          STATUS_COLORS[status],
        )}
      >
        <span className={cn('size-2 rounded-full', STATUS_DOTS[status])} />
        {STATUS_LABELS[status] || status}
        <ChevronDown className="size-3.5 opacity-60" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-50 mt-1 w-40 overflow-hidden rounded-lg border bg-popover shadow-lg">
            {(['todo', 'in_progress', 'in_review', 'done'] as const).map((s) => (
              <button
                key={s}
                onClick={() => { onChange(s); setOpen(false) }}
                className={cn(
                  'flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-accent',
                  status === s && 'bg-accent',
                )}
              >
                <span className={cn('size-2 rounded-full', STATUS_DOTS[s])} />
                {STATUS_LABELS[s]}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function DeleteTaskButton({ taskId, onDeleted }: { taskId: string; onDeleted: () => void }) {
  const [showConfirm, setShowConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    setDeleting(true)
    try {
      const res = await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' })
      if (res.ok) onDeleted()
    } catch (err) {
      console.error('Failed to delete task:', err)
    } finally {
      setDeleting(false)
      setShowConfirm(false)
    }
  }

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => setShowConfirm(true)}
        className="text-muted-foreground hover:text-destructive"
      >
        <Trash2 className="size-4" />
      </Button>
      {showConfirm && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowConfirm(false)} />
          <div className="absolute right-0 top-full z-50 mt-1 w-52 overflow-hidden rounded-md border bg-popover p-3 shadow-lg">
            <p className="text-xs font-medium">Delete this task?</p>
            <p className="mt-1 text-[11px] text-muted-foreground">Task, thread, and session will be removed.</p>
            <div className="mt-2.5 flex justify-end gap-1.5">
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowConfirm(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                variant="destructive"
                className="h-7 text-xs"
                disabled={deleting}
                onClick={handleDelete}
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export function TaskDetailPane({
  taskId,
  onBack,
  highlightMessageId,
}: {
  taskId: string
  onBack: () => void
  highlightMessageId?: string | null
}) {
  const [task, setTask] = useState<Task | null>(null)
  const [replies, setReplies] = useState<MessagePayload[]>([])
  const [routingAgent, setRoutingAgent] = useState<string | null>(null)
  const [editorKey, setEditorKey] = useState(0)
  const [glowingId, setGlowingId] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)
  const [loading, setLoading] = useState(true)
  const { socket, isConnected } = useSocket()
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const socketMsgIds = useRef(new Set<string>())
  const hasScrolledInitial = useRef(false)

  const scrollToBottom = useCallback((instant?: boolean) => {
    const el = scrollContainerRef.current
    if (!el) return
    if (instant) {
      el.scrollTop = el.scrollHeight
    } else {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    }
  }, [])

  // Fetch task detail
  useEffect(() => {
    setLoading(true)
    fetch(`/api/tasks/${taskId}`)
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        setTask(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [taskId])

  // Fetch thread replies
  useEffect(() => {
    if (!task) return
    socketMsgIds.current.clear()
    hasScrolledInitial.current = false
    setRoutingAgent(null)

    fetch(`/api/messages?thread_id=${task.message_id}`)
      .then((res) => res.ok ? res.json() : [])
      .then((data) => setReplies(Array.isArray(data) ? data : []))
      .catch(() => setReplies([]))
  }, [task?.message_id])

  // Socket subscriptions for real-time updates
  useEffect(() => {
    if (!isConnected || !task) return
    socket.emit('thread:join', task.message_id)

    const handleNewMessage = (message: MessagePayload) => {
      if (message.threadId === task.message_id) {
        if (socketMsgIds.current.has(message.id)) return
        socketMsgIds.current.add(message.id)
        if (message.senderType === 'agent') setRoutingAgent(null)
        setReplies((prev) => [...prev, message])
      }
    }

    const handleRouting = (data: { threadId: string | null; agentName: string }) => {
      if (data.threadId === task.message_id) setRoutingAgent(data.agentName)
    }

    const handleTaskUpdated = (updated: Task & { channel_id: string }) => {
      if (updated.id === taskId) {
        setTask((prev) => prev ? { ...prev, ...updated } : prev)
      }
    }

    socket.on('message:new', handleNewMessage)
    socket.on('agent:routing', handleRouting)
    socket.on('task:updated', handleTaskUpdated)

    return () => {
      socket.emit('thread:leave', task.message_id)
      socket.off('message:new', handleNewMessage)
      socket.off('agent:routing', handleRouting)
      socket.off('task:updated', handleTaskUpdated)
    }
  }, [task?.message_id, isConnected, socket, taskId])

  // Scroll to and highlight a specific message (from notification click)
  useEffect(() => {
    if (!highlightMessageId || replies.length === 0) return
    const el = document.getElementById(`msg-${highlightMessageId}`)
    if (el) {
      requestAnimationFrame(() => {
        el.scrollIntoView({ behavior: 'instant', block: 'center' })
        setGlowingId(highlightMessageId)
        setTimeout(() => setGlowingId(null), 3000)
      })
    }
  }, [highlightMessageId, replies])

  // Scroll management
  useEffect(() => {
    if (replies.length === 0) return
    if (highlightMessageId) return // skip auto-scroll when highlighting
    if (!hasScrolledInitial.current) {
      hasScrolledInitial.current = true
      requestAnimationFrame(() => scrollToBottom(true))
    } else {
      scrollToBottom()
    }
  }, [replies, routingAgent, scrollToBottom])

  const handleSubmit = useCallback(async (plainText: string) => {
    if (!task) return
    setIsPending(true)
    try {
      await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel_id: task.channel_id,
          content: plainText,
          thread_id: task.message_id,
        }),
      })
      setEditorKey((prev) => prev + 1)
    } catch (error) {
      console.error('Failed to send reply:', error)
    } finally {
      setIsPending(false)
    }
  }, [task])

  const handleStatusChange = async (newStatus: string) => {
    if (!task) return
    try {
      await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      setTask((prev) => prev ? { ...prev, status: newStatus as Task['status'] } : prev)
    } catch (err) {
      console.error('Failed to update status:', err)
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="size-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
      </div>
    )
  }

  if (!task) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Task not found
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b px-4 py-3">
        <Button variant="ghost" size="icon-sm" onClick={onBack}>
          <ArrowLeft className="size-4" />
        </Button>
        <div className="flex flex-1 items-center gap-3 min-w-0">
          <span className="text-sm font-mono text-muted-foreground">#{task.task_number}</span>
          <h1 className="truncate text-lg font-bold">{task.title}</h1>
        </div>
        <DeleteTaskButton taskId={task.id} onDeleted={onBack} />
        <Button variant="ghost" size="icon-sm" onClick={onBack}>
          <X className="size-4" />
        </Button>
      </div>

      {/* Task meta bar */}
      <div className="flex flex-wrap items-center gap-4 border-b px-4 py-2.5">
        <TaskStatusDropdown status={task.status} onChange={handleStatusChange} />

        <div className="flex items-center gap-1.5 text-sm">
          <span className="text-muted-foreground">Assignee</span>
          {task.claimed_by_name ? (
            <span className="flex items-center gap-1 font-medium">
              {task.claimed_by_type === 'agent' ? <Bot className="size-3.5" /> : <User className="size-3.5" />}
              {task.claimed_by_name}
            </span>
          ) : (
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">Unassigned</span>
              <AssignAgentDropdown
                taskId={task.id}
                channelId={task.channel_id}
                currentAgentId={task.claimed_by_id}
                onAssigned={() => {
                  fetch(`/api/tasks/${task.id}`)
                    .then((r) => r.ok ? r.json() : null)
                    .then((data) => { if (data) setTask(data) })
                    .catch(() => {})
                }}
              />
            </div>
          )}
        </div>

        {task.group_summary && (
          <div className="flex items-center gap-1.5 text-sm">
            <GitBranch className="size-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">{task.group_summary}</span>
          </div>
        )}
      </div>

      {/* Task body */}
      {task.body && (
        <div className="border-b px-4 py-3">
          <p className="whitespace-pre-wrap text-sm text-foreground/80">{task.body}</p>
        </div>
      )}

      {/* Discussion */}
      <div ref={scrollContainerRef} className="messages-scrollbar flex flex-1 flex-col overflow-y-auto">
        {replies.length === 0 && !routingAgent && (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            No discussion yet. Send a message to start.
          </div>
        )}

        {replies.map((reply) => (
          <div
            key={reply.id}
            id={`msg-${reply.id}`}
            className={cn(
              'transition-colors duration-1000',
              glowingId === reply.id && 'animate-glow-fade bg-primary/20 ring-1 ring-primary/40 rounded-md',
            )}
          >
            <Message
              id={reply.id}
              senderType={reply.senderType}
              senderId={reply.senderId}
              authorName={reply.sender_name}
              authorImage={reply.sender_avatar}
              body={reply.content}
              createdAt={reply.createdAt}
              hideThreadButton
            />
          </div>
        ))}

        {routingAgent && (
          <div className="flex items-center gap-2 px-5 py-1">
            <div className="flex gap-1">
              <span className="h-2 w-2 animate-bounce rounded-full bg-primary [animation-delay:0ms]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-primary [animation-delay:150ms]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-primary [animation-delay:300ms]" />
            </div>
            <span className="animate-pulse text-sm text-muted-foreground">
              Routing to <span className="font-medium text-primary">@{routingAgent}</span>...
            </span>
          </div>
        )}
      </div>

      {/* Reply editor */}
      <div className="border-t px-4 py-3">
        <EditorWithMentions
          channelId={task.channel_id ?? ''}
          editorKey={editorKey}
          disabled={isPending}
          onSubmit={handleSubmit}
          placeholder="Discuss this task..."
        />
      </div>
    </div>
  )
}
