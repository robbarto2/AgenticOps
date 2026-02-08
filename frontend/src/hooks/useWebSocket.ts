import { useEffect, useRef, useCallback } from 'react'
import { useConnectionStore } from '../store/connectionSlice'
import type { WebSocketInEvent } from '../types/websocket'

export function useWebSocket(onMessage: (event: WebSocketInEvent) => void) {
  const wsRef = useRef<WebSocket | null>(null)
  const setStatus = useConnectionStore((s) => s.setStatus)
  const reconnectTimeout = useRef<ReturnType<typeof setTimeout>>()
  const onMessageRef = useRef(onMessage)
  onMessageRef.current = onMessage

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    setStatus('connecting')
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/chat`)

    ws.onopen = () => {
      setStatus('connected')
    }

    ws.onmessage = (evt) => {
      try {
        const event: WebSocketInEvent = JSON.parse(evt.data)
        onMessageRef.current(event)
      } catch {
        // Ignore malformed messages
      }
    }

    ws.onclose = () => {
      setStatus('disconnected')
      wsRef.current = null
      // Reconnect with backoff
      reconnectTimeout.current = setTimeout(connect, 3000)
    }

    ws.onerror = () => {
      setStatus('error')
    }

    wsRef.current = ws
  }, [setStatus])

  useEffect(() => {
    connect()
    return () => {
      clearTimeout(reconnectTimeout.current)
      wsRef.current?.close()
    }
  }, [connect])

  const sendMessage = useCallback((content: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({ type: 'user_message', content, session_id: 'default' })
      )
    }
  }, [])

  return { sendMessage }
}
