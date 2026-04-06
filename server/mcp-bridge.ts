#!/usr/bin/env node
/**
 * MCP Bridge Server for AgentSlack
 *
 * Runs as a stdio MCP server subprocess of each Claude Code agent process.
 * Exposes tools that let the agent interact with AgentSlack:
 *   - send_message: post a message to a channel/thread
 *   - read_history: read recent messages
 *   - check_messages: poll for new messages since last check
 *   - list_channels: list channels the agent belongs to
 *   - list_agents: list other agents in the workspace
 *   - list_tasks: list tasks in a channel
 *   - create_tasks: create new task-messages
 *   - claim_tasks: claim tasks for work
 *   - unclaim_task: release a task
 *   - update_task_status: update task progress
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

const AGENT_ID = process.env.AGENT_ID!
const BASE_URL = process.env.AGENTSLACK_INTERNAL_URL || 'http://localhost:3000'

if (!AGENT_ID) {
  console.error('AGENT_ID environment variable is required')
  process.exit(1)
}

async function internalFetch(path: string, options?: RequestInit) {
  const url = `${BASE_URL}/api/internal/agent/${AGENT_ID}${path}`
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Internal API error (${res.status}): ${text}`)
  }
  return res.json()
}

const server = new McpServer({
  name: 'agentslack',
  version: '1.0.0',
})

// ── Messaging Tools ──────────────────────────────────────────────────────

server.tool(
  'send_message',
  'Send a message to a channel or thread in AgentSlack',
  {
    channelId: z.string().describe('The channel ID to send the message to'),
    content: z.string().describe('The message content (supports markdown)'),
    threadId: z.string().optional().describe('Optional thread ID to reply in a thread'),
  },
  async ({ channelId, content, threadId }) => {
    const result = await internalFetch('/send-message', {
      method: 'POST',
      body: JSON.stringify({ channelId, content, threadId }),
    })
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result) }],
    }
  },
)

server.tool(
  'read_history',
  'Read recent messages from a channel or thread',
  {
    channelId: z.string().describe('The channel ID to read messages from'),
    threadId: z.string().optional().describe('Optional thread ID to read thread replies'),
    limit: z.number().optional().default(20).describe('Number of messages to fetch (default 20)'),
  },
  async ({ channelId, threadId, limit }) => {
    const params = new URLSearchParams({ channelId, limit: String(limit) })
    if (threadId) params.set('threadId', threadId)
    const result = await internalFetch(`/read-history?${params}`)
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
    }
  },
)

server.tool(
  'check_messages',
  'Check for new messages since last check. Returns unread messages addressed to you.',
  {},
  async () => {
    const result = await internalFetch('/check-messages')
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
    }
  },
)

server.tool(
  'list_channels',
  'List channels you are a member of',
  {},
  async () => {
    const result = await internalFetch('/list-channels')
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
    }
  },
)

server.tool(
  'list_agents',
  'List other agents in the workspace',
  {},
  async () => {
    const result = await internalFetch('/list-agents')
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
    }
  },
)

// ── Task Tools ───────────────────────────────────────────────────────────

server.tool(
  'list_tasks',
  'List all tasks in a channel. Returns each task\'s number, title, status, and assignee.',
  {
    channelId: z.string().describe('The channel ID to list tasks for'),
    status: z
      .enum(['all', 'todo', 'in_progress', 'in_review', 'done'])
      .default('all')
      .describe('Filter by status (default: all)'),
  },
  async ({ channelId, status }) => {
    const params = new URLSearchParams({ channelId })
    if (status !== 'all') params.set('status', status)
    const result = await internalFetch(`/tasks?${params}`)

    // Format for readability
    if (result.tasks?.length > 0) {
      const formatted = result.tasks
        .map(
          (t: any) =>
            `#${t.task_number} [${t.status}] ${t.title}${t.claimed_by_name ? ` → @${t.claimed_by_name}` : ''}${t.created_by_name ? ` (by @${t.created_by_name})` : ''} msg=${t.message_id.slice(0, 8)}`,
        )
        .join('\n')
      return {
        content: [
          {
            type: 'text' as const,
            text: `## Task Board (${result.tasks.length} tasks)\n\n${formatted}`,
          },
        ],
      }
    }
    return {
      content: [{ type: 'text' as const, text: `No${status !== 'all' ? ` ${status}` : ''} tasks.` }],
    }
  },
)

server.tool(
  'create_tasks',
  'Create one or more new task-messages in a channel. Creates messages and publishes them as tasks. When creating multiple tasks, provide a summary to group them under a topic/story. Does not claim the task for you — call claim_tasks afterward if you want to own it.',
  {
    channelId: z.string().describe('The channel ID to create tasks in'),
    tasks: z
      .array(z.object({ title: z.string().describe('Task title') }))
      .describe('Array of tasks to create'),
    summary: z
      .string()
      .optional()
      .describe('A short topic/story summary to group these tasks under (e.g. "Making Coffee", "Auth System Setup")'),
  },
  async ({ channelId, tasks, summary }) => {
    const result = await internalFetch('/tasks', {
      method: 'POST',
      body: JSON.stringify({ channelId, tasks, summary }),
    })
    const created = result.tasks
      .map((t: any) => `#${t.taskNumber} msg=${t.messageId.slice(0, 8)} "${t.title}"`)
      .join('\n')
    const threadHints = result.tasks
      .map(
        (t: any) =>
          `#${t.taskNumber} → send_message(channelId="${channelId}", threadId="${t.messageId}")`,
      )
      .join('\n')
    return {
      content: [
        {
          type: 'text' as const,
          text: `Created ${result.tasks.length} task(s):\n${created}\n\nTo follow up in each task's thread:\n${threadHints}`,
        },
      ],
    }
  },
)

server.tool(
  'claim_tasks',
  'Claim tasks so you are assigned to work on them. By task number: use task_numbers. By message ID: use message_ids (converts message to task if needed). Thread messages cannot be claimed. Always claim before starting work to prevent duplicate effort.',
  {
    channelId: z.string().describe('The channel ID'),
    task_numbers: z
      .array(z.number())
      .optional()
      .describe('Task numbers to claim (e.g. [1, 3])'),
    message_ids: z
      .array(z.string())
      .optional()
      .describe('Message IDs to convert to tasks and claim'),
  },
  async ({ channelId, task_numbers, message_ids }) => {
    const result = await internalFetch('/tasks/claim', {
      method: 'POST',
      body: JSON.stringify({ channelId, task_numbers, message_ids }),
    })
    const lines = result.results.map((r: any) => {
      const label = r.taskNumber ? `#${r.taskNumber}` : `msg:${r.messageId}`
      return r.success ? `${label}: claimed` : `${label}: FAILED — ${r.reason || 'already claimed'}`
    })
    const succeeded = result.results.filter((r: any) => r.success).length
    const failed = result.results.length - succeeded
    let summary = `${succeeded} claimed`
    if (failed > 0) summary += `, ${failed} failed`
    return {
      content: [
        {
          type: 'text' as const,
          text: `Claim results (${summary}):\n${lines.join('\n')}`,
        },
      ],
    }
  },
)

server.tool(
  'unclaim_task',
  'Release your claim on a task so someone else can pick it up.',
  {
    channelId: z.string().describe('The channel ID'),
    task_number: z.number().describe('The task number to unclaim'),
  },
  async ({ channelId, task_number }) => {
    await internalFetch('/tasks/unclaim', {
      method: 'POST',
      body: JSON.stringify({ channelId, task_number }),
    })
    return {
      content: [{ type: 'text' as const, text: `#${task_number} unclaimed — now open.` }],
    }
  },
)

server.tool(
  'update_task_status',
  'Update a task\'s progress status. You must be the assignee. Valid statuses: todo, in_progress, in_review, done. Use in_review when your work is ready for human validation.',
  {
    channelId: z.string().describe('The channel ID'),
    task_number: z.number().describe('The task number to update'),
    status: z
      .enum(['todo', 'in_progress', 'in_review', 'done'])
      .describe('The new status'),
  },
  async ({ channelId, task_number, status }) => {
    await internalFetch('/tasks/update-status', {
      method: 'POST',
      body: JSON.stringify({ channelId, task_number, status }),
    })
    return {
      content: [
        { type: 'text' as const, text: `#${task_number} moved to ${status.replace('_', ' ')}.` },
      ],
    }
  },
)

// ── Start Server ─────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch((err) => {
  console.error('MCP Bridge failed to start:', err)
  process.exit(1)
})
