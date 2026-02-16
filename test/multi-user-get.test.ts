/**
 * Session.get() Multi-User User Isolation Tests
 *
 * TDD Phase 1: RED - Tests for Session.get() user isolation
 * These tests verify that Session.get() uses user-scoped storage paths.
 */

import { describe, it, expect, beforeAll } from "bun:test"
import type { Info } from "@/session/index"
import { createTestSession, cleanupTestData, withTestUserContext } from "../helpers/test-setup"

describe("Session.get() - Multi-User User Isolation", () => {
  // Cleanup all test data before running tests
  beforeAll(async () => {
    await cleanupTestData("test-user-1")
    await cleanupTestData("test-user-2")
  })

  describe("should retrieve session from user-scoped path", () => {
    it("should get session with correct user context", async () => {
      const userId = "test-user-1"
      const { Session } = await import("@/session/index")
      const { Instance } = await import("@/project/instance")

      // Create session
      const session = await createTestSession(userId, {
        title: "Get Test - User1",
      })
      expect(session.userId).toBe(userId)

      // Retrieve with same user context
      await withTestUserContext({ userId, authenticated: true }, async () => {
        await Instance.provide({
          directory: "global",
          userId,
          fn: async () => {
            const retrieved = await Session.get(session.id)
            expect(retrieved).toBeDefined()
            expect(retrieved?.id).toBe(session.id)
            expect(retrieved?.userId).toBe(userId)
            expect(retrieved?.title).toBe("Get Test - User1")
          },
        })
      })
    })

    it("should return undefined for non-existent session", async () => {
      const userId = "test-user-1"
      const { Session } = await import("@/session/index")
      const { Instance } = await import("@/project/instance")

      await withTestUserContext({ userId, authenticated: true }, async () => {
        await Instance.provide({
          directory: "global",
          userId,
          fn: async () => {
            const retrieved = await Session.get("non-existent-session-id")
            expect(retrieved).toBeNull()
          },
        })
      })
    })
  })

  describe("should enforce user isolation", () => {
    it("should not retrieve session from different user", async () => {
      const user1 = "test-user-1"
      const user2 = "test-user-2"
      const { Session } = await import("@/session/index")
      const { Instance } = await import("@/project/instance")

      // Create session for user1
      const session = await createTestSession(user1, {
        title: "User1 Private Session",
      })

      // Try to retrieve with user2 context
      await withTestUserContext({ userId: user2, authenticated: true }, async () => {
        await Instance.provide({
          directory: "global",
          userId: user2,
          fn: async () => {
            const retrieved = await Session.get(session.id)
            // Should not find it (different user path)
            expect(retrieved).toBeNull()
          },
        })
      })
    })

    it("should allow same user to retrieve their own session", async () => {
      const user1 = "test-user-1"
      const user2 = "test-user-2"
      const { Session } = await import("@/session/index")
      const { Instance } = await import("@/project/instance")

      // Create sessions for both users
      const session1 = await createTestSession(user1, {
        title: "User1 Session",
      })
      const session2 = await createTestSession(user2, {
        title: "User2 Session",
      })

      // User1 should only retrieve their own session
      await withTestUserContext({ userId: user1, authenticated: true }, async () => {
        await Instance.provide({
          directory: "global",
          userId: user1,
          fn: async () => {
            const retrieved1 = await Session.get(session1.id)
            expect(retrieved1).toBeDefined()
            expect(retrieved1?.id).toBe(session1.id)

            const retrieved2 = await Session.get(session2.id)
            expect(retrieved2).toBeNull()
          },
        })
      })

      // User2 should only retrieve their own session
      await withTestUserContext({ userId: user2, authenticated: true }, async () => {
        await Instance.provide({
          directory: "global",
          userId: user2,
          fn: async () => {
            const retrieved1 = await Session.get(session1.id)
            expect(retrieved1).toBeNull()

            const retrieved2 = await Session.get(session2.id)
            expect(retrieved2).toBeDefined()
            expect(retrieved2?.id).toBe(session2.id)
          },
        })
      })
    })
  })

  describe("should fallback to global path for backward compatibility", () => {
    it("should retrieve global session when user has no sessions", async () => {
      const { Session } = await import("@/session/index")
      const { Instance } = await import("@/project/instance")
      const { Storage } = await import("@/storage/storage")
      const { Identifier } = await import("@/id/id")
      const { getGlobalStoragePath } = await import("@/server/middleware/storage-paths")

      // Create a global session directly in storage
      const sessionId = Identifier.descending("session")
      const globalSession: Info = {
        id: sessionId,
        projectID: "global",
        title: "Global Session for Get Test",
        version: "local",
        time: {
          created: Date.now(),
          updated: Date.now(),
        },
      }

      const globalPath = [...getGlobalStoragePath(), sessionId]
      await Storage.write(globalPath, globalSession)

      // Retrieve with user context (should fallback to global)
      await withTestUserContext({ userId: "some-user", authenticated: true }, async () => {
        await Instance.provide({
          directory: "global",
          userId: "some-user",
          fn: async () => {
            const retrieved = await Session.get(sessionId)
            expect(retrieved).toBeDefined()
            expect(retrieved?.id).toBe(sessionId)
            expect(retrieved?.title).toBe("Global Session for Get Test")
          },
        })
      })

      // Cleanup
      await Storage.remove(globalPath)
    })
  })

  describe("should handle storage path edge cases", () => {
    it("should return null for session that exists but belongs to different user", async () => {
      const user1 = "test-user-1"
      const user2 = "test-user-2"
      const { Session } = await import("@/session/index")
      const { Instance } = await import("@/project/instance")

      // Create session for user1
      const session = await createTestSession(user1, {
        title: "Cross-User Access Test",
      })

      // Verify user2 cannot access it
      await withTestUserContext({ userId: user2, authenticated: true }, async () => {
        await Instance.provide({
          directory: "global",
          userId: user2,
          fn: async () => {
            const retrieved = await Session.get(session.id)
            expect(retrieved).toBeNull()
          },
        })
      })
    })
  })
})
