import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/config'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)
const CLAUDE_CLI = process.env.CLAUDE_CLI_PATH || 'claude'

// POST /api/tasks/generate — Generate task title + body from a message
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { message } = await req.json()
  if (!message || typeof message !== 'string') {
    return NextResponse.json({ error: 'message is required' }, { status: 400 })
  }

  const prompt = `Given the following message, generate a task from it. Return ONLY valid JSON with two fields:
- "title": a concise task title (max 80 chars, imperative form like "Implement X" or "Research Y")
- "body": a clear task description with context and acceptance criteria (2-4 sentences)

Message:
${message.slice(0, 2000)}

Respond with JSON only, no markdown fences.`

  try {
    const { stdout } = await execAsync(
      `${CLAUDE_CLI} -p --output-format text "${prompt.replace(/"/g, '\\"')}"`,
      { timeout: 30000 },
    )

    // Parse the JSON from Claude's response
    const jsonMatch = stdout.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return NextResponse.json({
        title: message.replace(/@\w+/g, '').trim().split('\n')[0].slice(0, 80) || 'Untitled task',
        body: message,
      })
    }

    const parsed = JSON.parse(jsonMatch[0])
    return NextResponse.json({
      title: (parsed.title || '').slice(0, 100) || 'Untitled task',
      body: parsed.body || message,
    })
  } catch (err) {
    console.error('[Tasks/Generate] Failed:', err)
    // Fallback: use message directly
    return NextResponse.json({
      title: message.replace(/@\w+/g, '').trim().split('\n')[0].slice(0, 80) || 'Untitled task',
      body: message,
    })
  }
}
