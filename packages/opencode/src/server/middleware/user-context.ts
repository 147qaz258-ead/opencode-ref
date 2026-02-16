/**
 * User Context
 *
 * Async-local storage for user context in request lifecycle.
 * This allows any code to access the current user without
 * passing userId through every function call.
 */

import { Log } from "@/util/log"
import { Context } from "@/util/context"

const log = Log.create({ service: "user.context" })

/**
 * User context stored in async local storage
import { withUserContext } from
 */
export interface UserContextData {
  /** Unique user identifier */
  userId: string
  /** Whether user is authenticated */
  authenticated: boolean
  /** Request ID for logging */
  requestId?: string
}

// Create context for user data
const userContext = Context.create<UserContextData>("user")

/**
 * Get the current user ID from context
 * Returns "default" if no user context is set (backward compatibility)
 */
export function getCurrentUserId(): string {
  try {
    const ctx = userContext.use()
    return ctx?.userId ?? "default"
  } catch {
    // No context set, return default for backward compatibility
    return "default"
  }
}

/**
 * Get the full user context
 * Returns null if no context is set
 */
export function getCurrentUserContext(): UserContextData | null {
  try {
    return userContext.use()
  } catch {
    return null
  }
}

/**
 * Check if current request is authenticated
 */
export function isAuthenticated(): boolean {
  try {
    const ctx = userContext.use()
    return ctx?.authenticated ?? false
  } catch {
    return false
  }
}

/**
 * Run code with user context
 *
 * @param userData - User context data
 * @param fn - Function to run with context
 * @returns Result of the function
 *
 * @example
 *   const result = await withUserContext({ userId: "abc123", authenticated: true }, async () => {
 *     // Any code here can use getCurrentUserId()
 *     return doSomething()
 *   })
 */
export async function withUserContext<T>(
  userData: UserContextData,
  fn: () => Promise<T>
): Promise<T> {
  return userContext.provide(userData, fn)
}

/**
 * Run code with default user context (for backward compatibility)
 */
export async function withDefaultUser<T>(fn: () => Promise<T>): Promise<T> {
  return withUserContext(
    {
      userId: "default",
      authenticated: false,
    },
    fn
  )
}

/**
 * Generate project ID for a user
 * Format: "user-{userId}" for isolation
 */
export function getProjectIdForUser(userId: string): string {
  return `user-${userId}`
}

/**
 * Get current project ID based on user context
 */
export function getCurrentProjectId(): string {
  const userId = getCurrentUserId()
  return getProjectIdForUser(userId)
}

/**
 * Get storage path for user-specific resources
 * @param userId - User identifier
 * @returns Storage path array for user resources
 * @example
 * getStoragePathForUser("user123") // Returns ["session", "user-user123"]
 */
export function getStoragePathForUser(userId: string): string[] {
  return ["session", getProjectIdForUser(userId)]
}

/**
 * Get session storage path for a specific user and session
 * @param userId - User identifier
 * @param sessionId - Session identifier
 * @returns Storage path array for session
 * @example
 * getSessionStoragePath("user123", "ses-abc") // Returns ["session", "user-user123", "ses-abc"]
 */
export function getSessionStoragePath(userId: string, sessionId: string): string[] {
  return [...getStoragePathForUser(userId), sessionId]
}
