'use client'

import { useEffect, useState } from 'react'
import { Save, RotateCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function AgentInstructionsEditor({ agentId }: { agentId: string }) {
  const [content, setContent] = useState('')
  const [original, setOriginal] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/agents/${agentId}/instructions`)
      .then((res) => res.json())
      .then((data) => {
        setContent(data.content || '')
        setOriginal(data.content || '')
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [agentId])

  const hasChanges = content !== original

  const handleSave = async () => {
    setSaving(true)
    setSaved(false)
    try {
      await fetch(`/api/agents/${agentId}/instructions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })
      setOriginal(content)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      console.error('Failed to save instructions:', err)
    } finally {
      setSaving(false)
    }
  }

  const handleSaveAndRestart = async () => {
    await handleSave()
    try {
      await fetch(`/api/agents/${agentId}/restart`, { method: 'POST' })
    } catch (err) {
      console.error('Failed to restart agent:', err)
    }
  }

  if (loading) {
    return <div className="px-6 py-2 text-xs text-muted-foreground">Loading instructions...</div>
  }

  return (
    <div className="space-y-2">
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        className="w-full min-h-[120px] rounded-md border bg-background px-3 py-2 text-sm font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-ring resize-y"
        placeholder="Agent instructions (CLAUDE.md)..."
      />
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          onClick={handleSave}
          disabled={!hasChanges || saving}
          className="gap-1.5"
        >
          <Save className="size-3.5" />
          {saving ? 'Saving...' : saved ? 'Saved' : 'Save'}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={handleSaveAndRestart}
          disabled={!hasChanges || saving}
          className="gap-1.5"
        >
          <RotateCw className="size-3.5" />
          Save & Restart
        </Button>
      </div>
      {!hasChanges && (
        <p className="text-[11px] text-muted-foreground">
          Changes take effect after restarting the agent.
        </p>
      )}
    </div>
  )
}
