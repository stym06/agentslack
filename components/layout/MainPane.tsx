'use client'

import { useState, useEffect } from 'react'
import { useSocket } from '@/lib/socket/useSocket'
import { ChannelHeader } from '@/components/messages/ChannelHeader'
import { MessageList } from '@/components/messages/MessageList'
import { MessageInput } from '@/components/messages/MessageInput'
import { ThreadPanel } from '@/components/threads/ThreadPanel'
import { useAgentProfile } from '@/components/agents/AgentProfileContext'
import type { Channel } from '@/types'

export function MainPane({
  channelId,
  channels,
}: {
  channelId: string | null
  channels: Channel[]
}) {
  const activeChannel = channels.find((c) => c.id === channelId)
  const { closeAgentProfile } = useAgentProfile()
  const [openThreadId, setOpenThreadId] = useState<string | null>(null)
  const { socket } = useSocket()

  // Join channel room at this level so all tabs receive socket events
  useEffect(() => {
    if (!socket || !channelId) return
    socket.emit('channel:join', channelId)
    return () => {
      socket.emit('channel:leave', channelId)
    }
  }, [socket, channelId])

  const showThread = !!openThreadId

  const handleOpenThread = (threadId: string) => {
    setOpenThreadId(threadId)
    closeAgentProfile()
  }

  return (
    <div className="flex h-full">
      <div className={showThread ? 'flex-1 min-w-0' : 'w-full'}>
        <div className="flex h-full flex-col">
          {activeChannel && (
            <ChannelHeader channelName={activeChannel.name} channelId={activeChannel.id} />
          )}
          <MessageList channelId={channelId} onOpenThread={handleOpenThread} />
          <MessageInput channelId={channelId} />
        </div>
      </div>

      {showThread && channelId && (
        <>
          <div
            className="w-1 shrink-0 cursor-col-resize bg-border hover:bg-primary/20 active:bg-primary/30 transition-colors"
            onMouseDown={(e) => {
              e.preventDefault()
              const startX = e.clientX
              const panel = (e.target as HTMLElement).nextElementSibling as HTMLElement
              const startWidth = panel.offsetWidth

              const onMouseMove = (moveEvent: MouseEvent) => {
                const delta = startX - moveEvent.clientX
                const newWidth = Math.max(300, Math.min(800, startWidth + delta))
                panel.style.width = `${newWidth}px`
              }

              const onMouseUp = () => {
                document.removeEventListener('mousemove', onMouseMove)
                document.removeEventListener('mouseup', onMouseUp)
              }

              document.addEventListener('mousemove', onMouseMove)
              document.addEventListener('mouseup', onMouseUp)
            }}
          />
          <div className="w-[400px] shrink-0 overflow-hidden">
            <ThreadPanel
              threadId={openThreadId!}
              channelId={channelId}
              onClose={() => setOpenThreadId(null)}
            />
          </div>
        </>
      )}
    </div>
  )
}
