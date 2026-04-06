import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/config'
import { db } from '@/lib/db'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Find the user's workspace
    const workspace = await db.workspace.findFirst({
      where: { userId: session.user.id },
    })

    if (!workspace) {
      return NextResponse.json(
        { error: 'Workspace not found' },
        { status: 404 }
      )
    }

    // Fetch all channels for this workspace
    const channels = await db.channel.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { createdAt: 'asc' },
    })

    return NextResponse.json(channels)
  } catch (error) {
    console.error('Error fetching channels:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { name, description } = body

    if (!name) {
      return NextResponse.json({ error: 'name required' }, { status: 400 })
    }

    // Find the user's workspace
    const workspace = await db.workspace.findFirst({
      where: { userId: session.user.id },
    })

    if (!workspace) {
      return NextResponse.json(
        { error: 'Workspace not found' },
        { status: 404 }
      )
    }

    // Create channel (strip # prefix if present)
    const channel = await db.channel.create({
      data: {
        workspaceId: workspace.id,
        name: name.replace(/^#/, ''),
        description: description || null,
      },
    })

    return NextResponse.json(channel)
  } catch (error) {
    console.error('Error creating channel:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
