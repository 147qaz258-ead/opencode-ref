/**
 * Sandbox Executor V2
 *
 * Unified execution layer for sandbox operations.
 * Automatically selects and manages the appropriate backend.
 */

import { Log } from "@/util/log"
import { createBackend, type ExecOptions, type SandboxBackend } from "./backend"

const log = Log.create({ service: "sandbox.executor-v2" })

/**
 * Sandbox configuration
 */
interface SandboxConfig {
  /** Backend type: http-api (Docker) or e2b (cloud) */
  backend: "http-api" | "e2b"
  /** Session ID */
  sessionId: string
  /** Container ID (required for http-api backend) */
  containerId?: string
  /** Host to connect to */
  host?: string
  /** API port */
  port?: number
  /** E2B API key (required for e2b backend) */
  apiKey?: string
  /** E2B template ID (optional for e2b backend) */
  templateId?: string
  /** Default workdir */
  workdir?: string
  /** Default timeout */
  timeout?: number
}

/**
 * Unified Sandbox Executor
 */
export class SandboxExecutorV2 {
  private backend: SandboxBackend
  private config: SandboxConfig

  private constructor(config: SandboxConfig, backend: SandboxBackend) {
    this.config = config
    this.backend = backend
    log.info("Sandbox executor created", { backend: config.backend, sessionId: config.sessionId })
  }

  /**
   * Create executor for a session (async factory)
   */
  static async create(config: SandboxConfig): Promise<SandboxExecutorV2> {
    const backend = await createBackend(config.backend, {
      sessionId: config.sessionId,
      containerId: config.containerId,
      host: config.host,
      port: config.port,
      timeout: config.timeout,
    })
    return new SandboxExecutorV2(config, backend)
  }

  /**
   * Execute a command
   */
  async exec(command: string, options?: Partial<ExecOptions>): Promise<{
    exitCode: number
    stdout: string
    stderr: string
    output: string
    success: boolean
    timedOut?: boolean
  }> {
    const execOptions: ExecOptions = {
      sessionId: this.config.sessionId,
      workdir: options?.workdir || this.config.workdir || "/home/ubuntu",
      timeout: options?.timeout || this.config.timeout || 120000,
      abort: options?.abort,
    }

    log.debug("Executing command", { command, ...execOptions })

    const result = await this.backend.exec(command, execOptions)

    return {
      ...result,
      output: result.stdout + (result.stderr ? `\n${result.stderr}` : ""),
      success: result.exitCode === 0,
      timedOut: result.timedOut,
    }
  }

  /**
   * Read file content
   */
  async readFile(path: string, options?: {
    startLine?: number
    endLine?: number
  }): Promise<string> {
    log.debug("Reading file", { path, options })
    return this.backend.readFile(path, options)
  }

  /**
   * Write file content
   */
  async writeFile(path: string, content: string, options?: {
    append?: boolean
  }): Promise<{ path: string; size: number }> {
    log.debug("Writing file", { path, size: content.length, options })
    const result = await this.backend.writeFile(path, content, options)
    return { path: result.path, size: result.size }
  }

  /**
   * Check file exists
   */
  async fileExists(path: string): Promise<boolean> {
    return this.backend.fileExists(path)
  }

  /**
   * Get file status
   */
  async fileStat(path: string): Promise<{
    exists: boolean
    type?: "file" | "directory"
    size?: number
    modified?: number
  }> {
    return this.backend.fileStat(path)
  }

  /**
   * List directory
   */
  async listDir(path: string): Promise<{
    entries: Array<{ name: string; type: "file" | "directory"; size: number }>
  }> {
    const entries = await this.backend.listDir(path)
    return { entries }
  }

  /**
   * Find files
   */
  async findFiles(path: string, pattern: string): Promise<string[]> {
    return this.backend.findFiles(path, pattern)
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    if (this.backend.cleanup) {
      await this.backend.cleanup()
    }
  }
}

/**
 * Create executor for a session
 *
 * Supports two backend types:
 * - "http-api": HTTP API to Docker containers (default)
 * - "e2b": E2B cloud sandbox (configured via SANDBOX_BACKEND env var)
 *
 * @param sessionId - Session ID
 * @param containerId - Container ID (required for http-api backend)
 * @param options - Additional options
 * @returns Executor instance
 */
export async function createExecutor(
  sessionId: string,
  containerId: string,
  options?: { host?: string; port?: number; backend?: "http-api" | "e2b" }
): Promise<SandboxExecutorV2> {
  // Determine backend type from options, env var, or default to http-api
  const backendType = options?.backend || (process.env.SANDBOX_BACKEND as "http-api" | "e2b") || "http-api"

  if (backendType === "e2b") {
    // E2B doesn't require containerId
    return SandboxExecutorV2.create({
      backend: "e2b",
      sessionId,
      apiKey: process.env.E2B_API_KEY,
      templateId: process.env.E2B_TEMPLATE_ID,
      workdir: "/home/",
      timeout: parseInt(process.env.E2B_TIMEOUT || "120000", 10),
    })
  }

  // http-api backend requires containerId
  if (!containerId) {
    throw new Error(`containerId is required for http-api backend (sessionId: ${sessionId})`)
  }

  return SandboxExecutorV2.create({
    backend: "http-api",
    sessionId,
    containerId,
    host: options?.host,
    port: options?.port,
    workdir: "/home/ubuntu",
    timeout: 120000,
  })
}

/**
 * Create executor for session with auto backend detection
 *
 * This function automatically detects the backend type from SANDBOX_BACKEND env var
 * and creates the appropriate executor. It handles both Docker (http-api) and E2B backends.
 *
 * For E2B backend:
 * - Uses E2B_API_KEY from environment
 * - Uses E2B_TEMPLATE_ID from environment (optional)
 * - Does not require Docker container
 *
 * For Docker backend (default):
 * - Requires getUserContainerForSession to be passed
 * - Uses containerId, host, port from container info
 *
 * @param sessionId - Session ID
 * @param getContainerFunc - Function to get Docker container info (for http-api backend)
 * @returns Executor instance
 */
export async function createExecutorForSession(
  sessionId: string,
  getContainerFunc: (session: { id: string; projectID: string }) => Promise<{ containerId: string; host: string; apiPort: number } | null>
): Promise<SandboxExecutorV2> {
  // Determine backend type from env var, or default to http-api
  const backendType = (process.env.SANDBOX_BACKEND as "http-api" | "e2b") || "http-api"

  if (backendType === "e2b") {
    // E2B backend - no container needed
    log.debug("Creating E2B executor for session", { sessionId })
    return SandboxExecutorV2.create({
      backend: "e2b",
      sessionId,
      apiKey: process.env.E2B_API_KEY,
      templateId: process.env.E2B_TEMPLATE_ID,
      workdir: "/home/",
      timeout: parseInt(process.env.E2B_TIMEOUT || "120000", 10),
    })
  }

  // Docker backend - get container info
  log.debug("Creating Docker executor for session", { sessionId })

  // For getUserContainerForSession, we need to create a Session.Info object
  // First, try to get the session info
  const { Session } = await import("../session")
  const sessionInfo = await Session.get(sessionId).catch(() => null)
  if (!sessionInfo) {
    throw new Error(`Session not found: ${sessionId}`)
  }

  const container = await getContainerFunc(sessionInfo)
  if (!container) {
    throw new Error(`Container not available for session: ${sessionId}`)
  }

  return SandboxExecutorV2.create({
    backend: "http-api",
    sessionId,
    containerId: container.containerId,
    host: container.host,
    port: container.apiPort,
    workdir: "/home/ubuntu",
    timeout: 120000,
  })
}
