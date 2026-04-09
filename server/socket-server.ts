import { Server as SocketIOServer } from 'socket.io'
import { Server as HTTPServer } from 'http'

// Store on globalThis so API routes in the same process can access it
const globalForIO = globalThis as unknown as { __socketio?: SocketIOServer }

export function initSocketServer(httpServer: HTTPServer) {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: process.env.NEXTAUTH_URL || 'http://localhost:3000',
      methods: ['GET', 'POST'],
    },
  })

  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id)

    socket.on('channel:join', (channelId: string) => {
      socket.join(`channel:${channelId}`)
      console.log(`Socket ${socket.id} joined channel:${channelId}`)
    })

    socket.on('channel:leave', (channelId: string) => {
      socket.leave(`channel:${channelId}`)
      console.log(`Socket ${socket.id} left channel:${channelId}`)
    })

    socket.on('thread:join', (threadId: string) => {
      socket.join(`thread:${threadId}`)
      console.log(`Socket ${socket.id} joined thread:${threadId}`)
    })

    socket.on('thread:leave', (threadId: string) => {
      socket.leave(`thread:${threadId}`)
      console.log(`Socket ${socket.id} left thread:${threadId}`)
    })

    socket.on('agent:join', (agentId: string) => {
      socket.join(`agent:${agentId}`)
      console.log(`Socket ${socket.id} joined agent:${agentId}`)
    })

    socket.on('agent:leave', (agentId: string) => {
      socket.leave(`agent:${agentId}`)
    })

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id)
    })
  })

  globalForIO.__socketio = io
  return io
}

export function getIO(): SocketIOServer {
  const io = globalForIO.__socketio
  if (!io) {
    throw new Error('Socket.io not initialized')
  }
  return io
}
