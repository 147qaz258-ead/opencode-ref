/**
 * Login Callback Page
 *
 * Handles OAuth callback from Google, extracts token and user info,
 * stores them, and redirects to home page.
 */

import { createSignal, onMount } from "solid-js"
import { useNavigate, useSearchParams } from "@solidjs/router"
import { useAuth } from "@/context/auth"

export default function LoginCallbackPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const auth = useAuth()
  const [status, setStatus] = createSignal<"loading" | "success" | "error">("loading")
  const [error, setError] = createSignal<string | null>(null)

  onMount(async () => {
    const token = searchParams.token
    const email = searchParams.email
    const urlError = searchParams.error

    // Handle OAuth error
    if (urlError) {
      setStatus("error")
      setError(decodeURIComponent(urlError))
      // Redirect to login page with error after 3 seconds
      setTimeout(() => {
        navigate(`/login?error=${encodeURIComponent(urlError)}`, { replace: true })
      }, 3000)
      return
    }

    // Check for required parameters
    if (!token) {
      setStatus("error")
      setError("Missing authentication token")
      setTimeout(() => {
        navigate("/login?error=" + encodeURIComponent("Missing authentication token"), { replace: true })
      }, 3000)
      return
    }

    if (!email) {
      setStatus("error")
      setError("Missing user email")
      setTimeout(() => {
        navigate("/login?error=" + encodeURIComponent("Missing user email"), { replace: true })
      }, 3000)
      return
    }

    try {
      // Extract userId from token (Google sub is in the JWT)
      const payload = decodeJWTPayload(token)
      const userId = payload?.userId || payload?.sub || `google-${email}`

      // Login with token and user data
      await auth.login(token, {
        userId,
        email,
        authenticated: true,
      })

      setStatus("success")

      // Redirect to home page after short delay
      setTimeout(() => {
        navigate("/home", { replace: true })
      }, 500)
    } catch (err) {
      setStatus("error")
      setError(err instanceof Error ? err.message : "Failed to authenticate")
      setTimeout(() => {
        navigate("/login?error=" + encodeURIComponent("Authentication failed"), { replace: true })
      }, 3000)
    }
  })

  /**
   * Decode JWT payload without verification (for UI display only)
   */
  function decodeJWTPayload(token: string): any {
    try {
      const parts = token.split(".")
      if (parts.length !== 3) return null

      const payload = parts[1]
      const base64 = payload.replace(/-/g, "+").replace(/_/g, "/")
      const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=")
      const decoded = atob(padded)
      return JSON.parse(decoded)
    } catch {
      return null
    }
  }

  return (
    <div class="min-h-screen flex items-center justify-center bg-background-base px-4">
      <div class="w-full max-w-md bg-surface-base rounded-2xl border border-border-weak shadow-xl p-8 text-center">
        {status() === "loading" && (
          <>
            <div class="w-16 h-16 border-4 border-border-weak border-t-text-brand rounded-full animate-spin mx-auto mb-6" />
            <h2 class="text-20-semibold text-text-strong mb-2">Signing you in...</h2>
            <p class="text-14-regular text-text-weak">Please wait while we complete your authentication.</p>
          </>
        )}

        {status() === "success" && (
          <>
            <div class="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg class="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 class="text-20-semibold text-text-strong mb-2">Welcome back!</h2>
            <p class="text-14-regular text-text-weak">Redirecting you to your workspace...</p>
          </>
        )}

        {status() === "error" && (
          <>
            <div class="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg class="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h2 class="text-20-semibold text-text-strong mb-2">Authentication Failed</h2>
            <p class="text-14-regular text-text-weak mb-4">{error()}</p>
            <p class="text-12-regular text-text-weak">Redirecting to login page...</p>
          </>
        )}
      </div>
    </div>
  )
}
