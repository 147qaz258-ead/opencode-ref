/**
 * Authentication Middleware
 *
 * Supports both simple Bearer Token authentication and JWT tokens.
 * Token formats:
 * - Simple: "user-{userID}" for MVP
 * - JWT: JWT token with userId and email claims
 *
 * Usage:
 *   Authorization: Bearer user-abc123
 *   Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 */

import { Log } from "@/util/log"
import z from "zod"
import { verifyJWT } from "@/auth/jwt"

const log = Log.create({ service: "auth.middleware" })

/**
 * User context extracted from auth token
 */
export interface UserContext {
  /** Unique user identifier */
  userId: string
  /** Whether user is authenticated */
  authenticated: boolean
}

/**
 * Token schema validation
 */
const TokenPayload = z.object({
  userId: z.string().min(1),
})

/**
 * Extract user context from Authorization header or a raw token string
 *
 * Supports both simple tokens ("user-{userID}") and JWT tokens.
 *
 * @param authHeader - The Authorization header value (optional)
 * @param rawToken - A raw token string (optional, e.g. from query param)
 * @returns UserContext if valid, null if invalid/missing
 */
export async function extractUserFromToken(
  authHeader: string | undefined | null,
  rawToken?: string | null
): Promise<UserContext | null> {
  let token: string | undefined

  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.slice(7).trim()
  } else if (rawToken) {
    token = rawToken.trim()
  }

  if (!token) {
    return null
  }

  // Try JWT first (JWT tokens have dots)
  if (token.includes(".")) {
    const payload = await verifyJWT(token)
    if (payload) {
      return {
        userId: payload.userId,
        authenticated: true,
      }
    }
    log.debug("JWT verification failed, falling back to simple token")
  }

  // Fallback to simple token format: "user-{userID}"
  const match = token.match(/^user-(\S+)$/)
  if (!match) {
    log.debug("Invalid token format", { token: token.substring(0, 20) + "..." })
    return null
  }

  const userId = match[1]

  // Validate with schema
  const parsed = TokenPayload.safeParse({ userId })
  if (!parsed.success) {
    log.debug("Token validation failed", { issues: parsed.error.issues })
    return null
  }

  return {
    userId: parsed.data.userId,
    authenticated: true,
  }
}


/**
 * Generate a simple user token
 * Used for testing and MVP login
 *
 * @param userId - The user ID to encode
 * @returns Token string
 */
export function generateUserToken(userId: string): string {
  return `user-${userId}`
}

/**
 * Request context key for storing user context
 */
export const USER_CONTEXT_KEY = "userContext"

/**
 * Create unauthorized response
 */
export function createUnauthorizedResponse(message: string = "Unauthorized"): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  })
}

/**
 * Authentication middleware options
 */
export interface AuthMiddlewareOptions {
  /** Whether auth is required (default: false for backward compatibility) */
  required?: boolean
  /** Routes to skip authentication */
  skipRoutes?: string[]
}

/**
 * Default routes that don't require authentication
 */
export const DEFAULT_SKIP_ROUTES = [
  "/health",
  "/login",
  "/auth",
  "/docs",
  "/openapi",
]

/**
 * Check if a route should skip authentication
 */
export function shouldSkipAuth(path: string, skipRoutes: string[] = DEFAULT_SKIP_ROUTES): boolean {
  return skipRoutes.some(route => path.startsWith(route))
}
