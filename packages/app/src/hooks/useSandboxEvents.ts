import { createEffect, onCleanup } from "solid-js"
import { createStore, produce } from "solid-js/store"
import { useAuth } from "@/context/auth"
import { useSDK } from "@/context/sdk"

export interface SandboxState {
  sandboxStatus: "pending" | "starting" | "running" | "stopping" | "stopped" | "error"
  vncStatus: "connecting" | "connected" | "disconnected" | "error"
  vncUrl: string | undefined
  shellOutput: string[]
  browserEvents: Array<{ action: string; timestamp: number; url?: string }>
  fileChanges: Array<{ path: string; action: string; timestamp: number }>
  containerLogs: string[]
  connected: boolean
  reconnectAttempt: number
}

export function useSandboxEvents(sessionId: () => string) {
  const auth = useAuth()
  const sdk = useSDK()
  const [state, setState] = createStore<SandboxState>({
    sandboxStatus: "pending",
    vncStatus: "disconnected",
    vncUrl: undefined,
    shellOutput: [],
    browserEvents: [],
    fileChanges: [],
    containerLogs: [],
    connected: false,
    reconnectAttempt: 0,
  })

  createEffect(() => {
    const id = sessionId()
    if (!id) return

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
      const sseUrl = `${baseUrl}/session-events/${id}/events${token ? `?token=${token}` : ""}`
      eventSource = new EventSource(sseUrl)

      eventSource.onopen = () => {
        setState({
          connected: true,
          reconnectAttempt: 0,
        })
        isIntentionallyClosed = false
      }

      eventSource.onerror = (error) => {
        setState("connected", false)

        // Only reconnect if not intentionally closed
        if (!isIntentionallyClosed) {
          const maxDelay = 30000
          const baseDelay = 1000
          const attempt = state.reconnectAttempt
          const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay)


          reconnectTimer = setTimeout(() => {
            setState("reconnectAttempt", attempt + 1)
            connect()
          }, delay)
        }
      }

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)

          // Handle heartbeat
          if (data.type === "session.heartbeat") {
            return
          }

          handleEvent(data)
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
      }
      if (eventSource) {
        eventSource.close()
      }
    })
  })

  function handleEvent(event: any) {

    switch (event.type) {
      case "sandbox.status":
        setState("sandboxStatus", event.status)
        break

      case "vnc.status":
        setState("vncStatus", event.status)
        if (event.vncUrl) {
          setState("vncUrl", event.vncUrl)
        }
        break

      case "shell.output":
        setState(
          produce((s) => {
            if (event.stdout) {
              s.shellOutput.push(event.stdout)
            }
          }),
        )
        break

      case "browser.event":
        setState(
          produce((s) => {
            s.browserEvents.push({
              action: event.action,
              timestamp: event.timestamp,
              url: event.url,
            })
          }),
        )
        break

      case "file.change":
        setState(
          produce((s) => {
            s.fileChanges.push({
              path: event.path,
              action: event.action,
              timestamp: event.timestamp,
            })
          }),
        )
        break

      case "container.log":
        setState(
          produce((s) => {
            s.containerLogs.push(event.message)
          }),
        )
        break

    }
  }

  return {
    state,
    clearShellOutput: () => setState("shellOutput", []),
    clearBrowserEvents: () => setState("browserEvents", []),
    clearFileChanges: () => setState("fileChanges", []),
    clearContainerLogs: () => setState("containerLogs", []),
  }
}
