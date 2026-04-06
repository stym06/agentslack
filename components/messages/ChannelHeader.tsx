'use client'

import { useState } from 'react'
import { Hash, Settings, Users } from 'lucide-react'
import { ManageAgentsModal } from '@/components/channels/ManageAgentsModal'
import { Button } from '@/components/ui/button'
import { Hint } from '@/components/hint'

interface ChannelHeaderProps {
  channelName: string
  channelId: string
}

export function ChannelHeader({ channelName, channelId }: ChannelHeaderProps) {
  const [showManageModal, setShowManageModal] = useState(false)

  return (
    <>
      <div className="flex h-[49px] items-center justify-between border-b px-4">
        <div className="flex items-center gap-1">
          <Hash className="size-4 text-muted-foreground" />
          <h2 className="text-lg font-bold">{channelName}</h2>
        </div>
        <div className="flex items-center gap-1">
          <Hint label="Manage agents">
            <Button
              variant="ghost"
              size="iconSm"
              onClick={() => setShowManageModal(true)}
            >
              <Users className="size-4" />
            </Button>
          </Hint>
        </div>
      </div>

      {showManageModal && (
        <ManageAgentsModal
          channelId={channelId}
          onClose={() => setShowManageModal(false)}
        />
      )}
    </>
  )
}
