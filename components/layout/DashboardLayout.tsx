'use client'

import { useState, useEffect } from 'react'
import { Sidebar } from './Sidebar'
import { MainPane } from './MainPane'
import type { Channel } from '@/types'

export function DashboardLayout() {
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null)
  const [channels, setChannels] = useState<Channel[]>([])

  useEffect(() => {
    fetch('/api/channels')
      .then((res) => res.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : []
        setChannels(list)
        if (list.length > 0 && !activeChannelId) {
          setActiveChannelId(list[0].id)
        }
      })
      .catch(console.error)
  }, [])

  return (
    <div className="flex h-full overflow-hidden">
      <div className="w-60 shrink-0">
        <Sidebar
          activeChannelId={activeChannelId}
          onChannelSelect={setActiveChannelId}
          channels={channels}
        />
      </div>
      <div className="flex-1 min-w-0">
        <MainPane channelId={activeChannelId} channels={channels} />
      </div>
    </div>
  )
}
