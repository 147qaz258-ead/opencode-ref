/**
 * OAuth Routes Tests
 *
 * TDD Phase 1: RED -> GREEN - Tests for OAuth routes
 */

import { test, expect, beforeEach, mock } from "bun:test"
import { Hono } from "hono"

// Import the oauth routes module
let oauthRoutesModule: typeof import("../../src/server/oauth-routes")

// Set required environment variables for tests
const TEST_CLIENT_ID = "test-client-id.apps.googleusercontent.com"
const TEST_CLIENT_SECRET = "test-client-secret"
const TEST_REDIRECT_URI = "http://localhost:4096/auth/callback"
const TEST_JWT_SECRET = "test-jwt-secret-for-development"

beforeEach(async () => {
  process.env.GOOGLE_OAUTH_CLIENT_ID = TEST_CLIENT_ID
  process.env.GOOGLE_OAUTH_CLIENT_SECRET = TEST_CLIENT_SECRET
  process.env.GOOGLE_OAUTH_REDIRECT_URI = TEST_REDIRECT_URI
  process.env.JWT_SECRET = TEST_JWT_SECRET

  // Clear mock users
  const { clearMockUsers } = await import("../../src/storage/user-mock")
  clearMockUsers()

  // Load oauth routes
  oauthRoutesModule = await import("../../src/server/oauth-routes")
})

// Helper to create mock request
function createMockRequest(url: string, method: string = "GET", headers?: Record<string, string>): Request {
  return new Request(url, {
    method,
    headers: {
      ...headers,
    },
  })
}

test("GET /auth/google should redirect to Google", async () => {
  const app = new Hono()
  app.route("/", oauthRoutesModule.default)

  const request = createMockRequest("http://localhost:4096/auth/google")
  const response = await app.request(request)

  expect(response.status).toBe(302) // Redirect
  const location = response.headers.get("Location")
  expect(location).toBeTruthy()
  expect(location).toContain("accounts.google.com")
})

test("GET /auth/google should generate and store state", async () => {
  const app = new Hono()
  app.route("/", oauthRoutesModule.default)

  const request = createMockRequest("http://localhost:4096/auth/google")
  const response = await app.request(request)

  expect(response.status).toBe(302)
  const location = response.headers.get("Location")
  expect(location).toContain("state=")

  // Extract state from URL
  const url = new URL(location!)
  const state = url.searchParams.get("state")
  expect(state).toBeTruthy()
  expect(state!.length).toBeGreaterThan(16)
})

test("GET /auth/callback with valid code should redirect with token", async () => {
  // Mock fetch for Google OAuth
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

  const app = new Hono()
  app.route("/", oauthRoutesModule.default)

  // First, initiate OAuth to get state
  const initRequest = createMockRequest("http://localhost:4096/auth/google")
  const initResponse = await app.request(initRequest)
  const initLocation = initResponse.headers.get("Location")!
  const state = new URL(initLocation).searchParams.get("state")!

  // Then callback with the state
  const callbackUrl = `http://localhost:4096/auth/callback?code=mock-auth-code&state=${state}`
  const callbackRequest = createMockRequest(callbackUrl)
  const callbackResponse = await app.request(callbackRequest)

  // Should redirect to frontend with token
  expect(callbackResponse.status).toBe(302)
  const location = callbackResponse.headers.get("Location")
  expect(location).toBeTruthy()
})

test("GET /auth/callback with error should handle gracefully", async () => {
  const app = new Hono()
  app.route("/", oauthRoutesModule.default)

  const callbackUrl = `http://localhost:4096/auth/callback?error=access_denied&error_description=user_denied`
  const request = createMockRequest(callbackUrl)
  const response = await app.request(request)

  // Should handle error gracefully
  expect(response.status).toBeLessThan(500)
  const data = await response.json()
  expect(data.error).toBeTruthy()
})

test("GET /auth/callback with invalid state should reject", async () => {
  // Mock fetch for Google OAuth
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

  const app = new Hono()
  app.route("/", oauthRoutesModule.default)

  // Use invalid state
  const callbackUrl = `http://localhost:4096/auth/callback?code=mock-auth-code&state=invalid-state`
  const request = createMockRequest(callbackUrl)
  const response = await app.request(request)

  // Should return error
  expect(response.status).toBeGreaterThanOrEqual(400)
})

test("GET /auth/me with valid token should return user info", async () => {
  // Mock fetch for Google OAuth
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

  const app = new Hono()
  app.route("/", oauthRoutesModule.default)

  // First, get a token through the OAuth flow
  const initRequest = createMockRequest("http://localhost:4096/auth/google")
  const initResponse = await app.request(initRequest)
  const initLocation = initResponse.headers.get("Location")!
  const state = new URL(initLocation).searchParams.get("state")!

  const callbackUrl = `http://localhost:4096/auth/callback?code=mock-auth-code&state=${state}`
  const callbackRequest = createMockRequest(callbackUrl)
  const callbackResponse = await app.request(callbackRequest)
  const callbackLocation = callbackResponse.headers.get("Location")!
  const token = new URL(callbackLocation).searchParams.get("token")!

  // Now use the token to get user info
  const meRequest = createMockRequest("http://localhost:4096/auth/me", "GET", {
    "Authorization": `Bearer ${token}`,
  })
  const meResponse = await app.request(meRequest)

  expect(meResponse.status).toBe(200)
  const data = await meResponse.json()
  expect(data.success).toBe(true)
  expect(data.user.email).toBe("test@example.com")
})

test("GET /auth/me with invalid token should return 401", async () => {
  const app = new Hono()
  app.route("/", oauthRoutesModule.default)

  const request = createMockRequest("http://localhost:4096/auth/me", "GET", {
    "Authorization": "Bearer invalid-token",
  })
  const response = await app.request(request)

  expect(response.status).toBe(401)
})

test("GET /auth/me with no token should return 401", async () => {
  const app = new Hono()
  app.route("/", oauthRoutesModule.default)

  const request = createMockRequest("http://localhost:4096/auth/me")
  const response = await app.request(request)

  expect(response.status).toBe(401)
})

test("POST /auth/logout should succeed", async () => {
  const app = new Hono()
  app.route("/", oauthRoutesModule.default)

  const request = createMockRequest("http://localhost:4096/auth/logout", "POST")
  const response = await app.request(request)

  expect(response.status).toBe(200)
})

test("GET /auth/providers should return supported OAuth providers", async () => {
  const app = new Hono()
  app.route("/", oauthRoutesModule.default)

  const request = createMockRequest("http://localhost:4096/auth/providers")
  const response = await app.request(request)

  expect(response.status).toBe(200)
  const providers = await response.json()
  expect(providers).toBeInstanceOf(Array)
  expect(providers).toContainEqual({
    id: "google",
    name: "Google",
    authUrl: "/auth/google",
  })
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
