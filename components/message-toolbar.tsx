'use client'

import { MessageSquareText, Smile } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { EmojiPopover } from './emoji-popover'
import { Hint } from './hint'

interface MessageToolbarProps {
  isPending: boolean
  handleThread: () => void
  handleReaction: (value: string) => void
  hideThreadButton?: boolean
}

export const MessageToolbar = ({
  isPending,
  handleThread,
  handleReaction,
  hideThreadButton,
}: MessageToolbarProps) => {
  return (
    <div className="absolute right-5 top-0">
      <div className="rounded-md border bg-card opacity-0 shadow-sm transition-opacity group-hover:opacity-100">
        <EmojiPopover hint="Add reaction" onEmojiSelect={handleReaction}>
          <Button variant="ghost" size="icon-sm" disabled={isPending}>
            <Smile className="size-4" />
          </Button>
        </EmojiPopover>

        {!hideThreadButton && (
          <Hint label="Reply in thread">
            <Button onClick={handleThread} variant="ghost" size="icon-sm" disabled={isPending}>
              <MessageSquareText className="size-4" />
            </Button>
          </Hint>
        )}
      </div>
    </div>
  )
}
