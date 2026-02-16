/**
 * Google OAuth Flow Tests
 *
 * TDD Phase 1: RED -> GREEN - Tests for Google OAuth flow
 * Focus on OAuth flow without user storage dependency
 */

import { test, expect, beforeEach, mock } from "bun:test"
import {
  getGoogleAuthURL,
  handleGoogleCallback,
  generateState,
  verifyState,
} from "../../src/auth/google-oauth"

// Set required environment variables for tests
const TEST_CLIENT_ID = "test-client-id.apps.googleusercontent.com"
const TEST_CLIENT_SECRET = "test-client-secret"
const TEST_REDIRECT_URI = "http://localhost:4096/auth/callback"
const TEST_JWT_SECRET = "test-jwt-secret-for-development"

beforeEach(() => {
  process.env.GOOGLE_OAUTH_CLIENT_ID = TEST_CLIENT_ID
  process.env.GOOGLE_OAUTH_CLIENT_SECRET = TEST_CLIENT_SECRET
  process.env.GOOGLE_OAUTH_REDIRECT_URI = TEST_REDIRECT_URI
  process.env.JWT_SECRET = TEST_JWT_SECRET
})

test("should generate Google auth URL with state", async () => {
  const state = "test-state-123"
  const url = await getGoogleAuthURL(state)

  expect(url).toBeDefined()
  expect(typeof url).toBe("string")
  expect(url).toContain("accounts.google.com")
  expect(url).toContain("oauth2/v2/auth")
  expect(url).toContain(`client_id=${TEST_CLIENT_ID}`)
  expect(url).toContain(`redirect_uri=${encodeURIComponent(TEST_REDIRECT_URI)}`)
  expect(url).toContain(`state=${state}`)
  expect(url).toContain("response_type=code")
  expect(url).toContain("scope=")
})

test("should generate cryptographically secure state", async () => {
  const state1 = await generateState()
  const state2 = await generateState()

  // States should be different
  expect(state1).not.toBe(state2)

  // State should be a non-empty string
  expect(state1).toBeTruthy()
  expect(state1.length).toBeGreaterThan(16) // At least 16 characters for security

  // Should be URL-safe (hex characters)
  expect(state1).toMatch(/^[a-f0-9]+$/)
})

test("should exchange code for tokens (mocked)", async () => {
  // Mock the fetch function to avoid real Google API calls
  const mockFetch = mock(() => Promise.resolve({
    ok: true,
    json: async () => ({
      access_token: "mock-access-token",
      id_token: createMockIdToken({
        sub: "google-123456",
        email: "test@example.com",
        name: "Test User",
        picture: "https://example.com/photo.jpg",
      }),
      expires_in: 3600,
      token_type: "Bearer",
    }),
  } as Response))

  globalThis.fetch = mockFetch

  const result = await handleGoogleCallback("mock-auth-code")

  expect(result).toBeDefined()
  expect(result.success).toBe(true)

  // Verify fetch was called with correct parameters
  expect(mockFetch).toHaveBeenCalled()
  const callArgs = mockFetch.mock.calls[0]
  expect(callArgs[0]).toContain("oauth2.googleapis.com")
})

test("should decode Google ID token", async () => {
  const mockIdToken = createMockIdToken({
    sub: "google-123456",
    email: "test@example.com",
    name: "Test User",
    picture: "https://example.com/photo.jpg",
    given_name: "Test",
    family_name: "User",
  })

  const mockFetch = mock(() => Promise.resolve({
    ok: true,
    json: async () => ({
      access_token: "mock-access-token",
      id_token: mockIdToken,
      expires_in: 3600,
      token_type: "Bearer",
    }),
  } as Response))

  globalThis.fetch = mockFetch

  const result = await handleGoogleCallback("mock-auth-code")

  expect(result.success).toBe(true)
  if (result.success) {
    expect(result.user).toBeDefined()
    expect(result.user!.email).toBe("test@example.com")
    expect(result.user!.name).toBe("Test User")
  }
})

test("should return JWT token on successful callback", async () => {
  const mockFetch = mock(() => Promise.resolve({
    ok: true,
    json: async () => ({
      access_token: "mock-access-token",
      id_token: createMockIdToken({
        sub: "google-123456",
        email: "test@example.com",
        name: "Test User",
        picture: "https://example.com/photo.jpg",
      }),
      expires_in: 3600,
      token_type: "Bearer",
    }),
  } as Response))

  globalThis.fetch = mockFetch

  const result = await handleGoogleCallback("mock-auth-code")

  expect(result.success).toBe(true)
  if (result.success) {
    expect(result.token).toBeDefined()
    expect(typeof result.token).toBe("string")
    expect(result.token!.length).toBeGreaterThan(0)
    // JWT format: header.payload.signature
    const parts = result.token!.split(".")
    expect(parts).toHaveLength(3)
  }
})

test("should handle OAuth errors from Google", async () => {
  const mockFetch = mock(() => Promise.resolve({
    ok: false,
    status: 400,
    json: async () => ({
      error: "invalid_grant",
      error_description: "The provided authorization code is invalid.",
    }),
  } as Response))

  globalThis.fetch = mockFetch

  const result = await handleGoogleCallback("invalid-code")

  expect(result.success).toBe(false)
  if (!result.success) {
    expect(result.error).toBeDefined()
    expect(result.error!.message).toContain("authorization code")
  }
})

test("should return error when GOOGLE_OAUTH_CLIENT_ID not set", async () => {
  delete process.env.GOOGLE_OAUTH_CLIENT_ID

  const result = await handleGoogleCallback("code")

  expect(result.success).toBe(false)
  if (!result.success) {
    expect(result.error?.message).toContain("GOOGLE_OAUTH_CLIENT_ID")
  }
})

test("should return error when GOOGLE_OAUTH_CLIENT_SECRET not set", async () => {
  delete process.env.GOOGLE_OAUTH_CLIENT_SECRET

  const result = await handleGoogleCallback("code")

  expect(result.success).toBe(false)
  if (!result.success) {
    expect(result.error?.message).toContain("GOOGLE_OAUTH_CLIENT_SECRET")
  }
})

test("should verify valid state", async () => {
  const state = await generateState()
  const isValid = await verifyState(state, state)

  expect(isValid).toBe(true)
})

test("should reject invalid state", async () => {
  const state1 = await generateState()
  const state2 = await generateState()

  const isValid = await verifyState(state1, state2)

  expect(isValid).toBe(false)
})

test("should reject empty state", async () => {
  const isValid = await verifyState("", "some-state")
  expect(isValid).toBe(false)

  const isValid2 = await verifyState("some-state", "")
  expect(isValid2).toBe(false)
})

test("should include required scopes in auth URL", async () => {
  const state = "test-state"
  const url = await getGoogleAuthURL(state)

  // Should include openid, email, and profile scopes
  expect(url).toContain("openid")
  expect(url).toContain("email")
  expect(url).toContain("profile")
})

test("should handle network errors gracefully", async () => {
  const mockFetch = mock(() => Promise.reject(new Error("Network error")))

  globalThis.fetch = mockFetch

  const result = await handleGoogleCallback("mock-code")

  expect(result.success).toBe(false)
  if (!result.success) {
    expect(result.error).toBeDefined()
    expect(result.error?.message).toBe("Network error")
  }
})

test("should handle JSON parse errors", async () => {
  const mockFetch = mock(() => Promise.resolve({
    ok: true,
    json: async () => {
      throw new Error("JSON Parse error")
    },
  } as Response))

  globalThis.fetch = mockFetch

  const result = await handleGoogleCallback("mock-code")

  expect(result.success).toBe(false)
  if (!result.success) {
    expect(result.error).toBeDefined()
  }
})

test("should return error if JWT_SECRET not set", async () => {
  delete process.env.JWT_SECRET

  const mockFetch = mock(() => Promise.resolve({
    ok: true,
    json: async () => ({
      access_token: "mock-access-token",
      id_token: createMockIdToken({
        sub: "google-123456",
        email: "test@example.com",
        name: "Test User",
      }),
      expires_in: 3600,
      token_type: "Bearer",
    }),
  } as Response))

  globalThis.fetch = mockFetch

  const result = await handleGoogleCallback("mock-code")

  expect(result.success).toBe(false)
  if (!result.success) {
    expect(result.error?.message).toContain("JWT_SECRET")
  }
})

test("should include access_type=offline in auth URL", async () => {
  const state = "test-state"
  const url = await getGoogleAuthURL(state)

  expect(url).toContain("access_type=offline")
})

test("should include prompt=consent in auth URL", async () => {
  const state = "test-state"
  const url = await getGoogleAuthURL(state)

  expect(url).toContain("prompt=consent")
})

// Helper function to create mock JWT
function createMockIdToken(payload: Record<string, string>): string {
  const header = { alg: "RS256", typ: "JWT" }
  const headerStr = btoa(JSON.stringify(header))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

  const payloadStr = btoa(JSON.stringify(payload))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

  return `${headerStr}.${payloadStr}.signature`
}
