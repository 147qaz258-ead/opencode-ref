/**
 * Storage Paths - User Isolation Tests
 *
 * TDD Phase 1: RED - Tests for user-isolated storage paths
 * These tests verify that storage paths are correctly generated for multi-user isolation.
 */

import { describe, it, expect, beforeEach } from "bun:test"
import {
  getUserStoragePath,
  getUserSessionPath,
  getGlobalStoragePath,
} from "@/server/middleware/storage-paths"

describe("Storage Paths - User Isolation", () => {
  describe("getUserStoragePath", () => {
    it("should create user-scoped path", () => {
      const userId = "user123"
      const path = getUserStoragePath(userId)

      expect(path).toEqual(["session", "user-user123"])
    })

    it("should handle complex user IDs", () => {
      const userId = "550e8400-e29b-41d4-a716-446655440000"
      const path = getUserStoragePath(userId)

      expect(path).toEqual(["session", `user-${userId}`])
    })

    it("should handle email-like user IDs", () => {
      const userId = "user@example.com"
      const path = getUserStoragePath(userId)

      expect(path).toEqual(["session", "user-user@example.com"])
    })
  })

  describe("getUserSessionPath", () => {
    it("should create session path under user", () => {
      const userId = "user123"
      const sessionId = "ses-abc"
      const path = getUserSessionPath(userId, sessionId)

      expect(path).toEqual(["session", "user-user123", "ses-abc"])
    })

    it("should handle UUID session IDs", () => {
      const userId = "user456"
      const sessionId = "550e8400-e29b-41d4-a716-446655440123"
      const path = getUserSessionPath(userId, sessionId)

      expect(path).toEqual(["session", "user-user456", sessionId])
    })

    it("should separate sessions by user", () => {
      const user1 = "user1"
      const user2 = "user2"
      const sameSessionId = "ses-same"

      const path1 = getUserSessionPath(user1, sameSessionId)
      const path2 = getUserSessionPath(user2, sameSessionId)

      expect(path1).not.toEqual(path2)
      expect(path1[1]).not.toEqual(path2[1])
      expect(path1[2]).toBe(path2[2])
    })
  })

  describe("getGlobalStoragePath", () => {
    it("should create global path", () => {
      const path = getGlobalStoragePath()

      expect(path).toEqual(["session", "global"])
    })

    it("should be consistent across calls", () => {
      const path1 = getGlobalStoragePath()
      const path2 = getGlobalStoragePath()

      expect(path1).toEqual(path2)
    })
  })
})
