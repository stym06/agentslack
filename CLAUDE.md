# AgentSlack Development Guidelines

## Project Overview

AgentSlack is a Slack-like workspace for managing teams of AI agents. Built with Next.js 16, React 19, PostgreSQL (Prisma ORM), Socket.io, and Claude Code CLI.

## Architecture

- **Frontend**: Next.js App Router (`app/`), React components (`components/`), Tailwind CSS 4, shadcn/ui
- **Backend**: Next.js API routes (`app/api/`), custom HTTP server (`server.ts`)
- **Database**: PostgreSQL via Prisma (`prisma/schema.prisma`), client at `lib/db/index.ts`
- **Real-time**: Socket.io server (`server/socket-server.ts`), client hooks (`lib/socket/`)
- **Agent Runtime**: Claude Code CLI processes managed by `server/agent-daemon.ts`
- **Agent Tools**: MCP bridge server (`server/mcp-bridge.ts`) exposes tools to agents
- **Auth**: NextAuth.js (`lib/auth/config.ts`)

## Key Directories

```
app/api/              # API routes (public + internal agent routes)
app/api/internal/     # Internal routes called by MCP bridge (no auth)
components/           # React components
lib/                  # Shared libraries (db, hooks, helpers)
server/               # Server-side modules (daemon, socket, MCP bridge)
prisma/               # Schema and migrations
__tests__/            # Test files mirroring source structure
types/                # TypeScript type definitions
```

## Testing

Every feature change, bug fix, or refactor to source files **must** include corresponding unit tests. Run `npm test` before committing to verify all tests pass.

- Test framework: **Vitest** (config in `vitest.config.ts`)
- Test location: `__tests__/` directory, mirroring source structure
- Run tests: `npm test` (single run) or `npm run test:watch` (watch mode)
- Coverage: `npx vitest run --coverage` — maintain >70% overall coverage
- Mocking patterns: use `vi.hoisted()` for mock variables used inside `vi.mock()` factories
- API route tests: mock `next-auth`, `@/lib/db`, `@/server/socket-server`, `@/server/agent-daemon` as needed
- Test environment is `node` (not jsdom) — component rendering tests are not in scope

## Database

- ORM: Prisma with PostgreSQL adapter (`@prisma/adapter-pg`)
- Schema: `prisma/schema.prisma`
- Migrations: `npx prisma migrate dev --name <name>`
- Client generation: `npx prisma generate` (outputs to `lib/generated/prisma/`)
- `DATABASE_URL` must be set in `.env.local` — no hardcoded fallback
- Dynamic import in `server.ts` (after dotenv loads): `const { db } = await import('./lib/db')`

## Environment

- All env vars documented in `.env.example`
- `server.ts` loads `.env.local` via dotenv before any DB imports
- Modules that import `lib/db` must not be statically imported in `server.ts` — use dynamic `await import()`

## Real-time Events

Socket.io rooms: `channel:{id}`, `thread:{id}`, `agent:{id}`

Key events:
- `message:new`, `message:streaming`, `message:reply_count`
- `agent:status`, `agent:activity`
- `task:created`, `task:updated`
- `project:created`, `project:updated`

## Agent System

- Each agent runs as a Claude Code CLI subprocess (`server/agent-daemon.ts`)
- Agents communicate via MCP tools defined in `server/mcp-bridge.ts`
- Activity events are emitted via Socket.io and persisted to `activity_events` table (72h TTL)
- Agent MCP tools: `send_message`, `read_history`, `check_messages`, `list_channels`, `list_agents`, `list_projects`, `list_tasks`, `create_tasks`, `claim_tasks`, `unclaim_task`, `update_task_status`, `get_task_context`

## Task System

- Tasks are always linked to a project (`project_id` required at application level)
- Tasks can be created from UI (message hover button or TaskList) or by agents via MCP
- Task statuses: `todo`, `in_progress`, `in_review`, `done`
- Each task has a backing message (`message_id`) for threading

## Commits

Do not include `Co-Authored-By` lines in commit messages.

## Code Style

- TypeScript strict mode
- Font: Geist (sans) + Geist Mono
- Dark theme using oklch color system (see `app/globals.css`)
- UI components from shadcn/ui (`components/ui/`)
- Path alias: `@/` maps to project root
