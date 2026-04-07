'use client'

import { useEffect, useState, useRef } from 'react'
import { differenceInMinutes, format, isToday, isYesterday } from 'date-fns'
import { useSocket } from '@/lib/socket/useSocket'
import { Message } from '@/components/message'

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
  task?: {
    taskNumber: number
    status: string
    title: string
    claimedByType?: string | null
    claimedById?: string | null
  } | null
}

const TIME_THRESHOLD = 5

const formatDateLabel = (dateStr: string) => {
  const date = new Date(dateStr)
  if (isToday(date)) return 'Today'
  if (isYesterday(date)) return 'Yesterday'
  return format(date, 'EEEE, MMMM d')
}

export function MessageList({
  channelId,
  onOpenThread,
}: {
  channelId: string | null
  onOpenThread?: (messageId: string) => void
}) {
  const [messages, setMessages] = useState<MessagePayload[]>([])
  const [typingAgents, setTypingAgents] = useState<Map<string, string>>(new Map())
  const { socket, isConnected } = useSocket()
  const socketMsgIds = useRef(new Set<string>())
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!channelId) {
      setMessages([])
      setTypingAgents(new Map())
      return
    }
    socketMsgIds.current.clear()
    setTypingAgents(new Map())
    fetch(`/api/messages?channel_id=${channelId}`)
      .then(async (res) => {
        if (!res.ok) {
          console.error('Messages fetch failed:', res.status, await res.text())
          return []
        }
        return res.json()
      })
      .then((data) => {
        const msgs = Array.isArray(data) ? data : []
        console.log(`Fetched ${msgs.length} messages for channel ${channelId}`)
        setMessages(msgs)
      })
      .catch((err) => {
        console.error('Messages fetch error:', err)
        setMessages([])
      })
  }, [channelId])

  useEffect(() => {
    if (!channelId || !isConnected) return

    const handleNewMessage = (message: MessagePayload) => {
      if (message.channelId === channelId && !message.threadId) {
        if (socketMsgIds.current.has(message.id)) return
        // Skip task messages — they only appear on the Tasks tab
        const metadata = message.metadata as Record<string, unknown> | null
        if (metadata?.isTask) return
        socketMsgIds.current.add(message.id)
        setMessages((prev) => [...prev, message])
      }
      // Clear typing indicator when agent sends a message
      if (message.senderType === 'agent') {
        setTypingAgents((prev) => {
          const next = new Map(prev)
          next.delete(message.senderId)
          return next
        })
      }
    }

    const handleReplyCount = (data: { message_id: string; reply_count: number }) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === data.message_id ? { ...m, replyCount: data.reply_count } : m,
        ),
      )
    }

    const handleRouting = (data: { channelId: string; threadId: string | null; agentId: string; agentName: string }) => {
      if (data.channelId === channelId && !data.threadId) {
        setTypingAgents((prev) => new Map(prev).set(data.agentId, data.agentName))
      }
    }

    socket.on('message:new', handleNewMessage)
    socket.on('message:reply_count', handleReplyCount)
    socket.on('agent:routing', handleRouting)

    return () => {
      socket.off('message:new', handleNewMessage)
      socket.off('message:reply_count', handleReplyCount)
      socket.off('agent:routing', handleRouting)
    }
  }, [channelId, isConnected, socket])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, typingAgents])

  if (!channelId) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted-foreground">
        Select a channel to start
      </div>
    )
  }

  // Group messages by date
  const grouped = messages.reduce(
    (groups, msg) => {
      const dateKey = format(new Date(msg.createdAt), 'yyyy-MM-dd')
      if (!groups[dateKey]) groups[dateKey] = []
      groups[dateKey].push(msg)
      return groups
    },
    {} as Record<string, MessagePayload[]>,
  )

  return (
    <div ref={scrollRef} className="messages-scrollbar flex flex-1 flex-col overflow-y-auto pb-4">
      <div className="mt-auto" />
      {Object.entries(grouped).map(([dateKey, msgs]) => (
        <div key={dateKey}>
          <div className="relative my-2 text-center">
            <hr className="absolute left-0 right-0 top-1/2 border-t border-border" />
            <span className="relative inline-block rounded-full border border-border bg-card px-4 py-1 text-xs shadow-sm">
              {formatDateLabel(dateKey)}
            </span>
          </div>

          {msgs.map((msg, i) => {
            const prevMsg = msgs[i - 1]
            const isCompact =
              prevMsg &&
              prevMsg.senderId === msg.senderId &&
              differenceInMinutes(new Date(msg.createdAt), new Date(prevMsg.createdAt)) <
                TIME_THRESHOLD

            const isSystem =
              (msg.metadata as Record<string, unknown>)?.system === true

            return (
              <Message
                key={msg.id}
                id={msg.id}
                senderType={msg.senderType}
                senderId={msg.senderId}
                authorName={msg.sender_name}
                authorImage={msg.sender_avatar}
                body={msg.content}
                createdAt={msg.createdAt}
                isCompact={isCompact}
                threadCount={msg.replyCount}
                threadTimestamp={
                  msg.replyCount > 0 ? new Date(msg.createdAt).getTime() : undefined
                }
                onOpenThread={onOpenThread}
                task={
                  msg.task
                    ? {
                        task_number: msg.task.taskNumber,
                        status: msg.task.status,
                        title: msg.task.title,
                      }
                    : null
                }
                isSystem={isSystem}
                onOpenTaskByNumber={isSystem ? async (taskNumber: number) => {
                  try {
                    const res = await fetch(`/api/tasks?channel_id=${channelId}&status=all`)
                    if (!res.ok) return
                    const data = await res.json()
                    const task = data.tasks?.find((t: any) => t.task_number === taskNumber)
                    if (task?.message_id) onOpenThread?.(task.message_id)
                  } catch {}
                } : undefined}
              />
            )
          })}
        </div>
      ))}

      {typingAgents.size > 0 && (
        <div className="flex items-center gap-2 px-5 py-2">
          <div className="flex gap-1">
            <span className="h-2 w-2 animate-bounce rounded-full bg-purple-400 [animation-delay:0ms]" />
            <span className="h-2 w-2 animate-bounce rounded-full bg-purple-400 [animation-delay:150ms]" />
            <span className="h-2 w-2 animate-bounce rounded-full bg-purple-400 [animation-delay:300ms]" />
          </div>
          <span className="animate-pulse text-sm text-muted-foreground">
            <span className="font-medium text-purple-600">
              {[...typingAgents.values()].map((name) => `@${name}`).join(', ')}
            </span>
            {' '}is typing...
          </span>
        </div>
      )}
    </div>
  )
}
