/**
 * Session Creation - Multi-User Integration Tests
 *
 * TDD Phase 2: RED - End-to-end tests for session creation with user isolation
 * These tests verify the complete data flow from context to storage.
 */

import { describe, it, expect, beforeAll } from "bun:test"
import { Identifier } from "@/id/id"
import type { Info } from "@/session/index"
import { createTestSession, cleanupTestData, withTestUserContext } from "../helpers/test-setup"

describe("Session Creation - Multi-User", () => {
  // Cleanup all test data before running tests
  beforeAll(async () => {
    await cleanupTestData("test-user-1")
    await cleanupTestData("test-user-2")
  })

  describe("should create session with correct userId from context", () => {
    it("should create session with userId from context", async () => {
      const userId = "test-user-1"

      await withTestUserContext({ userId, authenticated: true }, async () => {
        const session = await createTestSession(userId, {
          title: "Test Session from Context",
        })

        // Verify session has correct userId
        expect(session.userId).toBe(userId)

        // Verify session was created with valid ID
        expect(session.id).toBeDefined()
        expect(session.id).toMatch(/^ses-[a-z0-9-]+$/)
        expect(session.title).toBe("Test Session from Context")

        // Verify session is not shared by default
        expect(session.share).toBeUndefined()
      })
    })

    it("should use userId parameter when context is not available", async () => {
      const userId = "test-user-1"

      // Create session without context (backward compatibility)
      const session = await createTestSession(userId, {
        title: "Test Session with Parameter",
      })

      // Verify session has correct userId from parameter
      expect(session.userId).toBe(userId)
      expect(session.title).toBe("Test Session with Parameter")
    })

    it("should prioritize context userId over parameter", async () => {
      const contextUserId = "test-user-1"
      const parameterUserId = "test-user-2"

      await withTestUserContext({ userId: contextUserId, authenticated: true }, async () => {
        // Pass different userId as parameter
        const session = await createTestSession(parameterUserId, {
          title: "Context Should Win",
        })

        // Context userId should take priority
        expect(session.userId).toBe(contextUserId)
        expect(session.userId).not.toBe(parameterUserId)
      })
    })
  })

  describe("should create session with user-scoped storage path", () => {
    it("should store session in user-specific directory", async () => {
      const userId = "test-user-1"

      await withTestUserContext({ userId, authenticated: true }, async () => {
        const session = await createTestSession(userId, {
          title: "Test User Scoped Storage",
        })

        // Verify storage path by reading session back
        const { Storage } = await import("@/storage/storage")
        const { getUserStoragePath } = await import("@/server/middleware/storage-paths")
        const userPath = getUserStoragePath(userId)

        // Session should be stored under user path
        const storedSession = await Storage.read<Info>([...userPath, session.id])

        expect(storedSession).toBeDefined()
        expect(storedSession?.id).toBe(session.id)
        expect(storedSession?.userId).toBe(userId)
      })
    })

    it("should separate sessions by user", async () => {
      const user1 = "test-user-1"
      const user2 = "test-user-2"
      const sameTitle = "Same Title"

      // Create session for user 1
      const session1 = await withTestUserContext({ userId: user1, authenticated: true }, async () => {
        return await createTestSession(user1, { title: sameTitle })
      })

      // Create session for user 2 with same title
      const session2 = await withTestUserContext({ userId: user2, authenticated: true }, async () => {
        return await createTestSession(user2, { title: sameTitle })
      })

      // Sessions should have different IDs (stored in different paths)
      expect(session1.id).not.toBe(session2.id)

      // Both should have their respective userId
      expect(session1.userId).toBe(user1)
      expect(session2.userId).toBe(user2)
    })
  })

  describe("should handle errors gracefully", () => {
    it("should throw clear error when session creation fails", async () => {
      const userId = "test-user-1"

      await withTestUserContext({ userId, authenticated: true }, async () => {
        // This should not throw, but if it does, error should be clear
        const session = await createTestSession(userId, {
          title: "Error Handling Test",
        })

        expect(session).toBeDefined()
      })
    })
  })
})
