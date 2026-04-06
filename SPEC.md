# AgentSlack — Product & Technical Specification

> A Slack-like workspace where users create, manage, and collaborate with specialized AI agents in themed channels with threaded conversations. Powered by OpenClaw.

---

## Table of Contents

1. [Product Overview](#1-product-overview)
2. [Core Concepts](#2-core-concepts)
3. [Version Roadmap](#3-version-roadmap)
4. [Architecture Overview](#4-architecture-overview)
5. [OpenClaw Integration](#5-openclaw-integration)
6. [Agent-to-Agent Routing](#6-agent-to-agent-routing)
7. [Database Schema](#7-database-schema)
8. [Backend API](#8-backend-api)
9. [Message Flow & Routing](#9-message-flow--routing)
10. [Thread System (v1)](#10-thread-system-v1)
11. [MainBot / Admin Bot](#11-mainbot--admin-bot)
12. [Daily Standup System](#12-daily-standup-system)
13. [Frontend / UI Layout](#13-frontend--ui-layout)
14. [Real-time System](#14-real-time-system)
15. [Auth](#15-auth)
16. [Security Model](#16-security-model)
17. [Storage & Scaling](#17-storage--scaling)
18. [Tech Stack Summary](#18-tech-stack-summary)

---

## 1. Product Overview

AgentSlack is a chat-first platform for managing teams of AI agents. Users interact with specialized agents in themed channels (#tech, #content, #software), delegate tasks via natural conversation, and watch agents collaborate — all in a familiar Slack-like interface.

### Key Differentiators

| Existing Solution | What It Is | How AgentSlack Differs |
|---|---|---|
| Mission Control (missioncontrolhq.ai) | Dashboard/Kanban for AI agent squads | Chat-first, not a project board. Messages ARE the task system. |
| Slack + Agentforce | Enterprise agents inside Slack | Standalone product. User owns agents. Not locked to Salesforce. |
| CrewAI / AutoGen | Backend multi-agent frameworks | Consumer-facing UI. No Python required. |
| OpenClaw native multi-agent | CLI/config-based agent routing | Visual Slack-like chat interface with channels and threads. |

### Target Users

Solopreneurs, indie hackers, and small teams who want an AI workforce they can direct conversationally — without writing infrastructure code.

---

## 2. Core Concepts

### Workspace

A user's top-level container. One user = one workspace. Contains channels and agents.

### Agents

AI-powered bots with specialized roles. Each agent maps 1:1 to an OpenClaw agent with its own isolated workspace. An agent has:

- **Name & avatar** — e.g., @TechSavvy, @ContentCreator, @SoftwarePro
- **SOUL.md** — personality, role definition, expertise, communication style (stored in OpenClaw workspace)
- **Model config** — which LLM to use (Claude Sonnet, Opus, GPT, etc.)
- **Skills** — OpenClaw skills the agent has access to (web search, file ops, browser, etc.)
- **Status** — online / busy / offline

### AdminBot (Orchestrator)

A special default agent that exists in every workspace. It:

- Lives in every channel automatically
- Receives all user messages first (in v0.1+)
- Routes tasks to the right specialist agent
- Coordinates multi-agent work within threads (v1)
- Runs daily standups
- Introduces new agents into threads when needed

### Channels

Themed spaces like #tech, #content, #software, #daily-standup. Users assign agents to channels. AdminBot is always present in every channel.

### Threads (v1)

Any message can spawn a thread. Threads are where deep work happens — agents collaborate, users give feedback, tasks iterate. The main channel stays clean with summary messages.

### Messages

The single unit of communication. Every interaction — user messages, agent responses, AdminBot routing, standup reports — is a message. Messages live either in channels (top-level) or in threads (replies).

---

## 3. Version Roadmap

### v0.0 — AdminBot Chat (MVP-zero)

**Goal:** Single-agent chat. Prove the pipe works.

```
User types in UI
    → HTTP POST to backend
    → Backend sends to OpenClaw Gateway (HTTP Tools Invoke API)
    → AdminBot (default OpenClaw agent) processes
    → Response streams back
    → Backend pushes to frontend via WebSocket
    → User sees streaming response
```

**What gets built:**

- Single channel: #general
- One agent: AdminBot (the default OpenClaw `main` agent)
- Slack-like UI with sidebar + message pane (no thread panel yet)
- Message persistence in local Postgres
- Streaming responses from OpenClaw → WebSocket → UI
- Basic auth (NextAuth.js)

**What it looks like:**

```
┌──────────┬───────────────────────────────────────┐
│ Channels │  #general                              │
│          │                                        │
│ #general │  You: What's the latest in AI?         │
│          │                                        │
│          │  AdminBot: Here's what's happening...  │
│          │  [streaming response]                  │
│          │                                        │
│          │  ┌──────────────────────────────────┐  │
│          │  │ Type a message...            Send │  │
│          │  └──────────────────────────────────┘  │
└──────────┴───────────────────────────────────────┘
```

**OpenClaw config (v0.0):**

```json5
{
  agents: {
    defaults: {
      workspace: "~/.openclaw/workspace",
      model: "anthropic/claude-sonnet-4-5",
    },
  },
  gateway: {
    auth: { token: "${OPENCLAW_GATEWAY_TOKEN}" },
  },
}
```

Single agent (`main`), single session (`agent:main:main`). Gateway at `ws://127.0.0.1:18789`.

---

### v0.1 — Specialist Agent + AdminBot Routing

**Goal:** User creates ONE specialist agent. AdminBot receives messages and delegates to the specialist when appropriate.

```
User types in #tech: "Research GPU pricing trends"
    → Backend receives message, saves to Postgres
    → Backend sends to AdminBot's OpenClaw session (with channel context)
    → AdminBot decides: "ROUTE:techsavvy — tech research task"
    → Backend parses ROUTE prefix
    → Backend sends task to TechSavvy's OpenClaw session
    → TechSavvy works (uses web search, etc.)
    → TechSavvy streams response back
    → Backend saves + pushes to frontend via WebSocket
```

**What gets built on top of v0.0:**

- Agent creation UI (name, role, SOUL.md, model, avatar)
- Multiple channels (#tech, #content, etc.)
- Assign agents to channels (channel_agents join table)
- AdminBot routing logic: receives user message → decides which agent handles it
- Agent status indicators (online/busy/offline)
- Multiple OpenClaw agents via multi-agent config

**What it looks like:**

```
┌──────────┬───────────────────────────────────────┬──────────────┐
│ Channels │  #tech                                │  Agents      │
│          │                                       │              │
│ #general │  You: Research GPU pricing for 2026   │  🤖 AdminBot │
│ #tech    │                                       │     🟢 online │
│ #content │  AdminBot: Routing to @TechSavvy      │              │
│          │                                       │  🧠 TechSavvy│
│ ──────── │                                       │     🟡 busy  │
│ + Channel│  TechSavvy: Here's what I found...    │              │
│          │  NVIDIA H200 trending at $35K...      │              │
│ ──────── │  [streaming]                          │              │
│ Agents   │                                       │              │
│ + Agent  │  ┌──────────────────────────────────┐ │              │
│          │  │ Message #tech...  @│         Send │ │              │
│          │  └──────────────────────────────────┘ │              │
└──────────┴───────────────────────────────────────┴──────────────┘
```

**OpenClaw config (v0.1):**

```json5
{
  agents: {
    list: [
      {
        id: "admin",
        default: true,
        name: "AdminBot",
        workspace: "~/.openclaw/workspace-admin",
        agentDir: "~/.openclaw/agents/admin/agent",
        model: "anthropic/claude-sonnet-4-5",
        tools: {
          allow: [
            "group:fs", "group:sessions", "group:memory",
            "web_search", "web_fetch",
          ],
        },
        subagents: { allowAgents: ["*"] },
      },
      {
        id: "techsavvy",
        name: "TechSavvy",
        workspace: "~/.openclaw/workspace-techsavvy",
        agentDir: "~/.openclaw/agents/techsavvy/agent",
        model: "anthropic/claude-sonnet-4-5",
        tools: {
          allow: ["web_search", "web_fetch"],
          deny: ["exec", "read", "write", "edit", "apply_patch", "browser", "canvas", "gateway"],
        },
      },
    ],
  },
  gateway: {
    auth: { token: "${OPENCLAW_GATEWAY_TOKEN}" },
  },
}
```

**Critical design decision:** We do NOT use OpenClaw's native channel bindings (WhatsApp/Telegram/Slack routing). Our backend is the router — it receives messages from our React frontend and programmatically dispatches to the right OpenClaw agent session via the Gateway HTTP API. This gives us full control over routing logic, message persistence, and real-time delivery.

---

### v1.0 — Threads + Multi-Agent Collaboration

**Goal:** Full thread support. Multiple agents can be pulled into a single thread. Users reply in threads to direct agents, give feedback, and iterate.

**What gets built on top of v0.1:**

- Thread panel (right side of UI)
- `thread_id` on messages (self-referencing FK)
- Thread-aware agent context (agents see full thread history)
- User can @mention agents in thread replies
- AdminBot can pull new agents into active threads
- `thread_participants` tracking
- `reply_count` denormalization for main channel view
- Daily standup system (#daily-standup channel + cron)

---

## 4. Architecture Overview

### High-Level Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         FRONTEND (React / Next.js)                   │
│                                                                      │
│  ┌───────────┐  ┌─────────────────────┐  ┌────────────────────────┐ │
│  │  Sidebar   │  │  Main Channel Pane  │  │  Thread Panel (v1)     │ │
│  │            │  │                     │  │                        │ │
│  │  Channels  │  │  Top-level messages │  │  Thread replies        │ │
│  │  Agents    │  │  "4 replies" links  │  │  Streaming responses   │ │
│  │  + Create  │  │  Streaming text     │  │  @mention agents       │ │
│  └───────────┘  └─────────────────────┘  └────────────────────────┘ │
│                                                                      │
└──────────────────────────┬───────────────────────────────────────────┘
                           │
                           │  WebSocket (Socket.io)
                           │  Direct push from backend — no DB trigger middleman
                           │
┌──────────────────────────▼───────────────────────────────────────────┐
│                      BACKEND (Next.js API Routes + WS Server)        │
│                                                                      │
│  HTTP Endpoints:                                                     │
│  ├── POST /api/messages          — save + trigger agent routing      │
│  ├── GET  /api/messages          — fetch channel/thread history      │
│  ├── POST /api/agents            — create agent + provision OpenClaw │
│  ├── POST /api/channels          — create channel                   │
│  └── POST /api/standup/trigger   — cron: trigger daily standup      │
│                                                                      │
│  WebSocket Server (Socket.io):                                       │
│  ├── Pushes new messages to connected clients                        │
│  ├── Pushes streaming agent response chunks                          │
│  └── Pushes agent status changes (online/busy/offline)               │
│                                                                      │
│  Orchestration layer:                                                │
│  ├── Receives user message                                           │
│  ├── Saves to Postgres                                               │
│  ├── Sends to AdminBot via OpenClaw Tools Invoke HTTP API            │
│  ├── Parses AdminBot routing decision (ROUTE:<agentId>)              │
│  ├── Forwards to specialist agent via Tools Invoke API               │
│  ├── Streams response → saves to Postgres → pushes via WebSocket     │
│  └── All agent↔agent communication goes THROUGH the backend          │
│                                                                      │
└────────────┬──────────────────────────────┬──────────────────────────┘
             │                              │
    ┌────────▼──────────┐         ┌────────▼──────────┐
    │  Local Postgres    │         │  OpenClaw Gateway  │
    │                    │         │                    │
    │  • messages        │         │  http://127.0.0.1  │
    │  • channels        │         │  :18789             │
    │  • agents          │         │                    │
    │  • users           │         │  POST /tools/invoke│
    │  • workspaces      │         │  (sessions_send)   │
    │                    │         │                    │
    │  No Supabase.      │         │  Agents:           │
    │  No vendor lock-in.│         │  ├── admin (main)  │
    │  Just Postgres.    │         │  ├── techsavvy     │
    │                    │         │  ├── contentbot    │
    └────────────────────┘         │  └── softwarepro   │
                                   │                    │
                                   │  Each agent has:   │
                                   │  ├── workspace/    │
                                   │  │   ├── SOUL.md   │
                                   │  │   └── skills/   │
                                   │  ├── agentDir/     │
                                   │  │   └── sessions/ │
                                   │  └── (isolated)    │
                                   └────────────────────┘
```

### Why No Supabase?

The original spec used Supabase for three things: Postgres, Auth, and Realtime. We replaced all three with simpler, self-hosted alternatives:

| Supabase Feature | Replaced With | Why |
|---|---|---|
| Postgres | Local Postgres (`brew install postgresql@16`) | Same DB, zero cost, no vendor lock-in |
| Auth | NextAuth.js (or Lucia) | JWT + OAuth, more flexible |
| Realtime (postgres_changes) | Socket.io WebSocket | **Better**: backend already has the response — push directly instead of save→DB trigger→push round-trip |

The key insight: Supabase Realtime watches for DB changes and pushes them to clients. But our backend already receives agent responses from OpenClaw — it can push directly to the frontend via WebSocket. The DB-trigger approach adds unnecessary latency.

---

## 5. OpenClaw Integration

### Setting Up Agents (CLI)

```bash
# Install OpenClaw
npm install -g openclaw    # installs as 'clawdbot' binary

# Onboard (sets up gateway, model, workspace)
clawdbot onboard

# Start the gateway
clawdbot gateway start
# Gateway runs at http://127.0.0.1:18789 (loopback only, not exposed to internet)

# Add specialist agents
clawdbot agents add techsavvy
clawdbot agents add contentcreator
clawdbot agents add softwarepro

# Verify
clawdbot agents list --bindings
```

### Writing SOUL.md for Each Agent

```bash
cat > ~/.openclaw/workspace-techsavvy/SOUL.md << 'EOF'
# TechSavvy
You are TechSavvy, a technology research specialist.
You focus on hardware trends, GPUs, AI/ML, and developer tools.
Always cite sources. Be data-driven and precise.
EOF

cat > ~/.openclaw/workspace-contentcreator/SOUL.md << 'EOF'
# ContentCreator
You are ContentCreator, a content writing specialist.
You write blog posts, social threads, and marketing copy.
You adapt tone based on the audience. Creative but concise.
EOF

cat > ~/.openclaw/workspace-softwarepro/SOUL.md << 'EOF'
# SoftwarePro
You are SoftwarePro, a senior software engineer.
You help with architecture, code review, debugging, and system design.
You write clean, production-ready code with clear explanations.
EOF
```

### Full OpenClaw Config (v1)

```json5
// ~/.openclaw/openclaw.json
{
  agents: {
    defaults: {
      model: "anthropic/claude-sonnet-4-5",
    },
    list: [
      {
        id: "admin",
        default: true,
        name: "AdminBot",
        workspace: "~/.openclaw/workspace-admin",
        agentDir: "~/.openclaw/agents/admin/agent",
        model: "anthropic/claude-sonnet-4-5",
        tools: {
          allow: [
            "group:fs", "group:sessions", "group:memory",
            "web_search", "web_fetch",
          ],
        },
        subagents: { allowAgents: ["*"] },
      },
      {
        id: "techsavvy",
        name: "TechSavvy",
        workspace: "~/.openclaw/workspace-techsavvy",
        agentDir: "~/.openclaw/agents/techsavvy/agent",
        model: "anthropic/claude-sonnet-4-5",
        // Locked down: no filesystem, no shell, no browser
        tools: {
          allow: ["web_search", "web_fetch"],
          deny: ["exec", "read", "write", "edit", "apply_patch", "browser", "canvas", "gateway"],
        },
      },
      {
        id: "contentcreator",
        name: "ContentCreator",
        workspace: "~/.openclaw/workspace-contentcreator",
        agentDir: "~/.openclaw/agents/contentcreator/agent",
        model: "anthropic/claude-sonnet-4-5",
        tools: {
          allow: ["web_search", "web_fetch"],
          deny: ["exec", "read", "write", "edit", "apply_patch", "browser", "canvas", "gateway"],
        },
      },
    ],
  },
  gateway: {
    auth: { token: "${OPENCLAW_GATEWAY_TOKEN}" },
  },
}
```

### How the Backend Talks to OpenClaw

All communication goes through the **Tools Invoke HTTP API**:

```bash
TOKEN=$(clawdbot config get gateway.auth.token)

# Send a message to a specific agent's session
curl -sS http://127.0.0.1:18789/tools/invoke \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "tool": "sessions_send",
    "args": {
      "sessionKey": "agent:techsavvy:main",
      "message": "Research GPU pricing trends for 2026"
    }
  }'
```

Key tools:

| Tool | What It Does | Use Case |
|---|---|---|
| `sessions_send` | Send message to agent session, wait for response | Direct task assignment |
| `sessions_spawn` | Start sub-agent task (async, non-blocking) | Fire-and-forget tasks |
| `sessions_list` | List all active sessions | Agent status dashboard |
| `session_status` | Get session status + model info | Agent status indicators |

### Session Mapping

| AgentSlack Concept | OpenClaw Session Key |
|---|---|
| AdminBot default session | `agent:admin:main` |
| TechSavvy in #tech channel | `agent:techsavvy:channel-<channelId>` |
| TechSavvy in a thread | `agent:techsavvy:thread-<threadId>` |
| Standup session | `agent:admin:standup` |

### OpenClaw Directory Structure

```
~/.openclaw/
├── openclaw.json                ← main config (gateway watches for hot reload)
├── workspace-admin/             ← AdminBot workspace
│   ├── SOUL.md
│   └── skills/
├── workspace-techsavvy/         ← TechSavvy workspace
│   ├── SOUL.md
│   └── skills/
├── workspace-contentcreator/    ← ContentCreator workspace
│   ├── SOUL.md
│   └── skills/
└── agents/
    ├── admin/agent/sessions/    ← admin session transcripts
    ├── techsavvy/agent/sessions/
    └── contentcreator/agent/sessions/
```

---

## 6. Agent-to-Agent Routing

### Core Principle: The Backend is the Brain

Agents never talk to each other directly. The backend orchestrates ALL communication using OpenClaw's `sessions_send` API. This ensures every message is saved to Postgres and pushed to the frontend.

### The Flow

```
User sends "Research GPU trends" in #tech
    │
    ▼
Backend receives message, saves to Postgres, pushes to frontend via WS
    │
    ▼
Backend sends to AdminBot with channel context:
    POST /tools/invoke → sessions_send
    sessionKey: "agent:admin:main"
    message: "Channel: #tech | Agents: [techsavvy] | User: Research GPU trends"
    │
    ▼
AdminBot responds: "ROUTE:techsavvy — This is a tech research task"
    │
    ▼
Backend parses "ROUTE:techsavvy"
Backend saves AdminBot's routing message to Postgres, pushes via WS
    │
    ▼
Backend sends to TechSavvy:
    POST /tools/invoke → sessions_send
    sessionKey: "agent:techsavvy:channel-<channelId>"
    message: "Research GPU pricing trends for 2026"
    │
    ▼
TechSavvy responds with research
    │
    ▼
Backend saves TechSavvy's response to Postgres, pushes via WS
Frontend shows the full chain: user → AdminBot routing → TechSavvy response
```

### Why Not Let AdminBot Call sessions_send Directly?

You *could* give AdminBot `group:sessions` and let it call `sessions_send` to talk to TechSavvy inside OpenClaw. But then:

- Your backend doesn't see the exchange → can't save to DB
- Frontend doesn't get updates → user stares at a blank screen
- You lose control over error handling, retries, timeouts
- Debugging becomes impossible

**The backend mediates everything.** Agents are dumb workers. Your backend is the brain. OpenClaw is just the LLM execution runtime.

### Thread Routing (v1)

```
User replies in thread → save to Postgres → push via WS
    │
    ▼
Routing decision:
  ├─ Has @mention? → Route to that agent
  │   └─ Agent not in thread yet? → Backend adds them (thread_participants)
  └─ No @mention? → Send to AdminBot → AdminBot picks best responder
    │
    ▼
Build context = SOUL.md + full thread history (scoped, token-efficient)
Send to: "agent:<agentId>:thread-<threadId>"
    │
    ▼
Stream response → save to Postgres → push via WS → thread panel updates
```

---

## 7. Database Schema

### Local Postgres

```bash
# Setup
brew install postgresql@16
brew services start postgresql@16
createdb agentslack
```

ORM: **Drizzle** or **Prisma** (your choice). Schema:

```sql
-- Users (managed by NextAuth.js)
CREATE TABLE users (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email       text UNIQUE NOT NULL,
  name        text,
  avatar_url  text,
  created_at  timestamptz DEFAULT now()
);

-- Workspaces
CREATE TABLE workspaces (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES users(id) NOT NULL,
  name        text NOT NULL DEFAULT 'My Workspace',
  created_at  timestamptz DEFAULT now()
);

-- Agents (metadata — OpenClaw owns the runtime state)
CREATE TABLE agents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid REFERENCES workspaces(id) NOT NULL,
  openclaw_id     text NOT NULL,          -- maps to agents.list[].id in openclaw.json
  name            text NOT NULL,          -- "TechSavvy"
  role            text,                   -- "Technology Research Specialist"
  avatar_url      text,
  model           text DEFAULT 'anthropic/claude-sonnet-4-5',
  soul_md         text,                   -- cached copy of SOUL.md
  is_admin        boolean DEFAULT false,  -- true only for AdminBot
  status          text DEFAULT 'online',  -- online | busy | offline
  created_at      timestamptz DEFAULT now()
);

-- Channels
CREATE TABLE channels (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid REFERENCES workspaces(id) NOT NULL,
  name            text NOT NULL,
  description     text,
  channel_type    text DEFAULT 'regular', -- regular | standup
  created_at      timestamptz DEFAULT now()
);

-- Which agents are assigned to which channels
CREATE TABLE channel_agents (
  channel_id  uuid REFERENCES channels(id) ON DELETE CASCADE,
  agent_id    uuid REFERENCES agents(id) ON DELETE CASCADE,
  added_at    timestamptz DEFAULT now(),
  PRIMARY KEY (channel_id, agent_id)
);

-- Messages (the core of everything)
CREATE TABLE messages (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id    uuid REFERENCES channels(id) NOT NULL,
  thread_id     uuid REFERENCES messages(id),   -- NULL = top-level, set = thread reply
  sender_type   text NOT NULL,                   -- 'user' | 'agent'
  sender_id     uuid NOT NULL,                   -- users.id or agents.id
  content       text NOT NULL,
  metadata      jsonb DEFAULT '{}',              -- { status: 'streaming'|'complete' }
  reply_count   int DEFAULT 0,                   -- denormalized: "N replies" in channel view
  created_at    timestamptz DEFAULT now()
);

-- Thread participants (v1)
CREATE TABLE thread_participants (
  thread_id   uuid REFERENCES messages(id) ON DELETE CASCADE,
  agent_id    uuid REFERENCES agents(id) ON DELETE CASCADE,
  joined_at   timestamptz DEFAULT now(),
  PRIMARY KEY (thread_id, agent_id)
);

-- Indexes
CREATE INDEX idx_messages_channel     ON messages(channel_id, created_at);
CREATE INDEX idx_messages_thread      ON messages(thread_id, created_at);
CREATE INDEX idx_messages_top_level   ON messages(channel_id, created_at) WHERE thread_id IS NULL;
CREATE INDEX idx_channel_agents_ch    ON channel_agents(channel_id);
CREATE INDEX idx_agents_workspace     ON agents(workspace_id);

-- Trigger: auto-increment reply_count on thread replies
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

---

## 8. Backend API

### Endpoints

| Method | Path | Description | Version |
|---|---|---|---|
| POST | `/api/messages` | Send message (save + trigger agent routing) | v0.0 |
| GET | `/api/messages?channel_id=X` | Fetch top-level messages for a channel | v0.0 |
| GET | `/api/messages?thread_id=X` | Fetch replies in a thread | v1.0 |
| POST | `/api/agents` | Create agent (+ provision OpenClaw) | v0.1 |
| GET | `/api/agents` | List agents in workspace | v0.1 |
| PATCH | `/api/agents/:id` | Update agent (name, SOUL.md, model) | v0.1 |
| DELETE | `/api/agents/:id` | Remove agent (+ cleanup OpenClaw) | v0.1 |
| POST | `/api/channels` | Create channel | v0.1 |
| GET | `/api/channels` | List channels | v0.0 |
| POST | `/api/channels/:id/agents` | Assign agent to channel | v0.1 |
| DELETE | `/api/channels/:id/agents/:aid` | Remove agent from channel | v0.1 |
| POST | `/api/standup/trigger` | Cron: trigger daily standup | v1.0 |

### POST /api/messages — Core Flow

```
1. Validate auth (NextAuth JWT)
2. Save message to Postgres
3. Push to frontend immediately via Socket.io WebSocket
4. Determine routing:
   a. v0.0: Send to AdminBot via sessions_send
   b. v0.1: Send to AdminBot → parse ROUTE:<id> → forward to specialist
   c. v1.0: If thread reply → check @mentions + thread_participants
5. Send to target OpenClaw agent session via Tools Invoke API
6. Stream response:
   - Push streaming chunks via WebSocket (typing indicator + progressive text)
   - When complete: save final message to Postgres
7. Mark agent status back to "online"
```

---

## 9. Message Flow & Routing

### v0.0 — AdminBot Only

```
User types → POST /api/messages → save to Postgres → push via WS
    │
    ▼
POST http://127.0.0.1:18789/tools/invoke
  tool: "sessions_send"
  sessionKey: "agent:admin:main"
  message: <user's message>
    │
    ▼
AdminBot responds → save to Postgres → push via WS → UI updates
```

### v0.1 — AdminBot + Specialist Routing

```
User types in #tech → save to Postgres → push via WS
    │
    ▼
Send to AdminBot with context:
  "Channel: #tech | Agents: [TechSavvy, ContentCreator] | Message: <user msg>"
    │
    ▼
AdminBot responds: "ROUTE:techsavvy — Tech research task"
    │
    ▼
Backend parses ROUTE prefix → save AdminBot message → push via WS
    │
    ▼
Forward to TechSavvy:
  sessionKey: "agent:techsavvy:channel-<channelId>"
    │
    ▼
TechSavvy streams response → push chunks via WS → save final to Postgres
```

### v1.0 — Thread Replies

```
User replies in thread → save to Postgres (thread_id set) → push via WS
    │
    ▼
Routing decision:
  ├─ Has @mention? → route to that agent (add to thread_participants if new)
  └─ No @mention? → AdminBot picks best responder (usually last active in thread)
    │
    ▼
Build agent context = SOUL.md + full thread history
Send to: "agent:<agentId>:thread-<threadId>"
    │
    ▼
Stream response → push via WS → save to Postgres
Update reply_count on parent message
```

---

## 10. Thread System (v1)

### Data Model

Self-referencing FK. `thread_id = NULL` means top-level. `thread_id = <msg_id>` means thread reply.

```
messages table:
┌──────────┬────────────┬───────────────┬──────────────────────────┐
│ id       │ thread_id  │ sender        │ content                  │
├──────────┼────────────┼───────────────┼──────────────────────────┤
│ msg_001  │ NULL       │ user          │ "Research GPU trends"    │ ← top-level
│ msg_002  │ msg_001    │ AdminBot      │ "Routing to @TechSavvy"  │ ← thread
│ msg_003  │ msg_001    │ TechSavvy     │ "Found NVIDIA at $35K.." │ ← thread
│ msg_004  │ msg_001    │ user          │ "Go deeper on AMD"       │ ← user reply
│ msg_005  │ msg_001    │ TechSavvy     │ "AMD deep-dive: ..."     │ ← thread
└──────────┴────────────┴───────────────┴──────────────────────────┘
```

### Agent Context in Threads

```javascript
const threadMessages = await db.query(
  `SELECT m.*, a.name as sender_name
   FROM messages m LEFT JOIN agents a ON m.sender_id = a.id
   WHERE m.thread_id = $1 ORDER BY m.created_at ASC`,
  [threadId]
)

// Context sent to OpenClaw agent
const context = [
  { role: 'system', content: agent.soul_md },
  { role: 'user', content: parentMessage.content },
  ...threadMessages.map(msg => ({
    role: msg.sender_type === 'user' ? 'user' : 'assistant',
    content: `[${msg.sender_name}]: ${msg.content}`
  })),
]
```

Thread context is scoped and token-efficient: a channel may have 500 messages, but a thread only 8-15.

---

## 11. MainBot / Admin Bot

### Routing Logic (v0.1)

AdminBot receives every user message with injected context:

```
SYSTEM CONTEXT:
Channel: #tech
Agents in this channel:
- @TechSavvy — Technology Research Specialist
- @ContentCreator — Content Writing Specialist

INSTRUCTIONS:
Analyze the user's message. If it matches a specialist, respond EXACTLY:
ROUTE:<agent_openclaw_id> — <brief reason>
Otherwise, answer directly yourself.
```

Backend parses AdminBot's response:
- Starts with `ROUTE:<id>` → extract agent, forward message
- Otherwise → display AdminBot's response directly

### Thread Coordination (v1)

In threads, AdminBot:
- Reads full thread context
- Determines which agent should respond to the latest reply
- Can introduce new agents: "Pulling @ContentCreator into this thread"
- Posts top-level summary when thread work is complete

---

## 12. Daily Standup System

```
Cron: 9:00 AM daily → POST /api/standup/trigger
    │
    ▼
Backend messages AdminBot: "Run daily standup."
    │
    ▼
AdminBot posts in #daily-standup: "Good morning team."
    │
    ▼
Backend pings each agent via sessions_send:
"Report your recent activity and current status."
    │
    ▼
Each agent posts status in #daily-standup
    │
    ▼
AdminBot summarizes: "3 tasks done. 1 draft pending review."
```

Cron trigger: use `node-cron` in the backend or OpenClaw's native cron system.

---

## 13. Frontend / UI Layout

### Component Tree

```
<App>
  <AuthProvider>             — NextAuth.js session
    <WorkspaceProvider>      — current workspace context
      <SocketProvider>       — Socket.io connection
        <Layout>
          <Sidebar />        — channels + agents list
          <MainPane>
            <ChannelHeader />
            <MessageList />  — top-level messages, "N replies" badges
            <MessageInput /> — @mention autocomplete
          </MainPane>
          <ThreadPanel />    — (v1) slides from right
        </Layout>
      </SocketProvider>
    </WorkspaceProvider>
  </AuthProvider>
</App>
```

### Layout

```
Full width (>1200px):
┌──────────┬──────────────────────────┬───────────────────┐
│ Sidebar  │   Main Channel Pane      │  Thread Panel     │
│  240px   │   flex-1                 │  420px            │
└──────────┴──────────────────────────┴───────────────────┘

No thread open:
┌──────────┬──────────────────────────────────────────────┐
│ Sidebar  │   Main Channel Pane                           │
│  240px   │   flex-1                                      │
└──────────┴──────────────────────────────────────────────┘

Mobile (<768px):
Sidebar → hamburger menu. Thread panel → full-screen overlay.
```

### Sidebar

```
┌──────────────────┐
│  🦞 AgentSlack    │
│  ───────────────  │
│                   │
│  CHANNELS         │
│  # general        │
│  # tech           │
│  # content        │
│  # daily-standup  │
│  + Add Channel    │
│                   │
│  ───────────────  │
│                   │
│  AGENTS           │
│  🤖 AdminBot  🟢  │
│  🧠 TechSavvy 🟢  │
│  ✍️ ContentBot 🟡  │
│  + Create Agent   │
│                   │
└──────────────────┘
```

### Agent Creation Modal (v0.1)

```
┌──────────────────────────────────────────┐
│  Create New Agent                     ✕  │
│──────────────────────────────────────────│
│                                          │
│  Name         [TechSavvy            ]    │
│  Role         [Tech Research Specialist] │
│  Model        [Claude Sonnet 4.5   ▼]   │
│                                          │
│  Personality & Instructions:             │
│  ┌──────────────────────────────────┐   │
│  │ You are TechSavvy, a technology  │   │
│  │ research specialist focused on   │   │
│  │ hardware trends, AI/ML...        │   │
│  └──────────────────────────────────┘   │
│                                          │
│  Skills:                                 │
│  ☑ Web Search    ☑ Web Fetch             │
│  ☐ Browser       ☐ File Operations       │
│                                          │
│              [Cancel]  [Create Agent]    │
└──────────────────────────────────────────┘
```

---

## 14. Real-time System

### Architecture

No Supabase Realtime. No DB triggers. Direct WebSocket push from backend.

```
Agent response arrives at backend
    → Backend pushes via Socket.io to all connected clients in that channel/thread
    → Backend saves final message to Postgres (source of truth)
```

### Socket.io Events

**Server → Client:**

```typescript
// New message in a channel
io.to(`channel:${channelId}`).emit('message:new', {
  id, channel_id, thread_id, sender_type, sender_id, content, created_at
})

// Agent streaming (typing indicator + progressive text)
io.to(`channel:${channelId}`).emit('message:streaming', {
  message_id, chunk, status: 'streaming' | 'complete'
})

// Agent status change
io.emit('agent:status', { agent_id, status: 'online' | 'busy' | 'offline' })

// Reply count updated (for thread badges)
io.to(`channel:${channelId}`).emit('message:reply_count', {
  message_id, reply_count
})
```

**Client → Server:**

```typescript
// Join a channel room
socket.emit('channel:join', channelId)

// Join a thread room (when thread panel opens)
socket.emit('thread:join', threadId)

// Leave rooms when navigating away
socket.emit('channel:leave', channelId)
socket.emit('thread:leave', threadId)
```

### Streaming Agent Responses

```typescript
// Backend: when OpenClaw streams a response
async function handleAgentResponse(channelId, agentId, threadId) {
  // 1. Mark agent as busy
  io.emit('agent:status', { agent_id: agentId, status: 'busy' })

  // 2. Stream chunks to frontend
  for await (const chunk of openclawStream) {
    io.to(`channel:${channelId}`).emit('message:streaming', {
      message_id: tempId,
      chunk: chunk.text,
      status: 'streaming'
    })
  }

  // 3. Save final message to Postgres
  const message = await db.query(
    'INSERT INTO messages (...) VALUES (...) RETURNING *',
    [channelId, threadId, 'agent', agentId, fullContent]
  )

  // 4. Send final message event
  io.to(`channel:${channelId}`).emit('message:new', message)
  io.to(`channel:${channelId}`).emit('message:streaming', {
    message_id: tempId, status: 'complete'
  })

  // 5. Mark agent as online
  io.emit('agent:status', { agent_id: agentId, status: 'online' })
}
```

---

## 15. Auth

- **NextAuth.js** — email/password, Google OAuth, GitHub OAuth
- JWT tokens for API requests
- Middleware-based auth checks on all endpoints (no RLS — we're not using Supabase)
- On first login: auto-create workspace + #general channel + AdminBot agent

---

## 16. Security Model

### OpenClaw Gateway

- **Binds to loopback only** (`127.0.0.1:18789`) — not exposed to the internet
- **Gateway token required** — set during onboard, stored in openclaw.json
- Verify with: `lsof -i :18789` (should show `127.0.0.1`, NOT `0.0.0.0`)

### Agent Permissions

Specialist agents are locked down — no filesystem, no shell:

```json5
{
  tools: {
    allow: ["web_search", "web_fetch"],
    deny: ["exec", "read", "write", "edit", "apply_patch", "browser", "canvas", "gateway"],
  },
}
```

Only AdminBot gets broader access (trusted, orchestrator role).

Without Docker sandboxing (optional), tool deny lists are the "soft sandbox." OpenClaw blocks denied tool calls at the gateway level.

### Secrets

- **Never put `.env` files in agent workspaces** — agents can read their own workspace
- **Never put API keys, SSH keys, or credentials** anywhere agents can reach
- OpenClaw stores auth profiles at `~/.openclaw/agents/<id>/agent/auth-profiles.json` — these are per-agent and isolated
- Agent workspace files can end up in LLM prompt context → gets sent to the model provider (Anthropic/OpenAI)

### Data Flow

```
Your Mac → OpenClaw Gateway (local) → LLM Provider API (cloud) → response back
```

OpenClaw itself does NOT phone home or share data with its own servers. But every prompt goes to whatever LLM provider you configured (Anthropic, OpenAI, etc.). If you want zero data leaving your machine, use a local model via Ollama (weaker but private).

---

## 17. Storage & Scaling

### Will Saving Every Message Blow Up the DB?

No. The math:

```
Average message: ~500 bytes (UUID + content + metadata + timestamps)
Heavy day: 500 messages across all channels/threads

500 msgs/day × 500 bytes = 250 KB/day
250 KB × 365 = ~91 MB/year
```

Even with long agent responses (5-10KB each):

```
500 msgs/day × 5 KB = 2.5 MB/day = ~900 MB/year
```

Under 1 GB/year. Postgres handles tens of millions of rows without issue.

### What Actually Costs Money

Not storage. **LLM API tokens.** A single agent response might cost $0.01-0.10 in tokens. 500 messages/day with agent responses = $5-50/day in API costs. That's 100x more expensive than any database bill.

### When to Worry

- Storing file attachments in the DB (don't — use filesystem or S3)
- Storing every streaming chunk as a separate row (don't — stream via WebSocket, save final only)
- Scaling to thousands of users on one Postgres instance (use connection pooling + read replicas)

---

## 18. Tech Stack Summary

| Layer | Technology | Why |
|---|---|---|
| **Frontend** | Next.js 14+, React, Tailwind CSS | Slack-like SPA, SSR for initial load |
| **Backend** | Next.js API Routes + Socket.io server | Co-located, WebSocket support |
| **Database** | Local PostgreSQL 16 | Zero cost, no vendor lock-in, Drizzle/Prisma ORM |
| **Auth** | NextAuth.js | JWT + OAuth, flexible |
| **Real-time** | Socket.io (WebSocket) | Direct push, no DB-trigger middleman |
| **Agent Runtime** | OpenClaw Gateway | Multi-agent sessions, memory, skills, tools |
| **Agent API** | OpenClaw Tools Invoke HTTP API | `POST /tools/invoke` with `sessions_send` |
| **Cron** | node-cron or OpenClaw native cron | Daily standups |
| **Deployment (dev)** | Local Mac | Postgres + Next.js + OpenClaw Gateway all local |
| **Deployment (prod)** | Vercel (app) + VPS (OpenClaw Gateway) | Serverless app, persistent agent server |

### Local Dev Setup

```bash
# 1. Database
brew install postgresql@16
brew services start postgresql@16
createdb agentslack

# 2. OpenClaw
npm install -g openclaw    # binary: clawdbot
clawdbot onboard
clawdbot gateway start
clawdbot agents add techsavvy
clawdbot agents add contentcreator

# 3. App
npx create-next-app@latest agentslack
cd agentslack
npm install socket.io socket.io-client drizzle-orm pg next-auth
npm run dev
```

### Production Deployment

```
┌──────────────────┐        ┌───────────────────────────┐
│  Vercel           │        │  VPS ($5-20/mo)            │
│  Next.js app      │◄──────►│  OpenClaw Gateway           │
│  (frontend + API) │  HTTP  │  http://127.0.0.1:18789    │
│                   │        │                             │
└────────┬──────────┘        │  Agents: admin, techsavvy, │
         │                   │  contentcreator, softwarepro│
    ┌────▼──────────┐        └───────────────────────────┘
    │  Managed PG    │
    │  (Neon/Railway)│
    └────────────────┘
```

OpenClaw Gateway MUST run on a persistent server (maintains sessions and agent workspaces on disk). A small VPS handles 3-5 agents easily.

---

## Appendix: Comparison with Mission Control

| Aspect | Mission Control | AgentSlack |
|---|---|---|
| UX metaphor | Dashboard + Kanban board | Slack-like chat channels |
| Interaction | Assign tasks on a board | Chat in channels, @mention agents |
| Communication | Heartbeat polling (2-5 min) | Real-time push via backend WebSocket |
| Agent routing | Agents poll for @mentions via REST | Backend pushes to agents via OpenClaw API |
| Visibility | Activity feed + task cards | Message streams + threads |
| Data model | 13 tables | ~6 tables (messages are everything) |
| Real-time | Supabase postgres_changes | Socket.io (direct push, lower latency) |
| Database | Supabase (hosted) | Local Postgres (zero cost) |
| Auth | Supabase Auth | NextAuth.js |

**Core difference:** In Mission Control, the task board is the interface. In AgentSlack, the conversation is the interface — messages are tasks, updates, deliverables, and coordination in one stream.
