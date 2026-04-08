import { config } from 'dotenv'
config({ path: '.env.local' })

import { createServer } from 'http'
import { parse } from 'url'
import next from 'next'
import { initSocketServer, getIO } from './server/socket-server'
import { startStandupCron } from './lib/cron/standup'
import { createAgentDaemon, AgentConfig } from './server/agent-daemon'
import { ensureAgentDir } from './lib/agents/directory'
import { saveActivityEvent, purgeOldActivityEvents } from './lib/activity/store'

const dev = process.env.NODE_ENV !== 'production'
const hostname = 'localhost'
const port = parseInt(process.env.PORT || '3000', 10)
const app = next({ dev, hostname, port })
const handle = app.getRequestHandler()

app.prepare().then(async () => {
  // Dynamic import AFTER dotenv has loaded
  const { db } = await import('./lib/db')

  const httpServer = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url!, true)
      await handle(req, res, parsedUrl)
    } catch (err) {
      console.error('Error occurred handling', req.url, err)
      res.statusCode = 500
      res.end('internal server error')
    }
  })

  initSocketServer(httpServer)

  httpServer.listen(port, async () => {
    console.log(`> Ready on http://${hostname}:${port}`)
    console.log(`> DATABASE_URL: ${process.env.DATABASE_URL}`)
    console.log('> Socket.io server running')

    startStandupCron()

    try {
      const agents = await db.agent.findMany({
        where: { isAdmin: false },
      })

      await db.agent.updateMany({
        data: { status: 'loading' },
      })

      const agentConfigs: AgentConfig[] = agents.map((a) => {
        const dirPath = ensureAgentDir(a.id, a.soulMd || undefined)
        return {
          id: a.id,
          openclawId: a.openclawId,
          name: a.name,
          model: a.model,
          soulMd: a.soulMd,
          isAdmin: a.isAdmin,
          dirPath,
        }
      })

      const daemon = createAgentDaemon()

      daemon.setStatusCallback(async (agentId, status) => {
        const dbStatus = status === 'loading' ? 'loading' : status
        try {
          await db.agent.update({
            where: { id: agentId },
            data: { status: dbStatus },
          })
          const io = getIO()
          io.emit('agent:status', { agent_id: agentId, status: dbStatus })
        } catch (err) {
          console.error(`[Server] Failed to update agent ${agentId} status:`, err)
        }
      })

      daemon.setActivityCallback((agentId, event) => {
        const io = getIO()
        const room = `agent:${agentId}`
        console.log(`[Activity] Emitting ${event.type} to room ${room}`)
        io.to(room).emit('agent:activity' as any, { agent_id: agentId, event })
        // Persist to DB (fire-and-forget)
        saveActivityEvent(agentId, event)
      })

      daemon.startAll(agentConfigs)
      console.log(`> Agent daemon started with ${agentConfigs.length} agent(s)`)

      // Purge old activity events every hour (72h TTL)
      const PURGE_INTERVAL_MS = 60 * 60 * 1000
      setInterval(async () => {
        try {
          const count = await purgeOldActivityEvents(72)
          if (count > 0) console.log(`[Activity] Purged ${count} events older than 72h`)
        } catch (err) {
          console.error('[Activity] Purge failed:', err)
        }
      }, PURGE_INTERVAL_MS)
    } catch (err) {
      console.error('Failed to start agent daemon:', err)
    }
  })
})
