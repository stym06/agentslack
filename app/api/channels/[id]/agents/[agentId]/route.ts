import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/config'
import { db } from '@/lib/db'

// DELETE /api/channels/[id]/agents/[agentId] - Unassign an agent from a channel
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; agentId: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { id: channelId, agentId } = await params

    // Verify channel exists and user has access
    const channel = await db.channel.findUnique({
      where: { id: channelId },
      include: { workspace: true },
    })

    if (!channel) {
      return NextResponse.json(
        { error: 'Channel not found' },
        { status: 404 }
      )
    }

    if (channel.workspace.userId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Delete the assignment
    await db.channelAgent.deleteMany({
      where: {
        channelId,
        agentId,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error unassigning agent from channel:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
