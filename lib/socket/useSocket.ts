'use client'

import { useEffect, useState } from 'react'
import { io, Socket } from 'socket.io-client'

let socket: Socket | null = null

function getOrCreateSocket(): Socket {
  if (!socket) {
    socket = io({
      autoConnect: true,
    })
  }
  return socket
}

export function useSocket() {
  const [isConnected, setIsConnected] = useState(false)

  useEffect(() => {
    const s = getOrCreateSocket()

    function onConnect() {
      setIsConnected(true)
    }

    function onDisconnect() {
      setIsConnected(false)
    }

    s.on('connect', onConnect)
    s.on('disconnect', onDisconnect)

    // If already connected, set state immediately
    if (s.connected) {
      setIsConnected(true)
    }

    return () => {
      s.off('connect', onConnect)
      s.off('disconnect', onDisconnect)
    }
  }, [])

  return { socket: getOrCreateSocket(), isConnected }
}

export function getSocket(): Socket {
  return getOrCreateSocket()
}
