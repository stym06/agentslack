'use client'

import { useState } from 'react'
import { MessageSquare, ListTodo, Users } from 'lucide-react'
import { ChannelHeader } from '@/components/messages/ChannelHeader'
import { MessageList } from '@/components/messages/MessageList'
import { MessageInput } from '@/components/messages/MessageInput'
import { ThreadPanel } from '@/components/threads/ThreadPanel'
import { TaskList } from '@/components/tasks/TaskList'
import { ChannelAgentsPanel } from '@/components/channels/ChannelAgentsPanel'
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
  const [activeTab, setActiveTab] = useState<'chat' | 'tasks' | 'agents'>('chat')

  const showThread = !!openThreadId

  const handleOpenTask = (messageId: string) => {
    setActiveTab('tasks')
    setOpenThreadId(messageId)
  }

  const tabs = [
    { key: 'chat' as const, label: 'Chat', icon: MessageSquare },
    { key: 'tasks' as const, label: 'Tasks', icon: ListTodo },
    { key: 'agents' as const, label: 'Agents', icon: Users },
  ]

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
              {tabs.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  className={cn(
                    'flex cursor-pointer items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors',
                    activeTab === key
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </div>
          )}

          {/* Content */}
          {activeTab === 'chat' ? (
            <>
              <MessageList channelId={channelId} onOpenThread={setOpenThreadId} />
              <MessageInput channelId={channelId} />
            </>
          ) : activeTab === 'tasks' && channelId ? (
            <TaskList channelId={channelId} onOpenTask={handleOpenTask} />
          ) : activeTab === 'agents' && channelId ? (
            <ChannelAgentsPanel channelId={channelId} />
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
