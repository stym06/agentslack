'use client'

import { useEffect, useRef, useState } from 'react'

interface RendererProps {
  value: string
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * Convert plain text with markdown-style formatting to HTML
 */
function markdownToHtml(text: string): string {
  const parts: string[] = []
  let remaining = text

  // Process code blocks first (```...```)
  while (remaining.length > 0) {
    const blockStart = remaining.indexOf('```')
    if (blockStart === -1) {
      parts.push(formatInline(escapeHtml(remaining)))
      break
    }

    // Add text before the code block
    if (blockStart > 0) {
      parts.push(formatInline(escapeHtml(remaining.substring(0, blockStart))))
    }

    // Find the end of the code block
    const afterOpening = remaining.substring(blockStart + 3)
    const blockEnd = afterOpening.indexOf('```')

    if (blockEnd === -1) {
      // No closing ```, treat rest as code block
      const code = afterOpening.replace(/^\w*\n?/, '') // strip optional language hint
      parts.push(
        `<pre class="my-2 block w-full rounded-lg border border-border bg-muted/50 p-4 font-mono text-[13px] leading-relaxed text-foreground overflow-x-auto whitespace-pre-wrap"><code>${escapeHtml(code)}</code></pre>`,
      )
      remaining = ''
    } else {
      const code = afterOpening.substring(0, blockEnd).replace(/^\w*\n/, '') // strip lang hint
      parts.push(
        `<pre class="my-2 block w-full rounded-lg border border-border bg-muted/50 p-4 font-mono text-[13px] leading-relaxed text-foreground overflow-x-auto whitespace-pre-wrap"><code>${escapeHtml(code)}</code></pre>`,
      )
      remaining = afterOpening.substring(blockEnd + 3)
    }
  }

  return parts.join('')
}

/**
 * Format inline elements: `code`, @mentions, newlines
 */
function formatInline(html: string): string {
  // Process line by line for block-level elements
  const lines = html.split('\n')
  const output: string[] = []
  let inList = false
  let listType = ''

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i]

    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      if (inList) { output.push(listType === 'ul' ? '</ul>' : '</ol>'); inList = false }
      output.push('<hr class="my-2 border-border">')
      continue
    }

    // Headings
    const h3 = line.match(/^### (.+)$/)
    if (h3) {
      if (inList) { output.push(listType === 'ul' ? '</ul>' : '</ol>'); inList = false }
      output.push(`<h3 class="text-sm font-bold mt-2 mb-0.5">${inlineFormat(h3[1])}</h3>`)
      continue
    }
    const h2 = line.match(/^## (.+)$/)
    if (h2) {
      if (inList) { output.push(listType === 'ul' ? '</ul>' : '</ol>'); inList = false }
      output.push(`<h2 class="text-base font-bold mt-2 mb-0.5">${inlineFormat(h2[1])}</h2>`)
      continue
    }
    const h1 = line.match(/^# (.+)$/)
    if (h1) {
      if (inList) { output.push(listType === 'ul' ? '</ul>' : '</ol>'); inList = false }
      output.push(`<h1 class="text-lg font-bold mt-2 mb-0.5">${inlineFormat(h1[1])}</h1>`)
      continue
    }

    // Bullet list
    const bullet = line.match(/^[\-\*] (.+)$/)
    if (bullet) {
      if (!inList || listType !== 'ul') {
        if (inList) output.push(listType === 'ul' ? '</ul>' : '</ol>')
        output.push('<ul class="ml-5 list-disc my-0.5">')
        inList = true; listType = 'ul'
      }
      output.push(`<li class="py-0">${inlineFormat(bullet[1])}</li>`)
      continue
    }

    // Numbered list
    const numbered = line.match(/^\d+\. (.+)$/)
    if (numbered) {
      if (!inList || listType !== 'ol') {
        if (inList) output.push(listType === 'ul' ? '</ul>' : '</ol>')
        output.push('<ol class="ml-5 list-decimal my-0.5">')
        inList = true; listType = 'ol'
      }
      output.push(`<li class="py-0">${inlineFormat(numbered[1])}</li>`)
      continue
    }

    // Close list if we're no longer in one
    if (inList) {
      output.push(listType === 'ul' ? '</ul>' : '</ol>')
      inList = false
    }

    // Empty line = paragraph break (small gap, not double <br>)
    if (line.trim() === '') {
      output.push('<div class="h-1.5"></div>')
      continue
    }

    // Regular line
    output.push(`<div>${inlineFormat(line)}</div>`)
  }

  if (inList) output.push(listType === 'ul' ? '</ul>' : '</ol>')
  return output.join('')
}

/** Format inline markdown: bold, italic, code, links, mentions */
function inlineFormat(text: string): string {
  let result = text
  // Inline code
  result = result.replace(
    /`([^`]+)`/g,
    '<code class="rounded border border-border bg-muted px-1 py-0.5 font-mono text-xs text-[#e01e5a]">$1</code>',
  )
  // Bold
  result = result.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  // Italic
  result = result.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>')
  // Strikethrough
  result = result.replace(/~~([^~]+)~~/g, '<del>$1</del>')
  // Links [text](url)
  result = result.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-[#1264a3] hover:underline cursor-pointer">$1</a>',
  )
  // Bare URLs
  result = result.replace(
    /(?<!")(?<!=)(https?:\/\/[^\s<]+)/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer" class="text-[#1264a3] hover:underline cursor-pointer">$1</a>',
  )
  // @mentions
  result = result.replace(/@(\w+)/g, '<span class="mention-highlight">@$1</span>')
  return result
}

const Renderer = ({ value }: RendererProps) => {
  const [isEmpty, setIsEmpty] = useState(false)
  const rendererRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!rendererRef.current) return

    const container = rendererRef.current

    // Try parsing as Quill delta JSON, fall back to plain text
    try {
      const contents = JSON.parse(value)
      import('quill').then(({ default: Quill }) => {
        const quill = new Quill(document.createElement('div'), { theme: 'snow' })
        quill.enable(false)
        quill.setContents(contents)

        const text = quill.getText()
        const empty = text.replace(/<(.|\n)*?>/g, '').trim().length === 0
        setIsEmpty(empty)
        // Use the plain text from Quill and format it ourselves
        container.innerHTML = markdownToHtml(text)
      })
    } catch {
      // Plain text content (not Quill delta)
      setIsEmpty(!value.trim())
      container.innerHTML = markdownToHtml(value)
    }

    return () => {
      if (container) container.innerHTML = ''
    }
  }, [value])

  if (isEmpty) return null

  return <div ref={rendererRef} className="ql-editor ql-renderer" />
}

export default Renderer
