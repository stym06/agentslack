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
}

const STATUS_COLORS: Record<string, string> = {
  todo: 'bg-gray-100 text-gray-700',
  in_progress: 'bg-blue-100 text-blue-700',
  in_review: 'bg-yellow-100 text-yellow-700',
  done: 'bg-green-100 text-green-700',
}

const formatFullTime = (date: Date) => {
  return `${isToday(date) ? 'Today' : isYesterday(date) ? 'Yesterday' : format(date, 'MMM d, yyyy')} at ${format(date, 'h:mm:ss a')}`
}

export const Message = ({
  id,
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
}: MessageProps) => {
  const avatarFallback = authorName.charAt(0).toUpperCase()
  const dateObj = new Date(createdAt)
  const { openAgentProfile } = useAgentProfile()

  const handleAuthorClick = () => {
    if (senderType === 'agent' && senderId) {
      openAgentProfile(senderId)
    }
  }

  // System messages (task events) render as centered muted text
  if (isSystem) {
    return (
      <div className="flex items-center justify-center py-1">
        <span className="text-xs text-muted-foreground">{body}</span>
      </div>
    )
  }

  if (isCompact) {
    return (
      <div className="group relative flex flex-col gap-2 p-1.5 px-5 hover:bg-gray-100/60">
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
                    STATUS_COLORS[task.status] || 'bg-gray-100 text-gray-700',
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
            <ThreadBar
              count={threadCount}
              image={threadImage}
              name={threadName}
              timestamp={threadTimestamp}
              onClick={() => onOpenThread?.(id)}
            />
          </div>
        </div>

        {!hideThreadButton && (
          <MessageToolbar
            isPending={false}
            handleThread={() => onOpenThread?.(id)}
            handleReaction={() => {}}
            hideThreadButton={hideThreadButton}
          />
        )}
      </div>
    )
  }

  return (
    <div className="group relative flex flex-col gap-2 p-1.5 px-5 hover:bg-gray-100/60">
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
                  STATUS_COLORS[task.status] || 'bg-gray-100 text-gray-700',
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
          <ThreadBar
            count={threadCount}
            image={threadImage}
            name={threadName}
            timestamp={threadTimestamp}
            onClick={() => onOpenThread?.(id)}
          />
        </div>
      </div>

      {!hideThreadButton && (
        <MessageToolbar
          isPending={false}
          handleThread={() => onOpenThread?.(id)}
          handleReaction={() => {}}
          hideThreadButton={hideThreadButton}
        />
      )}
    </div>
  )
}
