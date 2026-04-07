'use client'

import EmojiPicker, { type EmojiClickData } from 'emoji-picker-react'
import { type PropsWithChildren, useState, useRef, useCallback } from 'react'

import { Popover as PopoverPrimitive } from '@base-ui/react/popover'
import { Tooltip, TooltipContent, TooltipProvider } from '@/components/ui/tooltip'

interface EmojiPopoverProps {
  hint?: string
  onEmojiSelect: (emoji: string) => void
}

export const EmojiPopover = ({
  children,
  hint = 'Emoji',
  onEmojiSelect,
}: PropsWithChildren<EmojiPopoverProps>) => {
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [tooltipOpen, setTooltipOpen] = useState(false)
  const anchorRef = useRef<HTMLDivElement>(null)

  const onSelect = useCallback((emojiData: EmojiClickData) => {
    onEmojiSelect(emojiData.emoji)
    setPopoverOpen(false)
    setTooltipOpen(false)
  }, [onEmojiSelect])

  return (
    <TooltipProvider delay={50}>
      <Tooltip open={tooltipOpen && !popoverOpen} onOpenChange={setTooltipOpen}>
        <PopoverPrimitive.Root open={popoverOpen} onOpenChange={setPopoverOpen}>
          <div
            ref={anchorRef}
            onClick={() => setPopoverOpen((v) => !v)}
            onMouseEnter={() => setTooltipOpen(true)}
            onMouseLeave={() => setTooltipOpen(false)}
          >
            {children}
          </div>
          <PopoverPrimitive.Portal>
            <PopoverPrimitive.Positioner anchor={anchorRef} side="top" sideOffset={4} className="isolate z-50">
              <PopoverPrimitive.Popup className="w-full border-none p-0 shadow-none">
                <EmojiPicker onEmojiClick={onSelect} />
              </PopoverPrimitive.Popup>
            </PopoverPrimitive.Positioner>
          </PopoverPrimitive.Portal>
        </PopoverPrimitive.Root>
        <TooltipContent>
          <p className="text-xs font-medium">{hint}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
