/**
 * Session.createNext() Project ID Tests
 *
 * TDD Phase 1: RED - Tests for user-scoped project IDs in Session.createNext()
 *
 * These tests verify that:
 * - Session.createNext() uses getProjectIdForUser(finalUserId) instead of Instance.project.id
 * - Sessions are stored in user-scoped paths: ["session", "user-{userId}", "{sessionId}"]
 * - Storage.write() uses the user-scoped projectID
 */

import { describe, it, expect, beforeAll } from "bun:test"
import { withUserContext, getProjectIdForUser, getSessionStoragePath } from "@/server/middleware/user-context"
import { Session } from "@/session/index"
import { Instance } from "@/project/instance"
import { Storage } from "@/storage/storage"

const USER_A = "test-user-project-a"
const USER_B = "test-user-project-b"

describe("Session.createNext() - Project ID Isolation", () => {
  beforeAll(async () => {
    // Clean up any existing test data
    await cleanupUserSessions(USER_A)
    await cleanupUserSessions(USER_B)
  })

  describe("should use user-scoped project ID for session creation", () => {
    it("should create session with user-scoped projectID", async () => {
      let createdSession: Session.Info | null = null

      await withUserContext({ userId: USER_A, authenticated: true }, async () => {
        await Instance.provide({
          directory: "global",
          userId: USER_A,
          fn: async () => {
            createdSession = await Session.create({
              title: "User A Session",
            })

            // Verify session was created
            expect(createdSession).toBeDefined()
            expect(createdSession!.id).toMatch(/^ses_[a-zA-Z0-9_]+$/)

            // CRITICAL: Verify projectID is user-scoped, not "global"
            const expectedProjectId = getProjectIdForUser(USER_A)
            expect(createdSession!.projectID).toBe(expectedProjectId)
            expect(createdSession!.projectID).not.toBe("global")

            // Verify userId is set correctly
            expect(createdSession!.userId).toBe(USER_A)
          },
        })
      })

      // Verify session is retrievable
      await withUserContext({ userId: USER_A, authenticated: true }, async () => {
        await Instance.provide({
          directory: "global",
          userId: USER_A,
          fn: async () => {
            const retrieved = await Session.get(createdSession!.id)
            expect(retrieved).not.toBeNull()
            expect(retrieved!.projectID).toBe(getProjectIdForUser(USER_A))
            expect(retrieved!.userId).toBe(USER_A)
          },
        })
      })
    })

    it("should store session in user-scoped storage path", async () => {
      const userId = USER_A
      let sessionId: string | null = null

      await withUserContext({ userId, authenticated: true }, async () => {
        await Instance.provide({
          directory: "global",
          userId,
          fn: async () => {
            const session = await Session.create({
              title: "Storage Path Test",
            })
            sessionId = session.id

            // Verify storage path
            const expectedPath = getSessionStoragePath(userId, sessionId)
            const stored = await Storage.read<Session.Info>(expectedPath)

            expect(stored).toBeDefined()
            expect(stored!.id).toBe(sessionId)
            expect(stored!.projectID).toBe(getProjectIdForUser(userId))
          },
        })
      })
    })

    it("should isolate sessions between users", async () => {
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

            // Verify User A's projectID
            expect(session.projectID).toBe(getProjectIdForUser(USER_A))
            expect(session.userId).toBe(USER_A)
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

            // Verify User B's projectID
            expect(session.projectID).toBe(getProjectIdForUser(USER_B))
            expect(session.userId).toBe(USER_B)
          },
        })
      })

      // Verify User A cannot access User B's session
      await withUserContext({ userId: USER_A, authenticated: true }, async () => {
        await Instance.provide({
          directory: "global",
          userId: USER_A,
          fn: async () => {
            // User A should not see User B's session
            const retrieved = await Session.get(sessionB_id!)
            expect(retrieved).toBeNull()
          },
        })
      })

      // Verify User B cannot access User A's session
      await withUserContext({ userId: USER_B, authenticated: true }, async () => {
        await Instance.provide({
          directory: "global",
          userId: USER_B,
          fn: async () => {
            // User B should not see User A's session
            const retrieved = await Session.get(sessionA_id!)
            expect(retrieved).toBeNull()
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

  describe("should use getProjectIdForUser for storage path", () => {
    it("should store with Storage.write using user-scoped path", async () => {
      const userId = USER_A
      let sessionId: string | null = null
      let projectID: string | null = null

      await withUserContext({ userId, authenticated: true }, async () => {
        await Instance.provide({
          directory: "global",
          userId,
          fn: async () => {
            const session = await Session.create({
              title: "Storage Write Test",
            })
            sessionId = session.id
            projectID = session.projectID

            // Verify projectID is user-scoped
            const expectedProjectId = getProjectIdForUser(userId)
            expect(projectID).toBe(expectedProjectId)

            // Verify session is stored at user-scoped path
            const storagePath = getSessionStoragePath(userId, sessionId!)
            const storedSession = await Storage.read<Session.Info>(storagePath)

            expect(storedSession).toBeDefined()
            expect(storedSession!.id).toBe(sessionId)
            expect(storedSession!.projectID).toBe(expectedProjectId)
          },
        })
      })
    })
  })

  describe("backward compatibility", () => {
    it("should work with default user when no context", async () => {
      let createdSession: Session.Info | null = null

      // Create session without user context (backward compatibility)
      await Instance.provide({
        directory: "global",
        fn: async () => {
          createdSession = await Session.create({
            title: "Default User Session",
          })

          // Verify session was created
          expect(createdSession).toBeDefined()
          expect(createdSession!.id).toMatch(/^ses_[a-zA-Z0-9_]+$/)

          // Should use default user's projectID
          expect(createdSession!.projectID).toBe("user-default")
        },
      })
    })
  })
})

/**
 * Helper function to clean up all sessions for a user
 */
async function cleanupUserSessions(userId: string): Promise<void> {
  const projectId = getProjectIdForUser(userId)

  try {
    const sessions = await Storage.list(["session", projectId])
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
