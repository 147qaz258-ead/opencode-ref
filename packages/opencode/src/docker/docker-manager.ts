/**
 * Docker Manager
 *
 * Main entry point for Docker container management in OpenCode.
 * Provides a high-level API for creating and managing sandbox containers.
 *
 * Usage:
 * ```typescript
 * const manager = new DockerManager()
 * const containerId = await manager.createForSession(sessionId, projectDir)
 * await manager.start(containerId)
 * const result = await manager.exec(containerId, ["ls", "-la"])
 * await manager.destroy(containerId)
 * ```
 */

import { ulid } from "ulid"
import { Log } from "@/util/log"
import { Instance } from "@/project/instance"
import { ContainerLifecycleManager, DEFAULT_IMAGE, DEFAULT_LIMITS } from "./container-lifecycle"
import { VolumeManager } from "./volume-manager"
import type { ContainerConfig, ContainerState, ExecResult } from "./types"

export const log = Log.create({ service: "docker.manager" })

/**
 * Session container information
 */
export interface SessionContainer {
  /** Container ID */
  containerId: string
  /** Session ID */
  sessionId: string
  /** Container name */
  name: string
  /** Whether container is running */
  isRunning: boolean
}

/**
 * Docker Manager
 *
 * Singleton manager for Docker containers.
 * Handles container creation, lifecycle, and execution.
 */
export class DockerManager {
  private static instance: DockerManager
  private lifecycle: ContainerLifecycleManager
  private containers: Map<string, SessionContainer> = new Map()

  private constructor() {
    this.lifecycle = new ContainerLifecycleManager()
  }

  /**
   * Get singleton instance
   */
  static getInstance(): DockerManager {
    if (!DockerManager.instance) {
      DockerManager.instance = new DockerManager()
    }
    return DockerManager.instance
  }

  /**
   * Create a container for a session
   *
   * @param sessionId - Session ID
   * @param projectDir - Project directory
   * @param skillsDir - Skills directory (optional)
   * @param options - Additional options
   * @returns Container ID
   */
  async createForSession(
    sessionId: string,
    projectDir?: string,  // 改为可选 - 支持无项目目录的临时会话
    skillsDir?: string,
    options?: {
      image?: string
      limits?: { memory?: number; cpu?: number; timeout?: number }
      userId?: string
    }
  ): Promise<string> {
    log.info("Creating container for session", { sessionId, projectDir, userId: options?.userId })

    // 如果没有 projectDir，使用临时目录（临时模式）
    const resolvedProjectDir = projectDir || VolumeManager.createTempVolume(sessionId, options?.userId)


    // Find skills directory if not provided
    const resolvedSkillsDir =
      skillsDir || this.findSkillsDirectory(resolvedProjectDir)

    // Create container config
    const config: ContainerConfig = {
      id: ulid(),
      sessionId,
      projectDir: resolvedProjectDir,
      skillsDir: resolvedSkillsDir,
      name: `agent-session-${sessionId}`,
      image: options?.image || DEFAULT_IMAGE,
      limits: options?.limits || DEFAULT_LIMITS,
      network: "bridge", // Use bridge network for sandbox API access
      ports: {
        8080: 0, // Sandbox API
        9222: 0, // Chrome DevTools Protocol (CDP) - legacy, not used with Playwright
        9223: 0, // Playwright HTTP API
        5901: 0, // VNC server (RFB protocol, for direct VNC clients)
        6080: 0, // websockify (WebSocket for noVNC)
      },
      env: {
        OPENCODE_SESSION_ID: sessionId,
        OPENCODE_PROJECT_DIR: "/home/ubuntu",
        // 如果有项目目录，技能在 /home/ubuntu/.opencode/skills (项目挂载中)
        // 否则技能在 /skills (单独挂载)
        OPENCODE_SKILLS_DIR: projectDir ? "/home/ubuntu/.opencode/skills" : "/skills",
        OPENCODE_SANDBOX: "true",  // 标记沙盒模式
      },
    }

    // Create container (createContainer already starts it)
    const containerId = await this.lifecycle.createContainer(config)


    // Store container info with correct running state
    this.containers.set(sessionId, {
      containerId,
      sessionId,
      name: config.name,
      isRunning: true,  // Container is started by createContainer
    })


    log.info("Container created for session", { sessionId, containerId })

    return containerId
  }

  /**
   * Start a session's container
   *
   * @param sessionId - Session ID
   */
  async start(sessionId: string): Promise<void> {

    const container = this.containers.get(sessionId)
    if (!container) {
      throw new Error(`No container found for session: ${sessionId}`)
    }

    log.info("Starting container for session", { sessionId })

    await this.lifecycle.start(container.containerId)

    container.isRunning = true

    log.info("Container started for session", { sessionId })
  }

  /**
   * Stop a session's container
   *
   * @param sessionId - Session ID
   */
  async stop(sessionId: string): Promise<void> {
    const container = this.containers.get(sessionId)
    if (!container) {
      throw new Error(`No container found for session: ${sessionId}`)
    }

    log.info("Stopping container for session", { sessionId })

    await this.lifecycle.stop(container.containerId)

    container.isRunning = false

    log.info("Container stopped for session", { sessionId })
  }

  /**
   * Remove a session's container
   *
   * @param sessionId - Session ID
   */
  async destroy(sessionId: string): Promise<void> {
    const container = this.containers.get(sessionId)
    if (!container) {
      log.warn("No container to destroy", { sessionId })
      return
    }

    log.info("Destroying container for session", { sessionId })

    // Stop if running
    if (container.isRunning) {
      await this.stop(sessionId)
    }

    // Remove container
    await this.lifecycle.remove(container.containerId, true)

    // Cleanup temp volumes
    // We try to get userId from current context as destruction is usually user-initiated
    const { getCurrentUserId } = require("../server/middleware/user-context")
    const userId = getCurrentUserId()
    await VolumeManager.cleanupTempVolumes(sessionId, userId)

    // Remove from registry
    this.containers.delete(sessionId)

  }

  /**
   * Get container
   *
   * @param sessionId - Session ID
   * @returns Container info or null if not found
   */
  getContainer(sessionId: string): SessionContainer | null {
    return this.containers.get(sessionId) || null
  }

  /**
   * Get container network information (IP address and ports)
   *
   * Returns the IP address and exposed ports for a session's container.
   * This is useful for connecting to services running inside the container.
   *
   * @param sessionId - Session ID
   * @returns Network info with IP and ports, or null if container not found
   */
  async getContainerIP(
    sessionId: string
  ): Promise<{ ip: string; ports: Record<number, number> } | null> {

    const container = this.containers.get(sessionId)
    if (!container) {
      return null
    }

    log.debug("Getting container network info", { sessionId })

    try {
      // Get container inspect data from Docker
      const info = await this.lifecycle.inspectContainer(container.containerId)

      // Extract IP address from network settings
      // Docker stores network info in NetworkSettings.Networks
      const networks = info.NetworkSettings?.Networks || {}
      const networkEntries = Object.entries(networks)

      if (networkEntries.length === 0) {
        log.warn("Container has no network attached", { sessionId })
        return null
      }

      // Get the first network's IP (bridge network typically)
      const firstNetwork = networkEntries[0][1] as { IPAddress: string } | undefined
      if (!firstNetwork) {
        return null
      }
      const ip = firstNetwork.IPAddress

      // Extract port bindings
      // Ports format: { "8080/tcp": [{ HostPort: 12345 }] }
      const ports: Record<number, number> = {}
      const portBindings = info.NetworkSettings?.Ports || {}

      for (const [portKey, bindings] of Object.entries(portBindings)) {
        if (bindings && Array.isArray(bindings) && bindings.length > 0) {
          const portNum = parseInt(portKey.split("/")[0], 10)
          const hostPort = bindings[0].HostPort
          if (hostPort) {
            ports[portNum] = parseInt(hostPort, 10)
          }
        }
      }

      const result = { ip, ports }

      log.debug("Container network info retrieved", { sessionId, result })

      return result
    } catch (error) {
      log.error("Failed to get container network info", { sessionId, error })
      return null
    }
  }

  /**
   * Get VNC WebSocket URL for a session's container
   *
   * Returns the WebSocket URL for VNC access via websockify.
   * - VNC server runs on port 5901 (RFB protocol)
   * - websockify converts VNC to WebSocket (standard: 6080, some images: 5901)
   *
   * @param sessionId - Session ID
   * @returns VNC WebSocket URL or null if not available
   */
  async getVncUrl(sessionId: string): Promise<string | null> {
    const networkInfo = await this.getContainerIP(sessionId)
    if (!networkInfo) {
      return null
    }

    // Prefer standard websockify port (6080), fallback to non-standard (5901)
    const websockifyPort = networkInfo.ports[6080] || networkInfo.ports[5901]
    if (!websockifyPort) {
      log.warn("No VNC/websockify port available", {
        sessionId,
        availablePorts: Object.keys(networkInfo.ports),
      })
      return null
    }

    // IMPORTANT: Use localhost, NOT container IP
    // The frontend (browser) runs on the host machine, not in the container network namespace
    // Browser can only connect to host-mapped ports via localhost
    return `ws://localhost:${websockifyPort}`
  }

  /**
   * List all active containers
   *
   * @returns Array of session containers
   */
  listSessions(): SessionContainer[] {
    return Array.from(this.containers.values())
  }

  /**
   * Find the skills directory for a project
   *
   * Uses project-specific skills directory:
   * - .opencode/skills/
   *
   * @param projectDir - Project directory
   * @returns Skills directory path
   */
  private findSkillsDirectory(projectDir: string): string {
    const path = require("path")

    // Use project-specific skills directory: .opencode/skills/
    return path.join(projectDir, ".opencode", "skills")
  }

  /**
   * Cleanup stale containers
   *
   * Removes containers that are no longer associated with active sessions.
   * Should be called periodically to prevent resource leaks.
   */
  async cleanupStaleContainers(): Promise<void> {
    log.info("Cleaning up stale containers")

    const activeIds = new Set(this.containers.values().map((c) => c.containerId))
    const allContainers = await this.lifecycle.listContainers()

    for (const container of allContainers) {
      if (!activeIds.has(container.id)) {
        log.info("Removing stale container", { containerId: container.id, name: container.name })
        try {
          await this.lifecycle.remove(container.id, true)
        } catch (error) {
          log.warn("Failed to remove stale container", { containerId: container.id, error })
        }
      }
    }

    log.info("Stale container cleanup complete")
  }

  /**
   * Check if Docker is available
   *
   * @returns true if Docker is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      await this.lifecycle.listContainers()
      return true
    } catch (error) {
      log.warn("Docker not available", { error })
      return false
    }
  }
}

/**
 * Get Docker manager instance
 */
export function getDockerManager(): DockerManager {
  return DockerManager.getInstance()
}