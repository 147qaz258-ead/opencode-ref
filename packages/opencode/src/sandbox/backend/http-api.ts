/**
 * HTTP API Sandbox Backend
 *
 * Communicates with sandbox container via HTTP API.
 * Replaces Docker exec with faster, more reliable HTTP calls.
 */

import { Log } from "@/util/log"
import { SessionLogger } from "@/util/session-logger"
import type {
  DirEntry,
  ExecOptions,
  ExecResult,
  FileStat,
  ReadOptions,
  SandboxBackend,
  WriteOptions,
  WriteResult,
} from "./index"

const log = Log.create({ service: "sandbox.backend.http-api" })

export interface HttpApiBackendConfig {
  /** Container ID or IP address */
  containerId: string
  /** HTTP API port (default: 8080) */
  port?: number
  /** Request timeout in milliseconds */
  timeout?: number
  /** Session ID (optional, for logging) */
  sessionId?: string
  /** User ID (for activity tracking) */
  userId?: string
  /** Max retry attempts for transient errors (default: 3) */
  maxRetries?: number
  /** Initial retry delay in milliseconds (default: 100) */
  retryDelay?: number
}

/**
 * Shell session for maintaining persistent shell state
 */
interface ShellSession {
  id: string
}

/**
 * Sleep utility for retry delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Check if an error is a transient network error that should trigger retry
 */
function isTransientError(error: unknown): boolean {
  if (error instanceof TypeError) {
    const message = error.message.toLowerCase()
    return (
      message.includes("fetch") ||
      message.includes("network") ||
      message.includes("econnrefused") ||
      message.includes("econnreset") ||
      message.includes("etimedout")
    )
  }
  return false
}

/**
 * Check if HTTP status code indicates a server error (5xx) that should trigger retry
 */
function isServerError(status: number): boolean {
  return status >= 500 && status < 600
}

/**
 * Check if HTTP status code indicates a client error (4xx) that should NOT trigger retry
 */
function isClientError(status: number): boolean {
  return status >= 400 && status < 500
}

export class HttpApiBackend implements SandboxBackend {
  readonly type = "http-api"
  private baseUrl: string
  private shellSessions: Map<string, ShellSession> = new Map()

  private timeout: number
  private logger?: SessionLogger
  private userId?: string
  private maxRetries: number
  private baseRetryDelay: number

  constructor(config: HttpApiBackendConfig) {
    const port = config.port || 8080
    this.baseUrl = `http://${config.containerId}:${port}`
    this.timeout = config.timeout || 120000
    this.userId = config.userId
    this.maxRetries = config.maxRetries ?? 3
    this.baseRetryDelay = config.retryDelay ?? 100

    if (config.sessionId) {
      this.logger = SessionLogger.get(config.sessionId)
    }
    log.info("HTTP API backend created", {
      baseUrl: this.baseUrl,
      sessionId: config.sessionId,
      userId: config.userId,
      maxRetries: this.maxRetries
    })
  }

  private async fetchWithLog(url: string, init: RequestInit): Promise<Response> {
    const start = Date.now()
    if (this.logger) {
      try {
        const body = init.body ? JSON.parse(init.body as string) : undefined
        this.logger.log({
          type: "http.request",
          method: init.method || "GET",
          url,
          body
        })
      } catch {
        // Body might not be JSON, just log without body
        this.logger.log({
          type: "http.request",
          method: init.method || "GET",
          url,
        })
      }
    }

    try {
      const response = await fetch(url, init)

      if (this.logger) {
        // Clone response to read body for logging without consuming it
        const cloned = response.clone()
        let body
        try {
          body = await cloned.json()
        } catch {
          try {
             body = await cloned.text()
             if (body.length > 1000) body = body.substring(0, 1000) + "...(truncated)"
          } catch {
             body = "[Binary or Stream]"
          }
        }

        this.logger.log({
          type: "http.response",
          status: response.status,
          body,
          duration: Date.now() - start
        })
      }

      return response
    } catch (error) {
       if (this.logger) {
         this.logger.log({
           type: "http.response",
           status: 0,
           body: error instanceof Error ? error.message : String(error),
           duration: Date.now() - start
         })
       }
       throw error
    }
  }

  /**
   * Fetch with retry logic for transient errors
   * - Network errors (TypeError with fetch/network keywords)
   * - HTTP 5xx errors (server errors)
   * - Uses exponential backoff: 100ms, 200ms, 400ms (capped at 2000ms)
   * - Does NOT retry on:
   *   - HTTP 4xx errors (client errors)
   *   - AbortError (operation aborted by user)
   */
  private async fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
    let lastError: Error | undefined

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const response = await this.fetchWithLog(url, init)

        // Check for HTTP server errors (5xx) that should trigger retry
        if (isServerError(response.status)) {
          const error = new Error(`HTTP ${response.status}: Server error`)
          lastError = error

          // Don't retry if this is the last attempt or it's a client error
          if (attempt === this.maxRetries - 1) {
            throw error
          }

          // Calculate exponential backoff delay
          const delay = Math.min(this.baseRetryDelay * Math.pow(2, attempt), 2000)
          log.warn(`HTTP ${response.status}, retrying... (${attempt + 1}/${this.maxRetries})`, {
            url,
            delay,
            attempt: attempt + 1,
          })

          await sleep(delay)
          continue
        }

        // Check for HTTP client errors (4xx) that should NOT trigger retry
        if (isClientError(response.status)) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }

        // Success or non-retryable error
        return response
      } catch (error) {
        // Check if this is an abort error (don't retry)
        if (
          error instanceof DOMException &&
          (error.name === "AbortError" || error.message.includes("aborted"))
        ) {
          throw error
        }

        // Check if this is a transient network error that should trigger retry
        if (isTransientError(error)) {
          lastError = error as Error

          // Don't retry if this is the last attempt
          if (attempt === this.maxRetries - 1) {
            throw error
          }

          // Calculate exponential backoff delay
          const delay = Math.min(this.baseRetryDelay * Math.pow(2, attempt), 2000)
          log.warn(`Network error, retrying... (${attempt + 1}/${this.maxRetries})`, {
            url,
            delay,
            attempt: attempt + 1,
            error: error instanceof Error ? error.message : String(error),
          })

          await sleep(delay)
          continue
        }

        // Non-retryable error, throw immediately
        throw error
      }
    }

    // Should not reach here, but TypeScript needs it
    throw lastError || new Error("Max retries exceeded")
  }

  /**
   * Update user activity (fire-and-forget)
   * This is called on every operation to prevent container auto-shutdown
   */
  private updateActivity(): void {
    if (!this.userId) return
    // Import dynamically to avoid circular dependency
    import("@/container/user-lifecycle").then(({ getUserContainerManager }) => {
      const manager = getUserContainerManager()
      manager.updateActivity(this.userId!)
    }).catch((error) => {
      log.warn("Failed to update user activity", { error, userId: this.userId })
    })
  }

  /**
   * Execute a shell command via HTTP API
   *
   * Uses persistent shell session for better performance.
   */
  async exec(command: string, options: ExecOptions): Promise<ExecResult> {
    // Update activity to prevent auto-shutdown
    this.updateActivity()

    const { sessionId, timeout, abort } = options

    log.debug("Executing command via HTTP API", { sessionId, command, timeout })

    // Get or create shell session for this sessionId
    let session = this.shellSessions.get(sessionId)
    if (!session) {
      session = { id: sessionId }
      this.shellSessions.set(sessionId, session)
    }

    try {
      // Check if signal is already aborted
      if (abort?.aborted) {
        throw new DOMException("The operation was aborted", "AbortError")
      }

      // Create abort controller that respects both timeout and abort signal
      const abortController = new AbortController()

      // Set up timeout
      const timeoutId = timeout
        ? setTimeout(() => abortController.abort(), timeout)
        : null

      // Set up abort signal listener
      if (abort) {
        abort.addEventListener("abort", () => {
          abortController.abort()
          if (timeoutId) clearTimeout(timeoutId)
        })
      }

      const url = `${this.baseUrl}/api/v1/shell/exec`
      const body = {
          id: session.id,
          command,
      }

      const response = await this.fetchWithRetry(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abortController.signal,
        body: JSON.stringify(body),
      })

      // Clean up timeout if it exists
      if (timeoutId) clearTimeout(timeoutId)

      if (!response.ok) {
        throw new Error(`HTTP API error: ${response.status} ${response.statusText}`)
      }

      const result = await response.json()

      // Log raw response for debugging empty output
      log.info("HTTP API exec response", { result })


      // Robust parsing: handle both console array and stdout string
      // Also handle parameter mismatch: backend uses 'output'/'returncode', frontend expects 'stdout'/'exit_code'
      const stdout = Array.isArray(result.data.console)
        ? result.data.console.join("")
        : (result.data.stdout || result.data.output || "")

      const stderr = result.data.error || result.data.stderr || ""

      return {
        // Use nullish coalescing for exit code (0 is valid)
        exitCode: result.data.exit_code ?? result.data.returncode ?? 0,
        stdout,
        stderr,
      }
    } catch (error) {
      log.error("HTTP API exec failed", { error })
      // Let all errors propagate - no defensive swallowing
      throw error
    }
  }

  /**
   * Read file via HTTP API
   */
  async readFile(path: string, options?: ReadOptions): Promise<string> {
    // Update activity to prevent auto-shutdown
    this.updateActivity()

    log.debug("Reading file via HTTP API", { path, options })

    try {
      const response = await this.fetchWithRetry(`${this.baseUrl}/api/v1/file/read`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          file: path,
          start_line: options?.startLine,
          end_line: options?.endLine,
        }),
      })

      if (!response.ok) {
        throw new Error(`HTTP API error: ${response.status}`)
      }

      const result = await response.json()
      return result.data.content || ""
    } catch (error) {
      log.error("HTTP API file read failed", { error })
      throw error
    }
  }

  /**
   * Write file via HTTP API
   */
  async writeFile(path: string, content: string, options?: WriteOptions): Promise<WriteResult> {
    // Update activity to prevent auto-shutdown
    this.updateActivity()

    log.debug("Writing file via HTTP API", { path, size: content.length })

    try {
      const response = await this.fetchWithRetry(`${this.baseUrl}/api/v1/file/write`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          file: path,
          content,
          mode: options?.append ? "append" : "overwrite",
        }),
      })

      if (!response.ok) {
        throw new Error(`HTTP API error: ${response.status}`)
      }

      const result = await response.json()
      return {
        path,
        size: result.data.size || content.length,
        written: true,
      }
    } catch (error) {
      log.error("HTTP API file write failed", { error })
      throw error
    }
  }

  /**
   * Check file exists via HTTP API
   */
  async fileExists(path: string): Promise<boolean> {
    // Update activity to prevent auto-shutdown
    this.updateActivity()

    const response = await this.fetchWithRetry(`${this.baseUrl}/api/v1/file/stat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file: path }),
    })

    if (response.status === 404) return false
    if (!response.ok) {
        throw new Error(`HTTP API error: ${response.status}`)
    }

    const result = await response.json()
    return result.data.exists === true
  }

  /**
   * Get file status via HTTP API
   */
  /**
   * Get file status via HTTP API
   * NOTE: The /api/v1/file/stat endpoint is missing, so we implement this using shell exec 'stat'.
   */
  async fileStat(path: string): Promise<FileStat> {
    // Update activity to prevent auto-shutdown
    this.updateActivity()
    // Determine format string for stat
    // %s = size in bytes
    // %F = file type
    // %Y = modification time (seconds since epoch)
    const cmd = `stat -c '{"size":%s,"type":"%F","modified":%Y}' "${path}"`

    try {
      // Use exec with a default timeout
      const result = await this.exec(cmd, { 
        sessionId: this.logger?.['sessionId'] || "system", // Fallback if no session logger
        timeout: 5000 
      })

      if (result.exitCode !== 0) {
        // Assume file not found if stat fails
        return { exists: false }
      }

      const output = result.stdout.trim()
      let statInfo: any
      try {
        statInfo = JSON.parse(output)
      } catch (e) {
        log.warn("Failed to parse stat output", { output, error: e })
        return { exists: false }
      }

      let type: "file" | "directory" = "file"
      if (statInfo.type.includes("directory")) {
        type = "directory"
      }

      return {
        exists: true,
        type,
        size: statInfo.size,
        modified: statInfo.modified * 1000, // Convert to ms
      }
    } catch (error) {
      log.error("fileStat implementation via exec failed", { error, path })
      // If exec fails entirely (e.g. network), verify by throwing or returning false?
      // Better to return exists: false or propagate error if critical.
      // Keeping consistent behavior: if we can't check, assume trouble or not found.
      throw error 
    }
  }

  /**
   * List directory via HTTP API
   */
  async listDir(path: string): Promise<DirEntry[]> {
    // Update activity to prevent auto-shutdown
    this.updateActivity()

    const url = `${this.baseUrl}/api/v1/file/list`
    log.info("HTTP API listDir request", { url, path })

    const response = await this.fetchWithRetry(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`HTTP ${response.status}: ${text}`)
    }

    const result = await response.json()

    // Fail fast: don't silently return empty array on error
    if (result.success === false) {
        throw new Error(`listDir failed: ${result.message || "Backend returned success=false"}`)
    }

    // Handle both formats: result.data (array) and result.data.entries (object with entries array)
    const entries = result.data?.entries || result.data
    if (!entries || !Array.isArray(entries)) {
        throw new Error(`listDir invalid response format: ${JSON.stringify(result)}`)
    }

    return entries
  }

  /**
   * Find files via HTTP API
   */
  async findFiles(path: string, pattern: string): Promise<string[]> {
    // Update activity to prevent auto-shutdown
    this.updateActivity()

    const response = await this.fetchWithRetry(`${this.baseUrl}/api/v1/file/find`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, glob: pattern }),
    })

    if (!response.ok) {
      throw new Error(`HTTP API error: ${response.status}`)
    }

    const result = await response.json()
    return result.data.files || []
  }

  /**
   * Cleanup shell sessions
   */
  async cleanup(): Promise<void> {
    this.shellSessions.clear()
    log.info("HTTP API backend cleaned up")
  }
}