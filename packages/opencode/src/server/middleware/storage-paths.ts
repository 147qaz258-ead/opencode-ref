/**
 * Storage Paths - User Isolation
 *
 * Provides consistent storage path generation for multi-user isolation.
 * All user-specific resources are stored under user-scoped paths.
 *
 * Path structure:
 * - Global: ["session", "global"]
 * - User-specific: ["session", "user-{userId}"]
 * - User session: ["session", "user-{userId}", "{sessionId}"]
 *
 * This ensures that:
 * 1. Each user's data is isolated from others
 * 2. Session IDs cannot conflict across users
 * 3. Backward compatibility with global sessions
 */

/**
 * Get storage path for user-specific resources
 *
 * @param userId - User identifier
 * @returns Storage path array for user resources
 *
 * @example
 * getUserStoragePath("user123")
 * // => ["session", "user-user123"]
 */
export function getUserStoragePath(userId: string): string[] {
  return ["session", `user-${userId}`]
}

/**
 * Get storage path for a specific user's session
 *
 * @param userId - User identifier
 * @param sessionId - Session identifier
 * @returns Storage path array for user session
 *
 * @example
 * getUserSessionPath("user123", "ses-abc")
 * // => ["session", "user-user123", "ses-abc"]
 */
export function getUserSessionPath(userId: string, sessionId: string): string[] {
  return [...getUserStoragePath(userId), sessionId]
}

/**
 * Get storage path for global resources
 *
 * Used for backward compatibility and shared resources.
 *
 * @returns Storage path array for global resources
 *
 * @example
 * getGlobalStoragePath()
 * // => ["session", "global"]
 */
export function getGlobalStoragePath(): string[] {
  return ["session", "global"]
}
