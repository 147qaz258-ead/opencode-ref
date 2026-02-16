/**
 * E2B Sandbox Lifecycle Manager
 *
 * Manages E2B cloud sandbox lifecycle for user sessions.
 * E2B handles auto-hibernation, so this layer mainly tracks sandbox IDs.
 */

import { Log } from "@/util/log"
import { getEnv } from "@/config/env-loader"

const log = Log.create({ service: "container.e2b-lifecycle" })


/** Idle timeout before E2B auto-hibernates sandbox (default: 30 minutes) */
const E2B_IDLE_TIMEOUT = 30 * 60 * 1000

/**
 * E2B Sandbox state
 */
export interface E2BSandbox {
  /** User ID */
  userId: string
  /** E2B sandbox ID */
  sandboxId: string
  /** Sandbox status */
  status: "running" | "stopped" | "hibernated"
  /** Last activity timestamp */
  lastActivity: number
  /** Creation timestamp */
  createdAt: number
}

/**
 * Configuration for creating a user sandbox
 */
export interface E2BSandboxConfig {
  /** User ID */
  userId: string
  /** Custom E2B template ID (optional) */
  templateId?: string
  /** Sandbox timeout in milliseconds (optional) */
  timeout?: number
}

/**
 * E2B Sandbox Manager
 *
 * Manages E2B sandbox lifecycle:
 * - Creates sandboxes on demand
 * - Reuses existing sandboxes for same user
 * - Tracks activity for hibernation
 * - Cleans up unused sandboxes
 */
export class E2BSandboxManager {
  private sandboxes: Map<string, E2BSandbox> = new Map()
  private idleCheckInterval?: ReturnType<typeof setInterval>
  private initialized = false

  /**
   * Initialize the sandbox manager
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      log.debug("E2BSandboxManager already initialized")
      return
    }

    log.info("Initializing E2BSandboxManager")

    // E2B tracks sandboxes server-side, so we don't need to scan for existing ones
    // Sandboxes will be recreated on demand if they don't exist

    this.initialized = true
    log.info("E2BSandboxManager initialized")
  }

  /**
   * Start idle sandbox monitoring
   * Note: E2B handles auto-hibernation server-side, this is just for local tracking
   */
  startIdleMonitoring(): void {
    if (this.idleCheckInterval) return

    this.idleCheckInterval = setInterval(() => {
      this.checkIdleSandboxes()
    }, 5 * 60 * 1000) // Check every 5 minutes

    log.info("E2B sandbox idle monitoring started")
  }

  /**
   * Stop idle sandbox monitoring
   */
  stopIdleMonitoring(): void {
    if (this.idleCheckInterval) {
      clearInterval(this.idleCheckInterval)
      this.idleCheckInterval = undefined
    }

    log.info("E2B sandbox idle monitoring stopped")
  }

  /**
   * Get or create sandbox for a user
   */
  async getOrCreateSandbox(config: E2BSandboxConfig): Promise<E2BSandbox> {

    // Ensure initialization happened
    if (!this.initialized) {
      await this.initialize()
    }

    const existing = this.sandboxes.get(config.userId)

    // If sandbox exists and is running, just update activity
    if (existing && (existing.status === "running" || existing.status === "hibernated")) {
      const previousStatus = existing.status
      existing.lastActivity = Date.now()
      existing.status = "running" // Wake from hibernation


      return existing
    }

    // Create new E2B sandbox

    const { Sandbox } = await import("@e2b/code-interpreter")

    const apiKey = getEnv("E2B_API_KEY")
    if (!apiKey) {
      throw new Error("E2B_API_KEY environment variable is required for E2B backend")
    }

    const templateId = config.templateId || getEnv("E2B_TEMPLATE_ID")

    try {

      const sandbox = await Sandbox.create({
        apiKey,
        id: templateId,
        timeoutMs: config.timeout || 120000,
      })


      const sandboxInfo: E2BSandbox = {
        userId: config.userId,
        sandboxId: sandbox.sandboxId,
        status: "running",
        lastActivity: Date.now(),
        createdAt: Date.now(),
      }

      this.sandboxes.set(config.userId, sandboxInfo)


      return sandboxInfo
    } catch (error) {

      throw new Error(
        `Failed to create E2B sandbox: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  /**
   * Update user activity (call on API request)
   */
  updateActivity(userId: string): void {
    const sandbox = this.sandboxes.get(userId)
    if (sandbox) {
      sandbox.lastActivity = Date.now()
    }
  }

  /**
   * Check for idle sandboxes
   * Note: E2B handles actual hibernation server-side, this just updates local status
   */
  private async checkIdleSandboxes(): Promise<void> {
    const now = Date.now()
    const idleSandboxes: string[] = []

    for (const [userId, sandbox] of this.sandboxes.entries()) {
      if (sandbox.status !== "running") continue

      const idleTime = now - sandbox.lastActivity
      if (idleTime > E2B_IDLE_TIMEOUT) {
        idleSandboxes.push(userId)
      }
    }

    for (const userId of idleSandboxes) {
      await this.hibernateSandbox(userId)
    }
  }

  /**
   * Hibernate a user's sandbox
   * Note: E2B handles hibernation server-side, we just update local status
   */
  private async hibernateSandbox(userId: string): Promise<void> {
    const sandbox = this.sandboxes.get(userId)
    if (!sandbox || sandbox.status !== "running") return

    log.info("Marking E2B sandbox as hibernated", { userId, sandboxId: sandbox.sandboxId })
    sandbox.status = "hibernated"

    // E2B will auto-hibernate the sandbox server-side after inactivity
    // We don't need to explicitly kill it
  }

  /**
   * Delete a user's sandbox
   */
  async deleteSandbox(userId: string): Promise<void> {
    log.info("Deleting E2B sandbox for user", { userId })

    const sandbox = this.sandboxes.get(userId)
    if (!sandbox) return

    try {
      const { Sandbox } = await import("@e2b/code-interpreter")
      const apiKey = getEnv("E2B_API_KEY")

      if (apiKey) {
        // Create sandbox instance with existing sandboxId, then kill it
        const e2bSandbox = await Sandbox.create({
          apiKey,
          id: sandbox.sandboxId,
        })
        await e2bSandbox.kill()
        log.info("E2B sandbox killed", { sandboxId: sandbox.sandboxId })
      }
    } catch (error) {
      log.warn("Failed to kill E2B sandbox", { userId, sandboxId: sandbox.sandboxId, error })
    }

    this.sandboxes.delete(userId)

    log.info("E2B sandbox deleted", { userId })
  }

  /**
   * Get all sandboxes
   */
  getAllSandboxes(): E2BSandbox[] {
    return Array.from(this.sandboxes.values())
  }

  /**
   * Get sandbox by user ID
   */
  getSandbox(userId: string): E2BSandbox | undefined {
    return this.sandboxes.get(userId)
  }

  /**
   * Cleanup
   */
  cleanup(): void {
    this.stopIdleMonitoring()
    this.sandboxes.clear()
  }
}

/**
 * Global E2B sandbox manager instance
 */
let globalE2BManager: E2BSandboxManager | null = null

/**
 * Get or create the global E2B sandbox manager
 */
export function getE2BManager(): E2BSandboxManager {
  if (!globalE2BManager) {
    globalE2BManager = new E2BSandboxManager()
  }
  return globalE2BManager
}
