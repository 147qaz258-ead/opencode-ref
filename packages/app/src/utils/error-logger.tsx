/**
 * Enhanced Error Logger
 *
 * Provides detailed error logging and user-friendly error display
 */

export interface APIError {
  message: string
  status?: number
  statusText?: string
  data?: unknown
  stack?: string
  url?: string
  method?: string
  request?: {
    sessionID?: string
    parts?: any[]
    userId?: string
  }
}

export interface ErrorContext {
  operation: string
  component: string
  timestamp: string
  userAgent?: string
  url?: string
}

/**
 * Format error for console logging (detailed)
 */
export function formatErrorForConsole(error: unknown, context: ErrorContext): void {
  const errorObj = formatError(error)
  const errorData = {
    ...context,
    error: {
      ...errorObj,
      // Include request details if available
      request: (error as any).request,
    },
  }

  // Log to console with structured format
  console.group(`🔴 [ERROR] ${context.operation} - ${context.component}`)
  console.error("Error Details:", errorData)
  console.groupEnd()

  // Also log to stderr for Bun/shell capture
  console.error(JSON.stringify(errorData, null, 2))
}

/**
 * Format error for user display (user-friendly)
 */
export function formatErrorForUser(error: unknown): string {
  const errorObj = formatError(error)

  // User-friendly error messages
  if (errorObj.status === 400) {
    if (errorObj.request?.parts?.length === 0) {
      return "无法发送空消息。请输入一些内容后再发送。"
    }
    if (errorObj.data && typeof errorObj.data === "object") {
      const data = errorObj.data as { error?: string; message?: string; details?: any }
      if (data.error) return data.error
      if (data.message) return data.message
      if (data.details?.message) return data.details.message
    }
    return "请求格式错误。请检查输入内容或刷新页面重试。"
  }

  if (errorObj.status === 404) {
    return "会话不存在或已被删除。"
  }

  if (errorObj.status === 403) {
    return "您没有权限执行此操作。"
  }

  if (errorObj.status === 500) {
    return "服务器内部错误。请稍后重试。"
  }

  // Network errors
  if (error instanceof TypeError && error.message.includes("fetch")) {
    return "网络连接失败。请检查网络连接。"
  }

  // Default error message
  return errorObj.message || "操作失败，请重试。"
}

/**
 * Format error object with all available details
 */
export function formatError(error: unknown): APIError {
  if (error && typeof error === "object") {
    const err = error as Partial<APIError>

    return {
      message: err.message ?? String(error),
      status: err.status,
      statusText: err.statusText,
      data: err.data,
      stack: err.stack,
      url: err.url,
      method: err.method,
      request: err.request,
    }
  }

  return {
    message: String(error),
  }
}

/**
 * Get detailed error information for debugging
 */
export function getErrorDetails(error: unknown): {
  userMessage: string
  debugInfo: Record<string, unknown>
  suggestion: string
} {
  const errorObj = formatError(error)
  const userMessage = formatErrorForUser(error)

  const debugInfo: Record<string, unknown> = {
    status: errorObj.status,
    statusText: errorObj.statusText,
    url: errorObj.url,
    method: errorObj.method,
    hasRequestData: !!errorObj.request,
    partsCount: errorObj.request?.parts?.length ?? 0,
    hasSessionId: !!errorObj.request?.sessionID,
    userId: errorObj.request?.userId ?? "unknown",
  }

  let suggestion = ""
  if (errorObj.status === 400) {
    if (errorObj.request?.parts?.length === 0) {
      suggestion = "请输入消息内容后再发送"
    } else {
      suggestion = "可能是数据格式问题。建议：1) 刷新页面 2) 检查输入内容 3) 查看浏览器控制台获取详细错误"
    }
  } else if (errorObj.status === 404) {
    suggestion = "会话可能已被删除。建议创建新会话或刷新页面"
  } else if (errorObj.status === 500) {
    suggestion = "服务器错误。建议稍后重试或联系支持"
  } else {
    suggestion = "请刷新页面或重试操作"
  }

  return {
    userMessage,
    debugInfo,
    suggestion,
  }
}
