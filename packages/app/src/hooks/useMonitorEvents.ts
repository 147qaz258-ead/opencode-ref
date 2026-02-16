import { onCleanup, createEffect, createSignal } from "solid-js"
import { useAuth } from "@/context/auth"
import { useSDK } from "@/context/sdk"
import type { MonitorAction } from "./useMonitor"

export interface MonitorEventHandlers {
  addAction: (action: MonitorAction) => void
}

export function useMonitorEvents(sessionId: () => string, handlers: MonitorEventHandlers) {
  const auth = useAuth()
  const sdk = useSDK()
  const [connected, setConnected] = createSignal(false)
  const [reconnectAttempt, setReconnectAttempt] = createSignal(0)

  createEffect(() => {
    const sid = sessionId()
    if (!sid) return

    let eventSource: EventSource | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let isIntentionallyClosed = false

    const connect = () => {
      // Close existing connection if any
      if (eventSource) {
        isIntentionallyClosed = true
        eventSource.close()
        eventSource = null
      }

      const token = auth.token
      // Use full backend URL instead of relative path to bypass Vite proxy
      const baseUrl = sdk.url.replace(/\/$/, "") // Remove trailing slash
      const sseUrl = `${baseUrl}/session-events/${sid}/events${token ? `?token=${token}` : ""}`
      eventSource = new EventSource(sseUrl)

      eventSource.onopen = () => {
        setConnected(true)
        setReconnectAttempt(0) // Reset reconnect counter on successful connection
        isIntentionallyClosed = false
      }

      eventSource.onerror = (error) => {
        setConnected(false)

        // Only reconnect if not intentionally closed
        if (!isIntentionallyClosed) {
          // Exponential backoff: 1s, 2s, 4s, 8s, max 30s
          const maxDelay = 30000
          const baseDelay = 1000
          const attempt = reconnectAttempt()
          const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay)


          reconnectTimer = setTimeout(() => {
            setReconnectAttempt(attempt + 1)
            connect()
          }, delay)
        }
      }

      // Use onmessage to catch all events and filter by type (more reliable than named events in some proxies)
      eventSource.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data)

          // Handle heartbeat
          if (event.type === "session.heartbeat") {
            return // Silent ignore heartbeat
          }

          // Filter for monitor.action events
          if (event.type === "monitor.action") {

            const action: MonitorAction = {
              id: event.data.actionId,
              timestamp: event.data.timestamp,
              renderType: event.data.renderType,
              data: event.data.data,
            }
            handlers.addAction(action)
          }
        } catch (e) {
          // Silent
        }
      }
    }

    // Initial connection
    connect()

    onCleanup(() => {
      isIntentionallyClosed = true
      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
        reconnectTimer = null
      }
      if (eventSource) {
        eventSource.close()
        eventSource = null
      }
    })
  })

  return {
    connected,
    reconnectAttempt,
  }
}
