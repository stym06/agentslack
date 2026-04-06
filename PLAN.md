# AgentSlack Implementation Plan (Updated)

> Complete implementation plan for building AgentSlack v0.0 → v1.0
> **No Supabase. Local Postgres + Socket.io + NextAuth.js.**

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Team Structure](#team-structure)
3. [Prerequisites & Setup](#prerequisites--setup)
4. [Phase 0: Foundation Setup](#phase-0-foundation-setup)
5. [Phase 1: v0.0 - AdminBot Chat (MVP)](#phase-1-v00---adminbot-chat-mvp)
6. [Phase 2: v0.1 - Multi-Agent Routing](#phase-2-v01---multi-agent-routing)
7. [Phase 3: v1.0 - Threads & Collaboration](#phase-3-v10---threads--collaboration)
8. [Testing & Validation](#testing--validation)
9. [Task Dependencies](#task-dependencies)

---

## Project Overview

**Goal**: Build a Slack-like workspace where users can create, manage, and chat with specialized AI agents powered by OpenClaw.

**Tech Stack** (Updated):
- Frontend: Next.js 14+ (App Router), React, Tailwind CSS
- Backend: Next.js API Routes + Socket.io WebSocket Server
- Database: **Local PostgreSQL 16** (not Supabase)
- Auth: **NextAuth.js** (not Supabase Auth)
- Real-time: **Socket.io** (not Supabase Realtime)
- Agent Runtime: OpenClaw Gateway (already running locally)

**Core Architecture Change**:
```
❌ OLD: Backend → Save to DB → DB trigger → Supabase Realtime → Frontend
✅ NEW: Backend → Save to DB + Push via Socket.io → Frontend
```

Direct push from backend = lower latency, simpler flow.

---

## Team Structure

Implementation organized by feature areas. Each agent specializes in one domain:

| Agent | Responsibility | Key Deliverables |
|-------|---------------|------------------|
| **infrastructure-agent** | Project setup, Postgres config, deployment prep | Next.js scaffold, local Postgres, env vars |
| **database-agent** | Schema design, migrations, triggers | SQL migrations, indexes, Drizzle/Prisma ORM |
| **auth-agent** | Authentication flow, workspace provisioning | NextAuth.js setup, login/signup UI, session mgmt |
| **openclaw-agent** | OpenClaw integration, agent provisioning, Gateway API | OpenClaw config writer, session manager, streaming handler |
| **ui-agent** | Frontend components, layout, styling | Sidebar, MessageList, ThreadPanel, AgentModal |
| **messaging-agent** | Message flow, routing logic, AdminBot integration | Message API, routing logic, agent orchestration |
| **realtime-agent** | Socket.io WebSocket server, live updates | Socket.io setup, room management, streaming events |
| **thread-agent** | Thread system, multi-agent collaboration (v1) | Thread panel, reply system, participant tracking |
| **standup-agent** | Daily standup system (v1) | Standup cron, agent reports, summary generation |

---

## Prerequisites & Setup

### What You Have
- ✅ OpenClaw running locally (`http://127.0.0.1:18789`)
- ✅ OpenClaw Gateway token set

### What Needs Setup
- ❌ Local PostgreSQL 16 (install via Homebrew)
- ❌ Next.js project (scaffold from scratch)
- ❌ Socket.io WebSocket server
- ❌ NextAuth.js configuration
- ❌ OpenClaw agents configuration
- ❌ Environment variables

---

## Phase 0: Foundation Setup

**Goal**: Get the development environment ready with Next.js, local Postgres, Socket.io, and basic OpenClaw config.

---

### TASK 0.1: Project Initialization (infrastructure-agent)

**Owner**: infrastructure-agent

**What to do**:
1. Initialize Next.js 14+ project with App Router
   ```bash
   npx create-next-app@latest agentslack --app --typescript --tailwind --eslint
   cd agentslack
   ```

2. Install dependencies:
   ```bash
   # Core
   npm install next-auth
   npm install socket.io socket.io-client

   # Database (choose one ORM)
   npm install drizzle-orm drizzle-kit pg     # Option A: Drizzle
   # OR
   npm install prisma @prisma/client           # Option B: Prisma

   # UI & Utils
   npm install zustand react-markdown lucide-react
   npm install @types/pg --save-dev
   ```

3. Create folder structure:
   ```
   /app
     /api
       /auth
         /[...nextauth]
       /messages
       /agents
       /channels
       /standup
     /dashboard
     /login
   /components
     /layout
     /messages
     /agents
     /channels
     /threads
   /lib
     /db
     /openclaw
     /socket
     /auth
     /stores
   /types
   /drizzle (or /prisma)
   /server
     socket-server.ts
   ```

4. Create `.env.local`:
   ```bash
   # Database
   DATABASE_URL=postgresql://localhost:5432/agentslack

   # NextAuth.js
   NEXTAUTH_URL=http://localhost:3000
   NEXTAUTH_SECRET=your_secret_here_generate_with_openssl

   # OAuth (optional)
   GOOGLE_CLIENT_ID=
   GOOGLE_CLIENT_SECRET=
   GITHUB_ID=
   GITHUB_SECRET=

   # OpenClaw
   OPENCLAW_GATEWAY_URL=http://127.0.0.1:18789
   OPENCLAW_GATEWAY_TOKEN=your_openclaw_token_here

   # Socket.io
   SOCKET_PORT=3001
   ```

**Deliverables**:
- [ ] Next.js project initialized
- [ ] Dependencies installed
- [ ] Folder structure created
- [ ] `.env.local` configured

---

### TASK 0.2: Local Postgres Setup (database-agent)

**Owner**: database-agent

**What to do**:

1. **Install PostgreSQL 16**:
   ```bash
   brew install postgresql@16
   brew services start postgresql@16

   # Verify
   psql --version  # Should show PostgreSQL 16.x
   ```

2. **Create database**:
   ```bash
   createdb agentslack

   # Test connection
   psql agentslack -c "SELECT version();"
   ```

3. **Choose and setup ORM** (Drizzle recommended for simplicity):

   **Option A: Drizzle** (recommended)
   ```bash
   # Create config
   cat > drizzle.config.ts << 'EOF'
   import type { Config } from 'drizzle-kit'

   export default {
     schema: './lib/db/schema.ts',
     out: './drizzle/migrations',
     driver: 'pg',
     dbCredentials: {
       connectionString: process.env.DATABASE_URL!,
     },
   } satisfies Config
   EOF
   ```

   **Option B: Prisma**
   ```bash
   npx prisma init
   # Edit prisma/schema.prisma with schema from SPEC.md
   ```

4. **Create database schema** (`/lib/db/schema.ts` for Drizzle):
   ```typescript
   import { pgTable, uuid, text, timestamp, boolean, integer, jsonb } from 'drizzle-orm/pg-core'

   export const users = pgTable('users', {
     id: uuid('id').primaryKey().defaultRandom(),
     email: text('email').notNull().unique(),
     name: text('name'),
     avatar_url: text('avatar_url'),
     created_at: timestamp('created_at').defaultNow(),
   })

   export const workspaces = pgTable('workspaces', {
     id: uuid('id').primaryKey().defaultRandom(),
     user_id: uuid('user_id').references(() => users.id).notNull(),
     name: text('name').notNull().default('My Workspace'),
     created_at: timestamp('created_at').defaultNow(),
   })

   export const agents = pgTable('agents', {
     id: uuid('id').primaryKey().defaultRandom(),
     workspace_id: uuid('workspace_id').references(() => workspaces.id).notNull(),
     openclaw_id: text('openclaw_id').notNull(),
     name: text('name').notNull(),
     role: text('role'),
     avatar_url: text('avatar_url'),
     model: text('model').default('anthropic/claude-sonnet-4-5'),
     soul_md: text('soul_md'),
     is_admin: boolean('is_admin').default(false),
     status: text('status').default('online'),
     created_at: timestamp('created_at').defaultNow(),
   })

   export const channels = pgTable('channels', {
     id: uuid('id').primaryKey().defaultRandom(),
     workspace_id: uuid('workspace_id').references(() => workspaces.id).notNull(),
     name: text('name').notNull(),
     description: text('description'),
     channel_type: text('channel_type').default('regular'),
     created_at: timestamp('created_at').defaultNow(),
   })

   export const channel_agents = pgTable('channel_agents', {
     channel_id: uuid('channel_id').references(() => channels.id, { onDelete: 'cascade' }),
     agent_id: uuid('agent_id').references(() => agents.id, { onDelete: 'cascade' }),
     added_at: timestamp('added_at').defaultNow(),
   })

   export const messages = pgTable('messages', {
     id: uuid('id').primaryKey().defaultRandom(),
     channel_id: uuid('channel_id').references(() => channels.id).notNull(),
     thread_id: uuid('thread_id').references(() => messages.id),
     sender_type: text('sender_type').notNull(), // 'user' | 'agent'
     sender_id: uuid('sender_id').notNull(),
     content: text('content').notNull(),
     metadata: jsonb('metadata').default({}),
     reply_count: integer('reply_count').default(0),
     created_at: timestamp('created_at').defaultNow(),
   })

   export const thread_participants = pgTable('thread_participants', {
     thread_id: uuid('thread_id').references(() => messages.id, { onDelete: 'cascade' }),
     agent_id: uuid('agent_id').references(() => agents.id, { onDelete: 'cascade' }),
     joined_at: timestamp('joined_at').defaultNow(),
   })
   ```

5. **Create migration**:
   ```bash
   # Drizzle
   npx drizzle-kit generate:pg
   npx drizzle-kit push:pg

   # Prisma
   npx prisma migrate dev --name init
   ```

6. **Create trigger for reply_count** (raw SQL):
   ```sql
   -- Run in psql agentslack
   CREATE OR REPLACE FUNCTION increment_reply_count()
   RETURNS TRIGGER AS $$
   BEGIN
     IF NEW.thread_id IS NOT NULL THEN
       UPDATE messages SET reply_count = reply_count + 1 WHERE id = NEW.thread_id;
     END IF;
     RETURN NEW;
   END;
   $$ LANGUAGE plpgsql;

   CREATE TRIGGER trigger_increment_reply_count
   AFTER INSERT ON messages
   FOR EACH ROW EXECUTE FUNCTION increment_reply_count();
   ```

7. **Create database client** (`/lib/db/index.ts`):
   ```typescript
   import { drizzle } from 'drizzle-orm/node-postgres'
   import { Pool } from 'pg'
   import * as schema from './schema'

   const pool = new Pool({
     connectionString: process.env.DATABASE_URL,
   })

   export const db = drizzle(pool, { schema })
   ```

**Deliverables**:
- [ ] PostgreSQL 16 installed and running
- [ ] Database created
- [ ] Schema defined (Drizzle or Prisma)
- [ ] Migrations applied
- [ ] Trigger created
- [ ] Database client configured

---

### TASK 0.3: NextAuth.js Setup (auth-agent)

**Owner**: auth-agent

**What to do**:

1. **Create NextAuth config** (`/lib/auth/config.ts`):
   ```typescript
   import { NextAuthOptions } from 'next-auth'
   import CredentialsProvider from 'next-auth/providers/credentials'
   import GoogleProvider from 'next-auth/providers/google'
   import GitHubProvider from 'next-auth/providers/github'
   import { db } from '@/lib/db'
   import { users } from '@/lib/db/schema'
   import { eq } from 'drizzle-orm'

   export const authOptions: NextAuthOptions = {
     providers: [
       CredentialsProvider({
         name: 'Email',
         credentials: {
           email: { label: 'Email', type: 'email' },
           password: { label: 'Password', type: 'password' },
         },
         async authorize(credentials) {
           // For MVP: auto-create user on first login
           if (!credentials?.email) return null

           let user = await db.query.users.findFirst({
             where: eq(users.email, credentials.email),
           })

           if (!user) {
             // Auto-create user
             const [newUser] = await db.insert(users).values({
               email: credentials.email,
             }).returning()
             user = newUser
           }

           return {
             id: user.id,
             email: user.email,
             name: user.name,
           }
         },
       }),
       // Optional: OAuth providers
       ...(process.env.GOOGLE_CLIENT_ID ? [
         GoogleProvider({
           clientId: process.env.GOOGLE_CLIENT_ID,
           clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
         })
       ] : []),
       ...(process.env.GITHUB_ID ? [
         GitHubProvider({
           clientId: process.env.GITHUB_ID,
           clientSecret: process.env.GITHUB_SECRET!,
         })
       ] : []),
     ],
     callbacks: {
       async jwt({ token, user }) {
         if (user) {
           token.id = user.id
         }
         return token
       },
       async session({ session, token }) {
         if (session.user) {
           session.user.id = token.id as string
         }
         return session
       },
     },
     pages: {
       signIn: '/login',
     },
     secret: process.env.NEXTAUTH_SECRET,
   }
   ```

2. **Create NextAuth route** (`/app/api/auth/[...nextauth]/route.ts`):
   ```typescript
   import NextAuth from 'next-auth'
   import { authOptions } from '@/lib/auth/config'

   const handler = NextAuth(authOptions)

   export { handler as GET, handler as POST }
   ```

3. **Create auth middleware** (`/middleware.ts`):
   ```typescript
   export { default } from 'next-auth/middleware'

   export const config = {
     matcher: ['/dashboard/:path*', '/api/messages/:path*', '/api/agents/:path*', '/api/channels/:path*'],
   }
   ```

4. **Generate secret**:
   ```bash
   openssl rand -base64 32
   # Add to .env.local as NEXTAUTH_SECRET
   ```

**Deliverables**:
- [ ] NextAuth.js configured
- [ ] Auth API route created
- [ ] Middleware protecting routes
- [ ] Secret generated

---

### TASK 0.4: Socket.io WebSocket Server (realtime-agent)

**Owner**: realtime-agent

**What to do**:

1. **Create Socket.io server** (`/server/socket-server.ts`):
   ```typescript
   import { Server as SocketIOServer } from 'socket.io'
   import { Server as HTTPServer } from 'http'

   let io: SocketIOServer | null = null

   export function initSocketServer(httpServer: HTTPServer) {
     io = new SocketIOServer(httpServer, {
       cors: {
         origin: process.env.NEXTAUTH_URL || 'http://localhost:3000',
         methods: ['GET', 'POST'],
       },
     })

     io.on('connection', (socket) => {
       console.log('Client connected:', socket.id)

       // Join channel room
       socket.on('channel:join', (channelId: string) => {
         socket.join(`channel:${channelId}`)
         console.log(`Socket ${socket.id} joined channel:${channelId}`)
       })

       // Leave channel room
       socket.on('channel:leave', (channelId: string) => {
         socket.leave(`channel:${channelId}`)
       })

       // Join thread room
       socket.on('thread:join', (threadId: string) => {
         socket.join(`thread:${threadId}`)
       })

       // Leave thread room
       socket.on('thread:leave', (threadId: string) => {
         socket.leave(`thread:${threadId}`)
       })

       socket.on('disconnect', () => {
         console.log('Client disconnected:', socket.id)
       })
     })

     return io
   }

   export function getIO(): SocketIOServer {
     if (!io) {
       throw new Error('Socket.io not initialized')
     }
     return io
   }
   ```

2. **Update Next.js server to use Socket.io** (`/server.js` in project root):
   ```javascript
   const { createServer } = require('http')
   const { parse } = require('url')
   const next = require('next')
   const { initSocketServer } = require('./server/socket-server')

   const dev = process.env.NODE_ENV !== 'production'
   const hostname = 'localhost'
   const port = 3000
   const app = next({ dev, hostname, port })
   const handle = app.getRequestHandler()

   app.prepare().then(() => {
     const httpServer = createServer(async (req, res) => {
       try {
         const parsedUrl = parse(req.url, true)
         await handle(req, res, parsedUrl)
       } catch (err) {
         console.error('Error occurred handling', req.url, err)
         res.statusCode = 500
         res.end('internal server error')
       }
     })

     // Initialize Socket.io
     initSocketServer(httpServer)

     httpServer.listen(port, (err) => {
       if (err) throw err
       console.log(`> Ready on http://${hostname}:${port}`)
       console.log('> Socket.io server running')
     })
   })
   ```

3. **Update package.json scripts**:
   ```json
   {
     "scripts": {
       "dev": "node server.js",
       "build": "next build",
       "start": "NODE_ENV=production node server.js"
     }
   }
   ```

4. **Create Socket.io client hook** (`/lib/socket/useSocket.ts`):
   ```typescript
   'use client'

   import { useEffect, useState } from 'react'
   import { io, Socket } from 'socket.io-client'

   let socket: Socket | null = null

   export function useSocket() {
     const [isConnected, setIsConnected] = useState(false)

     useEffect(() => {
       if (!socket) {
         socket = io('http://localhost:3000', {
           autoConnect: true,
         })

         socket.on('connect', () => {
           console.log('Socket connected')
           setIsConnected(true)
         })

         socket.on('disconnect', () => {
           console.log('Socket disconnected')
           setIsConnected(false)
         })
       }

       return () => {
         // Don't disconnect on unmount, keep connection alive
       }
     }, [])

     return { socket, isConnected }
   }

   export function getSocket(): Socket {
     if (!socket) {
       throw new Error('Socket not initialized')
     }
     return socket
   }
   ```

**Deliverables**:
- [ ] Socket.io server created
- [ ] Custom Next.js server with Socket.io
- [ ] Room join/leave handlers
- [ ] Client-side Socket.io hook

---

### TASK 0.5: OpenClaw Base Configuration (openclaw-agent)

**Owner**: openclaw-agent

**What to do**:

1. **Verify OpenClaw is running**:
   ```bash
   # Check gateway
   curl http://127.0.0.1:18789/health

   # Get token
   TOKEN=$(clawdbot config get gateway.auth.token)
   echo $TOKEN

   # Save to .env.local
   echo "OPENCLAW_GATEWAY_TOKEN=$TOKEN" >> .env.local
   ```

2. **Create AdminBot workspace**:
   ```bash
   # Create workspace directory
   mkdir -p ~/.openclaw/workspace-admin

   # Write SOUL.md
   cat > ~/.openclaw/workspace-admin/SOUL.md << 'EOF'
   # AdminBot

   You are AdminBot, the lead coordinator of an AI agent workspace.

   ## Your Role
   - You receive all user messages first
   - Analyze the message and decide which specialist agent should handle it
   - Route tasks by responding with: ROUTE:<agent_id> — <brief explanation>
   - If it's general/conversational, answer directly yourself
   - Coordinate multi-agent work in threads
   - Run daily standups

   ## Routing Format
   When delegating, respond EXACTLY like:
   ROUTE:techsavvy — This is a tech research task about GPU pricing

   ## Available Agents
   {AGENT_REGISTRY}

   ## Communication Style
   - Concise and professional
   - When delegating, explain briefly why
   - When summarizing, be brief
   EOF
   ```

3. **Update OpenClaw config** (`~/.openclaw/openclaw.json`):
   ```json5
   {
     "agents": {
       "defaults": {
         "model": "anthropic/claude-sonnet-4-5"
       },
       "list": [
         {
           "id": "admin",
           "default": true,
           "name": "AdminBot",
           "workspace": "~/.openclaw/workspace-admin",
           "agentDir": "~/.openclaw/agents/admin/agent",
           "model": "anthropic/claude-sonnet-4-5",
           "tools": {
             "allow": [
               "group:fs",
               "group:sessions",
               "group:memory",
               "web_search",
               "web_fetch"
             ]
           },
           "subagents": { "allowAgents": ["*"] }
         }
       ]
     },
     "gateway": {
       "auth": { "token": "${OPENCLAW_GATEWAY_TOKEN}" }
     }
   }
   ```

4. **Test AdminBot session**:
   ```bash
   curl -X POST http://127.0.0.1:18789/tools/invoke \
     -H "Authorization: Bearer $TOKEN" \
     -H 'Content-Type: application/json' \
     -d '{
       "tool": "sessions_send",
       "args": {
         "sessionKey": "agent:admin:main",
         "message": "Hello AdminBot, are you online?"
       }
     }'
   ```

5. **Create OpenClaw client library** (`/lib/openclaw/client.ts`):
   ```typescript
   const OPENCLAW_URL = process.env.OPENCLAW_GATEWAY_URL || 'http://127.0.0.1:18789'
   const OPENCLAW_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN

   export async function sendToAgent(
     agentId: string,
     sessionKey: string,
     message: string
   ): Promise<string> {
     const response = await fetch(`${OPENCLAW_URL}/tools/invoke`, {
       method: 'POST',
       headers: {
         'Authorization': `Bearer ${OPENCLAW_TOKEN}`,
         'Content-Type': 'application/json',
       },
       body: JSON.stringify({
         tool: 'sessions_send',
         args: {
           sessionKey,
           message,
         },
       }),
     })

     if (!response.ok) {
       throw new Error(`OpenClaw error: ${response.statusText}`)
     }

     const data = await response.json()
     return data.result || data.response || ''
   }

   export async function getAgentStatus(agentId: string): Promise<'online' | 'busy' | 'offline'> {
     try {
       const response = await fetch(`${OPENCLAW_URL}/tools/invoke`, {
         method: 'POST',
         headers: {
           'Authorization': `Bearer ${OPENCLAW_TOKEN}`,
           'Content-Type': 'application/json',
         },
         body: JSON.stringify({
           tool: 'session_status',
           args: { agentId },
         }),
       })

       if (!response.ok) return 'offline'

       const data = await response.json()
       return data.active ? 'busy' : 'online'
     } catch {
       return 'offline'
     }
   }
   ```

**Deliverables**:
- [ ] OpenClaw verified running
- [ ] AdminBot workspace created
- [ ] AdminBot SOUL.md written
- [ ] OpenClaw config updated
- [ ] AdminBot session tested
- [ ] OpenClaw client library created

---

### TASK 0.6: TypeScript Types (ui-agent)

**Owner**: ui-agent

**What to do**:

Create `/types/index.ts`:

```typescript
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
  status: 'online' | 'busy' | 'offline'
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
    attachments?: any[]
  }
  reply_count: number
  created_at: Date
  sender_name?: string // joined from agents/users
  sender_avatar?: string
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
  'message:streaming': (data: { message_id: string; chunk: string; status: 'streaming' | 'complete' }) => void
  'message:reply_count': (data: { message_id: string; reply_count: number }) => void
  'agent:status': (data: { agent_id: string; status: 'online' | 'busy' | 'offline' }) => void
}
```

**Deliverables**:
- [ ] TypeScript types defined
- [ ] Exported from `/types/index.ts`

---

## Phase 1: v0.0 - AdminBot Chat (MVP)

**Goal**: Single-agent chat. User sends message → AdminBot responds via Socket.io streaming.

**Architecture**:
```
User types → POST /api/messages → save to Postgres → push via Socket.io
    │
    ▼
OpenClaw Tools Invoke API → AdminBot responds
    │
    ▼
Backend receives response → save to Postgres → push via Socket.io → UI updates
```

---

### TASK 1.1: Authentication Flow (auth-agent)

**Owner**: auth-agent

**What to do**:

1. **Create login page** (`/app/login/page.tsx`):
   ```typescript
   'use client'

   import { signIn } from 'next-auth/react'
   import { useState } from 'react'
   import { useRouter } from 'next/navigation'

   export default function LoginPage() {
     const [email, setEmail] = useState('')
     const router = useRouter()

     const handleLogin = async (e: React.FormEvent) => {
       e.preventDefault()

       const result = await signIn('credentials', {
         email,
         password: 'dummy', // For MVP, any password works
         redirect: false,
       })

       if (result?.ok) {
         router.push('/dashboard')
       }
     }

     return (
       <div className="min-h-screen flex items-center justify-center bg-gray-900">
         <div className="bg-gray-800 p-8 rounded-lg shadow-lg w-96">
           <h1 className="text-2xl font-bold text-white mb-6">AgentSlack</h1>
           <form onSubmit={handleLogin}>
             <input
               type="email"
               placeholder="Email"
               value={email}
               onChange={(e) => setEmail(e.target.value)}
               className="w-full p-3 mb-4 bg-gray-700 text-white rounded"
               required
             />
             <button
               type="submit"
               className="w-full p-3 bg-blue-600 text-white rounded hover:bg-blue-700"
             >
               Sign In
             </button>
           </form>
         </div>
       </div>
     )
   }
   ```

2. **Create workspace provisioning** (`/lib/auth/provision.ts`):
   ```typescript
   import { db } from '@/lib/db'
   import { workspaces, channels, agents } from '@/lib/db/schema'
   import { eq } from 'drizzle-orm'

   export async function provisionUserWorkspace(userId: string) {
     // Check if workspace already exists
     const existingWorkspace = await db.query.workspaces.findFirst({
       where: eq(workspaces.user_id, userId),
     })

     if (existingWorkspace) {
       return existingWorkspace
     }

     // Create workspace
     const [workspace] = await db.insert(workspaces).values({
       user_id: userId,
       name: 'My Workspace',
     }).returning()

     // Create #general channel
     const [generalChannel] = await db.insert(channels).values({
       workspace_id: workspace.id,
       name: 'general',
       description: 'General discussion',
     }).returning()

     // Create AdminBot agent
     const [adminBot] = await db.insert(agents).values({
       workspace_id: workspace.id,
       openclaw_id: 'admin',
       name: 'AdminBot',
       role: 'Workspace Coordinator',
       is_admin: true,
       status: 'online',
     }).returning()

     return workspace
   }
   ```

3. **Update NextAuth callback** to provision on first login:
   ```typescript
   // In /lib/auth/config.ts
   callbacks: {
     async signIn({ user }) {
       if (user.id) {
         await provisionUserWorkspace(user.id)
       }
       return true
     },
     // ... rest of callbacks
   }
   ```

**Deliverables**:
- [ ] Login page created
- [ ] Workspace provisioning logic
- [ ] Auto-provision on first login
- [ ] Logout functionality

---

### TASK 1.2: Basic Layout & Sidebar (ui-agent)

**Owner**: ui-agent

**What to do**:

1. **Create SessionProvider wrapper** (`/app/providers.tsx`):
   ```typescript
   'use client'

   import { SessionProvider } from 'next-auth/react'

   export function Providers({ children }: { children: React.ReactNode }) {
     return <SessionProvider>{children}</SessionProvider>
   }
   ```

2. **Update root layout** (`/app/layout.tsx`):
   ```typescript
   import { Providers } from './providers'

   export default function RootLayout({ children }: { children: React.ReactNode }) {
     return (
       <html lang="en">
         <body>
           <Providers>{children}</Providers>
         </body>
       </html>
     )
   }
   ```

3. **Create DashboardLayout** (`/components/layout/DashboardLayout.tsx`):
   ```typescript
   'use client'

   import { Sidebar } from './Sidebar'
   import { MainPane } from './MainPane'
   import { useState } from 'react'

   export function DashboardLayout() {
     const [activeChannelId, setActiveChannelId] = useState<string | null>(null)

     return (
       <div className="flex h-screen bg-gray-900">
         <Sidebar
           activeChannelId={activeChannelId}
           onChannelSelect={setActiveChannelId}
         />
         <MainPane channelId={activeChannelId} />
       </div>
     )
   }
   ```

4. **Create Sidebar** (`/components/layout/Sidebar.tsx`):
   ```typescript
   'use client'

   import { useEffect, useState } from 'react'
   import { signOut } from 'next-auth/react'

   export function Sidebar({
     activeChannelId,
     onChannelSelect,
   }: {
     activeChannelId: string | null
     onChannelSelect: (id: string) => void
   }) {
     const [channels, setChannels] = useState([])
     const [agents, setAgents] = useState([])

     useEffect(() => {
       // Fetch channels
       fetch('/api/channels')
         .then(res => res.json())
         .then(setChannels)

       // Fetch agents
       fetch('/api/agents')
         .then(res => res.json())
         .then(setAgents)
     }, [])

     return (
       <div className="w-60 bg-gray-800 flex flex-col">
         {/* Header */}
         <div className="p-4 border-b border-gray-700">
           <h1 className="text-xl font-bold text-white">🦞 AgentSlack</h1>
         </div>

         {/* Channels */}
         <div className="flex-1 overflow-y-auto p-4">
           <div className="mb-6">
             <h2 className="text-xs font-semibold text-gray-400 uppercase mb-2">
               Channels
             </h2>
             {channels.map((channel: any) => (
               <div
                 key={channel.id}
                 onClick={() => onChannelSelect(channel.id)}
                 className={`px-3 py-1 rounded cursor-pointer ${
                   activeChannelId === channel.id
                     ? 'bg-blue-600 text-white'
                     : 'text-gray-300 hover:bg-gray-700'
                 }`}
               >
                 # {channel.name}
               </div>
             ))}
           </div>

           {/* Agents */}
           <div>
             <h2 className="text-xs font-semibold text-gray-400 uppercase mb-2">
               Agents
             </h2>
             {agents.map((agent: any) => (
               <div
                 key={agent.id}
                 className="flex items-center gap-2 px-3 py-1 text-gray-300"
               >
                 <span className={`w-2 h-2 rounded-full ${
                   agent.status === 'online' ? 'bg-green-500' :
                   agent.status === 'busy' ? 'bg-yellow-500' :
                   'bg-gray-500'
                 }`} />
                 {agent.name}
               </div>
             ))}
           </div>
         </div>

         {/* Footer */}
         <div className="p-4 border-t border-gray-700">
           <button
             onClick={() => signOut()}
             className="w-full px-3 py-2 bg-red-600 text-white rounded hover:bg-red-700"
           >
             Logout
           </button>
         </div>
       </div>
     )
   }
   ```

5. **Create dashboard page** (`/app/dashboard/page.tsx`):
   ```typescript
   import { DashboardLayout } from '@/components/layout/DashboardLayout'

   export default function DashboardPage() {
     return <DashboardLayout />
   }
   ```

**Deliverables**:
- [ ] SessionProvider wrapper
- [ ] DashboardLayout component
- [ ] Sidebar component
- [ ] Dashboard page
- [ ] Basic styling (Tailwind, Slack-like dark theme)

---

### TASK 1.3: Main Channel Pane (ui-agent)

**Owner**: ui-agent

**What to do**:

1. **Create ChannelHeader** (`/components/messages/ChannelHeader.tsx`):
   ```typescript
   export function ChannelHeader({ channelName }: { channelName: string }) {
     return (
       <div className="h-14 border-b border-gray-700 px-4 flex items-center">
         <h2 className="text-xl font-bold text-white"># {channelName}</h2>
       </div>
     )
   }
   ```

2. **Create MessageList** (`/components/messages/MessageList.tsx`):
   ```typescript
   'use client'

   import { useEffect, useState, useRef } from 'react'
   import { Message } from '@/types'
   import { useSocket } from '@/lib/socket/useSocket'

   export function MessageList({ channelId }: { channelId: string | null }) {
     const [messages, setMessages] = useState<Message[]>([])
     const { socket } = useSocket()
     const messagesEndRef = useRef<HTMLDivElement>(null)

     useEffect(() => {
       if (!channelId) return

       // Fetch initial messages
       fetch(`/api/messages?channel_id=${channelId}`)
         .then(res => res.json())
         .then(setMessages)

       // Join channel room
       socket?.emit('channel:join', channelId)

       // Listen for new messages
       socket?.on('message:new', (message: Message) => {
         if (message.channel_id === channelId && !message.thread_id) {
           setMessages(prev => [...prev, message])
         }
       })

       return () => {
         socket?.emit('channel:leave', channelId)
         socket?.off('message:new')
       }
     }, [channelId, socket])

     useEffect(() => {
       messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
     }, [messages])

     if (!channelId) {
       return (
         <div className="flex-1 flex items-center justify-center text-gray-500">
           Select a channel to start
         </div>
       )
     }

     return (
       <div className="flex-1 overflow-y-auto p-4 space-y-4">
         {messages.map((message) => (
           <div key={message.id} className="flex gap-3">
             <div className="w-10 h-10 rounded bg-gray-700 flex items-center justify-center text-white font-bold">
               {message.sender_name?.[0] || 'U'}
             </div>
             <div>
               <div className="flex items-center gap-2">
                 <span className="font-bold text-white">{message.sender_name}</span>
                 <span className="text-xs text-gray-500">
                   {new Date(message.created_at).toLocaleTimeString()}
                 </span>
               </div>
               <div className="text-gray-300">{message.content}</div>
               {message.metadata?.status === 'streaming' && (
                 <div className="flex gap-1 mt-1">
                   <span className="animate-pulse">●</span>
                   <span className="animate-pulse delay-100">●</span>
                   <span className="animate-pulse delay-200">●</span>
                 </div>
               )}
             </div>
           </div>
         ))}
         <div ref={messagesEndRef} />
       </div>
     )
   }
   ```

3. **Create MessageInput** (`/components/messages/MessageInput.tsx`):
   ```typescript
   'use client'

   import { useState } from 'react'

   export function MessageInput({ channelId }: { channelId: string | null }) {
     const [content, setContent] = useState('')
     const [sending, setSending] = useState(false)

     const handleSend = async () => {
       if (!content.trim() || !channelId || sending) return

       setSending(true)
       try {
         await fetch('/api/messages', {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({ channel_id: channelId, content }),
         })
         setContent('')
       } catch (error) {
         console.error('Failed to send message:', error)
       } finally {
         setSending(false)
       }
     }

     const handleKeyPress = (e: React.KeyboardEvent) => {
       if (e.key === 'Enter' && !e.shiftKey) {
         e.preventDefault()
         handleSend()
       }
     }

     return (
       <div className="p-4 border-t border-gray-700">
         <div className="flex gap-2">
           <textarea
             value={content}
             onChange={(e) => setContent(e.target.value)}
             onKeyPress={handleKeyPress}
             placeholder="Type a message..."
             className="flex-1 p-3 bg-gray-700 text-white rounded resize-none"
             rows={1}
             disabled={!channelId || sending}
           />
           <button
             onClick={handleSend}
             disabled={!channelId || sending || !content.trim()}
             className="px-6 py-3 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
           >
             Send
           </button>
         </div>
       </div>
     )
   }
   ```

4. **Create MainPane** (`/components/layout/MainPane.tsx`):
   ```typescript
   import { ChannelHeader } from '@/components/messages/ChannelHeader'
   import { MessageList } from '@/components/messages/MessageList'
   import { MessageInput } from '@/components/messages/MessageInput'

   export function MainPane({ channelId }: { channelId: string | null }) {
     return (
       <div className="flex-1 flex flex-col">
         {channelId && <ChannelHeader channelName="general" />}
         <MessageList channelId={channelId} />
         <MessageInput channelId={channelId} />
       </div>
     )
   }
   ```

**Deliverables**:
- [ ] ChannelHeader component
- [ ] MessageList component (with Socket.io integration)
- [ ] MessageInput component
- [ ] MainPane component
- [ ] Auto-scroll to latest message

---

### TASK 1.4: Messages API - Read (messaging-agent)

**Owner**: messaging-agent

**What to do**:

Create GET endpoint (`/app/api/messages/route.ts`):

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/config'
import { db } from '@/lib/db'
import { messages, agents, users } from '@/lib/db/schema'
import { eq, and, isNull } from 'drizzle-orm'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const channelId = searchParams.get('channel_id')
  const threadId = searchParams.get('thread_id')

  if (!channelId && !threadId) {
    return NextResponse.json({ error: 'channel_id or thread_id required' }, { status: 400 })
  }

  try {
    let results

    if (threadId) {
      // Fetch thread replies
      results = await db
        .select({
          id: messages.id,
          channel_id: messages.channel_id,
          thread_id: messages.thread_id,
          sender_type: messages.sender_type,
          sender_id: messages.sender_id,
          content: messages.content,
          metadata: messages.metadata,
          reply_count: messages.reply_count,
          created_at: messages.created_at,
          sender_name: agents.name, // Will be null for user messages
        })
        .from(messages)
        .leftJoin(agents, eq(messages.sender_id, agents.id))
        .where(eq(messages.thread_id, threadId))
        .orderBy(messages.created_at)
    } else {
      // Fetch top-level messages
      results = await db
        .select({
          id: messages.id,
          channel_id: messages.channel_id,
          thread_id: messages.thread_id,
          sender_type: messages.sender_type,
          sender_id: messages.sender_id,
          content: messages.content,
          metadata: messages.metadata,
          reply_count: messages.reply_count,
          created_at: messages.created_at,
          sender_name: agents.name,
        })
        .from(messages)
        .leftJoin(agents, eq(messages.sender_id, agents.id))
        .where(and(eq(messages.channel_id, channelId!), isNull(messages.thread_id)))
        .orderBy(messages.created_at)
    }

    // Add user names for user messages
    const messagesWithNames = results.map(msg => ({
      ...msg,
      sender_name: msg.sender_name || 'You',
    }))

    return NextResponse.json(messagesWithNames)
  } catch (error) {
    console.error('Error fetching messages:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

**Deliverables**:
- [ ] GET /api/messages endpoint
- [ ] Support for channel_id filter
- [ ] Support for thread_id filter (for v1)
- [ ] Join with agents table for sender names
- [ ] Auth middleware protection

---

### TASK 1.5: Messages API - Create & OpenClaw Integration (messaging-agent + openclaw-agent)

**Owner**: messaging-agent (API), openclaw-agent (Gateway integration)

**What to do**:

1. **Create POST endpoint** (`/app/api/messages/route.ts` - add to existing file):
   ```typescript
   import { getIO } from '@/server/socket-server'
   import { sendToAgent } from '@/lib/openclaw/client'

   export async function POST(req: NextRequest) {
     const session = await getServerSession(authOptions)
     if (!session?.user?.id) {
       return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
     }

     const body = await req.json()
     const { channel_id, content, thread_id } = body

     if (!channel_id || !content) {
       return NextResponse.json({ error: 'channel_id and content required' }, { status: 400 })
     }

     try {
       // 1. Save user message to database
       const [userMessage] = await db.insert(messages).values({
         channel_id,
         thread_id: thread_id || null,
         sender_type: 'user',
         sender_id: session.user.id,
         content,
       }).returning()

       // 2. Push user message to frontend via Socket.io
       const io = getIO()
       io.to(`channel:${channel_id}`).emit('message:new', {
         ...userMessage,
         sender_name: 'You',
       })

       // 3. Send to AdminBot via OpenClaw (async, don't await)
       handleAgentResponse(channel_id, content, thread_id).catch(console.error)

       return NextResponse.json({ success: true, message: userMessage })
     } catch (error) {
       console.error('Error sending message:', error)
       return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
     }
   }

   // Handle agent response asynchronously
   async function handleAgentResponse(
     channelId: string,
     userMessage: string,
     threadId?: string
   ) {
     const io = getIO()

     try {
       // Get AdminBot from database
       const adminBot = await db.query.agents.findFirst({
         where: eq(agents.is_admin, true),
       })

       if (!adminBot) {
         throw new Error('AdminBot not found')
       }

       // Mark AdminBot as busy
       await db.update(agents).set({ status: 'busy' }).where(eq(agents.id, adminBot.id))
       io.emit('agent:status', { agent_id: adminBot.id, status: 'busy' })

       // Send to AdminBot via OpenClaw
       const sessionKey = threadId
         ? `agent:admin:thread-${threadId}`
         : `agent:admin:channel-${channelId}`

       const response = await sendToAgent('admin', sessionKey, userMessage)

       // Save AdminBot response to database
       const [agentMessage] = await db.insert(messages).values({
         channel_id: channelId,
         thread_id: threadId || null,
         sender_type: 'agent',
         sender_id: adminBot.id,
         content: response,
         metadata: { status: 'complete' },
       }).returning()

       // Push to frontend via Socket.io
       io.to(`channel:${channelId}`).emit('message:new', {
         ...agentMessage,
         sender_name: adminBot.name,
       })

       // Mark AdminBot as online
       await db.update(agents).set({ status: 'online' }).where(eq(agents.id, adminBot.id))
       io.emit('agent:status', { agent_id: adminBot.id, status: 'online' })
     } catch (error) {
       console.error('Error handling agent response:', error)
     }
   }
   ```

**Deliverables**:
- [ ] POST /api/messages endpoint
- [ ] User message saved to Postgres
- [ ] User message pushed via Socket.io
- [ ] AdminBot integration via OpenClaw
- [ ] Agent response saved and pushed
- [ ] Agent status updates

---

### TASK 1.6: Channels & Agents API (messaging-agent)

**Owner**: messaging-agent

**What to do**:

1. **Create GET /api/channels** (`/app/api/channels/route.ts`):
   ```typescript
   import { NextRequest, NextResponse } from 'next/server'
   import { getServerSession } from 'next-auth'
   import { authOptions } from '@/lib/auth/config'
   import { db } from '@/lib/db'
   import { channels, workspaces } from '@/lib/db/schema'
   import { eq } from 'drizzle-orm'

   export async function GET(req: NextRequest) {
     const session = await getServerSession(authOptions)
     if (!session?.user?.id) {
       return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
     }

     const workspace = await db.query.workspaces.findFirst({
       where: eq(workspaces.user_id, session.user.id),
     })

     if (!workspace) {
       return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
     }

     const channelsList = await db.query.channels.findMany({
       where: eq(channels.workspace_id, workspace.id),
     })

     return NextResponse.json(channelsList)
   }
   ```

2. **Create GET /api/agents** (`/app/api/agents/route.ts`):
   ```typescript
   import { NextRequest, NextResponse } from 'next/server'
   import { getServerSession } from 'next-auth'
   import { authOptions } from '@/lib/auth/config'
   import { db } from '@/lib/db'
   import { agents, workspaces } from '@/lib/db/schema'
   import { eq } from 'drizzle-orm'

   export async function GET(req: NextRequest) {
     const session = await getServerSession(authOptions)
     if (!session?.user?.id) {
       return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
     }

     const workspace = await db.query.workspaces.findFirst({
       where: eq(workspaces.user_id, session.user.id),
     })

     if (!workspace) {
       return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
     }

     const agentsList = await db.query.agents.findMany({
       where: eq(agents.workspace_id, workspace.id),
     })

     return NextResponse.json(agentsList)
   }
   ```

**Deliverables**:
- [ ] GET /api/channels endpoint
- [ ] GET /api/agents endpoint
- [ ] Workspace scoping

---

### ✅ v0.0 MILESTONE: Single-Agent Chat Working

**Validation Checklist**:
- [ ] User can log in with email
- [ ] Workspace + #general + AdminBot auto-created on first login
- [ ] User can see #general channel in sidebar
- [ ] User can type message and send
- [ ] Message appears instantly in UI (Socket.io push)
- [ ] AdminBot receives message via OpenClaw
- [ ] AdminBot response appears in UI (Socket.io push)
- [ ] AdminBot status changes: online → busy → online
- [ ] Messages persist in Postgres
- [ ] Open two browser tabs, send message from one, see in both (Socket.io rooms)

---

## Phase 2: v0.1 - Multi-Agent Routing

**Goal**: User creates specialist agents. AdminBot routes messages to the right agent.

---

### TASK 2.1: Agent Creation UI (ui-agent)

**Owner**: ui-agent

**What to do**:

1. **Create AgentModal** (`/components/agents/CreateAgentModal.tsx`):
   ```typescript
   'use client'

   import { useState } from 'react'

   export function CreateAgentModal({ onClose }: { onClose: () => void }) {
     const [name, setName] = useState('')
     const [role, setRole] = useState('')
     const [model, setModel] = useState('anthropic/claude-sonnet-4-5')
     const [soulMd, setSoulMd] = useState('')
     const [skills, setSkills] = useState<string[]>(['web_search', 'web_fetch'])

     const handleCreate = async () => {
       await fetch('/api/agents', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ name, role, model, soul_md: soulMd, skills }),
       })
       onClose()
       window.location.reload() // Refresh to show new agent
     }

     return (
       <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
         <div className="bg-gray-800 p-6 rounded-lg w-[500px]">
           <h2 className="text-xl font-bold text-white mb-4">Create New Agent</h2>

           <input
             placeholder="Name (e.g., TechSavvy)"
             value={name}
             onChange={(e) => setName(e.target.value)}
             className="w-full p-2 mb-3 bg-gray-700 text-white rounded"
           />

           <input
             placeholder="Role (e.g., Tech Research Specialist)"
             value={role}
             onChange={(e) => setRole(e.target.value)}
             className="w-full p-2 mb-3 bg-gray-700 text-white rounded"
           />

           <select
             value={model}
             onChange={(e) => setModel(e.target.value)}
             className="w-full p-2 mb-3 bg-gray-700 text-white rounded"
           >
             <option value="anthropic/claude-sonnet-4-5">Claude Sonnet 4.5</option>
             <option value="anthropic/claude-opus-4-6">Claude Opus 4.6</option>
             <option value="anthropic/claude-haiku-4-5">Claude Haiku 4.5</option>
           </select>

           <textarea
             placeholder="Personality & Instructions (SOUL.md)"
             value={soulMd}
             onChange={(e) => setSoulMd(e.target.value)}
             className="w-full p-2 mb-3 bg-gray-700 text-white rounded h-32"
           />

           <div className="flex gap-4 justify-end">
             <button
               onClick={onClose}
               className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
             >
               Cancel
             </button>
             <button
               onClick={handleCreate}
               className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
             >
               Create Agent
             </button>
           </div>
         </div>
       </div>
     )
   }
   ```

2. **Add "+ Create Agent" button to Sidebar**:
   ```typescript
   // In Sidebar.tsx
   const [showAgentModal, setShowAgentModal] = useState(false)

   // In agents section:
   <button
     onClick={() => setShowAgentModal(true)}
     className="px-3 py-1 text-sm text-blue-400 hover:text-blue-300"
   >
     + Create Agent
   </button>

   {showAgentModal && <CreateAgentModal onClose={() => setShowAgentModal(false)} />}
   ```

**Deliverables**:
- [ ] CreateAgentModal component
- [ ] Form validation
- [ ] "+ Create Agent" button in Sidebar
- [ ] Modal open/close state

---

### TASK 2.2: Agents API - Create & Provision (openclaw-agent + messaging-agent)

**Owner**: openclaw-agent (provisioning), messaging-agent (API endpoint)

**What to do**:

1. **Create agent provisioner** (`/lib/openclaw/provision.ts`):
   ```typescript
   import fs from 'fs'
   import path from 'path'
   import os from 'os'

   export async function provisionAgent(agent: {
     openclaw_id: string
     name: string
     soul_md: string
     model: string
     skills: string[]
   }) {
     const openclawDir = path.join(os.homedir(), '.openclaw')
     const workspaceDir = path.join(openclawDir, `workspace-${agent.openclaw_id}`)
     const agentDir = path.join(openclawDir, 'agents', agent.openclaw_id, 'agent')

     // 1. Create workspace directory
     fs.mkdirSync(workspaceDir, { recursive: true })

     // 2. Write SOUL.md
     fs.writeFileSync(path.join(workspaceDir, 'SOUL.md'), agent.soul_md)

     // 3. Create agent directory
     fs.mkdirSync(agentDir, { recursive: true })

     // 4. Update openclaw.json
     const configPath = path.join(openclawDir, 'openclaw.json')
     const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))

     if (!config.agents.list) {
       config.agents.list = []
     }

     config.agents.list.push({
       id: agent.openclaw_id,
       name: agent.name,
       workspace: workspaceDir,
       agentDir: agentDir,
       model: agent.model,
       tools: {
         allow: agent.skills,
         deny: ['exec', 'read', 'write', 'edit', 'apply_patch', 'browser', 'canvas', 'gateway'],
       },
     })

     fs.writeFileSync(configPath, JSON.stringify(config, null, 2))

     // 5. Wait for OpenClaw hot-reload
     await new Promise(resolve => setTimeout(resolve, 2000))
   }
   ```

2. **Create POST /api/agents** (add to `/app/api/agents/route.ts`):
   ```typescript
   import { provisionAgent } from '@/lib/openclaw/provision'

   export async function POST(req: NextRequest) {
     const session = await getServerSession(authOptions)
     if (!session?.user?.id) {
       return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
     }

     const body = await req.json()
     const { name, role, model, soul_md, skills } = body

     if (!name || !soul_md) {
       return NextResponse.json({ error: 'name and soul_md required' }, { status: 400 })
     }

     try {
       // Get workspace
       const workspace = await db.query.workspaces.findFirst({
         where: eq(workspaces.user_id, session.user.id),
       })

       if (!workspace) {
         return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
       }

       // Generate openclaw_id (slugify name)
       const openclaw_id = name.toLowerCase().replace(/\s+/g, '')

       // Save agent to database
       const [agent] = await db.insert(agents).values({
         workspace_id: workspace.id,
         openclaw_id,
         name,
         role: role || null,
         model: model || 'anthropic/claude-sonnet-4-5',
         soul_md,
         is_admin: false,
         status: 'online',
       }).returning()

       // Provision in OpenClaw
       await provisionAgent({
         openclaw_id,
         name,
         soul_md,
         model: agent.model,
         skills: skills || ['web_search', 'web_fetch'],
       })

       return NextResponse.json(agent)
     } catch (error) {
       console.error('Error creating agent:', error)
       return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
     }
   }
   ```

**Deliverables**:
- [ ] Agent provisioner
- [ ] POST /api/agents endpoint
- [ ] OpenClaw config writer
- [ ] Agent creation working end-to-end
- [ ] Hot-reload wait time

---

### TASK 2.3: Multi-Channel Support (messaging-agent + ui-agent)

**Owner**: messaging-agent (API), ui-agent (UI)

**What to do**:

1. **Create POST /api/channels** (add to `/app/api/channels/route.ts`):
   ```typescript
   export async function POST(req: NextRequest) {
     const session = await getServerSession(authOptions)
     if (!session?.user?.id) {
       return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
     }

     const body = await req.json()
     const { name, description } = body

     if (!name) {
       return NextResponse.json({ error: 'name required' }, { status: 400 })
     }

     const workspace = await db.query.workspaces.findFirst({
       where: eq(workspaces.user_id, session.user.id),
     })

     if (!workspace) {
       return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
     }

     const [channel] = await db.insert(channels).values({
       workspace_id: workspace.id,
       name: name.replace(/^#/, ''), // Remove # prefix if present
       description: description || null,
     }).returning()

     return NextResponse.json(channel)
   }
   ```

2. **Create "+ Add Channel" button in Sidebar** (similar to Agent modal)

**Deliverables**:
- [ ] POST /api/channels endpoint
- [ ] Create channel modal
- [ ] Channel list updates dynamically

---

### TASK 2.4: Assign Agents to Channels (messaging-agent + ui-agent)

**Owner**: messaging-agent (API), ui-agent (UI)

**What to do**:

1. **Create POST /api/channels/[id]/agents** (`/app/api/channels/[id]/agents/route.ts`):
   ```typescript
   export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
     const session = await getServerSession(authOptions)
     if (!session?.user?.id) {
       return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
     }

     const body = await req.json()
     const { agent_id } = body

     await db.insert(channel_agents).values({
       channel_id: params.id,
       agent_id,
     })

     return NextResponse.json({ success: true })
   }
   ```

2. **Update ChannelHeader** to show "Manage Agents" button

3. **Create ManageAgentsModal** with checkboxes for each agent

**Deliverables**:
- [ ] POST /api/channels/[id]/agents endpoint
- [ ] DELETE /api/channels/[id]/agents/[agentId] endpoint
- [ ] ManageAgentsModal component
- [ ] Agent assignment working

---

### TASK 2.5: AdminBot Routing Logic (messaging-agent + openclaw-agent)

**Owner**: messaging-agent (routing parser), openclaw-agent (SOUL.md update)

**What to do**:

1. **Update AdminBot SOUL.md** to include routing instructions (already done in TASK 0.5, but verify)

2. **Create routing helper** (`/lib/openclaw/routing.ts`):
   ```typescript
   import { Agent } from '@/types'

   export function buildAdminBotContext(channelId: string, agents: Agent[]): string {
     const agentList = agents
       .filter(a => !a.is_admin)
       .map(a => `- @${a.name} (${a.openclaw_id}) — ${a.role || 'Agent'}`)
       .join('\n')

     return `SYSTEM CONTEXT:
   Channel: #${channelId}
   Agents in this channel:
   ${agentList}

   INSTRUCTIONS:
   Analyze the user's message. If it matches a specialist, respond EXACTLY:
   ROUTE:<agent_openclaw_id> — <brief reason>
   Otherwise, answer directly yourself.`
   }

   export function parseRoutingResponse(response: string): {
     isRouting: boolean
     targetAgentId?: string
     reason?: string
   } {
     const match = response.match(/^ROUTE:(\w+)\s*—\s*(.+)/i)

     if (match) {
       return {
         isRouting: true,
         targetAgentId: match[1],
         reason: match[2],
       }
     }

     return { isRouting: false }
   }
   ```

3. **Update POST /api/messages** to use routing logic:
   ```typescript
   // In handleAgentResponse function:

   // Get channel agents
   const channelAgents = await db
     .select({ agent: agents })
     .from(channel_agents)
     .leftJoin(agents, eq(channel_agents.agent_id, agents.id))
     .where(eq(channel_agents.channel_id, channelId))

   const agentsList = channelAgents.map(ca => ca.agent).filter(Boolean)

   // Build AdminBot context
   const context = buildAdminBotContext(channelId, agentsList)
   const messageWithContext = `${context}\n\nUser: ${userMessage}`

   // Send to AdminBot
   const adminResponse = await sendToAgent('admin', sessionKey, messageWithContext)

   // Parse routing
   const routing = parseRoutingResponse(adminResponse)

   if (routing.isRouting) {
     // Save AdminBot routing message
     const [routingMsg] = await db.insert(messages).values({
       channel_id: channelId,
       sender_type: 'agent',
       sender_id: adminBot.id,
       content: `Routing to @${routing.targetAgentId}: ${routing.reason}`,
     }).returning()

     io.to(`channel:${channelId}`).emit('message:new', {
       ...routingMsg,
       sender_name: adminBot.name,
     })

     // Get target agent
     const targetAgent = agentsList.find(a => a.openclaw_id === routing.targetAgentId)

     if (targetAgent) {
       // Mark target agent as busy
       await db.update(agents).set({ status: 'busy' }).where(eq(agents.id, targetAgent.id))
       io.emit('agent:status', { agent_id: targetAgent.id, status: 'busy' })

       // Forward to specialist
       const specialistResponse = await sendToAgent(
         targetAgent.openclaw_id,
         `agent:${targetAgent.openclaw_id}:channel-${channelId}`,
         userMessage
       )

       // Save specialist response
       const [specialistMsg] = await db.insert(messages).values({
         channel_id: channelId,
         sender_type: 'agent',
         sender_id: targetAgent.id,
         content: specialistResponse,
       }).returning()

       io.to(`channel:${channelId}`).emit('message:new', {
         ...specialistMsg,
         sender_name: targetAgent.name,
       })

       // Mark specialist as online
       await db.update(agents).set({ status: 'online' }).where(eq(agents.id, targetAgent.id))
       io.emit('agent:status', { agent_id: targetAgent.id, status: 'online' })
     }
   } else {
     // AdminBot answered directly (existing code)
   }
   ```

**Deliverables**:
- [ ] AdminBot routing logic
- [ ] ROUTE: prefix parser
- [ ] Multi-agent routing working
- [ ] AdminBot delegates to specialists

---

### ✅ v0.1 MILESTONE: Multi-Agent Routing Working

**Validation Checklist**:
- [ ] User can create new specialist agents via UI (e.g., TechSavvy)
- [ ] Agents appear in Sidebar with status indicators
- [ ] User can create multiple channels (#tech, #content)
- [ ] User can assign agents to channels
- [ ] User sends message in #tech: "Research GPU pricing"
- [ ] AdminBot receives message with channel context
- [ ] AdminBot routes to TechSavvy: "ROUTE:techsavvy — Tech research task"
- [ ] TechSavvy responds
- [ ] Response appears in channel
- [ ] Agent status updates (online → busy → online)
- [ ] Multiple agents can be assigned to same channel

---

## Phase 3: v1.0 - Threads & Collaboration

**Goal**: Full thread support. Multiple agents collaborate in threads. @mentions work.

---

### TASK 3.1: Thread Panel UI (ui-agent)

**Owner**: ui-agent

**What to do**:

1. **Create ThreadPanel** (`/components/threads/ThreadPanel.tsx`):
   ```typescript
   'use client'

   import { useEffect, useState } from 'react'
   import { Message } from '@/types'
   import { useSocket } from '@/lib/socket/useSocket'

   export function ThreadPanel({
     threadId,
     onClose,
   }: {
     threadId: string | null
     onClose: () => void
   }) {
     const [messages, setMessages] = useState<Message[]>([])
     const [parentMessage, setParentMessage] = useState<Message | null>(null)
     const { socket } = useSocket()

     useEffect(() => {
       if (!threadId) return

       // Fetch thread messages
       fetch(`/api/messages?thread_id=${threadId}`)
         .then(res => res.json())
         .then(setMessages)

       // Fetch parent message
       fetch(`/api/messages/${threadId}`)
         .then(res => res.json())
         .then(setParentMessage)

       // Join thread room
       socket?.emit('thread:join', threadId)

       // Listen for new replies
       socket?.on('message:new', (message: Message) => {
         if (message.thread_id === threadId) {
           setMessages(prev => [...prev, message])
         }
       })

       return () => {
         socket?.emit('thread:leave', threadId)
         socket?.off('message:new')
       }
     }, [threadId, socket])

     if (!threadId) return null

     return (
       <div className="w-[420px] border-l border-gray-700 bg-gray-800 flex flex-col">
         <div className="h-14 border-b border-gray-700 px-4 flex items-center justify-between">
           <h3 className="text-white font-semibold">Thread</h3>
           <button onClick={onClose} className="text-gray-400 hover:text-white">
             ✕
           </button>
         </div>

         <div className="flex-1 overflow-y-auto p-4 space-y-4">
           {/* Parent message */}
           {parentMessage && (
             <div className="pb-4 border-b border-gray-700">
               <div className="flex gap-3">
                 <div className="w-10 h-10 rounded bg-gray-700 flex items-center justify-center text-white font-bold">
                   {parentMessage.sender_name?.[0] || 'U'}
                 </div>
                 <div>
                   <div className="font-bold text-white">{parentMessage.sender_name}</div>
                   <div className="text-gray-300">{parentMessage.content}</div>
                   <div className="text-xs text-gray-500 mt-1">
                     {parentMessage.reply_count} replies
                   </div>
                 </div>
               </div>
             </div>
           )}

           {/* Thread replies */}
           {messages.map((message) => (
             <div key={message.id} className="flex gap-3">
               <div className="w-8 h-8 rounded bg-gray-700 flex items-center justify-center text-white text-sm font-bold">
                 {message.sender_name?.[0] || 'U'}
               </div>
               <div>
                 <div className="flex items-center gap-2">
                   <span className="font-bold text-white text-sm">{message.sender_name}</span>
                   <span className="text-xs text-gray-500">
                     {new Date(message.created_at).toLocaleTimeString()}
                   </span>
                 </div>
                 <div className="text-gray-300 text-sm">{message.content}</div>
               </div>
             </div>
           ))}
         </div>

         <ThreadInput threadId={threadId} />
       </div>
     )
   }
   ```

2. **Create ThreadInput** (`/components/threads/ThreadInput.tsx`):
   ```typescript
   'use client'

   import { useState } from 'react'

   export function ThreadInput({ threadId }: { threadId: string }) {
     const [content, setContent] = useState('')

     const handleSend = async () => {
       if (!content.trim()) return

       await fetch('/api/messages', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ thread_id: threadId, content }),
       })
       setContent('')
     }

     return (
       <div className="p-4 border-t border-gray-700">
         <div className="flex gap-2">
           <textarea
             value={content}
             onChange={(e) => setContent(e.target.value)}
             placeholder="Reply in thread..."
             className="flex-1 p-2 bg-gray-700 text-white rounded resize-none text-sm"
             rows={2}
           />
           <button
             onClick={handleSend}
             className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
           >
             Send
           </button>
         </div>
       </div>
     )
   }
   ```

3. **Update MessageList** to show "N replies" badge and open thread on click:
   ```typescript
   // In MessageList.tsx
   const [openThreadId, setOpenThreadId] = useState<string | null>(null)

   // In message render:
   {message.reply_count > 0 && (
     <button
       onClick={() => setOpenThreadId(message.id)}
       className="text-xs text-blue-400 hover:underline mt-1"
     >
       {message.reply_count} {message.reply_count === 1 ? 'reply' : 'replies'} →
     </button>
   )}

   // Add ThreadPanel to layout:
   {openThreadId && (
     <ThreadPanel threadId={openThreadId} onClose={() => setOpenThreadId(null)} />
   )}
   ```

**Deliverables**:
- [ ] ThreadPanel component
- [ ] ThreadInput component
- [ ] "N replies" badge in MessageList
- [ ] Thread panel slides in from right
- [ ] Thread open/close state

---

### TASK 3.2: Thread Messages API (messaging-agent)

**Owner**: messaging-agent

**What to do**:

1. **Add GET /api/messages/[id]** for fetching parent message (`/app/api/messages/[id]/route.ts`):
   ```typescript
   export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
     const session = await getServerSession(authOptions)
     if (!session?.user?.id) {
       return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
     }

     const message = await db.query.messages.findFirst({
       where: eq(messages.id, params.id),
     })

     return NextResponse.json(message)
   }
   ```

2. **Update POST /api/messages** to handle thread replies (already partially done in TASK 1.5):
   - If `thread_id` is provided, save message with `thread_id` set
   - Trigger will auto-increment `reply_count` on parent
   - Push to `thread:${threadId}` room via Socket.io

**Deliverables**:
- [ ] GET /api/messages/[id] endpoint
- [ ] Thread replies save correctly
- [ ] reply_count trigger working
- [ ] Socket.io pushes to thread rooms

---

### TASK 3.3: Thread Routing with @Mentions (messaging-agent + ui-agent)

**Owner**: messaging-agent (routing), ui-agent (@mention autocomplete)

**What to do**:

1. **Create @mention parser** (`/lib/utils/mentions.ts`):
   ```typescript
   export function extractMentions(content: string): string[] {
     const regex = /@(\w+)/g
     const matches = content.matchAll(regex)
     return Array.from(matches, m => m[1].toLowerCase())
   }
   ```

2. **Update POST /api/messages** thread routing:
   ```typescript
   // In handleAgentResponse for thread replies:
   if (threadId) {
     // Parse @mentions
     const mentions = extractMentions(userMessage)

     if (mentions.length > 0) {
       // Route to mentioned agents
       for (const mentionedName of mentions) {
         const agent = await db.query.agents.findFirst({
           where: eq(agents.openclaw_id, mentionedName),
         })

         if (agent) {
           // Build thread context
           const threadMessages = await db.query.messages.findMany({
             where: eq(messages.thread_id, threadId),
             orderBy: messages.created_at,
           })

           const context = buildThreadContext(threadMessages, agent.soul_md)

           // Send to agent
           const response = await sendToAgent(
             agent.openclaw_id,
             `agent:${agent.openclaw_id}:thread-${threadId}`,
             context
           )

           // Save response
           await db.insert(messages).values({
             thread_id: threadId,
             sender_type: 'agent',
             sender_id: agent.id,
             content: response,
           })

           // Add to thread_participants
           await db.insert(thread_participants).values({
             thread_id: threadId,
             agent_id: agent.id,
           }).onConflictDoNothing()
         }
       }
     } else {
       // No @mention → send to AdminBot to decide
       // (similar to channel routing logic)
     }
   }
   ```

3. **Create @mention autocomplete** (ui-agent):
   - Detect "@" typed in ThreadInput
   - Show dropdown with available agents
   - Filter as user types

**Deliverables**:
- [ ] @mention parser
- [ ] Thread routing with @mentions
- [ ] Thread context building
- [ ] thread_participants tracking
- [ ] @mention autocomplete UI

---

### TASK 3.4: Daily Standup System (standup-agent)

**Owner**: standup-agent

**What to do**:

1. **Create standup API** (`/app/api/standup/trigger/route.ts`):
   ```typescript
   import { db } from '@/lib/db'
   import { messages, agents, channels } from '@/lib/db/schema'
   import { sendToAgent } from '@/lib/openclaw/client'
   import { getIO } from '@/server/socket-server'

   export async function POST(req: NextRequest) {
     // Get #daily-standup channel
     const standupChannel = await db.query.channels.findFirst({
       where: eq(channels.channel_type, 'standup'),
     })

     if (!standupChannel) {
       return NextResponse.json({ error: 'Standup channel not found' }, { status: 404 })
     }

     const io = getIO()

     // 1. AdminBot opens standup
     const adminBot = await db.query.agents.findFirst({
       where: eq(agents.is_admin, true),
     })

     const openingMsg = await db.insert(messages).values({
       channel_id: standupChannel.id,
       sender_type: 'agent',
       sender_id: adminBot!.id,
       content: 'Good morning team! Time for daily standup.',
     }).returning()

     io.to(`channel:${standupChannel.id}`).emit('message:new', openingMsg[0])

     // 2. Query each agent for their status
     const allAgents = await db.query.agents.findMany({
       where: eq(agents.is_admin, false),
     })

     for (const agent of allAgents) {
       const report = await sendToAgent(
         agent.openclaw_id,
         `agent:${agent.openclaw_id}:standup`,
         'Report your recent activity and current status.'
       )

       const reportMsg = await db.insert(messages).values({
         channel_id: standupChannel.id,
         sender_type: 'agent',
         sender_id: agent.id,
         content: report,
       }).returning()

       io.to(`channel:${standupChannel.id}`).emit('message:new', reportMsg[0])
     }

     // 3. AdminBot summarizes
     const summary = await sendToAgent(
       'admin',
       'agent:admin:standup',
       'Summarize the team standup reports.'
     )

     const summaryMsg = await db.insert(messages).values({
       channel_id: standupChannel.id,
       sender_type: 'agent',
       sender_id: adminBot!.id,
       content: summary,
     }).returning()

     io.to(`channel:${standupChannel.id}`).emit('message:new', summaryMsg[0])

     return NextResponse.json({ success: true })
   }
   ```

2. **Create #daily-standup channel on workspace provisioning**:
   ```typescript
   // In /lib/auth/provision.ts, add:
   const [standupChannel] = await db.insert(channels).values({
     workspace_id: workspace.id,
     name: 'daily-standup',
     description: 'Daily standup reports',
     channel_type: 'standup',
   }).returning()
   ```

3. **Setup cron** (using `node-cron`):
   ```bash
   npm install node-cron @types/node-cron
   ```

   Create `/lib/cron/standup.ts`:
   ```typescript
   import cron from 'node-cron'

   export function startStandupCron() {
     // Run at 9:00 AM daily
     cron.schedule('0 9 * * *', async () => {
       console.log('Running daily standup...')

       await fetch('http://localhost:3000/api/standup/trigger', {
         method: 'POST',
       })
     })
   }
   ```

   Call in `server.js`:
   ```javascript
   const { startStandupCron } = require('./lib/cron/standup')

   // After httpServer.listen:
   startStandupCron()
   ```

**Deliverables**:
- [ ] POST /api/standup/trigger endpoint
- [ ] #daily-standup channel auto-created
- [ ] Standup report generation
- [ ] Cron job configured
- [ ] AdminBot summary

---

### ✅ v1.0 MILESTONE: Threads & Collaboration Working

**Validation Checklist**:
- [ ] User sends message in channel
- [ ] User clicks "N replies" to open thread panel
- [ ] Thread panel slides in from right
- [ ] User can reply in thread
- [ ] User can @mention agents: "@techsavvy need more data"
- [ ] Mentioned agent receives thread context and responds
- [ ] Multiple agents can collaborate in same thread
- [ ] Thread participants tracked
- [ ] reply_count updates in real-time on parent message
- [ ] Daily standup runs (manual trigger or cron)
- [ ] Agents post status reports in #daily-standup
- [ ] AdminBot posts summary

---

## Testing & Validation

### Manual Testing Checklist

**v0.0**:
- [ ] Fresh database: user can sign up with email
- [ ] Workspace + #general + AdminBot auto-created
- [ ] User can type message and send
- [ ] AdminBot receives message via OpenClaw and responds
- [ ] Response appears with typing indicator (Socket.io streaming)
- [ ] Open two browser tabs, send message from one, see in both
- [ ] Logout and login again, messages persist

**v0.1**:
- [ ] Create agent: TechSavvy (Tech Research Specialist)
- [ ] Agent appears in Sidebar with status indicator
- [ ] Create #tech channel
- [ ] Assign TechSavvy to #tech
- [ ] Send message: "Research GPU pricing trends"
- [ ] AdminBot routes: "ROUTE:techsavvy — Tech research task"
- [ ] TechSavvy responds
- [ ] Agent status: online → busy → online
- [ ] Create second agent: ContentCreator
- [ ] Both agents in #tech, routing works for both

**v1.0**:
- [ ] Send message in #tech: "Research GPUs and write a post"
- [ ] Click message to open thread panel
- [ ] Reply: "Go deeper on AMD"
- [ ] @mention: "@techsavvy need AMD data"
- [ ] TechSavvy receives full thread context and responds
- [ ] Reply: "@contentcreator start drafting"
- [ ] ContentCreator joins thread
- [ ] Thread participants visible
- [ ] reply_count badge updates live
- [ ] Trigger standup: POST /api/standup/trigger
- [ ] Check #daily-standup for reports

### Edge Cases
- [ ] Send message while offline → fail gracefully
- [ ] OpenClaw Gateway is down → show error
- [ ] Agent takes too long (timeout)
- [ ] Create agent with same name → auto-suffix
- [ ] @mention non-existent agent → ignore
- [ ] Thread with 100+ messages → pagination?

---

## Task Dependencies

```
Phase 0 (Foundation):
  0.1 (Project Init)
    ↓
  0.2 (Postgres) ← parallel → 0.3 (NextAuth) ← parallel → 0.4 (Socket.io)
    ↓
  0.5 (OpenClaw)
    ↓
  0.6 (Types)
    ↓
  All must complete before Phase 1

Phase 1 (v0.0):
  1.1 (Auth) → 1.2 (Layout) → 1.3 (Main Pane)
    ↓
  1.4 (Messages Read) → 1.5 (Messages Create + OpenClaw)
    ↓
  1.6 (Channels & Agents API)

Phase 2 (v0.1):
  2.1 (Agent UI) → 2.2 (Agent API)
    ↓
  2.3 (Multi-Channel) → 2.4 (Assign Agents)
    ↓
  2.5 (Routing Logic)

Phase 3 (v1.0):
  3.1 (Thread UI) → 3.2 (Thread API) → 3.3 (Thread Routing)
    ↓
  3.4 (Standup) can run in parallel
```

**Estimated Timeline**:
- Phase 0 (Foundation): 1-2 days
- Phase 1 (v0.0): 2-3 days
- Phase 2 (v0.1): 3-4 days
- Phase 3 (v1.0): 4-5 days

**Total**: ~2-2.5 weeks for full v1.0

---

## Success Criteria

✅ **v0.0**: User logs in, sends message, gets streaming response from AdminBot via Socket.io.

✅ **v0.1**: User creates agents, assigns to channels, AdminBot routes to specialists.

✅ **v1.0**: User spawns threads, @mentions agents, watches them collaborate with full context.

---

**Ready to build? Let's ship AgentSlack! 🚀**
