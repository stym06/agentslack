'use client'

import { useEffect, useState, useRef } from 'react'

type AgentOption = {
  id: string
  name: string
  role: string | null
  openclawId: string
}

export function MentionDropdown({
  channelId,
  query,
  onSelect,
  onClose,
}: {
  channelId: string
  query: string
  onSelect: (agentName: string) => void
  onClose: () => void
}) {
  const [agents, setAgents] = useState<AgentOption[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/agents')
      .then((res) => (res.ok ? res.json() : []))
      .then((data: AgentOption[]) => setAgents(data))
      .catch(() => setAgents([]))
  }, [channelId])

  const filtered = agents.filter((a) =>
    a.name.toLowerCase().includes(query.toLowerCase())
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
      } else if (e.key === 'Enter' && filtered.length > 0) {
        e.preventDefault()
        onSelect(filtered[selectedIndex].name)
      } else if (e.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [filtered, selectedIndex, onSelect, onClose])

  if (filtered.length === 0) return null

  return (
    <div
      ref={listRef}
      className="absolute bottom-full left-0 mb-1 w-64 bg-popover border border-border rounded-lg shadow-lg overflow-hidden z-10"
    >
      {filtered.map((agent, i) => (
        <button
          key={agent.id}
          className={`w-full cursor-pointer px-3 py-2 flex items-center gap-2 text-left hover:bg-accent ${
            i === selectedIndex ? 'bg-accent' : ''
          }`}
          onMouseDown={(e) => {
            e.preventDefault()
            onSelect(agent.name)
          }}
        >
          <div className="w-7 h-7 rounded bg-primary/80 flex items-center justify-center text-primary-foreground text-xs font-bold shrink-0">
            {agent.name[0]}
          </div>
          <div className="min-w-0">
            <div className="text-sm text-foreground font-medium truncate">
              {agent.name}
            </div>
            {agent.role && (
              <div className="text-xs text-muted-foreground truncate">{agent.role}</div>
            )}
          </div>
        </button>
      ))}
    </div>
  )
}
