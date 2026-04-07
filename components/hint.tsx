'use client'

import { type PropsWithChildren, useState, useEffect } from 'react'

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

interface HintProps {
  label: string
  side?: 'top' | 'right' | 'bottom' | 'left'
  align?: 'start' | 'center' | 'end'
}

export const Hint = ({ label, children, side, align }: PropsWithChildren<HintProps>) => {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  // Render children without tooltip on server to avoid hydration ID mismatch
  if (!mounted) return <span>{children}</span>

  return (
    <TooltipProvider delay={50}>
      <Tooltip>
        <TooltipTrigger render={<span />}>{children}</TooltipTrigger>
        <TooltipContent side={side} align={align}>
          <p className="text-xs font-medium">{label}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
