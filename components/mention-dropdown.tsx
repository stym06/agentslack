'use client'

import { useEffect, useState } from 'react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Bot } from 'lucide-react'
import { cn } from '@/lib/utils'

type AgentOption = {
  id: string
  name: string
  role: string | null
}

interface MentionDropdownProps {
  channelId: string
  query: string
  onSelect: (agentName: string) => void
  onClose: () => void
}

export function MentionDropdown({
  channelId,
  query,
  onSelect,
  onClose,
}: MentionDropdownProps) {
  const [agents, setAgents] = useState<AgentOption[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)

  useEffect(() => {
    fetch('/api/agents')
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setAgents(Array.isArray(data) ? data : []))
      .catch(() => setAgents([]))
  }, [channelId])

  const filtered = agents.filter((a) =>
    a.name.toLowerCase().includes(query.toLowerCase()),
  )

  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((prev) => Math.min(prev + 1, filtered.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((prev) => Math.max(prev - 1, 0))
      } else if ((e.key === 'Enter' || e.key === 'Tab') && filtered.length > 0) {
        e.preventDefault()
        e.stopPropagation()
        onSelect(filtered[selectedIndex].name)
      } else if (e.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown, true)
    return () => document.removeEventListener('keydown', handleKeyDown, true)
  }, [filtered, selectedIndex, onSelect, onClose])

  if (agents.length === 0) {
    return (
      <div className="absolute bottom-full z-50 mb-1 w-80 overflow-hidden rounded-lg border bg-card shadow-xl">
        <div className="border-b px-3 py-2">
          <span className="text-xs text-muted-foreground">
            No agents in this channel. Add agents via the channel header.
          </span>
        </div>
      </div>
    )
  }

  if (filtered.length === 0) return null

  return (
    <div className="absolute bottom-full z-50 mb-1 w-80 overflow-hidden rounded-lg border bg-card shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b bg-muted px-3 py-1.5">
        <span className="text-xs text-muted-foreground">
          Agents matching &quot;@{query}&quot;
        </span>
        <span className="text-[10px] text-muted-foreground">
          <kbd className="rounded border border-border bg-muted px-1 py-0.5 text-[10px]">↑</kbd>{' '}
          <kbd className="rounded border border-border bg-muted px-1 py-0.5 text-[10px]">↓</kbd> to navigate{' '}
          <kbd className="rounded border border-border bg-muted px-1 py-0.5 text-[10px]">↵</kbd> to select{' '}
          <kbd className="rounded border border-border bg-muted px-1 py-0.5 text-[10px]">esc</kbd> to dismiss
        </span>
      </div>

      {/* Agent list */}
      {filtered.map((agent, i) => (
        <button
          key={agent.id}
          className={cn(
            'flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-accent',
            i === selectedIndex && 'bg-primary text-primary-foreground hover:bg-primary',
          )}
          onMouseDown={(e) => {
            e.preventDefault()
            onSelect(agent.name)
          }}
          onMouseEnter={() => setSelectedIndex(i)}
        >
          <div className="relative">
            <Avatar className="size-8 shrink-0 rounded-lg">
              <AvatarFallback className={cn(
                'rounded-lg text-xs',
                i === selectedIndex ? 'bg-primary text-primary-foreground' : 'bg-primary/80 text-primary-foreground',
              )}>
                {agent.name[0]}
              </AvatarFallback>
            </Avatar>
            <Bot className={cn(
              'absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full border-2 border-card',
              i === selectedIndex ? 'text-primary-foreground/70' : 'text-primary',
            )} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className={cn(
                'truncate text-sm font-bold',
                i === selectedIndex ? 'text-white' : 'text-foreground',
              )}>
                {agent.name}
              </span>
              {agent.role && (
                <span className={cn(
                  'truncate text-xs',
                  i === selectedIndex ? 'text-primary-foreground/80' : 'text-muted-foreground',
                )}>
                  {agent.role}
                </span>
              )}
            </div>
          </div>
          {i === selectedIndex && (
            <span className="text-xs text-primary-foreground/70">●</span>
          )}
        </button>
      ))}
    </div>
  )
}
