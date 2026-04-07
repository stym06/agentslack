'use client'

import { useState } from 'react'
import { FolderGit2 } from 'lucide-react'
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

type SourceType = 'local' | 'git'

export function CreateProjectModal({
  channelId,
  onClose,
  onCreated,
}: {
  channelId?: string
  onClose: () => void
  onCreated?: (project: any) => void
}) {
  const [name, setName] = useState('')
  const [sourceType, setSourceType] = useState<SourceType>('local')
  const [repoPath, setRepoPath] = useState('')
  const [gitUrl, setGitUrl] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || isSubmitting) return

    const payload: Record<string, string> = {
      name: name.trim(),
    }
    if (channelId) payload.channel_id = channelId

    if (sourceType === 'local') {
      if (!repoPath.trim()) return
      payload.repo_path = repoPath.trim()
    } else {
      if (!gitUrl.trim()) return
      payload.git_url = gitUrl.trim()
    }

    setIsSubmitting(true)
    setError(null)

    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(err.error || 'Failed to create project')
      }

      const project = await res.json()
      onCreated?.(project)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project')
    } finally {
      setIsSubmitting(false)
    }
  }

  const isValid =
    name.trim() &&
    (sourceType === 'local' ? repoPath.trim() : gitUrl.trim())

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <FolderGit2 className="size-5 text-muted-foreground" />
            <DialogTitle>Add Project</DialogTitle>
          </div>
          <DialogDescription>
            Link a git repository to this channel. Agents will work on tasks in isolated worktrees.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Project Name</label>
              <Input
                placeholder="e.g., backend-api, frontend-app"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Source</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setSourceType('local')}
                  className={`cursor-pointer rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    sourceType === 'local'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                  }`}
                >
                  Local Path
                </button>
                <button
                  type="button"
                  onClick={() => setSourceType('git')}
                  className={`cursor-pointer rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    sourceType === 'git'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                  }`}
                >
                  Git URL
                </button>
              </div>
            </div>

            {sourceType === 'local' ? (
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Repository Path</label>
                <Input
                  placeholder="/Users/you/code/my-project"
                  value={repoPath}
                  onChange={(e) => setRepoPath(e.target.value)}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Absolute path to a local git repository
                </p>
              </div>
            ) : (
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Git URL</label>
                <Input
                  placeholder="https://github.com/org/repo.git"
                  value={gitUrl}
                  onChange={(e) => setGitUrl(e.target.value)}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  The repository will be cloned locally
                </p>
              </div>
            )}

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
          </div>

          <DialogFooter className="mt-4">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || !isValid}>
              {isSubmitting ? 'Adding...' : 'Add Project'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
