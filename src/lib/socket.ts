import { io, type Socket } from 'socket.io-client'
import { API_BASE_URL } from './api'
import { loadSession } from './auth'

let socket: Socket | null = null
let currentCompanyId: string | null = null

// O servidor só coloca na sala da empresa com o token de login de um usuário dela.
function join() {
  if (!socket || !currentCompanyId) return
  socket.emit('join:company', { companyId: currentCompanyId, token: loadSession()?.token?.token })
}

export function connectSocket(companyId: string): Socket {
  if (!socket) {
    socket = io(API_BASE_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
    })
    // A cada (re)conexão entra de novo na sala (o servidor esquece as salas ao reconectar).
    socket.on('connect', join)
  }

  currentCompanyId = companyId
  if (socket.connected) join()

  return socket
}

export function getSocketId(): string | undefined {
  return socket?.id
}

export function disconnectSocket(): void {
  socket?.disconnect()
  socket = null
}
