'use client'

import { useState, useEffect, useRef } from 'react'

export function TypingText({
  text,
  enabled,
  onTick,
}: {
  text: string
  enabled: boolean
  onTick?: () => void
}) {
  const [displayedLength, setDisplayedLength] = useState(enabled ? 0 : text.length)
  const completedRef = useRef(!enabled)

  useEffect(() => {
    if (!enabled || completedRef.current) {
      setDisplayedLength(text.length)
      return
    }

    let pos = 0
    const interval = setInterval(() => {
      pos = Math.min(pos + 3, text.length)
      setDisplayedLength(pos)
      onTick?.()
      if (pos >= text.length) {
        clearInterval(interval)
        completedRef.current = true
      }
    }, 15)

    return () => clearInterval(interval)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, enabled])

  if (displayedLength >= text.length) {
    return <>{text}</>
  }

  return (
    <>
      {text.slice(0, displayedLength)}
      <span className="inline-block w-0.5 h-4 bg-muted-foreground animate-pulse ml-0.5 align-text-bottom" />
    </>
  )
}
