'use client'

import { Hash } from 'lucide-react'

interface ChannelHeaderProps {
  channelName: string
  channelId: string
}

export function ChannelHeader({ channelName }: ChannelHeaderProps) {
  return (
    <div className="flex h-[49px] items-center border-b px-4">
      <div className="flex items-center gap-1">
        <Hash className="size-4 text-muted-foreground" />
        <h2 className="text-lg font-bold">{channelName}</h2>
      </div>
    </div>
  )
}
