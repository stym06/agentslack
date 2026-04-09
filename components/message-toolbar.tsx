'use client'

import { useState, useEffect, useCallback } from 'react'
import { MessageSquareText, ListTodo, FolderGit2, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Hint } from './hint'
import type { Project } from '@/types'

interface MessageToolbarProps {
  isPending: boolean
  handleThread: () => void
  hideThreadButton?: boolean
  onCreateTask?: (projectId: string) => void
  hasTask?: boolean
  onDelete?: () => void
}

export const MessageToolbar = ({
  isPending,
  handleThread,
  hideThreadButton,
  onCreateTask,
  hasTask,
  onDelete,
}: MessageToolbarProps) => {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showProjectPicker, setShowProjectPicker] = useState(false)
  const [projects, setProjects] = useState<Project[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!showProjectPicker || loaded) return
    fetch('/api/projects')
      .then((r) => r.ok ? r.json() : [])
      .then((data) => {
        setProjects((Array.isArray(data) ? data : []).filter((p: Project) => p.status === 'active'))
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  }, [showProjectPicker, loaded])

  return (
    <div className="absolute right-5 top-0">
      <div className="relative flex items-center rounded-md border bg-card opacity-0 shadow-sm transition-opacity group-hover:opacity-100">
        {!hideThreadButton && (
          <Hint label="Reply in thread">
            <Button onClick={handleThread} variant="ghost" size="icon-sm" disabled={isPending} className="text-muted-foreground hover:text-blue-400">
              <MessageSquareText className="size-4" />
            </Button>
          </Hint>
        )}

        {onCreateTask && !hasTask && (
          <>
            <Hint label="Create task">
              <Button
                onClick={() => setShowProjectPicker(!showProjectPicker)}
                variant="ghost"
                size="icon-sm"
                disabled={isPending}
                className="text-muted-foreground hover:text-green-400"
              >
                <ListTodo className="size-4" />
              </Button>
            </Hint>

            {showProjectPicker && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowProjectPicker(false)} />
                <div className="absolute right-0 top-full z-50 mt-1 w-56 overflow-hidden rounded-md border bg-popover shadow-lg">
                  <div className="flex items-center gap-1.5 border-b px-3 py-2 text-xs font-medium text-muted-foreground">
                    <FolderGit2 className="size-3" />
                    Select project for task
                  </div>
                  {!loaded ? (
                    <div className="px-3 py-3 text-xs text-muted-foreground">Loading...</div>
                  ) : projects.length === 0 ? (
                    <div className="px-3 py-3 text-xs text-muted-foreground">No active projects</div>
                  ) : (
                    projects.map((project) => (
                      <button
                        key={project.id}
                        onClick={() => {
                          onCreateTask(project.id)
                          setShowProjectPicker(false)
                        }}
                        className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
                      >
                        <span className="h-2 w-2 shrink-0 rounded-full bg-green-500" />
                        <span className="truncate">{project.name}</span>
                      </button>
                    ))
                  )}
                </div>
              </>
            )}
          </>
        )}

        {onDelete && (
          <>
            <Hint label="Delete message">
              <Button
                onClick={() => setShowDeleteConfirm(true)}
                variant="ghost"
                size="icon-sm"
                disabled={isPending}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="size-4" />
              </Button>
            </Hint>

            {showDeleteConfirm && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowDeleteConfirm(false)} />
                <div className="absolute right-0 top-full z-50 mt-1 w-52 overflow-hidden rounded-md border bg-popover p-3 shadow-lg">
                  <p className="text-xs font-medium">Delete this message?</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">This cannot be undone.</p>
                  <div className="mt-2.5 flex justify-end gap-1.5">
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowDeleteConfirm(false)}>
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-7 text-xs"
                      onClick={() => { setShowDeleteConfirm(false); onDelete() }}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
