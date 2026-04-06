'use client'

import { useState, useCallback } from 'react'
import { EditorWithMentions } from '@/components/editor-with-mentions'

export function MessageInput({ channelId }: { channelId: string | null }) {
  const [editorKey, setEditorKey] = useState(0)
  const [isPending, setIsPending] = useState(false)

  const handleSubmit = useCallback(
    async (plainText: string) => {
      if (!channelId) return
      setIsPending(true)
      try {
        await fetch('/api/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channel_id: channelId, content: plainText }),
        })
        setEditorKey((prev) => prev + 1)
      } catch (error) {
        console.error('Failed to send message:', error)
      } finally {
        setIsPending(false)
      }
    },
    [channelId],
  )

  if (!channelId) return null

  return (
    <div className="px-5 pb-4">
      <EditorWithMentions
        channelId={channelId}
        editorKey={editorKey}
        disabled={isPending}
        onSubmit={handleSubmit}
        placeholder="Type a message... Use @ to mention an agent"
      />
    </div>
  )
}
