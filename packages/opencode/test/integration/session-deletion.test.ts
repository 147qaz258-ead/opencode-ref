/**
 * Session Deletion - Multi-User Integration Tests
 *
 * TDD Phase 2: RED - End-to-end tests for session deletion with user isolation
 */

import { describe, it, expect, beforeAll } from "bun:test"
import type { Info } from "@/session/index"
import { createTestSession, cleanupTestData, withTestUserContext } from "../helpers/test-setup"

describe("Session Deletion - Multi-User", () => {
  // Cleanup before tests
  beforeAll(async () => {
    await cleanupTestData("test-user-1")
    await cleanupTestData("test-user-2")
  })

  describe("should delete session when user is owner", () => {
    it("should delete session successfully", async () => {
      const userId = "test-user-1"
      const { Session } = await import("@/session/index")
      const { Instance } = await import("@/project/instance")

      // Create session
      const session = await createTestSession(userId, { title: "To Delete" })

      // Verify it exists
      await withTestUserContext({ userId, authenticated: true }, async () => {
        await Instance.provide({
          directory: "global",
          userId,
          fn: async () => {
            const before = await Session.get(session.id)
            expect(before).toBeDefined()

            // Delete it
            await Session.remove(session.id)

            // Verify it's gone
            const after = await Session.get(session.id)
            expect(after).toBeUndefined()
          },
        })
      })
    })
  })

  describe("should not delete session when user is not owner", () => {
    it("should keep session when different user tries to delete", async () => {
      const user1 = "test-user-1"
      const user2 = "test-user-2"
      const { Session } = await import("@/session/index")
      const { Instance } = await import("@/project/instance")

      // Create session for user1
      const session = await createTestSession(user1, { title: "User1 Session" })

      // Try to delete with user2 context
      await withTestUserContext({ userId: user2, authenticated: true }, async () => {
        await Instance.provide({
          directory: "global",
          userId: user2,
          fn: async () => {
            // This will try to delete but won't find it (different user path)
            await Session.remove(session.id)
          },
        })
      })

      // Verify session still exists for user1
      await withTestUserContext({ userId: user1, authenticated: true }, async () => {
        await Instance.provide({
          directory: "global",
          userId: user1,
          fn: async () => {
            const stillThere = await Session.get(session.id)
            expect(stillThere).toBeDefined()
            expect(stillThere.id).toBe(session.id)
          },
        })
      })

      // Cleanup
      await withTestUserContext({ userId: user1, authenticated: true }, async () => {
        await Instance.provide({
          directory: "global",
          userId: user1,
          fn: async () => {
            await Session.remove(session.id)
          },
        })
      })
    })
  })

  describe("should cascade delete child sessions", () => {
    it("should delete parent and all children", async () => {
      const userId = "test-user-1"
      const { Session } = await import("@/session/index")
      const { Instance } = await import("@/project/instance")
      const { Identifier } = await import("@/id/id")

      await withTestUserContext({ userId, authenticated: true }, async () => {
        await Instance.provide({
          directory: "global",
          userId,
          fn: async () => {
            // Create parent session
            const parent = await Session.create({ title: "Parent Session" })

            // Create child session
            const child = await Session.fork({
              sessionID: parent.id,
              userId,
            })

            // Verify both exist
            expect(await Session.get(parent.id)).toBeDefined()
            expect(await Session.get(child.id)).toBeDefined()

            // Delete parent (should cascade)
            await Session.remove(parent.id)

            // Verify both are gone
            expect(await Session.get(parent.id)).toBeUndefined()
            expect(await Session.get(child.id)).toBeUndefined()
          },
        })
      })
    })
  })
})
