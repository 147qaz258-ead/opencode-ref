/**
 * JWT Token Utilities
 *
 * Provides JWT generation and verification for authentication.
 * Uses HS256 algorithm with a configurable secret.
 */

import { SignJWT, jwtVerify, type JWTVerifyResult } from "jose"
import { Log } from "@/util/log"

const log = Log.create({ service: "auth.jwt" })

/**
 * JWT payload structure
 */
export interface JWTPayload {
  /** User ID */
  userId: string
  /** User email */
  email: string
  /** Issued at timestamp */
  iat: number
  /** Expiration timestamp */
  exp: number
}

/**
 * Token expiration time: 7 days in seconds
 */
const TOKEN_EXPIRATION_SECONDS = 7 * 24 * 60 * 60

/**
 * Get JWT secret from environment
 * @throws Error if JWT_SECRET is not set
 */
function getJWTSecret(): string {
  const secret = process.env.JWT_SECRET
  if (!secret) {
    throw new Error("JWT_SECRET environment variable is not set")
  }
  return secret
}

/**
 * Convert secret to TextEncoder for jose library
 */
function getSecretKey(): Uint8Array {
  const secret = getJWTSecret()
  return new TextEncoder().encode(secret)
}

/**
 * Generate a JWT token for a user
 *
 * @param userId - User ID
 * @param email - User email
 * @returns JWT token string
 * @throws Error if JWT_SECRET is not set
 *
 * @example
 *   const token = await generateJWT("user-123", "user@example.com")
 *   // => "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 */
export async function generateJWT(userId: string, email: string): Promise<string> {
  const secretKey = getSecretKey()
  const now = Math.floor(Date.now() / 1000)

  const token = await new SignJWT({ userId, email })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(now)
    .setExpirationTime(now + TOKEN_EXPIRATION_SECONDS)
    .sign(secretKey)

  log.debug("Generated JWT token", { userId, email })
  return token
}

/**
 * Verify and decode a JWT token
 *
 * @param token - JWT token string
 * @returns JWT payload if valid, null if invalid
 *
 * @example
 *   const payload = await verifyJWT(token)
 *   if (payload) {
 *     console.log(payload.userId, payload.email)
 *   }
 */
export async function verifyJWT(token: string): Promise<JWTPayload | null> {
  if (!token || typeof token !== "string") {
    log.debug("Invalid token: empty or not a string")
    return null
  }

  // Check JWT format: should have 3 parts separated by dots
  const parts = token.split(".")
  if (parts.length !== 3) {
    log.debug("Invalid token format: wrong number of parts", { count: parts.length })
    return null
  }

  try {
    const secretKey = getSecretKey()
    const { payload } = await jwtVerify(token, secretKey)

    // Extract and return the payload
    const jwtPayload: JWTPayload = {
      userId: payload.userId as string,
      email: payload.email as string,
      iat: payload.iat as number,
      exp: payload.exp as number,
    }

    log.debug("Verified JWT token", { userId: jwtPayload.userId, email: jwtPayload.email })
    return jwtPayload
  } catch (error) {
    log.debug("Failed to verify JWT token", { error: error instanceof Error ? error.message : String(error) })
    return null
  }
}

/**
 * Extract user ID from JWT token without full verification
 * This is faster but less secure - use only for non-critical operations
 *
 * @param token - JWT token string
 * @returns User ID or null
 */
export function extractUserIdFromToken(token: string): string | null {
  try {
    // Decode the payload (middle part) without verification
    const parts = token.split(".")
    if (parts.length !== 3) return null

    // Base64URL decode the payload
    const payload = parts[1]
    // Add padding if needed
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/")
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=")

    const decoded = atob(padded)
    const parsed = JSON.parse(decoded)

    return parsed.userId || null
  } catch {
    return null
  }
}
