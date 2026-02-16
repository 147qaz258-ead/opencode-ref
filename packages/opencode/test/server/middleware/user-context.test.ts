/**
 * User Context Tests
 *
 * TDD tests for user context management
 */

import { describe, it, expect, beforeEach } from "bun:test"
import {
  getCurrentUserId,
  getCurrentUserContext,
  isAuthenticated,
  withUserContext,
  withDefaultUser,
  getProjectIdForUser,
  getCurrentProjectId,
} from "@/server/middleware/user-context"

describe("getCurrentUserId", () => {
  it("should return 'default' when no context is set", () => {
    const userId = getCurrentUserId()
    expect(userId).toBe("default")
  })

  it("should return user ID when context is set", async () => {
    let capturedUserId: string | undefined

    await withUserContext({ userId: "test-user-123", authenticated: true }, async () => {
      capturedUserId = getCurrentUserId()
    })

    expect(capturedUserId).toBe("test-user-123")
  })

  it("should return 'default' after context ends", async () => {
    await withUserContext({ userId: "test-user-123", authenticated: true }, async () => {
      // Inside context
    })

    // Outside context
    const userId = getCurrentUserId()
    expect(userId).toBe("default")
  })
})

describe("getCurrentUserContext", () => {
  it("should return null when no context is set", () => {
    const ctx = getCurrentUserContext()
    expect(ctx).toBeNull()
  })

  it("should return context data when set", async () => {
    let capturedCtx: ReturnType<typeof getCurrentUserContext> = null

    await withUserContext(
      { userId: "test-user-456", authenticated: true, requestId: "req-123" },
      async () => {
        capturedCtx = getCurrentUserContext()
      }
    )

    expect(capturedCtx).not.toBeNull()
    expect(capturedCtx!.userId).toBe("test-user-456")
    expect(capturedCtx!.authenticated).toBe(true)
    expect(capturedCtx!.requestId).toBe("req-123")
  })
})

describe("isAuthenticated", () => {
  it("should return false when no context is set", () => {
    expect(isAuthenticated()).toBe(false)
  })

  it("should return true when authenticated context is set", async () => {
    let result: boolean | undefined

    await withUserContext({ userId: "test", authenticated: true }, async () => {
      result = isAuthenticated()
    })

    expect(result).toBe(true)
  })

  it("should return false when unauthenticated context is set", async () => {
    let result: boolean | undefined

    await withUserContext({ userId: "test", authenticated: false }, async () => {
      result = isAuthenticated()
    })

    expect(result).toBe(false)
  })
})

describe("withUserContext", () => {
  it("should return the result of the inner function", async () => {
    const result = await withUserContext({ userId: "test", authenticated: true }, async () => {
      return "hello world"
    })

    expect(result).toBe("hello world")
  })

  it("should propagate errors from inner function", async () => {
    expect(
      withUserContext({ userId: "test", authenticated: true }, async () => {
        throw new Error("test error")
      })
    ).rejects.toThrow("test error")
  })

  it("should support nested contexts", async () => {
    let outerUserId: string | undefined
    let innerUserId: string | undefined

    await withUserContext({ userId: "outer", authenticated: true }, async () => {
      outerUserId = getCurrentUserId()

      await withUserContext({ userId: "inner", authenticated: true }, async () => {
        innerUserId = getCurrentUserId()
      })
    })

    expect(outerUserId).toBe("outer")
    expect(innerUserId).toBe("inner")
  })
})

describe("withDefaultUser", () => {
  it("should set user ID to 'default'", async () => {
    let userId: string | undefined

    await withDefaultUser(async () => {
      userId = getCurrentUserId()
    })

    expect(userId).toBe("default")
  })

  it("should set authenticated to false", async () => {
    let auth: boolean | undefined

    await withDefaultUser(async () => {
      auth = isAuthenticated()
    })

    expect(auth).toBe(false)
  })
})

describe("getProjectIdForUser", () => {
  it("should prefix user ID with 'user-'", () => {
    expect(getProjectIdForUser("abc123")).toBe("user-abc123")
  })

  it("should handle UUID user IDs", () => {
    const uuid = "550e8400-e29b-41d4-a716-446655440000"
    expect(getProjectIdForUser(uuid)).toBe(`user-${uuid}`)
  })
})

describe("getCurrentProjectId", () => {
  it("should return 'user-default' when no context is set", () => {
    expect(getCurrentProjectId()).toBe("user-default")
  })

  it("should return correct project ID when context is set", async () => {
    let projectId: string | undefined

    await withUserContext({ userId: "test-123", authenticated: true }, async () => {
      projectId = getCurrentProjectId()
    })

    expect(projectId).toBe("user-test-123")
  })
})
