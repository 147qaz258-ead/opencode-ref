/**
 * useActiveTool Hook
 *
 * 监听 SSE 事件流中的工具执行事件，追踪当前活跃工具的状态。
 * 根据工具执行状态自动更新 activeTool。
 *
 * 后端 SSE 事件格式：
 * - tool.execution: 工具执行状态变更
 * - shell.output: Shell 输出
 * - browser.event: 浏览器事件
 */

import { createSignal, createEffect, onCleanup } from "solid-js"
import { useAuth } from "@/context/auth"
import { useSDK } from "@/context/sdk"

export interface ActiveTool {
  /** 工具类型 */
  type: "browser" | "bash" | "read" | "write" | null
  /** 工具调用 ID（用于匹配请求和响应） */
  id?: string
  /** 工具状态 */
  status: "pending" | "running" | "completed" | "error"
  /** 工具名称（用于显示） */
  name?: string
  /** 错误消息（如果失败） */
  error?: string
}

/**
 * 后端工具执行事件
 */
export interface ToolExecutionEvent {
  type: "tool.execution"
  sessionId: string
  toolId: string
  toolType: "bash" | "file" | "browser" | "read" | "edit" | "other"
  phase: "starting" | "running" | "completed" | "error"
  progress?: number
  output?: string
  error?: string
  timestamp: number
}

/**
 * Map backend tool type to frontend tool type
 */
function mapToolType(backendType: ToolExecutionEvent["toolType"]): ActiveTool["type"] {
  switch (backendType) {
    case "browser":
      return "browser"
    case "bash":
      return "bash"
    case "read":
      return "read"
    case "edit":
      return "write"
    case "file":
      return "read" // Default to read for file operations
    case "other":
    default:
      return null
  }
}

/**
 * Map backend phase to frontend status
 */
function mapPhase(phase: ToolExecutionEvent["phase"]): ActiveTool["status"] {
  switch (phase) {
    case "starting":
      return "pending"
    case "running":
      return "running"
    case "completed":
      return "completed"
    case "error":
      return "error"
  }
}

/**
 * Hook to manage active tool state based on SSE events
 *
 * @param sessionId - Session ID getter function
 * @returns Active tool state and event handlers
 */
export function useActiveTool(sessionId: () => string) {
  const auth = useAuth()
  const sdk = useSDK()
  const [activeTool, setActiveTool] = createSignal<ActiveTool>({
    type: null,
    status: "pending",
  })
  const [connected, setConnected] = createSignal(false)
  const [reconnectAttempt, setReconnectAttempt] = createSignal(0)

  let clearTimer: ReturnType<typeof setTimeout> | undefined

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
        console.log("[SSE] Connection opened")
        setConnected(true)
        setReconnectAttempt(0)
        isIntentionallyClosed = false
      }

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          console.log(`[SSE] Event received: ${data.type}`, data)

          // Handle heartbeat
          if (data.type === "session.heartbeat") {
            return
          }

          handleToolEvent(data)
        } catch (e) {
          // Silent
        }
      }

      eventSource.onerror = (error) => {
        console.error("[SSE] Connection error:", error)
        setConnected(false)

        // Only reconnect if not intentionally closed
        if (!isIntentionallyClosed) {
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
    }

    // Initial connection
    connect()

    onCleanup(() => {
      isIntentionallyClosed = true
      if (clearTimer) {
        clearTimeout(clearTimer)
      }
      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
      }
      if (eventSource) {
        eventSource.close()
      }
    })
  })

  /**
   * Handle tool-related SSE events
   */
  function handleToolEvent(event: any) {
    switch (event.type) {
      case "tool.execution":
        // Tool execution state changed
        const toolExec = event as ToolExecutionEvent
        const toolType = mapToolType(toolExec.toolType)
        const status = mapPhase(toolExec.phase)

        setActiveTool({
          type: toolType,
          id: toolExec.toolId,
          name: toolExec.toolType,
          status,
          error: toolExec.error,
        })

        // Auto-clear on completion or error
        if (status === "completed" || status === "error") {
          // Clear existing timer
          if (clearTimer) {
            clearTimeout(clearTimer)
          }

          // Set new timer
          const delay = status === "error" ? 3000 : 2000
          clearTimer = setTimeout(() => {
            setActiveTool({ type: null, status: "pending" })
            clearTimer = undefined
          }, delay)
        }
        break
    }
  }

  /**
   * Manually clear active tool state
   */
  function clearActiveTool() {
    if (clearTimer) {
      clearTimeout(clearTimer)
      clearTimer = undefined
    }
    setActiveTool({ type: null, status: "pending" })
  }

  return {
    activeTool,
    clearActiveTool,
    connected,
    reconnectAttempt,
  }
}
