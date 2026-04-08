'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Sidebar, type ActiveView } from './Sidebar'
import { MainPane } from './MainPane'
import { GlobalTasksPane } from './GlobalTasksPane'
import { GlobalProjectsPane } from './GlobalProjectsPane'
import { NotificationsPane } from './NotificationsPane'
import { TaskDetailPane } from '@/components/tasks/TaskDetailPane'
import { AgentProfilePanel } from '@/components/agents/AgentProfilePanel'
import { AgentProfileProvider } from '@/components/agents/AgentProfileContext'
import { useSocket } from '@/lib/socket/useSocket'
import type { Agent, Channel } from '@/types'

export type Notification = {
  id: string
  type: 'agent_reply' | 'task_update'
  title: string
  body: string
  timestamp: Date
  read: boolean
  taskId?: string
  channelId?: string
  threadId?: string
  messageId?: string
}

// Read view state from URL search params
function useViewState() {
  const searchParams = useSearchParams()
  const router = useRouter()

  const view = (searchParams.get('view') as ActiveView) || 'channel'
  const channelId = searchParams.get('channel') || null
  const taskId = searchParams.get('task') || null
  const highlightMessageId = searchParams.get('highlight') || null

  const navigate = useCallback((params: { view?: ActiveView; channel?: string | null; task?: string | null; highlight?: string | null }) => {
    const sp = new URLSearchParams()
    const v = params.view ?? view
    const ch = params.channel !== undefined ? params.channel : channelId
    const t = params.task !== undefined ? params.task : taskId
    const h = params.highlight ?? null

    if (t) {
      sp.set('task', t)
      if (h) sp.set('highlight', h)
    } else {
      if (v !== 'channel') sp.set('view', v)
      if (ch) sp.set('channel', ch)
    }

    const qs = sp.toString()
    router.push(`/dashboard${qs ? `?${qs}` : ''}`)
  }, [router, view, channelId, taskId])

  return { view, channelId, taskId, highlightMessageId, navigate }
}

function playChime() {
  try {
    const audio = new Audio('/chime.wav')
    audio.volume = 0.5
    audio.play().catch(() => {})
  } catch {}
}

export function DashboardLayout() {
  const { view: activeView, channelId: activeChannelId, taskId: openTaskId, highlightMessageId, navigate } = useViewState()
  const [channels, setChannels] = useState<Channel[]>([])
  const [agents, setAgents] = useState<Agent[]>([])
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)
  const [notifications, setNotifications] = useState<Notification[]>(() => {
    if (typeof window === 'undefined') return []
    try {
      const stored = localStorage.getItem('agentslack:notifications')
      if (!stored) return []
      return JSON.parse(stored).map((n: any) => ({ ...n, timestamp: new Date(n.timestamp) }))
    } catch { return [] }
  })

  // Persist to localStorage on change
  useEffect(() => {
    try {
      localStorage.setItem('agentslack:notifications', JSON.stringify(notifications))
    } catch {}
  }, [notifications])
  const { socket, isConnected } = useSocket()

  // Set default channel on first load
  useEffect(() => {
    fetch('/api/channels')
      .then((res) => res.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : []
        setChannels(list)
        if (list.length > 0 && !activeChannelId && activeView === 'channel' && !openTaskId) {
          navigate({ channel: list[0].id })
        }
      })
      .catch(console.error)
  }, [])

  useEffect(() => {
    fetch('/api/agents')
      .then((res) => res.ok ? res.json() : [])
      .then((data) => setAgents(Array.isArray(data) ? data : []))
      .catch(() => setAgents([]))
  }, [])

  // Join all channel rooms for global notification listening
  useEffect(() => {
    if (!isConnected || channels.length === 0) return
    for (const ch of channels) {
      socket.emit('channel:join', ch.id)
    }
    return () => {
      for (const ch of channels) {
        socket.emit('channel:leave', ch.id)
      }
    }
  }, [isConnected, socket, channels])

  // Listen for agent messages and task updates globally
  useEffect(() => {
    if (!isConnected) return

    const handleNewMessage = (msg: any) => {
      const senderType = msg.senderType ?? msg.sender_type
      if (senderType !== 'agent') return
      const metadata = msg.metadata as Record<string, unknown> | null
      if (metadata?.system) return

      const threadId = msg.threadId ?? msg.thread_id
      const msgChannelId = msg.channelId ?? msg.channel_id

      const notif: Notification = {
        id: `msg-${msg.id}`,
        type: 'agent_reply',
        read: false,
        title: msg.sender_name ?? 'Agent',
        body: (msg.content ?? '').length > 80 ? msg.content.slice(0, 80) + '...' : msg.content,
        timestamp: new Date(msg.createdAt ?? msg.created_at ?? Date.now()),
        channelId: msgChannelId,
        threadId: threadId ?? msg.id,
        messageId: msg.id,
      }
      setNotifications((prev) => [notif, ...prev].slice(0, 50))
      playChime()

      // If this is a reply in a task thread, look up the task ID asynchronously
      if (threadId) {
        fetch(`/api/tasks?status=all`)
          .then((res) => res.ok ? res.json() : null)
          .then((data) => {
            const task = data?.tasks?.find((t: any) => (t.message_id ?? t.messageId) === threadId)
            if (task) {
              setNotifications((prev) =>
                prev.map((n) => n.id === notif.id ? { ...n, taskId: task.id } : n)
              )
            }
          })
          .catch(() => {})
      }
    }

    const handleTaskUpdate = (task: any) => {
      const claimedByType = task.claimed_by_type ?? task.claimedByType
      if (claimedByType !== 'agent') return

      const taskNumber = task.task_number ?? task.taskNumber
      const channelId = task.channel_id ?? task.channelId
      const claimedByName = task.claimed_by_name ?? task.claimedByName
      const notif: Notification = {
        id: `task-${task.id}-${Date.now()}`,
        type: 'task_update',
        read: false,
        title: `#${taskNumber} ${task.title}`,
        body: `Moved to ${(task.status ?? '').replace('_', ' ')}${claimedByName ? ` by @${claimedByName}` : ''}`,
        timestamp: new Date(),
        taskId: task.id,
        channelId,
      }
      setNotifications((prev) => [notif, ...prev].slice(0, 50))
      playChime()
    }

    socket.on('message:new', handleNewMessage as any)
    socket.on('task:updated', handleTaskUpdate as any)

    return () => {
      socket.off('message:new', handleNewMessage as any)
      socket.off('task:updated', handleTaskUpdate as any)
    }
  }, [isConnected, socket])

  const openAgentProfileByName = useCallback((name: string) => {
    const agent = agents.find((a) => a.name.toLowerCase() === name.toLowerCase())
    if (agent) setSelectedAgentId(agent.id)
  }, [agents])

  const profileContext = useMemo(() => ({
    openAgentProfile: (agentId: string) => setSelectedAgentId(agentId),
    openAgentProfileByName,
    closeAgentProfile: () => setSelectedAgentId(null),
  }), [openAgentProfileByName])

  const handleChannelSelect = useCallback((id: string) => {
    navigate({ view: 'channel', channel: id, task: null })
  }, [navigate])

  const handleOpenTask = useCallback((taskId: string) => {
    navigate({ task: taskId })
    setSelectedAgentId(null)
  }, [navigate])

  const handleTaskBack = useCallback(() => {
    navigate({ task: null, view: 'tasks' })
  }, [navigate])

  const handleNotificationClick = useCallback((notif: Notification) => {
    setNotifications((prev) => prev.map((n) => n.id === notif.id ? { ...n, read: true } : n))
    if (notif.taskId) {
      navigate({ task: notif.taskId, highlight: notif.messageId ?? null })
    } else if (notif.channelId) {
      navigate({ view: 'channel', channel: notif.channelId, task: null })
    }
  }, [navigate])

  const handleClearNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id))
  }, [])

  return (
    <AgentProfileProvider value={profileContext}>
      <div className="flex h-full overflow-hidden">
        <div className="w-60 shrink-0">
          <Sidebar
            activeChannelId={activeChannelId}
            activeView={openTaskId ? 'tasks' : activeView}
            onChannelSelect={handleChannelSelect}
            onViewSelect={(v) => navigate({ view: v, task: null })}
            onAgentSelect={(id) => {
              setSelectedAgentId((prev) => prev === id ? null : id)
              if (openTaskId) navigate({ task: null, view: activeView })
            }}
            channels={channels}
            agents={agents}
            onAgentsChange={setAgents}
            notifications={notifications}
          />
        </div>
        <div className="flex-1 min-w-0">
          {openTaskId ? (
            <TaskDetailPane taskId={openTaskId} onBack={handleTaskBack} highlightMessageId={highlightMessageId} />
          ) : activeView === 'tasks' ? (
            <GlobalTasksPane onOpenTask={handleOpenTask} />
          ) : activeView === 'projects' ? (
            <GlobalProjectsPane />
          ) : activeView === 'notifications' ? (
            <NotificationsPane
              notifications={notifications}
              onNotificationClick={handleNotificationClick}
              onClearNotification={handleClearNotification}
            />
          ) : (
            <MainPane channelId={activeChannelId} channels={channels} onOpenTaskDetail={handleOpenTask} />
          )}
        </div>
        {selectedAgentId && (
          <>
            <div className="w-px shrink-0 bg-border" />
            <div className="w-[340px] shrink-0 overflow-hidden">
              <AgentProfilePanel
                agentId={selectedAgentId}
                onClose={() => setSelectedAgentId(null)}
              />
            </div>
          </>
        )}
      </div>
    </AgentProfileProvider>
  )
}
