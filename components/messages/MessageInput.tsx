'use client'

import { useState, useCallback } from 'react'
import { EditorWithMentions } from '@/components/editor-with-mentions'
import { ProjectPicker } from '@/components/projects/ProjectPicker'
import type { Project } from '@/types'

export function MessageInput({ channelId }: { channelId: string | null }) {
  const [editorKey, setEditorKey] = useState(0)
  const [isPending, setIsPending] = useState(false)
  const [attachedProject, setAttachedProject] = useState<Project | null>(null)

  const handleSubmit = useCallback(
    async (plainText: string) => {
      if (!channelId) return
      setIsPending(true)
      try {
        const payload: Record<string, string> = {
          channel_id: channelId,
          content: plainText,
        }
        if (attachedProject) {
          payload.project_id = attachedProject.id
        }
        await fetch('/api/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        setEditorKey((prev) => prev + 1)
        setAttachedProject(null)
      } catch (error) {
        console.error('Failed to send message:', error)
      } finally {
        setIsPending(false)
      }
    },
    [channelId, attachedProject],
  )

  if (!channelId) return null

  return (
    <div className="px-5 pb-4">
      {attachedProject && (
        <div className="mb-1.5 flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            {attachedProject.name}
            <button
              onClick={() => setAttachedProject(null)}
              className="ml-0.5 cursor-pointer text-primary/60 hover:text-primary"
            >
              &times;
            </button>
          </span>
          <span className="text-[11px] text-muted-foreground">
            Agent will work in a worktree for this project
          </span>
        </div>
      )}
      <EditorWithMentions
        channelId={channelId}
        editorKey={editorKey}
        disabled={isPending}
        onSubmit={handleSubmit}
        placeholder="Type a message... Use @ to mention an agent"
        extraToolbarContent={
          <ProjectPicker
            channelId={channelId}
            selectedProject={attachedProject}
            onSelect={setAttachedProject}
          />
        }
      />
    </div>
  )
}
