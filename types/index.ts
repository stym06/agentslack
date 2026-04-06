export type User = {
  id: string
  email: string
  name: string | null
  avatar_url: string | null
  created_at: Date
}

export type Workspace = {
  id: string
  user_id: string
  name: string
  created_at: Date
}

export type Agent = {
  id: string
  workspace_id: string
  openclaw_id: string
  name: string
  role: string | null
  avatar_url: string | null
  model: string
  soul_md: string | null
  is_admin: boolean
  status: 'online' | 'busy' | 'offline' | 'loading'
  created_at: Date
}

export type Channel = {
  id: string
  workspace_id: string
  name: string
  description: string | null
  channel_type: 'regular' | 'standup'
  created_at: Date
}

export type Message = {
  id: string
  channel_id: string
  thread_id: string | null
  sender_type: 'user' | 'agent'
  sender_id: string
  content: string
  metadata: {
    status?: 'streaming' | 'complete'
    attachments?: unknown[]
  }
  reply_count: number
  created_at: Date
  sender_name?: string
  sender_avatar?: string
  // Task fields (populated when message is a task)
  task?: Task | null
}

export type TaskGroup = {
  id: string
  channel_id: string
  summary: string
  created_by_type: 'user' | 'agent'
  created_by_id: string
  created_at: Date
  tasks?: Task[]
}

export type Task = {
  id: string
  channel_id: string
  message_id: string
  task_number: number
  title: string
  status: 'todo' | 'in_progress' | 'in_review' | 'done'
  created_by_type: 'user' | 'agent'
  created_by_id: string
  claimed_by_type: 'user' | 'agent' | null
  claimed_by_id: string | null
  group_id: string | null
  created_at: Date
  updated_at: Date
  // Joined fields
  created_by_name?: string
  claimed_by_name?: string
  group_summary?: string
  comment_count?: number
}

export type ChannelAgent = {
  channel_id: string
  agent_id: string
  added_at: Date
}

export type ThreadParticipant = {
  thread_id: string
  agent_id: string
  joined_at: Date
}

// Socket.io event types
export type SocketEvents = {
  'message:new': (message: Message) => void
  'message:streaming': (data: {
    message_id: string
    chunk: string
    status: 'streaming' | 'complete'
  }) => void
  'message:reply_count': (data: {
    message_id: string
    reply_count: number
  }) => void
  'agent:status': (data: {
    agent_id: string
    status: 'online' | 'busy' | 'offline' | 'loading'
  }) => void
  'task:created': (task: Task & { channel_id: string }) => void
  'task:updated': (task: Task & { channel_id: string }) => void
}
