'use client'

import { useState } from 'react'
import { MessageSquare, ListTodo } from 'lucide-react'
import { ChannelHeader } from '@/components/messages/ChannelHeader'
import { MessageList } from '@/components/messages/MessageList'
import { MessageInput } from '@/components/messages/MessageInput'
import { ThreadPanel } from '@/components/threads/ThreadPanel'
import { TaskList } from '@/components/tasks/TaskList'
import { cn } from '@/lib/utils'
import type { Channel } from '@/types'

export function MainPane({
  channelId,
  channels,
}: {
  channelId: string | null
  channels: Channel[]
}) {
  const activeChannel = channels.find((c) => c.id === channelId)
  const [openThreadId, setOpenThreadId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'chat' | 'tasks'>('chat')

  const showThread = !!openThreadId

  const handleOpenTask = (messageId: string) => {
    setActiveTab('tasks')
    setOpenThreadId(messageId)
  }

  return (
    <div className="flex h-full">
      <div className={showThread ? 'flex-1 min-w-0' : 'w-full'}>
        <div className="flex h-full flex-col">
          {activeChannel && (
            <ChannelHeader channelName={activeChannel.name} channelId={activeChannel.id} />
          )}

          {/* Tab toggle */}
          {channelId && (
            <div className="flex items-center gap-1 border-b px-4">
              <button
                onClick={() => setActiveTab('chat')}
                className={cn(
                  'flex cursor-pointer items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors',
                  activeTab === 'chat'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                <MessageSquare className="h-4 w-4" />
                Chat
              </button>
              <button
                onClick={() => setActiveTab('tasks')}
                className={cn(
                  'flex cursor-pointer items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors',
                  activeTab === 'tasks'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                <ListTodo className="h-4 w-4" />
                Tasks
              </button>
            </div>
          )}

          {/* Content */}
          {activeTab === 'chat' ? (
            <>
              <MessageList channelId={channelId} onOpenThread={setOpenThreadId} />
              <MessageInput channelId={channelId} />
            </>
          ) : channelId ? (
            <TaskList channelId={channelId} onOpenTask={handleOpenTask} />
          ) : null}
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
