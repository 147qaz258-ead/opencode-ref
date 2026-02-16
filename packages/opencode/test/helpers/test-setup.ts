/**
 * Test Setup Helpers
 *
 * TDD Phase 1: RED - Test utilities for integration testing
 * These helpers provide reusable functions for end-to-end testing.
 *
 * Key principles:
 * - Test utilities should be simple and focused
 * - Each helper should be independently testable
 * - Use real storage where possible, minimize mocking
 */

import { Identifier } from "@/id/id"
import type { Info } from "@/session/index"
import { Session } from "@/session/index"
import { userContext } from "@/server/middleware/user-context"
import type { Omit } from "typescript"

/**
 * Create a mock Authorization header for testing
 *
 * @param userId - User ID to encode in token
 * @returns Authorization header value (Bearer token)
 *
 * @example
 * createMockAuthHeader("user123")
 * // => "Bearer user-user123"
 */
export function createMockAuthHeader(userId: string): string {
  return `Bearer user-${userId}`
}

/**
 * Create a test session with minimal required fields
 *
 * @param userId - User ID to create session for
 * @param overrides - Optional fields to override
 * @returns Created session info
 *
 * @example
 * const session = await createTestSession("user123", {
 *   title: "My Test"
 * })
 */
export async function createTestSession(
  userId: string,
  overrides: Partial<Omit<Info, "id" | "version" | "time">> = {},
): Promise<Info> {
  const result = await Session.createNext({
    userId,
    title: "Test Session",
    ...overrides,
  })

  return result.info
}

/**
 * Run code with test user context
 *
 * @param userData - User context data
 * @param fn - Function to run with context
 * @returns Result of function
 *
 * @example
 * await withTestUserContext({ userId: "user123" }, async () => {
 *   const current = getCurrentUserId()
 *   expect(current).toBe("user123")
 * })
 */
export async function withTestUserContext<T>(
  userData: { userId: string; authenticated?: boolean },
  fn: () => Promise<T>,
): Promise<T> {
  return userContext.provide(userData, fn)
}

/**
 * Run code with default user context (for backward compatibility)
 */
export async function withDefaultUser<T>(fn: () => Promise<T>): Promise<T> {
  return userContext.provide({}, fn)
}

/**
 * Cleanup test data for a specific user
 *
 * @param userId - User ID to cleanup data for
 *
 * @example
 * await cleanupTestData("user123")
 */
export async function cleanupTestData(userId: string): Promise<void> {
  const { Storage } = await import("@/storage/storage")
  const { getProjectIdForUser } = await import("@/server/middleware/user-context")

  try {
    // Remove all sessions for this user
    const sessions = await Storage.list(["session", getProjectIdForUser(userId)])

    for (const sessionPath of sessions) {
      await Storage.remove(sessionPath)
    }

    console.log(`[DIAGNOSTIC] Cleaned up ${sessions.length} sessions for user ${userId}`)
  } catch (error) {
    console.warn(`Cleanup warning for user ${userId}:`, error)
  }
}

/**
 * Wait for a condition to be true (with timeout)
 *
 * @param condition - Function that returns boolean
 * @param timeoutMs - Maximum time to wait (default: 5000ms)
 *
 * @example
 * await waitFor(() => session.sandboxStatus === "running")
 *
 * @returns
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeoutMs: number = 5000,
): Promise<void> {
  const start = Date.now()

  while (true) {
    if (await condition()) {
      return
    }

    if (Date.now() - start > timeoutMs) {
      throw new Error(`Timeout waiting for condition after ${timeoutMs}ms`)
    }
  }

  await new Promise((resolve) => setTimeout(resolve, 50))
}
