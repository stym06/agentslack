'use client'

import { useState } from 'react'
import { AlertTriangle, GitBranch, Archive, Loader2, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'

// Match "uncommitted changes in /path/to/repo"
const DIRTY_REPO_REGEX = /uncommitted changes[\s\S]*?(\/\S+)/i

export function extractRepoPath(text: string): string | null {
  const match = text.match(DIRTY_REPO_REGEX)
  return match ? match[1] : null
}

export function DirtyRepoActions({ repoPath }: { repoPath: string }) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  const handleAction = async (action: 'stash' | 'new_branch') => {
    setLoading(true)
    try {
      const res = await fetch('/api/projects/git-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo_path: repoPath, action }),
      })
      const data = await res.json()
      if (res.ok) {
        setResult(data.message)
      } else {
        setResult(`Failed: ${data.error}`)
      }
    } catch {
      setResult('Failed to perform action')
    } finally {
      setLoading(false)
    }
  }

  if (result) {
    return (
      <div className="mt-2 flex items-center gap-1.5 rounded-md bg-green-500/10 px-3 py-2 text-xs text-green-400">
        <Check className="size-3.5" />
        {result}
      </div>
    )
  }

  return (
    <div className="mt-2 flex items-center gap-2 rounded-md border border-yellow-500/20 bg-yellow-500/5 px-3 py-2">
      <AlertTriangle className="size-3.5 shrink-0 text-yellow-500" />
      <span className="text-xs text-muted-foreground">Uncommitted changes detected</span>
      <div className="ml-auto flex gap-1.5">
        <Button
          size="sm"
          variant="outline"
          className="h-6 text-[11px] px-2"
          disabled={loading}
          onClick={() => handleAction('stash')}
        >
          {loading ? <Loader2 className="mr-1 size-3 animate-spin" /> : <Archive className="mr-1 size-3" />}
          Stash
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-6 text-[11px] px-2"
          disabled={loading}
          onClick={() => handleAction('new_branch')}
        >
          {loading ? <Loader2 className="mr-1 size-3 animate-spin" /> : <GitBranch className="mr-1 size-3" />}
          Save to branch
        </Button>
      </div>
    </div>
  )
}
