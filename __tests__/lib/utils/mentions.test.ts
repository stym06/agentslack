import { describe, it, expect } from 'vitest'
import { extractMentions, buildThreadContext } from '@/lib/utils/mentions'

describe('extractMentions', () => {
  it('extracts single mention', () => {
    expect(extractMentions('Hey @alice can you help?')).toEqual(['alice'])
  })

  it('extracts multiple mentions', () => {
    expect(extractMentions('@alice and @bob please review')).toEqual(['alice', 'bob'])
  })

  it('returns lowercase mentions', () => {
    expect(extractMentions('@Alice @BOB')).toEqual(['alice', 'bob'])
  })

  it('returns empty array when no mentions', () => {
    expect(extractMentions('no mentions here')).toEqual([])
  })

  it('returns empty array for empty string', () => {
    expect(extractMentions('')).toEqual([])
  })

  it('handles mentions with underscores and numbers', () => {
    expect(extractMentions('@agent_1 @dev2')).toEqual(['agent_1', 'dev2'])
  })

  it('handles mentions at start of string', () => {
    expect(extractMentions('@frontend please fix this')).toEqual(['frontend'])
  })

  it('handles mentions at end of string', () => {
    expect(extractMentions('please fix this @backend')).toEqual(['backend'])
  })

  it('handles adjacent mentions (regex extracts both)', () => {
    expect(extractMentions('@alice@bob')).toEqual(['alice', 'bob'])
  })

  it('handles email-like patterns', () => {
    // The regex will match the part after @
    const result = extractMentions('email user@example.com')
    expect(result).toEqual(['example'])
  })
})

describe('buildThreadContext', () => {
  it('returns no messages text for empty array', () => {
    expect(buildThreadContext([])).toBe('No previous messages in thread.')
  })

  it('formats a single message', () => {
    const messages = [
      {
        senderType: 'user',
        senderId: 'u1',
        content: 'Hello',
        createdAt: new Date('2024-01-01T10:00:00Z'),
        sender_name: 'Alice',
      },
    ]
    const result = buildThreadContext(messages)
    expect(result).toBe('Thread context:\n[2024-01-01T10:00:00.000Z] Alice: Hello')
  })

  it('formats multiple messages', () => {
    const messages = [
      {
        senderType: 'user',
        senderId: 'u1',
        content: 'Hello',
        createdAt: new Date('2024-01-01T10:00:00Z'),
        sender_name: 'Alice',
      },
      {
        senderType: 'agent',
        senderId: 'a1',
        content: 'Hi there!',
        createdAt: new Date('2024-01-01T10:01:00Z'),
        sender_name: 'Bot',
      },
    ]
    const result = buildThreadContext(messages)
    expect(result).toContain('Alice: Hello')
    expect(result).toContain('Bot: Hi there!')
  })

  it('falls back to "User" when sender_name is missing for user', () => {
    const messages = [
      {
        senderType: 'user',
        senderId: 'u1',
        content: 'Hello',
        createdAt: new Date('2024-01-01T10:00:00Z'),
      },
    ]
    const result = buildThreadContext(messages)
    expect(result).toContain('User: Hello')
  })

  it('falls back to "Agent" when sender_name is missing for agent', () => {
    const messages = [
      {
        senderType: 'agent',
        senderId: 'a1',
        content: 'Hello',
        createdAt: new Date('2024-01-01T10:00:00Z'),
      },
    ]
    const result = buildThreadContext(messages)
    expect(result).toContain('Agent: Hello')
  })
})
