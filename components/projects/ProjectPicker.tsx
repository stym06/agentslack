'use client'

import { useState, useEffect } from 'react'
import { FolderGit2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Hint } from '@/components/hint'
import { cn } from '@/lib/utils'
import type { Project } from '@/types'

interface ProjectPickerProps {
  channelId: string
  selectedProject: Project | null
  onSelect: (project: Project | null) => void
}

export function ProjectPicker({ channelId, selectedProject, onSelect }: ProjectPickerProps) {
  const [open, setOpen] = useState(false)
  const [projects, setProjects] = useState<Project[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!open || loaded) return
    fetch(`/api/projects?channel_id=${channelId}`)
      .then((r) => r.ok ? r.json() : [])
      .then((data) => {
        setProjects((Array.isArray(data) ? data : []).filter((p: Project) => p.status === 'active'))
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  }, [open, loaded, channelId])

  // Reset loaded state when channelId changes
  useEffect(() => { setLoaded(false) }, [channelId])

  if (selectedProject) {
    return null // chip is shown above the editor, no need for the button
  }

  return (
    <div className="relative">
      <Hint label="Attach project">
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={() => setOpen(!open)}
          className={cn(selectedProject && 'text-primary')}
        >
          <FolderGit2 className="size-4" />
        </Button>
      </Hint>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full left-0 z-50 mb-1 w-52 overflow-hidden rounded-md border bg-popover shadow-lg">
            <div className="px-3 py-2 text-xs font-medium text-muted-foreground border-b">
              Attach project
            </div>
            {!loaded ? (
              <div className="px-3 py-3 text-xs text-muted-foreground">Loading...</div>
            ) : projects.length === 0 ? (
              <div className="px-3 py-3 text-xs text-muted-foreground">
                No projects in this channel
              </div>
            ) : (
              projects.map((project) => (
                <button
                  key={project.id}
                  onClick={() => {
                    onSelect(project)
                    setOpen(false)
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
    </div>
  )
}
