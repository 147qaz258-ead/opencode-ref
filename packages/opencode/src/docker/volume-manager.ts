/**
 * Volume Manager
 *
 * Handles Docker volume mounting and management for sandbox containers.
 * Ensures proper isolation and permissions for mounted directories.
 */

import path from "path"
import { Log } from "@/util/log"
import { getEnv } from "@/config/env-loader"
import type { VolumeMount } from "./types"

export const log = Log.create({ service: "docker.volume-manager" })

/**
 * Get the container workspace directory from environment or default
 * This must match the container's WORKDIR in its Dockerfile
 */
function getContainerWorkspace(): string {
  return getEnv("SANDBOX_WORKSPACE") || "/workspace"
}

/**
 * Volume Manager for Docker containers
 *
 * Manages volume mounts, ensuring proper permissions and isolation.
 */
export class VolumeManager {
  /**
   * Create standard volume mounts for a sandbox container
   *
   * @param sessionId - Session ID
   * @param projectDir - Project directory path
   * @param skillsDir - Skills directory path
   * @param userId - User ID for permissions (default: 1000)
   * @returns Array of volume mounts
   */
  static createSandboxMounts(
    sessionId: string,
    projectDir?: string,
    skillsDir?: string,
    userId: number = 1000
  ): VolumeMount[] {
    const mounts: VolumeMount[] = []
    const containerWorkspace = getContainerWorkspace()

    if (projectDir) {
      mounts.push({
        hostPath: path.resolve(projectDir),
        containerPath: containerWorkspace,
        mode: "rw",
      })
    }

    if (skillsDir) {
      mounts.push({
        hostPath: path.resolve(skillsDir),
        containerPath: "/skills",
        mode: "ro",
      })
    }

    return mounts
  }

  /**
   * Build Docker volume bindings from mounts
   *
   * Docker HostConfig.Binds requires string[] format: "hostPath:containerPath:mode"
   * See: https://docs.docker.com/engine/api/v1.43/#tag/Container/operation/ContainerCreate
   *
   * @param mounts - Array of volume mounts
   * @returns Docker volume bindings as string array
   */
  static buildBinds(mounts: VolumeMount[]): string[] {
    const binds: string[] = []

    for (const mount of mounts) {
      // Format: "hostPath:containerPath:mode"
      binds.push(`${mount.hostPath}:${mount.containerPath}:${mount.mode}`)
    }

    return binds
  }

  /**
   * Create a temporary volume for a session
   *
   * @param sessionId - Session ID
   * @param userId - User ID (optional, defaults to current context)
   * @returns Path to the temp volume
   */
  static createTempVolume(sessionId: string, userId?: string): string {
    const fs = require("fs")
    const path = require("path")
    const { Global } = require("../global/index")
    const { getCurrentUserId } = require("../server/middleware/user-context")
    
    const finalUserId = userId || getCurrentUserId()
    const tempRoot = path.join(Global.Path.data, "storage", "temp", finalUserId, sessionId)
    
    if (!fs.existsSync(tempRoot)) {
      fs.mkdirSync(tempRoot, { recursive: true })
    }
    
    log.info("Created temp volume", { sessionId, userId: finalUserId, path: tempRoot })
    return tempRoot
  }

  /**
   * Cleanup temporary volumes for a session
   *
   * @param sessionId - Session ID
   * @param userId - User ID (optional, defaults to current context)
   */
  static async cleanupTempVolumes(sessionId: string, userId?: string): Promise<void> {
    const fs = require("fs/promises")
    const path = require("path")
    const { Global } = require("../global/index")
    const { getCurrentUserId } = require("../server/middleware/user-context")
    
    const finalUserId = userId || getCurrentUserId()
    const tempRoot = path.join(Global.Path.data, "storage", "temp", finalUserId, sessionId)
    
    try {
      await fs.rm(tempRoot, { recursive: true, force: true })
      log.info("Cleaned up temp volume", { sessionId, userId: finalUserId, path: tempRoot })
    } catch (error) {
      log.warn("Failed to cleanup temp volume", { sessionId, userId: finalUserId, error })
    }
  }
}
