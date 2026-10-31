import { useEffect, useRef, useState } from 'react'
import { proctorSocketUrl } from '../api/proctor'
import type { RealtimeEvent } from '../types'

export type SocketStatus = 'idle' | 'connecting' | 'open' | 'closed'

/**
 * Keeps the proctor room websocket alive: exponential backoff reconnect, and a
 * `lastEventAt` stamp the page uses to poll only while the socket is down.
 */
export function useProctorSocket(
  examId: string | undefined,
  token: string | undefined,
  onEvent: (event: RealtimeEvent) => void,
) {
  const [status, setStatus] = useState<SocketStatus>('idle')
  const [lastEventAt, setLastEventAt] = useState<number | null>(null)
  const handlerRef = useRef(onEvent)

  useEffect(() => {
    handlerRef.current = onEvent
  }, [onEvent])

  useEffect(() => {
    if (!examId || !token) {
      setStatus('idle')
      return
    }

    let disposed = false
    let socket: WebSocket | null = null
    let timer: number | undefined
    let attempts = 0

    const connect = () => {
      if (disposed) return
      setStatus('connecting')
      socket = new WebSocket(proctorSocketUrl(examId, token))

      socket.onopen = () => {
        attempts = 0
        setStatus('open')
      }
      socket.onmessage = (message) => {
        try {
          const payload = JSON.parse(String(message.data)) as RealtimeEvent
          setLastEventAt(Date.now())
          if (payload.type !== 'connected') handlerRef.current(payload)
        } catch {
          // A malformed frame must not break the room.
        }
      }
      socket.onclose = () => {
        if (disposed) return
        setStatus('closed')
        attempts += 1
        timer = window.setTimeout(connect, Math.min(15_000, 1000 * 2 ** Math.min(attempts, 4)))
      }
      socket.onerror = () => {
        socket?.close()
      }
    }

    connect()

    return () => {
      disposed = true
      if (timer !== undefined) window.clearTimeout(timer)
      if (socket) {
        socket.onclose = null
        socket.onopen = null
        socket.onmessage = null
        socket.onerror = null
        socket.close()
      }
    }
  }, [examId, token])

  return { status, lastEventAt }
}
