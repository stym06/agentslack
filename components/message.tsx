'use client'

import { format, isToday, isYesterday } from 'date-fns'
import dynamic from 'next/dynamic'
import { Loader } from 'lucide-react'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import { useAgentProfile } from '@/components/agents/AgentProfileContext'

import { Hint } from './hint'
import { ThreadBar } from './thread-bar'
import { MessageToolbar } from './message-toolbar'
import { DirtyRepoActions, extractRepoPath } from './messages/DirtyRepoActions'

const Renderer = dynamic(() => import('./renderer'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center">
      <Loader className="size-6 animate-spin text-muted-foreground" />
    </div>
  ),
})

interface MessageProps {
  id: string
  channelId?: string
  senderType?: string
  senderId?: string
  authorName?: string
  authorImage?: string | null
  body: string
  createdAt: string | Date
  isCompact?: boolean
  hideThreadButton?: boolean
  threadCount?: number
  threadImage?: string
  threadName?: string
  threadTimestamp?: number
  onOpenThread?: (id: string) => void
  task?: {
    task_number: number
    status: string
    title: string
    claimed_by_name?: string | null
  } | null
  isSystem?: boolean
  onOpenTaskByNumber?: (taskNumber: number) => void
  onTaskCreated?: (task: any) => void
  onDelete?: (id: string) => void
}

const STATUS_COLORS: Record<string, string> = {
  todo: 'bg-muted text-muted-foreground',
  in_progress: 'bg-blue-500/15 text-blue-400',
  in_review: 'bg-yellow-500/15 text-yellow-400',
  done: 'bg-green-500/15 text-green-400',
}

const formatFullTime = (date: Date) => {
  return `${isToday(date) ? 'Today' : isYesterday(date) ? 'Yesterday' : format(date, 'MMM d, yyyy')} at ${format(date, 'h:mm:ss a')}`
}

export const Message = ({
  id,
  channelId,
  senderType,
  senderId,
  body,
  createdAt,
  authorName = 'Member',
  authorImage,
  isCompact,
  hideThreadButton,
  threadCount,
  threadImage,
  threadName,
  threadTimestamp,
  onOpenThread,
  task,
  isSystem,
  onOpenTaskByNumber,
  onTaskCreated,
  onDelete,
}: MessageProps) => {
  const avatarFallback = authorName.charAt(0).toUpperCase()
  const dateObj = new Date(createdAt)
  const { openAgentProfile } = useAgentProfile()

  const handleAuthorClick = () => {
    if (senderType === 'agent' && senderId) {
      openAgentProfile(senderId)
    }
  }

  const handleCreateTask = channelId ? async (projectId: string) => {
    try {
      // Generate title + body from message via agent
      const genRes = await fetch('/api/tasks/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: body }),
      })
      const { title: genTitle, body: genBody } = genRes.ok
        ? await genRes.json()
        : { title: body.replace(/@\w+/g, '').trim().slice(0, 100) || 'Untitled task', body: body }

      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel_id: channelId,
          project_id: projectId,
          message_id: id,
          title: genTitle,
          body: genBody,
        }),
      })
      if (res.ok) {
        const created = await res.json()
        onTaskCreated?.(created)
      }
    } catch (err) {
      console.error('Failed to create task:', err)
    }
  } : undefined

  const dirtyRepoPath = extractRepoPath(body)

  const handleDelete = onDelete ? async () => {
    try {
      const res = await fetch(`/api/messages/${id}`, { method: 'DELETE' })
      if (res.ok) onDelete(id)
    } catch (err) {
      console.error('Failed to delete message:', err)
    }
  } : undefined

  // System messages (task events) render as centered muted text
  if (isSystem) {
    // Parse #N references and make them clickable
    const parts = body.split(/(#\d+)/g)
    const hasTaskRef = parts.some((p) => /^#\d+$/.test(p))

    return (
      <div className="flex flex-col items-center py-1">
        <span className="text-xs text-muted-foreground">
          {hasTaskRef && onOpenTaskByNumber
            ? parts.map((part, i) => {
                const match = part.match(/^#(\d+)$/)
                if (match) {
                  const num = parseInt(match[1], 10)
                  return (
                    <button
                      key={i}
                      onClick={() => onOpenTaskByNumber(num)}
                      className="cursor-pointer font-semibold text-primary hover:underline"
                    >
                      {part}
                    </button>
                  )
                }
                return <span key={i}>{part}</span>
              })
            : body}
        </span>
        {dirtyRepoPath && <DirtyRepoActions repoPath={dirtyRepoPath} />}
      </div>
    )
  }

  if (isCompact) {
    return (
      <div className="group relative flex flex-col gap-2 p-1.5 px-5 hover:bg-muted/60">
        <div className="flex items-start gap-2">
          <Hint label={formatFullTime(dateObj)}>
            <button className="w-[40px] cursor-pointer text-center text-sm leading-[22px] text-muted-foreground opacity-0 hover:underline group-hover:opacity-100">
              {format(dateObj, 'hh:mm')}
            </button>
          </Hint>

          <div className="flex w-full flex-col">
            {task && (
              <div className="mb-1 flex items-center gap-1.5">
                <span className="text-xs font-mono text-muted-foreground">#{task.task_number}</span>
                <span
                  className={cn(
                    'rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                    STATUS_COLORS[task.status] || 'bg-muted text-muted-foreground',
                  )}
                >
                  {task.status.replace('_', ' ')}
                </span>
                {task.claimed_by_name && (
                  <span className="text-[10px] text-muted-foreground">@{task.claimed_by_name}</span>
                )}
              </div>
            )}
            <Renderer value={body} />
            {dirtyRepoPath && <DirtyRepoActions repoPath={dirtyRepoPath} />}
            <ThreadBar
              count={threadCount}
              image={threadImage}
              name={threadName}
              timestamp={threadTimestamp}
              onClick={() => onOpenThread?.(id)}
            />
          </div>
        </div>

        <MessageToolbar
          isPending={false}
          handleThread={() => onOpenThread?.(id)}

          hideThreadButton={hideThreadButton}
          onCreateTask={handleCreateTask}
          hasTask={!!task}
          onDelete={handleDelete}
        />
      </div>
    )
  }

  return (
    <div className="group relative flex flex-col gap-2 p-1.5 px-5 hover:bg-muted/60">
      <div className="flex items-start gap-2">
        <Avatar className="size-9 shrink-0">
          <AvatarImage alt={authorName} src={authorImage ?? undefined} />
          <AvatarFallback>{avatarFallback}</AvatarFallback>
        </Avatar>

        <div className="flex w-full flex-col overflow-hidden">
          <div className="text-sm">
            <button onClick={handleAuthorClick} className="cursor-pointer font-bold text-primary hover:underline">{authorName}</button>
            <span>&nbsp;&nbsp;</span>
            <Hint label={formatFullTime(dateObj)}>
              <button className="cursor-pointer text-xs text-muted-foreground hover:underline">
                {format(dateObj, 'h:mm a')}
              </button>
            </Hint>
          </div>

          {task && (
            <div className="mb-1 flex items-center gap-1.5">
              <span className="text-xs font-mono text-muted-foreground">#{task.task_number}</span>
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                  STATUS_COLORS[task.status] || 'bg-muted text-muted-foreground',
                )}
              >
                {task.status.replace('_', ' ')}
              </span>
              {task.claimed_by_name && (
                <span className="text-[10px] text-muted-foreground">@{task.claimed_by_name}</span>
              )}
            </div>
          )}

          <Renderer value={body} />
          {dirtyRepoPath && <DirtyRepoActions repoPath={dirtyRepoPath} />}
          <ThreadBar
            count={threadCount}
            image={threadImage}
            name={threadName}
            timestamp={threadTimestamp}
            onClick={() => onOpenThread?.(id)}
          />
        </div>
      </div>

      <MessageToolbar
        isPending={false}
        handleThread={() => onOpenThread?.(id)}
        handleReaction={() => {}}
        hideThreadButton={hideThreadButton}
        onCreateTask={handleCreateTask}
        hasTask={!!task}
        onDelete={handleDelete}
      />
    </div>
  )
}
