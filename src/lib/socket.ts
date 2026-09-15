import { io, type Socket } from 'socket.io-client'
import { API_BASE_URL } from './api'

let socket: Socket | null = null

export function connectSocket(companyId: string): Socket {
  if (!socket) {
    socket = io(API_BASE_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
    })
  }

  if (socket.connected) {
    socket.emit('join:company', { companyId })
  } else {
    socket.once('connect', () => socket?.emit('join:company', { companyId }))
  }

  return socket
}

export function getSocketId(): string | undefined {
  return socket?.id
}

export function disconnectSocket(): void {
  socket?.disconnect()
  socket = null
}
