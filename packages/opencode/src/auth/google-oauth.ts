/**
 * Google OAuth Flow
 *
 * Handles Google OAuth 2.0 authentication flow including:
 * - Generating authorization URLs
 * - Exchanging authorization codes for tokens
 * - Decoding and validating ID tokens
 * - Creating/updating users
 */

import { Log } from "@/util/log"
import { generateJWT, type JWTPayload } from "./jwt"
import { findOrCreateUser as realFindOrCreateUser, type UserInfo } from "@/storage/user"
import { findOrCreateUser as mockFindOrCreateUser } from "@/storage/user-mock"

/**
 * Determine whether to use real (MongoDB) or mock (in-memory) storage.
 * - Always use mock in test mode
 * - Use mock when MONGODB_URI points to an unreachable Docker hostname
 * - Use mock when MONGODB_URI is not configured for localhost
 */
function shouldUseMockStorage(): boolean {
  // Testing mode
  if (process.env.NODE_ENV === "test" || process.env.BUN_TEST === "1") {
    return true
  }

  // Check if MongoDB URI is accessible (Docker hostname "mongodb" won't resolve locally)
  const mongoUri = process.env.MONGODB_URI || ""
  if (!mongoUri || mongoUri.includes("mongodb://mongodb:")) {
    console.log("[GoogleAuth] Using in-memory storage (MongoDB URI is Docker-only or unset)")
    return true
  }

  return false
}

const findOrCreateUser = shouldUseMockStorage()
  ? mockFindOrCreateUser
  : realFindOrCreateUser

const log = Log.create({ service: "auth.google-oauth" })

/**
 * OAuth callback result
 */
export type OAuthCallbackResult =
  | { success: true; user: UserInfo & { createdAt?: number; lastLoginAt?: number }; token: string }
  | { success: false; error: { message: string; code?: string } }

/**
 * Google OAuth configuration
 */
interface GoogleOAuthConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
}

/**
 * Get Google OAuth configuration from environment
 * @throws Error if required environment variables are not set
 */
function getGoogleOAuthConfig(): GoogleOAuthConfig {
  /*
   * Trim values to avoid issues with copy-paste whitespace
   */
  const clientId = (process.env.GOOGLE_OAUTH_CLIENT_ID || "").trim()
  const clientSecret = (process.env.GOOGLE_OAUTH_CLIENT_SECRET || "").trim()
  const redirectUri = (process.env.GOOGLE_OAUTH_REDIRECT_URI || "").trim()

  if (!clientId) {
    throw new Error("GOOGLE_OAUTH_CLIENT_ID environment variable is not set")
  }
  if (!clientSecret) {
    throw new Error("GOOGLE_OAUTH_CLIENT_SECRET environment variable is not set")
  }
  if (!redirectUri) {
    throw new Error("GOOGLE_OAUTH_REDIRECT_URI environment variable is not set")
  }

  // Log loaded config (masked)
  const maskedSecret = clientSecret.substring(0, 3) + "..." + clientSecret.substring(clientSecret.length - 3)
  log.info("Google OAuth config loaded", {
    clientId: `${clientId.substring(0, 10)}...`,
    redirectUri,
    secretMasked: maskedSecret
  })

  return { clientId, clientSecret, redirectUri }
}

/**
 * Generate Google OAuth authorization URL
 *
 * @param state - CSRF state parameter
 * @returns Authorization URL
 * @throws Error if OAuth configuration is invalid
 *
 * @example
 *   const url = await getGoogleAuthURL("random-state-123")
 *   // => "https://accounts.google.com/o/oauth2/v2/auth?..."
 */
export async function getGoogleAuthURL(state: string): Promise<string> {
  const config = getGoogleOAuthConfig()

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state: state,
    access_type: "offline",
    prompt: "consent",
  })

  const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  log.info("Generated Google auth URL", { state })

  return url
}

/**
 * Generate cryptographically secure CSRF state
 *
 * @returns Random state string
 *
 * @example
 *   const state = await generateState()
 */
export async function generateState(): Promise<string> {
  // Generate 32 random bytes (256 bits) and convert to hex
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)

  // Convert to URL-safe base64
  const state = Array.from(bytes)
    .map(b => b.toString(16).padStart(2, "0"))
    .join("")

  log.debug("Generated OAuth state", { state: state.substring(0, 8) + "..." })

  return state
}

/**
 * Verify CSRF state
 *
 * @param state - State from callback
 * @param expected - Expected state value
 * @returns True if state matches
 */
export async function verifyState(state: string, expected: string): Promise<boolean> {
  if (!state || !expected) {
    return false
  }

  const isValid = state === expected
  if (!isValid) {
    log.warn("Invalid OAuth state", { provided: state, expected })
  }

  return isValid
}

/**
 * Decode Google ID token (JWT)
 *
 * @param idToken - Google ID token
 * @returns Decoded payload or null
 */
function decodeIdToken(idToken: string): Record<string, string> | null {
  try {
    // JWT format: header.payload.signature
    const parts = idToken.split(".")
    if (parts.length !== 3) {
      log.error("Invalid ID token format")
      return null
    }

    // Decode payload (middle part)
    const payload = parts[1]
    // Add padding if needed
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/")
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=")

    const decoded = atob(padded)
    const parsed = JSON.parse(decoded) as Record<string, string>

    log.debug("Decoded Google ID token", { sub: parsed.sub, email: parsed.email })

    return parsed
  } catch (error) {
    log.error("Failed to decode ID token", { error })
    return null
  }
}

/**
 * Handle Google OAuth callback
 *
 * Exchanges authorization code for tokens and creates/updates user.
 *
 * @param code - Authorization code from Google
 * @returns OAuth callback result with user and JWT token
 *
 * @example
 *   const result = await handleGoogleCallback("auth-code-from-google")
 *   if (result.success) {
 *     console.log("User:", result.user)
 *     console.log("Token:", result.token)
 *   }
 */
export async function handleGoogleCallback(code: string): Promise<OAuthCallbackResult> {
  try {
    // Validate config first (throws if missing)
    const config = getGoogleOAuthConfig()

    // Validate JWT_SECRET is set
    if (!process.env.JWT_SECRET) {
      throw new Error("JWT_SECRET environment variable is not set")
    }

    // Detect proxy from environment
    const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy

    // Hardcoded fallback proxy for local development (Clash/mihomo default)
    const FALLBACK_PROXY = "http://127.0.0.1:7890"
    const effectiveProxy = proxyUrl || FALLBACK_PROXY

    // Use Basic Auth for client authentication
    const credentials = btoa(`${config.clientId}:${config.clientSecret}`)

    // Build POST body
    const postBody = new URLSearchParams({
      code: code,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code",
    }).toString()

    // Use curl subprocess to bypass Bun.serve() fetch proxy bug
    // Bun's fetch proxy option doesn't work inside Bun.serve() request handlers
    log.info("Exchanging auth code for token", { proxy: effectiveProxy })

    const curlArgs = [
      "-s",                  // silent
      "-X", "POST",
      "-x", effectiveProxy,  // proxy
      "-H", "Content-Type: application/x-www-form-urlencoded",
      "-H", `Authorization: Basic ${credentials}`,
      "-d", postBody,
      "--max-time", "30",    // 30s timeout
      "https://oauth2.googleapis.com/token",
    ]

    let responseText: string
    try {
      const proc = Bun.spawn(["curl", ...curlArgs], {
        stdout: "pipe",
        stderr: "pipe",
      })

      responseText = await new Response(proc.stdout).text()
      const stderrText = await new Response(proc.stderr).text()
      await proc.exited

      if (proc.exitCode !== 0) {
        log.error("curl failed", { exitCode: proc.exitCode, stderr: stderrText })
        throw new Error(`curl failed: ${stderrText || `exit code ${proc.exitCode}`}`)
      }
    } catch (curlError: any) {
      log.error("curl error", { error: curlError.message })
      throw new Error(`Failed to reach Google OAuth: ${curlError.message}`)
    }

    // Parse the response
    let tokenData: any
    try {
      tokenData = JSON.parse(responseText)
    } catch {
      console.log(`[GoogleAuth] Failed to parse response: ${responseText.substring(0, 200)}`)
      throw new Error(`Invalid response from Google: ${responseText.substring(0, 100)}`)
    }

    // Check for error in response
    if (tokenData.error) {
      console.log("!!! Google Token Exchange Failed !!!")
      console.log("Error:", tokenData.error)
      console.log("Description:", tokenData.error_description)

      log.error("Failed to exchange authorization code", { error: tokenData })

      return {
        success: false,
        error: {
          message: tokenData.error_description || tokenData.error || "Failed to exchange authorization code",
          code: tokenData.error,
        },
      }
    }

    const idToken = tokenData.id_token

    if (!idToken) {
      log.error("No ID token in response")
      return {
        success: false,
        error: { message: "No ID token in response from Google" },
      }
    }

    // Decode ID token to get user info
    const userInfo = decodeIdToken(idToken)
    if (!userInfo) {
      return {
        success: false,
        error: { message: "Failed to decode ID token" },
      }
    }

    // Create or update user
    const user = await findOrCreateUser({
      googleId: userInfo.sub,
      email: userInfo.email,
      name: userInfo.name || userInfo.email,
      picture: userInfo.picture,
    })

    // Generate JWT token for our app
    const token = await generateJWT(user.googleId, user.email)

    log.info("User authenticated via Google OAuth", { googleId: user.googleId, email: user.email })

    return {
      success: true,
      user,
      token,
    }
  } catch (error) {
    log.error("OAuth callback error", { error })

    return {
      success: false,
      error: {
        message: error instanceof Error ? error.message : "Unknown error occurred",
      },
    }
  }
}

/**
 * Get Google OAuth scopes required by the application
 *
 * @returns Array of OAuth scopes
 */
export function getRequiredScopes(): string[] {
  return [
    "openid",   // Required for OpenID Connect
    "email",    // User's email address
    "profile",  // User's profile information
  ]
}
