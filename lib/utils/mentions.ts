/**
 * Extract @mentions from message content
 * Supports multi-word names like @Backend Dev
 * @param content - The message content to parse
 * @returns Array of mentioned names (lowercase)
 */
export function extractMentions(content: string): string[] {
  const mentionRegex = /@(\w+)/g
  const mentions: string[] = []
  let match: RegExpExecArray | null

  while ((match = mentionRegex.exec(content)) !== null) {
    mentions.push(match[1].toLowerCase())
  }

  return mentions
}

/**
 * Build thread context string from messages for agent consumption
 * @param messages - Array of thread messages
 * @returns Formatted context string
 */
export function buildThreadContext(
  messages: Array<{
    senderType: string
    senderId: string
    content: string
    createdAt: Date
    sender_name?: string
  }>,
): string {
  if (messages.length === 0) {
    return 'No previous messages in thread.'
  }

  const contextLines = messages.map((msg) => {
    const timestamp = msg.createdAt.toISOString()
    const sender = msg.sender_name || (msg.senderType === 'user' ? 'User' : 'Agent')
    return `[${timestamp}] ${sender}: ${msg.content}`
  })

  return `Thread context:\n${contextLines.join('\n')}`
}
