'use client'

import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, X, Check, Package, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'

type Skill = {
  name: string
  type: 'installed' | 'custom'
  filename: string
  description?: string
}

export function AgentSkillsPanel({ agentId }: { agentId: string }) {
  const [skills, setSkills] = useState<Skill[]>([])
  const [loading, setLoading] = useState(true)
  const [editingSkill, setEditingSkill] = useState<{ filename: string; type: string } | null>(null)
  const [editContent, setEditContent] = useState('')
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newContent, setNewContent] = useState('')
  const [saving, setSaving] = useState(false)

  const fetchSkills = () => {
    fetch(`/api/agents/${agentId}/skills`)
      .then((res) => res.json())
      .then((data) => {
        setSkills(data.skills || [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }

  useEffect(() => {
    fetchSkills()
  }, [agentId])

  const handleView = async (skill: Skill) => {
    const res = await fetch(`/api/agents/${agentId}/skills/${skill.filename}?type=${skill.type}`)
    const data = await res.json()
    setEditContent(data.content || '')
    setEditingSkill({ filename: skill.filename, type: skill.type })
  }

  const handleSaveEdit = async () => {
    if (!editingSkill || editingSkill.type === 'installed') return
    setSaving(true)
    await fetch(`/api/agents/${agentId}/skills/${editingSkill.filename}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: editContent }),
    })
    setSaving(false)
    setEditingSkill(null)
  }

  const handleDelete = async (filename: string) => {
    await fetch(`/api/agents/${agentId}/skills/${filename}`, { method: 'DELETE' })
    fetchSkills()
  }

  const handleCreate = async () => {
    if (!newName.trim()) return
    setSaving(true)
    const filename = newName.replace(/[^a-zA-Z0-9_-]/g, '') + '.md'
    await fetch(`/api/agents/${agentId}/skills`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename, content: newContent }),
    })
    setSaving(false)
    setCreating(false)
    setNewName('')
    setNewContent('')
    fetchSkills()
  }

  if (loading) {
    return <div className="text-xs text-muted-foreground">Loading skills...</div>
  }

  const installedSkills = skills.filter((s) => s.type === 'installed')
  const customSkills = skills.filter((s) => s.type === 'custom')

  return (
    <div className="space-y-2">
      {skills.length === 0 && !creating && (
        <p className="text-xs text-muted-foreground">No skills yet.</p>
      )}

      {/* Installed skills */}
      {installedSkills.map((skill) => (
        <div key={`installed-${skill.name}`}>
          {editingSkill?.filename === skill.filename && editingSkill?.type === 'installed' ? (
            <div className="space-y-2 rounded-md border p-2">
              <div className="flex items-center gap-1.5">
                <Package className="size-3 text-muted-foreground" />
                <span className="text-xs font-medium">{skill.name}</span>
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">installed</span>
              </div>
              <pre className="max-h-[200px] overflow-auto whitespace-pre-wrap rounded-md border bg-muted/30 px-2 py-1.5 text-xs font-mono">
                {editContent}
              </pre>
              <Button size="sm" variant="ghost" onClick={() => setEditingSkill(null)} className="h-7 gap-1 text-xs">
                <X className="size-3" />
                Close
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <div className="flex items-center gap-2 min-w-0">
                <Package className="size-3.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm">{skill.name}</span>
                    <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">installed</span>
                  </div>
                  {skill.description && (
                    <p className="truncate text-[11px] text-muted-foreground">{skill.description}</p>
                  )}
                </div>
              </div>
              <Button size="iconSm" variant="ghost" onClick={() => handleView(skill)} className="size-7 shrink-0">
                <FileText className="size-3" />
              </Button>
            </div>
          )}
        </div>
      ))}

      {/* Custom skills */}
      {customSkills.map((skill) => (
        <div key={`custom-${skill.filename}`}>
          {editingSkill?.filename === skill.filename && editingSkill?.type === 'custom' ? (
            <div className="space-y-2 rounded-md border p-2">
              <div className="text-xs font-medium">{skill.name}</div>
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="w-full min-h-[80px] rounded-md border bg-background px-2 py-1.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-ring resize-y"
              />
              <div className="flex gap-1.5">
                <Button size="sm" onClick={handleSaveEdit} disabled={saving} className="h-7 gap-1 text-xs">
                  <Check className="size-3" />
                  {saving ? 'Saving...' : 'Save'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditingSkill(null)} className="h-7 gap-1 text-xs">
                  <X className="size-3" />
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <span className="text-sm">{skill.name}</span>
              <div className="flex gap-1">
                <Button size="iconSm" variant="ghost" onClick={() => handleView(skill)} className="size-7">
                  <Pencil className="size-3" />
                </Button>
                <Button size="iconSm" variant="ghost" onClick={() => handleDelete(skill.filename)} className="size-7 text-destructive hover:text-destructive">
                  <Trash2 className="size-3" />
                </Button>
              </div>
            </div>
          )}
        </div>
      ))}

      {/* Create new custom skill */}
      {creating ? (
        <div className="space-y-2 rounded-md border p-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Skill name (e.g., review-code)"
            className="w-full rounded-md border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            autoFocus
          />
          <textarea
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder="Skill instructions..."
            className="w-full min-h-[80px] rounded-md border bg-background px-2 py-1.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-ring resize-y"
          />
          <div className="flex gap-1.5">
            <Button size="sm" onClick={handleCreate} disabled={saving || !newName.trim()} className="h-7 gap-1 text-xs">
              <Check className="size-3" />
              Create
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setCreating(false); setNewName(''); setNewContent('') }} className="h-7 gap-1 text-xs">
              <X className="size-3" />
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setCreating(true)} className="h-7 gap-1.5 text-xs">
          <Plus className="size-3" />
          Add Skill
        </Button>
      )}
    </div>
  )
}
