import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getIO } from '@/server/socket-server'
import { getAgentDaemon } from '@/server/agent-daemon'

export async function POST() {
  try {
    const standupChannel = await db.channel.findFirst({
      where: { channelType: 'standup' },
    })

    if (!standupChannel) {
      return NextResponse.json(
        { error: 'Standup channel not found' },
        { status: 404 }
      )
    }

    const adminBot = await db.agent.findFirst({
      where: { isAdmin: true },
    })

    if (!adminBot) {
      return NextResponse.json({ error: 'AdminBot not found' }, { status: 404 })
    }

    const io = getIO()
    const daemon = getAgentDaemon()

    // AdminBot posts opening message
    const openingMessage = await db.message.create({
      data: {
        channelId: standupChannel.id,
        senderType: 'agent',
        senderId: adminBot.id,
        content: 'Good morning team! Time for daily standup.',
      },
    })

    io.to(`channel:${standupChannel.id}`).emit('message:new', {
      ...openingMessage,
      sender_name: adminBot.name,
      sender_avatar: adminBot.avatarUrl ?? null,
    })

    // Get all non-admin agents
    const agents = await db.agent.findMany({
      where: {
        workspaceId: standupChannel.workspaceId,
        isAdmin: false,
      },
    })

    // Deliver standup prompt to each agent via their Claude process
    for (const agent of agents) {
      await db.agent.update({
        where: { id: agent.id },
        data: { status: 'busy' },
      })
      io.emit('agent:status', { agent_id: agent.id, status: 'busy' })

      daemon.deliverMessage(agent.id, {
        channelId: standupChannel.id,
        senderName: 'AdminBot',
        content: `It's daily standup time. Please report your recent activity and current status by using the send_message tool to post in channel ${standupChannel.id}.`,
      })
    }

    // Agents will respond asynchronously via their MCP send_message tool

    return NextResponse.json({
      success: true,
      message: 'Standup prompts delivered to agents',
      agentCount: agents.length,
    })
  } catch (error) {
    console.error('Error in standup trigger:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
