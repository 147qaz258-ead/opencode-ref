/**
 * User Container Lifecycle Manager
 *
 * Manages persistent sandbox containers for each user.
 * Containers are created on first use and hibernated when idle.
 */

import { Log } from "@/util/log"
import { getDockerManager } from "@/docker/docker-manager"

const log = Log.create({ service: "container.user-lifecycle" })

export interface UserContainer {
  userId: string
  containerId: string
  /** Host to connect to (localhost or container IP) */
  host: string
  /** API port on host (mapped from container's 8080) */
  apiPort: number
  /** Playwright HTTP API port on host (mapped from container's 9223) */
  playwrightPort: number
  status: "error" | "running" | "pending" | "starting" | "stopping" | "stopped"
  lastActivity: number
  createdAt: number
}

export interface UserContainerConfig {
  userId: string
  image?: string
  limits?: {
    memory?: number
    cpu?: number
  }
}

const IDLE_TIMEOUT = 5 * 60 * 1000  // 5 minutes

/**
 * User Container Lifecycle Manager
 */
export class UserContainerManager {
  private containers: Map<string, UserContainer> = new Map()
  private docker = getDockerManager()
  private idleCheckInterval?: ReturnType<typeof setInterval>
  private initialized = false
  /** Tracks in-progress container creation to prevent race conditions */
  private creationLocks: Map<string, Promise<UserContainer>> = new Map()

  /**
   * Initialize the container manager by scanning Docker for existing containers.
   * This should be called once during server startup.
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      log.debug("UserContainerManager already initialized")
      return
    }

    log.info("Initializing UserContainerManager - scanning Docker for existing containers")

    try {
      const existingContainers = await this.scanExistingContainers()

      for (const containerInfo of existingContainers) {
        // Resolve port mapping once at initialization
        const { host, apiPort, playwrightPort } = await this.resolveContainerPort(containerInfo.id)

        log.info("Found existing user container", {
          userId: containerInfo.userId,
          containerId: containerInfo.id,
          status: containerInfo.status,
          host,
          apiPort,
          playwrightPort,
        })

        this.containers.set(containerInfo.userId, {
          userId: containerInfo.userId,
          containerId: containerInfo.id,
          host,
          apiPort,
          playwrightPort,
          status: containerInfo.status === "running" ? "running" : "stopped",
          lastActivity: Date.now(),
          createdAt: Date.now(), // We don't know the actual creation time
        })
      }

      this.initialized = true
      log.info("UserContainerManager initialized", {
        containersFound: existingContainers.length,
        containerIds: existingContainers.map(c => c.userId)
      })
    } catch (error) {
      log.error("Failed to initialize UserContainerManager", {
        error: error instanceof Error ? error.message : String(error)
      })
      // Don't fail startup - just continue with empty registry
      this.initialized = true
    }
  }

  /**
   * Scan Docker for existing agent-session-* containers
   * Returns list of containers with their userId and status
   */
  private async scanExistingContainers(): Promise<Array<{ id: string; userId: string; status: string }>> {
    try {
      const { spawnSync } = await import("child_process")

      // List all containers (including stopped) with agent-session prefix
      const result = spawnSync("docker", [
        "ps", "-a",
        "--format", "{{.ID}}|{{.Names}}|{{.Status}}",
        "-f", "name=agent-session-"
      ], {
        encoding: "utf-8",
        timeout: 10000,
      })

      if (result.status !== 0 || !result.stdout.trim()) {
        return []
      }

      const containers: Array<{ id: string; userId: string; status: string }> = []

      for (const line of result.stdout.trim().split("\n")) {
        if (!line) continue
        const [id, name, status] = line.split("|")

        // Extract userId from container name: agent-session-{userId}
        const match = name.match(/^agent-session-(.+)$/)
        if (match) {
          const userId = match[1]
          const isRunning = status.toLowerCase().startsWith("up")
          containers.push({
            id,
            userId,
            status: isRunning ? "running" : "stopped"
          })
        }
      }

      return containers
    } catch (error) {
      log.warn("Failed to scan Docker containers", {
        error: error instanceof Error ? error.message : String(error)
      })
      return []
    }
  }

  /**
   * Resolve container port mapping once.
   * This is called only at container creation or initialization time, NOT on every tool call.
   */
  private async resolveContainerPort(containerId: string): Promise<{ host: string; apiPort: number; playwrightPort: number }> {
    const defaultResult = { host: "localhost", apiPort: 8080, playwrightPort: 9223 }

    try {
      const { spawnSync } = await import("child_process")

      // Helper function to resolve a single port
      const resolveSinglePort = (containerPort: number): number | null => {
        const result = spawnSync("docker", ["port", containerId, containerPort.toString()], {
          encoding: "utf-8",
          timeout: 3000,
        })

        if (result.status === 0 && result.stdout.trim()) {
          // Output format: 0.0.0.0:32774 or 127.0.0.1:32774
          const output = result.stdout.trim()
          const match = output.match(/(?:\d+\.\d+\.\d+\.\d+|::):(\d+)/)
          if (match) {
            return parseInt(match[1], 10)
          }
        }
        return null
      }

      const apiPort = resolveSinglePort(8080)
      const playwrightPort = resolveSinglePort(9223)

      if (apiPort && playwrightPort) {
        return { host: "localhost", apiPort, playwrightPort }
      }

      log.warn("Failed to resolve some container ports", {
        containerId,
        apiPort,
        playwrightPort,
      })
      return defaultResult
    } catch (error) {
      log.warn("Failed to resolve container port", { containerId, error })
      return defaultResult
    }
  }

  /**
   * Start a container by its ID using Docker CLI
   * This bypasses DockerManager's internal registry for containers discovered during initialization
   */
  private async startContainerById(containerId: string): Promise<void> {
    const { spawnSync } = await import("child_process")
    const result = spawnSync("docker", ["start", containerId], {
      encoding: "utf-8",
      timeout: 30000,
    })

    if (result.status !== 0) {
      const errorMsg = result.stderr || result.stdout || "Unknown error"
      throw new Error(`Failed to start container ${containerId}: ${errorMsg}`)
    }

    log.info("Container started via CLI", { containerId })
  }

  /**
   * Start idle container monitoring
   */
  startIdleMonitoring(): void {
    if (this.idleCheckInterval) return

    this.idleCheckInterval = setInterval(() => {
      this.checkAndHibernateIdleContainers()
    }, 5 * 60 * 1000)  // Check every 5 minutes

    log.info("User container idle monitoring started")
  }

  /**
   * Stop idle container monitoring
   */
  stopIdleMonitoring(): void {
    if (this.idleCheckInterval) {
      clearInterval(this.idleCheckInterval)
      this.idleCheckInterval = undefined
    }

    log.info("User container idle monitoring stopped")
  }

  /**
   * Get or create container for a user.
   *
   * After initialize() is called, this method relies purely on in-memory state.
   * If a container exists (running or stopped), it's reused. Otherwise, a new one is created.
   *
   * This method uses a locking mechanism to prevent concurrent creation of duplicate containers
   * for the same user when called simultaneously.
   */
  async getOrCreateContainer(config: UserContainerConfig): Promise<UserContainer> {
    // Ensure initialization happened
    if (!this.initialized) {
      await this.initialize()
    }

    // Check if there's already a creation in progress for this user
    let creationPromise = this.creationLocks.get(config.userId)

    if (!creationPromise) {
      // No lock exists - we're the first to create for this user
      // Create the lock promise
      creationPromise = this.createContainerInternal(config)

      // Store the lock so concurrent calls wait for the same promise
      this.creationLocks.set(config.userId, creationPromise)

      // Always clean up the lock, even if creation fails
      try {
        await creationPromise
      } finally {
        // Remove the lock - creation is complete (success or failure)
        this.creationLocks.delete(config.userId)
      }
    }

    // Wait for the creation promise (either we just created it, or it was already in progress)
    return creationPromise
  }

  /**
   * Internal container creation logic.
   * This is called by getOrCreateContainer with locking already handled.
   */
  private async createContainerInternal(config: UserContainerConfig): Promise<UserContainer> {
    const existing = this.containers.get(config.userId)

    // If container exists in memory and is running, just update activity
    if (existing && existing.status === "running") {
      existing.lastActivity = Date.now()
      log.debug("Reusing existing running container", { userId: config.userId, containerId: existing.containerId })
      return existing
    }

    // If container exists in memory but is stopped, start it
    if (existing && existing.status === "stopped") {
      log.info("Starting hibernated container", { userId: config.userId })

      try {
        await this.startContainerById(existing.containerId)
        existing.status = "running"
        existing.lastActivity = Date.now()

        log.info("Container started", { userId: config.userId, containerId: existing.containerId })

        return existing
      } catch (error) {
        log.error("Failed to start container, will recreate", { userId: config.userId, error })
        // If start fails, remove from registry and recreate
        this.containers.delete(config.userId)

        // Also try to clean up dead container in Docker
        try {
          await this.docker.destroy(config.userId)
        } catch {
          // Ignore cleanup errors
        }
      }
    }

    // Create new container
    log.info("Creating new container for user", { userId: config.userId })

    const containerId = await this.docker.createForSession(
      config.userId,  // Use userId as sessionId
      undefined,      // No projectDir for user containers
      undefined,      // No skillsDir
      {
        image: config.image,
        limits: config.limits,
        userId: config.userId,
      }

    )

    // Resolve port mapping once at creation time
    const { host, apiPort, playwrightPort } = await this.resolveContainerPort(containerId)

    const container: UserContainer = {
      userId: config.userId,
      containerId,
      host,
      apiPort,
      playwrightPort,
      status: "running",
      lastActivity: Date.now(),
      createdAt: Date.now(),
    }

    this.containers.set(config.userId, container)

    log.info("Container created for user", { userId: config.userId, containerId })

    return container
  }

  /**
   * Update user activity (call on API request)
   */
  updateActivity(userId: string): void {
    const container = this.containers.get(userId)
    if (container) {
      container.lastActivity = Date.now()
    }
  }

  /**
   * Hibernate idle containers
   */
  private async checkAndHibernateIdleContainers(): Promise<void> {
    const now = Date.now()
    const idleContainers: string[] = []

    for (const [userId, container] of this.containers.entries()) {
      if (container.status !== "running") continue

      const idleTime = now - container.lastActivity
      if (idleTime > IDLE_TIMEOUT) {
        idleContainers.push(userId)
      }
    }

    for (const userId of idleContainers) {
      await this.hibernateContainer(userId)
    }
  }

  /**
   * Hibernate a user's container
   */
  private async hibernateContainer(userId: string): Promise<void> {
    const container = this.containers.get(userId)
    if (!container || container.status !== "running") return

    log.info("Hibernating idle container", { userId, containerId: container.containerId })

    try {
      await this.docker.stop(userId)
      container.status = "stopped"

      log.info("Container hibernated", { userId })
    } catch (error) {
      log.error("Failed to hibernate container", { userId, error })
    }
  }

  /**
   * Delete a user's container
   */
  async deleteContainer(userId: string): Promise<void> {
    log.info("Deleting container for user", { userId })

    await this.docker.destroy(userId)
    this.containers.delete(userId)

    log.info("Container deleted", { userId })
  }

  /**
   * Get all containers
   */
  getAllContainers(): UserContainer[] {
    return Array.from(this.containers.values())
  }

  /**
   * Get container by user ID
   */
  getContainer(userId: string): UserContainer | undefined {
    return this.containers.get(userId)
  }

  /**
   * Cleanup
   */
  cleanup(): void {
    this.stopIdleMonitoring()
    this.containers.clear()
    this.creationLocks.clear()
  }
}

// Global instance
let globalManager: UserContainerManager | null = null

/**
 * Get user container manager instance
 */
export function getUserContainerManager(): UserContainerManager {
  if (!globalManager) {
    globalManager = new UserContainerManager()
    globalManager.startIdleMonitoring()
  }
  return globalManager
}

/**
 * Close global manager
 */
export function closeUserContainerManager(): void {
  if (globalManager) {
    globalManager.cleanup()
    globalManager = null
  }
}
