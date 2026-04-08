'use client'

import { useState, useEffect } from 'react'
import { MessageSquareText, Smile, ListTodo, FolderGit2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { EmojiPopover } from './emoji-popover'
import { Hint } from './hint'
import type { Project } from '@/types'

interface MessageToolbarProps {
  isPending: boolean
  handleThread: () => void
  handleReaction: (value: string) => void
  hideThreadButton?: boolean
  onCreateTask?: (projectId: string) => void
  hasTask?: boolean
}

export const MessageToolbar = ({
  isPending,
  handleThread,
  handleReaction,
  hideThreadButton,
  onCreateTask,
  hasTask,
}: MessageToolbarProps) => {
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
      <div className="relative rounded-md border bg-card opacity-0 shadow-sm transition-opacity group-hover:opacity-100">
        <EmojiPopover hint="Add reaction" onEmojiSelect={handleReaction}>
          <Button variant="ghost" size="icon-sm" disabled={isPending}>
            <Smile className="size-4" />
          </Button>
        </EmojiPopover>

        {!hideThreadButton && (
          <Hint label="Reply in thread">
            <Button onClick={handleThread} variant="ghost" size="icon-sm" disabled={isPending}>
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
      </div>
    </div>
  )
}
