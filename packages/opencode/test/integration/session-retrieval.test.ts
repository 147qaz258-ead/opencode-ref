/**
 * Session Retrieval - Multi-User Integration Tests
 *
 * TDD Phase 2: RED - End-to-end tests for session retrieval with user isolation
 */

import { describe, it, expect, beforeAll } from "bun:test"
import type { Info } from "@/session/index"
import { createTestSession, cleanupTestData, withTestUserContext } from "../helpers/test-setup"

describe("Session Retrieval - Multi-User", () => {
  // Cleanup before tests
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
      const session = await createTestSession(userId, { title: "Retrieval Test" })
      expect(session.userId).toBe(userId)

      // Retrieve with same user context
      await withTestUserContext({ userId, authenticated: true }, async () => {
        await Instance.provide({
          directory: "global",
          userId,
          fn: async () => {
            const retrieved = await Session.get(session.id)
            expect(retrieved).toBeDefined()
            expect(retrieved.id).toBe(session.id)
            expect(retrieved.userId).toBe(userId)
            expect(retrieved.title).toBe("Retrieval Test")
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
            expect(retrieved).toBeUndefined()
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
      const session = await createTestSession(user1, { title: "User1 Session" })

      // Try to retrieve with user2 context
      await withTestUserContext({ userId: user2, authenticated: true }, async () => {
        await Instance.provide({
          directory: "global",
          userId: user2,
          fn: async () => {
            const retrieved = await Session.get(session.id)
            // Should not find it (different user path)
            expect(retrieved).toBeUndefined()
          },
        })
      })
    })
  })

  describe("should fallback to global path for backward compatibility", () => {
    it("should retrieve global session when no userId", async () => {
      const { Session } = await import("@/session/index")
      const { Instance } = await import("@/project/instance")
      const { Storage } = await import("@/storage/storage")
      const { Identifier } = await import("@/id/id")

      // Create a global session directly in storage
      const sessionId = Identifier.descending("session")
      const globalSession = {
        id: sessionId,
        projectID: "global",
        title: "Global Session",
        version: "local",
        time: {
          created: Date.now(),
          updated: Date.now(),
        },
      } as Info

      await Storage.write(["session", "global", sessionId], globalSession)

      // Retrieve with any user context (should use fallback)
      await withTestUserContext({ userId: "some-user", authenticated: true }, async () => {
        await Instance.provide({
          directory: "global",
          userId: "some-user",
          fn: async () => {
            const retrieved = await Session.get(sessionId)
            expect(retrieved).toBeDefined()
            expect(retrieved.id).toBe(sessionId)
            expect(retrieved.title).toBe("Global Session")
          },
        })
      })

      // Cleanup
      await Storage.remove(["session", "global", sessionId])
    })
  })
})
