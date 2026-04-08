'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { XIcon } from 'lucide-react'
import { useSocket } from '@/lib/socket/useSocket'
import { Button } from '@/components/ui/button'
import { Message } from '@/components/message'
import { Separator } from '@/components/ui/separator'
import { EditorWithMentions } from '@/components/editor-with-mentions'

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

export function ThreadPanel({
  threadId,
  channelId,
  onClose,
}: {
  threadId: string
  channelId: string
  onClose: () => void
}) {
  const [parentMessage, setParentMessage] = useState<MessagePayload | null>(null)
  const [replies, setReplies] = useState<MessagePayload[]>([])
  const [routingAgent, setRoutingAgent] = useState<string | null>(null)
  const [editorKey, setEditorKey] = useState(0)
  const [isPending, setIsPending] = useState(false)
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

  useEffect(() => {
    fetch(`/api/messages/${threadId}`)
      .then((res) => res.json())
      .then(setParentMessage)
      .catch(console.error)
  }, [threadId])

  useEffect(() => {
    socketMsgIds.current.clear()
    hasScrolledInitial.current = false
    setRoutingAgent(null)
    fetch(`/api/messages?thread_id=${threadId}`)
      .then(async (res) => {
        if (!res.ok) {
          console.error('Thread fetch failed:', res.status, await res.text())
          return []
        }
        return res.json()
      })
      .then((data) => setReplies(Array.isArray(data) ? data : []))
      .catch((err) => {
        console.error('Thread fetch error:', err)
        setReplies([])
      })
  }, [threadId])

  useEffect(() => {
    if (!isConnected) return
    socket.emit('thread:join', threadId)

    const handleNewMessage = (message: MessagePayload) => {
      if (message.threadId === threadId) {
        if (socketMsgIds.current.has(message.id)) return
        socketMsgIds.current.add(message.id)
        if (message.senderType === 'agent') setRoutingAgent(null)
        setReplies((prev) => [...prev, message])
      }
    }

    const handleRouting = (data: {
      channelId: string
      threadId: string | null
      agentName: string
    }) => {
      if (data.threadId === threadId) setRoutingAgent(data.agentName)
    }

    socket.on('message:new', handleNewMessage)
    socket.on('agent:routing', handleRouting)

    return () => {
      socket.emit('thread:leave', threadId)
      socket.off('message:new', handleNewMessage)
      socket.off('agent:routing', handleRouting)
    }
  }, [threadId, isConnected, socket])

  useEffect(() => {
    if (replies.length === 0) return
    if (!hasScrolledInitial.current) {
      hasScrolledInitial.current = true
      // Use rAF to ensure DOM has rendered before scrolling
      requestAnimationFrame(() => scrollToBottom(true))
    } else {
      scrollToBottom()
    }
  }, [replies, routingAgent, scrollToBottom])

  const handleSubmit = useCallback(async (plainText: string) => {
    setIsPending(true)
    try {
      await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel_id: channelId,
          content: plainText,
          thread_id: threadId,
        }),
      })
      setEditorKey((prev) => prev + 1)
    } catch (error) {
      console.error('Failed to send reply:', error)
    } finally {
      setIsPending(false)
    }
  }, [channelId, threadId])

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-[49px] items-center justify-between border-b px-4">
        <p className="text-lg font-bold">Thread</p>
        <Button onClick={onClose} size="icon-sm" variant="ghost">
          <XIcon className="size-5 stroke-[1.5]" />
        </Button>
      </div>

      {/* Parent message */}
      {parentMessage && (
        <>
          <Message
            id={parentMessage.id}
            channelId={channelId}
            senderType={parentMessage.senderType}
            senderId={parentMessage.senderId}
            authorName={parentMessage.sender_name}
            authorImage={parentMessage.sender_avatar}
            body={parentMessage.content}
            createdAt={parentMessage.createdAt}
            hideThreadButton
          />
          <Separator />
          {replies.length > 0 && (
            <>
              <div className="px-4 py-2 text-xs text-muted-foreground">
                {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
              </div>
              <Separator />
            </>
          )}
        </>
      )}

      {/* Replies */}
      <div ref={scrollContainerRef} className="messages-scrollbar flex flex-1 flex-col overflow-y-auto pb-4">
        {replies.map((reply) => (
          <Message
            key={reply.id}
            id={reply.id}
            channelId={channelId}
            senderType={reply.senderType}
            senderId={reply.senderId}
            authorName={reply.sender_name}
            authorImage={reply.sender_avatar}
            body={reply.content}
            createdAt={reply.createdAt}
            hideThreadButton
          />
        ))}

        {routingAgent && (
          <div className="flex items-center gap-2 px-5 py-1">
            <div className="flex gap-1">
              <span className="h-2 w-2 animate-bounce rounded-full bg-purple-400 [animation-delay:0ms]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-purple-400 [animation-delay:150ms]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-purple-400 [animation-delay:300ms]" />
            </div>
            <span className="animate-pulse text-sm text-muted-foreground">
              Routing to <span className="font-medium text-purple-600">@{routingAgent}</span>...
            </span>
          </div>
        )}

        <div />
      </div>

      {/* Reply editor */}
      <div className="px-4 pb-4">
        <EditorWithMentions
          channelId={channelId}
          editorKey={editorKey}
          disabled={isPending}
          onSubmit={handleSubmit}
          placeholder="Reply..."
        />
      </div>
    </div>
  )
}
