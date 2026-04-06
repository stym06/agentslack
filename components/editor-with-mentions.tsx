'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { Loader } from 'lucide-react'
import { MentionDropdown } from '@/components/mention-dropdown'

const Editor = dynamic(() => import('@/components/editor'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center">
      <Loader className="size-6 animate-spin text-muted-foreground" />
    </div>
  ),
})

function getQuillTextBeforeCursor(containerEl: HTMLElement | null): string | null {
  if (!containerEl) return null
  const sel = window.getSelection()
  if (!sel || !sel.rangeCount) return null

  const node = sel.anchorNode
  if (!node) return null

  const editor = (node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element))?.closest('.ql-editor')
  if (!editor || !containerEl.contains(editor)) return null

  const range = sel.getRangeAt(0)
  const preRange = document.createRange()
  preRange.setStart(editor, 0)
  preRange.setEnd(range.startContainer, range.startOffset)
  return preRange.toString()
}

interface EditorWithMentionsProps {
  channelId: string
  placeholder?: string
  disabled?: boolean
  onSubmit: (body: string) => Promise<void>
  editorKey: number
}

export function EditorWithMentions({
  channelId,
  placeholder = 'Type a message...',
  disabled = false,
  onSubmit,
  editorKey,
}: EditorWithMentionsProps) {
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = () => {
      const text = getQuillTextBeforeCursor(containerRef.current)
      if (text === null) {
        setMentionQuery(null)
        return
      }
      const atMatch = text.match(/@(\w*)$/)
      setMentionQuery(atMatch ? atMatch[1] : null)
    }

    document.addEventListener('keyup', handler)
    document.addEventListener('mouseup', handler)
    return () => {
      document.removeEventListener('keyup', handler)
      document.removeEventListener('mouseup', handler)
    }
  }, [])

  const handleMentionSelect = useCallback((agentName: string) => {
    const editorEl = containerRef.current?.querySelector('.ql-editor')
    if (!editorEl) return

    const sel = window.getSelection()
    if (!sel || !sel.rangeCount) return

    const text = getQuillTextBeforeCursor(containerRef.current)
    if (!text) return

    const atIndex = text.lastIndexOf('@')
    if (atIndex === -1) return

    const range = sel.getRangeAt(0)
    const preRange = document.createRange()
    preRange.setStart(editorEl, 0)
    preRange.setEnd(range.startContainer, range.startOffset)
    const fullText = preRange.toString()
    const charsToDelete = fullText.length - atIndex

    for (let i = 0; i < charsToDelete; i++) {
      sel.modify('extend', 'backward', 'character')
    }

    document.execCommand('insertText', false, `@${agentName} `)
    setMentionQuery(null)
  }, [])

  const handleSubmit = useCallback(
    async ({ body }: { body: string; image: File | null }) => {
      let plainText = body
      try {
        const delta = JSON.parse(body)
        plainText = delta.ops
          ?.map((op: { insert?: string }) => (typeof op.insert === 'string' ? op.insert : ''))
          .join('')
          .trim()
      } catch {
        // Already plain text
      }
      if (!plainText) return
      await onSubmit(plainText)
    },
    [onSubmit],
  )

  return (
    <div ref={containerRef} className="relative">
      {mentionQuery !== null && (
        <MentionDropdown
          channelId={channelId}
          query={mentionQuery}
          onSelect={handleMentionSelect}
          onClose={() => setMentionQuery(null)}
        />
      )}
      <Editor
        key={editorKey}
        onSubmit={handleSubmit}
        disabled={disabled}
        placeholder={placeholder}
      />
    </div>
  )
}
