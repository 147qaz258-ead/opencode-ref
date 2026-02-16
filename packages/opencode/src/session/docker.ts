/**
 * Docker User Container Integration
 *
 * Integrates user-level Docker container lifecycle with OpenCode sessions.
 * One user = One container, shared across all sessions.
 */

import { Log } from "@/util/log"
import { Config } from "@/config/config"
import { getDockerManager } from "@/docker/docker-manager"
import { getUserContainerManager, type UserContainer } from "@/container/user-lifecycle"
import { Session } from "./index"

export const log = Log.create({ service: "session.docker" })

/**
 * Check if Docker is enabled for sessions
 */
export async function isDockerEnabled(): Promise<boolean> {
  try {
    const cfg = await Config.get()
    const enabled = cfg.experimental?.docker?.enabled ?? false
    const envVar = process.env.OPENCODE_DOCKER_ENABLED


    log.debug("Checking Docker enabled status", {
      configEnabled: enabled,
      envVar: envVar,
    })

    if (!enabled) {
      log.debug("Docker not enabled in configuration")
      return false
    }

    const docker = getDockerManager()
    const available = await docker.isAvailable()


    log.debug("Docker availability check", { available })

    return available
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
      log.warn("Failed to check Docker status", { error })
    log.warn("Failed to check Docker status", { error })
    return false
  }
}

/**
 * Get or create user container for a session
 *
 * Uses projectID as userId - one container per project/user.
 * Implements auto-retry with exponential backoff for transient failures.
 *
 * @param session - Session info
 * @param maxRetries - Maximum number of retry attempts (default: 5)
 * @returns User container or null if Docker is disabled
 */
export async function getUserContainerForSession(
  session: Session.Info,
  maxRetries: number = 5
): Promise<UserContainer | null> {
  const userId = session.userId || session.projectID.replace("user-", "")

  let lastError: Error | null = null


  for (let attempt = 1; attempt <= maxRetries; attempt++) {

    try {
      const enabled = await isDockerEnabled()
      if (!enabled) {
        log.warn("Docker not enabled - check configuration", {
          sessionId: session.id,
          attempt,
          maxRetries,
          reason: "isDockerEnabled() returned false",
        })
        // If Docker not enabled and we have retries left, wait and retry
        if (attempt < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000)
          log.debug("Waiting before retry", { delay, attempt })
          await sleep(delay)
          continue
        }
        return null
      }

      const manager = getUserContainerManager()
      const cfg = await Config.get()


      log.debug("Getting or creating user container", {
        sessionId: session.id,
        userId,
        attempt,
        image: cfg.experimental?.docker?.image,
      })

      // Get or create user container
      const container = await manager.getOrCreateContainer({
        userId,
        image: cfg.experimental?.docker?.image,
      })


      log.info("User container ready for session", {
        sessionId: session.id,
        userId,
        containerId: container.containerId,
        status: container.status,
        attempt,
      })

      return container
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      log.warn("Failed to get user container, retrying", {
        sessionId: session.id,
        attempt,
        maxRetries,
        error: lastError.message,
      })

      if (attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000)
        await sleep(delay)
      }
    }
  }


  log.error("Failed to get user container after all retries", {
    sessionId: session.id,
    maxRetries,
    lastError: lastError?.message,
  })
  return null
}

/**
 * Sleep for a specified number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Destroy a user's container
 *
 * This should only be called explicitly (e.g., user account deletion).
 * Normal session cleanup does NOT destroy the user container.
 *
 * @param userId - User ID (projectID)
 */
export async function destroyUserContainer(userId: string): Promise<void> {
  try {
    const manager = getUserContainerManager()
    await manager.deleteContainer(userId)
    log.info("User container destroyed", { userId })
  } catch (error) {
    log.error("Failed to destroy user container", { error, userId })
    // Don't throw - cleanup should continue
  }
}

/**
 * Get container state for a session
 *
 * @param sessionId - Session ID
 * @returns User container or null
 */
export async function getContainerState(sessionId: string) {
  try {
    const session = await Session.get(sessionId).catch(() => null)
    if (!session) return null

    const manager = getUserContainerManager()
    return manager.getContainer(session.projectID) || null
  } catch (error) {
    log.warn("Failed to get container state", { error, sessionId })
    return null
  }
}

/**
 * Update user activity (call on API request)
 *
 * @param userId - User ID (projectID)
 */
export async function updateUserActivity(userId: string): Promise<void> {
  try {
    const manager = getUserContainerManager()
    manager.updateActivity(userId)
  } catch (error) {
    log.warn("Failed to update user activity", { error, userId })
  }
}

/**
 * Background retry scheduler for container initialization
 * Allows sessions to be created even when container fails initially
 */
const pendingRetries = new Map<string, NodeJS.Timeout>()

/**
 * Schedule a background retry for container initialization
 *
 * @param sessionId - Session ID to retry container creation for
 * @param userId - User ID for context persistence
 * @param delayMs - Delay before retry (default: 5000ms)
 */
export async function scheduleContainerRetry(
  sessionId: string,
  userId: string,
  delayMs: number = 5000
): Promise<void> {

  if (pendingRetries.has(sessionId)) {
    log.debug("Container retry already scheduled", { sessionId })
    return
  }

  log.info("Scheduling background container retry", { sessionId, delayMs })

  const timeout = setTimeout(async () => {
    const { withUserContext } = await import("@/server/middleware/user-context")
    
    await withUserContext({ userId, authenticated: true }, async () => {
      try {
        const session = await Session.get(sessionId)
        if (!session) {
          log.debug("Session no longer exists, canceling retry", { sessionId })
          pendingRetries.delete(sessionId)
          return
        }

        // If already has container, no need to retry
        if (session.sandboxId) {
          log.debug("Session already has container, canceling retry", {
            sessionId,
            containerId: session.sandboxId,
          })
          pendingRetries.delete(sessionId)
          return
        }

        log.debug("Attempting container creation in background", { sessionId, userId })

        // Try with shorter retry count for background
        const container = await getUserContainerForSession(session, 2)

        if (container) {
          await Session.update(sessionId, (draft) => {
            draft.sandboxId = container.containerId
            draft.sandboxStatus = container.status
          })
          log.info("Background container initialization succeeded", {
            sessionId,
            containerId: container.containerId,
          })
        } else {
          // Schedule another retry
          log.debug("Background container retry failed, scheduling another", { sessionId })
          scheduleContainerRetry(sessionId, userId, Math.min(delayMs * 2, 30000))
        }
      } catch (error) {
        log.error("Background container retry failed with error", {
          sessionId,
          error: error instanceof Error ? error.message : String(error),
        })
        // Schedule another retry
        scheduleContainerRetry(sessionId, userId, Math.min(delayMs * 2, 30000))
      } finally {
        pendingRetries.delete(sessionId)
      }
    })
  }, delayMs)

  pendingRetries.set(sessionId, timeout)
}

/**
 * Cancel a pending container retry
 *
 * @param sessionId - Session ID to cancel retry for
 */
export function cancelContainerRetry(sessionId: string): void {
  const timeout = pendingRetries.get(sessionId)
  if (timeout) {
    clearTimeout(timeout)
    pendingRetries.delete(sessionId)
    log.debug("Canceled container retry", { sessionId })
  }
}

/**
 * Get all sessions with pending retries
 *
 * @returns Array of session IDs with pending retries
 */
export function getPendingRetries(): string[] {
  return Array.from(pendingRetries.keys())
}
