/**
 * Permission Utilities
 *
 * Helper functions for checking user permissions on resources.
 */

import { Log } from "@/util/log"
import { getCurrentProjectId, getCurrentUserId, isAuthenticated } from "./user-context"
import { Session } from "@/session"
import { Storage } from "@/storage/storage"

const log = Log.create({ service: "permission" })

/**
 * Check if the current user owns a session
 *
 * A user owns a session if:
 * - The session's projectID matches the user's project ID
 * - Or the user is the default user (backward compatibility)
 */
export async function canAccessSession(sessionId: string): Promise<boolean> {
  try {
    // Get the session to check ownership
    const session = await Storage.read<Session.Info>(["session", getCurrentProjectId(), sessionId])
    if (!session) {
      return false
    }

    // Check if the session belongs to the user's project
    const userProjectId = getCurrentProjectId()
    const sessionProjectId = session.projectID

    // Session belongs to user if project IDs match
    // Also allow default user to access "global" project for backward compatibility
    const userId = getCurrentUserId()
    if (userId === "default" && sessionProjectId === "global") {
      return true
    }

    // Check if project IDs match (user-{userId} format)
    return sessionProjectId === userProjectId
  } catch (error) {
    log.debug("Session access check failed", { sessionId, error })
    return false
  }
}

/**
 * Check if the current user can access an artifact
 *
 * An artifact is accessible if:
 * - The artifact's session belongs to the user
 */
export async function canAccessArtifact(
  artifactSessionId: string
): Promise<boolean> {
  return canAccessSession(artifactSessionId)
}

/**
 * Verify session access and throw if not allowed
 */
export async function requireSessionAccess(sessionId: string): Promise<void> {
  const canAccess = await canAccessSession(sessionId)
  if (!canAccess) {
    throw new Error(`Access denied: You don't have permission to access session ${sessionId}`)
  }
}

/**
 * Verify artifact access and throw if not allowed
 */
export async function requireArtifactAccess(artifactSessionId: string): Promise<void> {
  await requireSessionAccess(artifactSessionId)
}

/**
 * Get the current user's project ID for storage operations
 * This ensures data is stored in the correct user's namespace
 */
export function getUserStoragePrefix(): string {
  return getCurrentProjectId()
}

/**
 * Check if authentication is required for the current environment
 */
export function isAuthRequired(): boolean {
  // If AUTH_ENABLED is set, require authentication
  const authEnabled = process.env.AUTH_ENABLED
  if (authEnabled === "true" || authEnabled === "1") {
    return true
  }
  return false
}

/**
 * Require authentication if AUTH_ENABLED is true
 */
export function requireAuthIfEnabled(): void {
  if (isAuthRequired() && !isAuthenticated()) {
    throw new Error("Authentication required")
  }
}
