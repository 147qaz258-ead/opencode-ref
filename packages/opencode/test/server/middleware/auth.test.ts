/**
 * Auth Middleware Tests
 *
 * TDD tests for authentication middleware
 */

import { describe, it, expect } from "bun:test"
import {
  extractUserFromToken,
  generateUserToken,
  createUnauthorizedResponse,
  shouldSkipAuth,
  DEFAULT_SKIP_ROUTES,
  type UserContext,
} from "@/server/middleware/auth"

describe("extractUserFromToken", () => {
  describe("valid tokens", () => {
    it("should extract user ID from valid token", async () => {
      const authHeader = "Bearer user-abc123"
      const result = await extractUserFromToken(authHeader)

      expect(result).not.toBeNull()
      expect(result?.userId).toBe("abc123")
      expect(result?.authenticated).toBe(true)
    })

    it("should handle complex user IDs", async () => {
      const authHeader = "Bearer user-550e8400-e29b-41d4-a716-446655440000"
      const result = await extractUserFromToken(authHeader)

      expect(result).not.toBeNull()
      expect(result?.userId).toBe("550e8400-e29b-41d4-a716-446655440000")
    })

    it("should handle email-like user IDs", async () => {
      const authHeader = "Bearer user-user@example.com"
      const result = await extractUserFromToken(authHeader)

      expect(result).not.toBeNull()
      expect(result?.userId).toBe("user@example.com")
    })

    it("should handle numeric user IDs", async () => {
      const authHeader = "Bearer user-12345"
      const result = await extractUserFromToken(authHeader)

      expect(result).not.toBeNull()
      expect(result?.userId).toBe("12345")
    })
  })

  describe("invalid tokens", () => {
    it("should return null for undefined header", async () => {
      const result = await extractUserFromToken(undefined)
      expect(result).toBeNull()
    })

    it("should return null for null header", async () => {
      const result = await extractUserFromToken(null as any)
      expect(result).toBeNull()
    })

    it("should return null for empty string", async () => {
      const result = await extractUserFromToken("")
      expect(result).toBeNull()
    })

    it("should return null for missing Bearer prefix", async () => {
      const result = await extractUserFromToken("user-abc123")
      expect(result).toBeNull()
    })

    it("should return null for wrong auth scheme", async () => {
      const result = await extractUserFromToken("Basic dXNlcjpwYXNz")
      expect(result).toBeNull()
    })

    it("should return null for invalid token format", async () => {
      const result = await extractUserFromToken("Bearer invalid-token")
      expect(result).toBeNull()
    })

    it("should return null for empty user ID", async () => {
      const result = await extractUserFromToken("Bearer user-")
      expect(result).toBeNull()
    })

    it("should return null for token with spaces in wrong place", async () => {
      const result = await extractUserFromToken("Bearer user- abc123")
      expect(result).toBeNull()
    })
  })

  describe("edge cases", () => {
    it("should handle extra whitespace after Bearer", async () => {
      const authHeader = "Bearer   user-abc123"
      const result = await extractUserFromToken(authHeader)

      // Extra spaces should be trimmed
      expect(result).not.toBeNull()
      expect(result?.userId).toBe("abc123")
    })

    it("should be case-sensitive for Bearer", async () => {
      const result = await extractUserFromToken("bearer user-abc123")
      expect(result).toBeNull()
    })
  })
})

describe("generateUserToken", () => {
  it("should generate valid token for user ID", () => {
    const token = generateUserToken("abc123")
    expect(token).toBe("user-abc123")
  })

  it("should generate token that can be parsed back", async () => {
    const userId = "test-user-123"
    const token = generateUserToken(userId)
    const authHeader = `Bearer ${token}`
    const result = await extractUserFromToken(authHeader)

    expect(result?.userId).toBe(userId)
  })

  it("should handle UUID user IDs", () => {
    const userId = "550e8400-e29b-41d4-a716-446655440000"
    const token = generateUserToken(userId)
    expect(token).toBe(`user-${userId}`)
  })
})

describe("createUnauthorizedResponse", () => {
  it("should create 401 response with default message", () => {
    const response = createUnauthorizedResponse()

    expect(response.status).toBe(401)
    expect(response.headers.get("Content-Type")).toBe("application/json")
  })

  it("should create 401 response with custom message", async () => {
    const response = createUnauthorizedResponse("Token expired")
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body).toEqual({ error: "Token expired" })
  })
})

describe("shouldSkipAuth", () => {
  it("should skip health endpoint", () => {
    expect(shouldSkipAuth("/health")).toBe(true)
    expect(shouldSkipAuth("/health/check")).toBe(true)
  })

  it("should skip login endpoint", () => {
    expect(shouldSkipAuth("/login")).toBe(true)
    expect(shouldSkipAuth("/login/callback")).toBe(true)
  })

  it("should skip docs endpoint", () => {
    expect(shouldSkipAuth("/docs")).toBe(true)
    expect(shouldSkipAuth("/docs/api")).toBe(true)
  })

  it("should NOT skip protected routes", () => {
    expect(shouldSkipAuth("/session")).toBe(false)
    expect(shouldSkipAuth("/api/session")).toBe(false)
    expect(shouldSkipAuth("/project")).toBe(false)
  })

  it("should use custom skip routes", () => {
    const customSkipRoutes = ["/custom"]
    expect(shouldSkipAuth("/custom", customSkipRoutes)).toBe(true)
    expect(shouldSkipAuth("/health", customSkipRoutes)).toBe(false)
  })
})

describe("DEFAULT_SKIP_ROUTES", () => {
  it("should include common public routes", () => {
    expect(DEFAULT_SKIP_ROUTES).toContain("/health")
    expect(DEFAULT_SKIP_ROUTES).toContain("/login")
    expect(DEFAULT_SKIP_ROUTES).toContain("/docs")
  })
})
