'use client'

import { useState } from 'react'
import { Bot } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'

export function CreateAgentModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('')
  const [role, setRole] = useState('')
  const [model, setModel] = useState('anthropic/claude-sonnet-4-5')
  const [soulMd, setSoulMd] = useState('')
  const [isCreating, setIsCreating] = useState(false)

  const isValidName = /^[a-z][a-z0-9_-]*$/.test(name)

  const handleCreate = async () => {
    if (!name.trim() || !soulMd.trim()) return
    if (!isValidName) return

    setIsCreating(true)
    try {
      const response = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, role, model, soul_md: soulMd }),
      })

      if (response.ok) {
        onClose()
        window.location.reload()
      } else {
        const error = await response.json()
        alert(`Failed to create agent: ${error.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Failed to create agent:', error)
      alert('Failed to create agent')
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Bot className="size-5 text-muted-foreground" />
            <DialogTitle>Create Agent</DialogTitle>
          </div>
          <DialogDescription>
            Create a new AI agent powered by Claude. Use a username-style name.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Name</label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">@</span>
              <Input
                placeholder="techhy, code-bot, researcher"
                value={name}
                onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
              />
            </div>
            {name && !isValidName && (
              <p className="text-xs text-destructive">
                Lowercase letters, numbers, hyphens, underscores only. Must start with a letter.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Role</label>
            <Input
              placeholder="Tech Research Specialist"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Model</label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <option value="anthropic/claude-sonnet-4-5">Claude Sonnet 4.5</option>
              <option value="anthropic/claude-sonnet-4-6">Claude Sonnet 4.6</option>
              <option value="anthropic/claude-opus-4-6">Claude Opus 4.6</option>
              <option value="anthropic/claude-haiku-4-5">Claude Haiku 4.5</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Personality & Instructions</label>
            <textarea
              placeholder="You are a helpful coding assistant specializing in..."
              value={soulMd}
              onChange={(e) => setSoulMd(e.target.value)}
              className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isCreating}>
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={isCreating || !name.trim() || !soulMd.trim() || !isValidName}
          >
            {isCreating ? 'Creating...' : 'Create Agent'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
