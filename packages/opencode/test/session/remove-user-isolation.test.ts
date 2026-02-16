/**
 * Session.remove() User Isolation Tests
 *
 * TDD Phase 1: RED - Tests for user-isolated session deletion
 *
 * These tests verify that:
 * - UserA can delete their own sessions
 * - UserA cannot delete UserB's sessions
 */

import { describe, it, expect, beforeAll } from "bun:test"
import { withUserContext } from "@/server/middleware/user-context"
import { Session } from "@/session/index"
import { Storage } from "@/storage/storage"
import { Instance } from "@/project/instance"

const USER_A = "test-user-a"
const USER_B = "test-user-b"

describe("Session.remove() - User Isolation", () => {
  beforeAll(async () => {
    // Clean up any existing test data
    await cleanupUserSessions(USER_A)
    await cleanupUserSessions(USER_B)
  })

  describe("user can delete their own session", () => {
    it("should delete session and all associated data", async () => {
      let sessionA_id: string | null = null

      // Create session as user A
      await withUserContext({ userId: USER_A, authenticated: true }, async () => {
        await Instance.provide({
          directory: "global",
          userId: USER_A,
          fn: async () => {
            const session = await Session.create({
              title: "User A Session",
            })
            sessionA_id = session.id

            // Verify session exists
            const retrieved = await Session.get(session.id)
            expect(retrieved).not.toBeNull()
            expect(retrieved?.id).toBe(session.id)
          },
        })
      })

      // Delete session as user A
      await withUserContext({ userId: USER_A, authenticated: true }, async () => {
        await Instance.provide({
          directory: "global",
          userId: USER_A,
          fn: async () => {
            await Session.remove(sessionA_id!)

            // Verify session is deleted
            const retrieved = await Session.get(sessionA_id!)
            expect(retrieved).toBeNull()

            // Verify storage is cleaned up
            const userProjectId = `user-${USER_A}`
            const sessionPath = ["session", userProjectId, sessionA_id!]
            await expectRejects(Storage.read(sessionPath))
          },
        })
      })
    })
  })

  describe("user cannot delete another user's session", () => {
    it("should not delete session when different user tries to delete", async () => {
      let sessionA_id: string | null = null

      // Create session as user A
      await withUserContext({ userId: USER_A, authenticated: true }, async () => {
        await Instance.provide({
          directory: "global",
          userId: USER_A,
          fn: async () => {
            const session = await Session.create({
              title: "User A Session - Protected",
            })
            sessionA_id = session.id

            // Verify session exists for user A
            const retrieved = await Session.get(session.id)
            expect(retrieved).not.toBeNull()
            expect(retrieved?.id).toBe(session.id)
          },
        })
      })

      // Try to delete as user B - should not affect user A's session
      await withUserContext({ userId: USER_B, authenticated: true }, async () => {
        await Instance.provide({
          directory: "global",
          userId: USER_B,
          fn: async () => {
            // User B should not see user A's session
            const retrieved = await Session.get(sessionA_id!)
            expect(retrieved).toBeNull()

            // Attempting to delete should not affect user A's session
            // The remove() should handle this gracefully (session not found)
            await Session.remove(sessionA_id!)
          },
        })
      })

      // Verify session still exists for user A
      await withUserContext({ userId: USER_A, authenticated: true }, async () => {
        await Instance.provide({
          directory: "global",
          userId: USER_A,
          fn: async () => {
            const stillExists = await Session.get(sessionA_id!)
            expect(stillExists).not.toBeNull()
            expect(stillExists?.id).toBe(sessionA_id)
          },
        })
      })

      // Cleanup
      await withUserContext({ userId: USER_A, authenticated: true }, async () => {
        await Instance.provide({
          directory: "global",
          userId: USER_A,
          fn: async () => {
            await Session.remove(sessionA_id!)
          },
        })
      })
    })
  })

  describe("storage path isolation", () => {
    it("should store sessions in user-scoped paths", async () => {
      let sessionA_id: string | null = null
      let sessionB_id: string | null = null

      // User A creates a session
      await withUserContext({ userId: USER_A, authenticated: true }, async () => {
        await Instance.provide({
          directory: "global",
          userId: USER_A,
          fn: async () => {
            const session = await Session.create({
              title: "User A Session",
            })
            sessionA_id = session.id

            // Verify storage path
            const userProjectId = `user-${USER_A}`
            const sessionPath = ["session", userProjectId, session.id]
            const stored = await Storage.read<Session.Info>(sessionPath)
            expect(stored).not.toBeNull()
            expect(stored?.id).toBe(session.id)
          },
        })
      })

      // User B creates a session
      await withUserContext({ userId: USER_B, authenticated: true }, async () => {
        await Instance.provide({
          directory: "global",
          userId: USER_B,
          fn: async () => {
            const session = await Session.create({
              title: "User B Session",
            })
            sessionB_id = session.id

            // Verify storage path
            const userProjectId = `user-${USER_B}`
            const sessionPath = ["session", userProjectId, session.id]
            const stored = await Storage.read<Session.Info>(sessionPath)
            expect(stored).not.toBeNull()
            expect(stored?.id).toBe(session.id)
          },
        })
      })

      // Verify user A cannot see user B's session via direct storage access
      await withUserContext({ userId: USER_A, authenticated: true }, async () => {
        await Instance.provide({
          directory: "global",
          userId: USER_A,
          fn: async () => {
            const userProjectId = `user-${USER_A}`
            const sessionBPathForUserA = ["session", userProjectId, sessionB_id!]
            await expectRejects(Storage.read<Session.Info>(sessionBPathForUserA))
          },
        })
      })

      // Cleanup
      await withUserContext({ userId: USER_A, authenticated: true }, async () => {
        await Instance.provide({
          directory: "global",
          userId: USER_A,
          fn: async () => {
            await Session.remove(sessionA_id!)
          },
        })
      })

      await withUserContext({ userId: USER_B, authenticated: true }, async () => {
        await Instance.provide({
          directory: "global",
          userId: USER_B,
          fn: async () => {
            await Session.remove(sessionB_id!)
          },
        })
      })
    })
  })
})

/**
 * Helper function to clean up all sessions for a user
 */
async function cleanupUserSessions(userId: string): Promise<void> {
  const userProjectId = `user-${userId}`

  try {
    const sessions = await Storage.list(["session", userProjectId])
    for (const sessionPath of sessions) {
      // Remove messages
      const sessionId = sessionPath[sessionPath.length - 1] as string
      const messages = await Storage.list(["message", sessionId]).catch(() => [])
      for (const messagePath of messages) {
        const messageId = messagePath[messagePath.length - 1] as string
        const parts = await Storage.list(["part", messageId]).catch(() => [])
        for (const partPath of parts) {
          await Storage.remove(partPath)
        }
        await Storage.remove(messagePath)
      }
      await Storage.remove(sessionPath)
    }
  } catch (error) {
    // Ignore cleanup errors
  }
}

/**
 * Helper to check if promise rejects
 */
async function expectRejects(promise: Promise<unknown>): Promise<void> {
  let didThrow = false
  try {
    await promise
  } catch {
    didThrow = true
  }
  if (!didThrow) {
    throw new Error("Expected promise to throw but it did not")
  }
}
