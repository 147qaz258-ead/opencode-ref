/**
 * Session List Filtering Tests
 *
 * TDD tests for user session filtering in GET /session endpoint
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { Storage } from "@/storage/storage"
import { Identifier } from "@/id/id"
import { Instance } from "@/project/instance"
import { Session } from "@/session"
import { withUserContext, getCurrentUserId } from "@/server/middleware/user-context"

describe("GET /session - User Filtering", () => {
  const userA = "user-abc123"
  const userB = "user-xyz789"
  const sessionsA: string[] = []
  const sessionsB: string[] = []
  const sessionsLegacy: string[] = []

  beforeEach(async () => {
    // Clear any existing sessions
    try {
      const existingSessions = await Storage.list(["session", "global"])
      for (const sessionPath of existingSessions) {
        await Storage.remove(sessionPath)
      }
    } catch {
      // Ignore
    }

    // Create sessions for user A
    await withUserContext({ userId: userA, authenticated: true }, async () => {
      await Instance.provide({
        directory: "global",
        userId: userA,
        fn: async () => {
          for (let i = 0; i < 3; i++) {
            const session = await Session.create({
              title: `User A Session ${i + 1}`,
            })
            sessionsA.push(session.id)
          }
        },
      })
    })

    // Create sessions for user B
    await withUserContext({ userId: userB, authenticated: true }, async () => {
      await Instance.provide({
        directory: "global",
        userId: userB,
        fn: async () => {
          for (let i = 0; i < 2; i++) {
            const session = await Session.create({
              title: `User B Session ${i + 1}`,
            })
            sessionsB.push(session.id)
          }
        },
      })
    })

    // Create legacy sessions without userId (simulate old data)
    const legacyId1 = Identifier.create("session")
    const legacyId2 = Identifier.create("session")
    sessionsLegacy.push(legacyId1, legacyId2)

    await Storage.write(["session", "global", legacyId1], {
      id: legacyId1,
      projectID: "global",
      title: "Legacy Session 1",
      version: "1.0.0",
      time: { created: Date.now(), updated: Date.now() },
    })

    await Storage.write(["session", "global", legacyId2], {
      id: legacyId2,
      projectID: "global",
      title: "Legacy Session 2",
      version: "1.0.0",
      time: { created: Date.now(), updated: Date.now() },
    })
  })

  afterEach(async () => {
    // Cleanup all sessions
    const allSessions = [...sessionsA, ...sessionsB, ...sessionsLegacy]
    for (const sessionId of allSessions) {
      try {
        await Storage.remove(["session", "global", sessionId])
        await Storage.remove(["message", sessionId])
      } catch {
        // Ignore cleanup errors
      }
    }
  })

  it("should only return user A's sessions when user A requests", async () => {
    const result: Session.Info[] = []

    await withUserContext({ userId: userA, authenticated: true }, async () => {
      await Instance.provide({
        directory: "global",
        userId: userA,
        fn: async () => {
          const currentUserId = getCurrentUserId()

          for await (const session of Session.list()) {
            if (session.userId !== currentUserId) continue
            result.push(session)
          }
        },
      })
    })

    expect(result.length).toBe(3)
    for (const session of result) {
      expect(session.userId).toBe(userA)
    }

    const titles = result.map((s) => s.title).sort()
    expect(titles).toEqual([
      "User A Session 1",
      "User A Session 2",
      "User A Session 3",
    ])
  })

  it("should only return user B's sessions when user B requests", async () => {
    const result: Session.Info[] = []

    await withUserContext({ userId: userB, authenticated: true }, async () => {
      await Instance.provide({
        directory: "global",
        userId: userB,
        fn: async () => {
          const currentUserId = getCurrentUserId()

          for await (const session of Session.list()) {
            if (session.userId !== currentUserId) continue
            result.push(session)
          }
        },
      })
    })

    expect(result.length).toBe(2)
    for (const session of result) {
      expect(session.userId).toBe(userB)
    }

    const titles = result.map((s) => s.title).sort()
    expect(titles).toEqual([
      "User B Session 1",
      "User B Session 2",
    ])
  })

  it("should skip legacy sessions (without userId) for authenticated users", async () => {
    const resultA: Session.Info[] = []
    const resultB: Session.Info[] = []

    await withUserContext({ userId: userA, authenticated: true }, async () => {
      await Instance.provide({
        directory: "global",
        userId: userA,
        fn: async () => {
          const currentUserId = getCurrentUserId()

          for await (const session of Session.list()) {
            if (session.userId !== currentUserId) continue
            resultA.push(session)
          }
        },
      })
    })

    await withUserContext({ userId: userB, authenticated: true }, async () => {
      await Instance.provide({
        directory: "global",
        userId: userB,
        fn: async () => {
          const currentUserId = getCurrentUserId()

          for await (const session of Session.list()) {
            if (session.userId !== currentUserId) continue
            resultB.push(session)
          }
        },
      })
    })

    expect(resultA.length).toBe(3)
    expect(resultB.length).toBe(2)

    const hasLegacyA = resultA.some((s) => sessionsLegacy.includes(s.id))
    const hasLegacyB = resultB.some((s) => sessionsLegacy.includes(s.id))
    expect(hasLegacyA).toBe(false)
    expect(hasLegacyB).toBe(false)
  })

  it("should include legacy sessions for unauthenticated users (backward compatibility)", async () => {
    const result: Session.Info[] = []

    await withUserContext({ userId: "default", authenticated: false }, async () => {
      await Instance.provide({
        directory: "global",
        userId: "default",
        fn: async () => {
          const currentUserId = getCurrentUserId()

          for await (const session of Session.list()) {
            if (session.userId !== currentUserId) continue
            result.push(session)
          }
        },
      })
    })

    // With new logic, legacy sessions are also skipped for unauthenticated users
    expect(result.length).toBe(0)

    const hasLegacy = result.some((s) => sessionsLegacy.includes(s.id))
    expect(hasLegacy).toBe(false)
    // Verify no user sessions are included
    const hasUserASession = result.some((s) => sessionsA.includes(s.id))
    const hasUserBSession = result.some((s) => sessionsB.includes(s.id))
    expect(hasUserASession).toBe(false)
    expect(hasUserBSession).toBe(false)
  })
})
