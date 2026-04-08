'use client'

import { useEffect, useRef, useState } from 'react'
import { Terminal, Trash2 } from 'lucide-react'
import { useAgentActivity } from '@/lib/hooks/useAgentActivity'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { AgentActivityEvent } from '@/types'

function formatTime(ts: number) {
  const d = new Date(ts)
  return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function EventRow({ event }: { event: AgentActivityEvent }) {
  const time = <span className="shrink-0 text-muted-foreground/50">{formatTime(event.timestamp)}</span>

  switch (event.type) {
    case 'system':
      return (
        <div className="flex gap-2">
          {time}
          <span className="rounded bg-muted px-1 text-muted-foreground">[SYS]</span>
          <span className="text-muted-foreground">
            {event.subtype}
            {event.mcpServers && (
              <span className="ml-1 text-muted-foreground/60">
                {event.mcpServers.map((s) => `${s.name}:${s.status}`).join(', ')}
              </span>
            )}
          </span>
        </div>
      )

    case 'tool_use':
      return (
        <div className="flex gap-2">
          {time}
          <span className="text-blue-400">{'>'}</span>
          <span className="font-semibold text-blue-400">{event.toolName}</span>
          <span className="truncate text-muted-foreground/60">{event.input}</span>
        </div>
      )

    case 'text':
      return (
        <div className="flex gap-2">
          {time}
          <span className="text-foreground/80">{event.text}</span>
        </div>
      )

    case 'result':
      return (
        <div className="flex gap-2">
          {time}
          <span className="text-green-400">done</span>
          <span className="text-muted-foreground/60">
            {(event.durationMs / 1000).toFixed(1)}s
          </span>
          {event.totalCostUsd != null && (
            <span className="rounded bg-green-500/15 px-1 text-green-400">
              ${event.totalCostUsd.toFixed(4)}
            </span>
          )}
        </div>
      )
  }
}

export function AgentActivityStream({ agentId }: { agentId: string }) {
  const { events, clearEvents } = useAgentActivity(agentId)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)

  // Auto-scroll when new events arrive
  useEffect(() => {
    if (!autoScroll || !scrollRef.current) return
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [events, autoScroll])

  // Detect manual scroll-up to pause auto-scroll
  const handleScroll = () => {
    const el = scrollRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40
    setAutoScroll(atBottom)
  }

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b px-3 py-1.5">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Terminal className="size-3" />
          <span>{events.length} events</span>
          {!autoScroll && (
            <button
              onClick={() => {
                setAutoScroll(true)
                scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'instant' })
              }}
              className="ml-2 cursor-pointer rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary hover:bg-primary/20"
            >
              Jump to bottom
            </button>
          )}
        </div>
        {events.length > 0 && (
          <Button variant="ghost" size="icon-sm" onClick={clearEvents}>
            <Trash2 className="size-3" />
          </Button>
        )}
      </div>

      {/* Stream */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className={cn(
          'flex-1 overflow-y-auto bg-background p-3 font-mono text-xs leading-5',
          events.length === 0 && 'flex items-center justify-center',
        )}
      >
        {events.length === 0 ? (
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <div className="flex gap-1">
              <span className="size-1.5 animate-pulse rounded-full bg-muted-foreground/40" />
              <span className="size-1.5 animate-pulse rounded-full bg-muted-foreground/40 [animation-delay:300ms]" />
              <span className="size-1.5 animate-pulse rounded-full bg-muted-foreground/40 [animation-delay:600ms]" />
            </div>
            <span className="text-xs">Waiting for activity...</span>
          </div>
        ) : (
          <div className="space-y-0.5">
            {events.map((event, i) => (
              <EventRow key={i} event={event} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
