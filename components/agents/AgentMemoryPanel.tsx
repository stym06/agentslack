'use client'

import { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

type MemoryEntry = { filename: string; content: string }

export function AgentMemoryPanel({ agentId }: { agentId: string }) {
  const [entries, setEntries] = useState<MemoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [clearing, setClearing] = useState(false)

  const fetchMemory = () => {
    setLoading(true)
    fetch(`/api/agents/${agentId}/memory`)
      .then((res) => res.json())
      .then((data) => {
        setEntries(data.entries || [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }

  useEffect(() => {
    fetchMemory()
  }, [agentId])

  const handleClear = async () => {
    if (!confirm('Clear all memory for this agent?')) return
    setClearing(true)
    await fetch(`/api/agents/${agentId}/memory`, { method: 'DELETE' })
    setClearing(false)
    setEntries([])
  }

  if (loading) {
    return <div className="text-xs text-muted-foreground">Loading memory...</div>
  }

  return (
    <div className="space-y-2">
      {entries.length === 0 ? (
        <p className="text-xs text-muted-foreground">No memory entries yet.</p>
      ) : (
        <>
          {entries.map((entry) => (
            <div key={entry.filename} className="rounded-md border p-2">
              <div className="mb-1 text-[11px] font-medium text-muted-foreground">
                {entry.filename.replace(/\.md$/, '')}
              </div>
              <p className="whitespace-pre-wrap text-xs leading-relaxed">
                {entry.content}
              </p>
            </div>
          ))}
          <Button
            size="sm"
            variant="destructive"
            onClick={handleClear}
            disabled={clearing}
            className="h-7 gap-1.5 text-xs"
          >
            <Trash2 className="size-3" />
            {clearing ? 'Clearing...' : 'Clear Memory'}
          </Button>
        </>
      )}
    </div>
  )
}
