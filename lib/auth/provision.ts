import { db } from '@/lib/db'

export async function provisionUserWorkspace(userId: string) {
  // Check if workspace already exists
  const existingWorkspace = await db.workspace.findFirst({
    where: { userId },
  })

  if (existingWorkspace) {
    return existingWorkspace
  }

  // Create workspace
  const workspace = await db.workspace.create({
    data: {
      userId,
      name: 'My Workspace',
    },
  })

  // Create #general channel
  await db.channel.create({
    data: {
      workspaceId: workspace.id,
      name: 'general',
      description: 'General discussion',
    },
  })

  // Create #daily-standup channel
  await db.channel.create({
    data: {
      workspaceId: workspace.id,
      name: 'daily-standup',
      description: 'Daily standup reports',
      channelType: 'standup',
    },
  })

  return workspace
}
