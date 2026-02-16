/**
 * OAuth Routes
 *
 * HTTP endpoints for Google OAuth authentication flow.
 * Integrates with the existing authentication middleware.
 */

import { Hono } from "hono"
import { Log } from "@/util/log"
import { getGoogleAuthURL, handleGoogleCallback } from "@/auth/google-oauth"
import { verifyJWT } from "@/auth/jwt"

const log = Log.create({ service: "server.oauth-routes" })

// Create OAuth router
const app = new Hono()

/**
 * HMAC-based stateless state generation & verification.
 * No in-memory storage needed — survives server restarts.
 */
async function createState(): Promise<string> {
  const secret = process.env.JWT_SECRET || "opencode-dev-secret"
  const timestamp = Date.now().toString()
  const nonce = crypto.randomUUID()
  const data = `${timestamp}:${nonce}`

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data))
  const hex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("")

  // state = data|signature
  return `${data}|${hex}`
}

async function verifyStateParam(state: string): Promise<boolean> {
  const secret = process.env.JWT_SECRET || "opencode-dev-secret"
  const parts = state.split("|")
  if (parts.length !== 2) return false

  const [data, providedSig] = parts
  const [timestampStr] = data.split(":")

  // Check expiry (10 minutes)
  const timestamp = parseInt(timestampStr, 10)
  if (isNaN(timestamp) || Date.now() - timestamp > 10 * 60 * 1000) {
    log.warn("OAuth state expired", { age: Date.now() - timestamp })
    return false
  }

  // Verify HMAC
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data))
  const expectedSig = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("")

  return expectedSig === providedSig
}

/**
 * GET /auth/google
 * Initiates Google OAuth flow
 */
app.get("/auth/google", async (c) => {
  const state = await createState()
  const authUrl = await getGoogleAuthURL(state)

  log.info("Initiated Google OAuth")

  return c.redirect(authUrl)
})

/**
 * GET /auth/callback
 * Handles OAuth callback from Google
 */
app.get("/auth/callback", async (c) => {
  const { code, state, error, error_description } = c.req.query()

  // Handle OAuth errors from Google
  if (error) {
    log.warn("OAuth error from Google", { error, error_description })
    return c.json({
      success: false,
      error: error_description || error,
    }, 400)
  }

  if (!code || !state) {
    return c.json({
      success: false,
      error: "Missing code or state parameter",
    }, 400)
  }

  // Verify state using HMAC (stateless, survives restarts)
  const validState = await verifyStateParam(state)

  if (!validState) {
    log.warn("Invalid OAuth state", { state: state.substring(0, 30) + "..." })
    return c.json({
      success: false,
      error: "Invalid state parameter",
    }, 400)
  }

  // Handle callback
  const result = await handleGoogleCallback(code)

  if (!result.success) {
    return c.json({
      success: false,
      error: result.error.message,
    }, 400)
  }

  log.info("User authenticated via OAuth", { email: result.user.email })

  // Redirect to frontend login callback page with token
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000"
  const redirectUrl = new URL(frontendUrl)
  redirectUrl.pathname = "/login-callback"
  redirectUrl.searchParams.set("token", result.token)
  redirectUrl.searchParams.set("email", result.user.email)

  return c.redirect(redirectUrl.toString())
})

/**
 * GET /auth/me
 * Get current user info from JWT token
 */
app.get("/auth/me", async (c) => {
  const authHeader = c.req.header("Authorization")

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json({
      success: false,
      error: "Missing or invalid Authorization header",
    }, 401)
  }

  const token = authHeader.slice(7)
  const payload = await verifyJWT(token)

  if (!payload) {
    return c.json({
      success: false,
      error: "Invalid or expired token",
    }, 401)
  }

  return c.json({
    success: true,
    user: {
      userId: payload.userId,
      email: payload.email,
    },
  })
})

/**
 * POST /auth/logout
 * Logout (client-side token invalidation)
 */
app.post("/auth/logout", async (c) => {
  log.info("User logged out")

  return c.json({
    success: true,
    message: "Logged out successfully",
  })
})

/**
 * GET /auth/providers
 * Get list of supported OAuth providers
 */
app.get("/auth/providers", async (c) => {
  const providers = [
    {
      id: "google",
      name: "Google",
      authUrl: "/auth/google",
    },
  ]

  return c.json(providers)
})

export default app
