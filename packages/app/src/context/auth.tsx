/**
 * Authentication Context
 *
 * Provides user authentication state and methods for SolidJS frontend.
 * Integrates with Google OAuth and JWT token-based authentication.
 */

import { createSimpleContext } from "@opencode-ai/ui/context"
import { createSignal, createEffect, onMount, onCleanup } from "solid-js"

/**
 * Authenticated user information
 */
export interface AuthUser {
  /** User ID (from Google sub or custom) */
  userId: string
  /** User email address */
  email: string
  /** User display name */
  name?: string
  /** User profile picture URL */
  picture?: string
  /** Whether user is authenticated */
  authenticated: boolean
}

/**
 * Authentication state
 */
export interface AuthState {
  /** Current user (null if not authenticated) */
  user: AuthUser | null
  /** JWT token (null if not authenticated) */
  token: string | null
  /** Loading state */
  isLoading: boolean
}

/**
 * Local storage keys
 */
const STORAGE_KEYS = {
  TOKEN: "opencode_auth_token",
  USER: "opencode_auth_user",
}

/**
 * Create authentication context
 */
const { use: useAuth, provider: AuthProvider } = createSimpleContext({
  name: "Auth",
  init: () => {
    // Signals for reactive state
    const [user, setUser] = createSignal<AuthUser | null>(null)
    const [token, setToken] = createSignal<string | null>(null)
    const [isLoading, setIsLoading] = createSignal(true)

    /**
     * Decode JWT payload without verification (for UI display only)
     */
    function decodeJWTPayload(token: string): { userId?: string; email?: string } | null {
      try {
        const parts = token.split(".")
        if (parts.length !== 3) return null

        // Base64URL decode the payload
        const payload = parts[1]
        const base64 = payload.replace(/-/g, "+").replace(/_/g, "/")
        const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=")
        const decoded = atob(padded)
        return JSON.parse(decoded)
      } catch {
        return null
      }
    }

    /**
     * Load auth state from localStorage
     */
    function loadFromStorage(): { token: string | null; user: AuthUser | null } {
      if (typeof window === "undefined") {
        return { token: null, user: null }
      }

      try {
        const storedToken = localStorage.getItem(STORAGE_KEYS.TOKEN)
        const storedUser = localStorage.getItem(STORAGE_KEYS.USER)

        if (storedToken && storedUser) {
          return {
            token: storedToken,
            user: JSON.parse(storedUser) as AuthUser,
          }
        }
      } catch (error) {
        console.error("Failed to load auth state from storage", error)
      }

      return { token: null, user: null }
    }

    /**
     * Save auth state to localStorage
     */
    function saveToStorage(token: string | null, user: AuthUser | null): void {
      if (typeof window === "undefined") return

      try {
        if (token && user) {
          localStorage.setItem(STORAGE_KEYS.TOKEN, token)
          localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user))
        } else {
          localStorage.removeItem(STORAGE_KEYS.TOKEN)
          localStorage.removeItem(STORAGE_KEYS.USER)
        }
      } catch (error) {
        console.error("Failed to save auth state to storage", error)
      }
    }

    /**
     * Verify token by calling /auth/me endpoint
     */
    async function verifyToken(token: string): Promise<boolean> {
      try {
        const response = await fetch("/auth/me", {
          headers: {
            "Authorization": `Bearer ${token}`,
            "Accept": "application/json",
          },
        })

        if (response.ok) {
          const data = await response.json()
          if (data.success && data.user) {
            return true
          }
        }
      } catch (error) {
        console.error("Token verification failed", error)
      }
      return false
    }

    /**
     * Login with token and user data
     */
    async function login(token: string, userData?: Partial<AuthUser>): Promise<void> {
      // Decode token if user data not provided
      let authUser: AuthUser

      if (userData?.userId && userData?.email) {
        authUser = {
          userId: userData.userId,
          email: userData.email,
          name: userData.name,
          picture: userData.picture,
          authenticated: true,
        }
      } else {
        // Decode JWT to get user info
        const payload = decodeJWTPayload(token)
        if (!payload?.userId || !payload?.email) {
          throw new Error("Invalid token: missing user information")
        }

        authUser = {
          userId: payload.userId,
          email: payload.email,
          authenticated: true,
        }
      }

      // Update state
      setToken(token)
      setUser(authUser)

      // Save to storage
      saveToStorage(token, authUser)
    }

    /**
     * Logout - clear auth state
     */
    function logout(): void {
      setToken(null)
      setUser(null)
      saveToStorage(null, null)
    }

    /**
     * Check authentication status on mount
     */
    onMount(async () => {
      const { token: storedToken, user: storedUser } = loadFromStorage()

      if (storedToken && storedUser) {
        // Verify token is still valid
        const isValid = await verifyToken(storedToken)

        if (isValid) {
          setToken(storedToken)
          setUser(storedUser)
        } else {
          // Token invalid, clear storage
          saveToStorage(null, null)
        }
      }

      setIsLoading(false)
    })

    return {
      get user() {
        return user()
      },
      get token() {
        return token()
      },
      get isLoading() {
        return isLoading()
      },
      get isAuthenticated() {
        return !!user() && !!token()
      },
      login,
      logout,
    }
  },
})

export { useAuth, AuthProvider }
