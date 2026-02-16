/**
 * Login Page
 *
 * Google OAuth login page with clean, centered layout.
 */

import { createSignal, onMount } from "solid-js"
import { Button } from "@opencode-ai/ui/button"
import { Logo } from "@opencode-ai/ui/logo"
import { Icon } from "@opencode-ai/ui/icon"
import { useNavigate, useSearchParams } from "@solidjs/router"

export default function LoginPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [isLoading, setIsLoading] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)

  // Check for error in URL params
  onMount(() => {
    const urlError = searchParams.error
    if (urlError) {
      setError(decodeURIComponent(urlError))
    }
  })

  /**
   * Handle Google OAuth login
   */
  function handleGoogleLogin() {
    setIsLoading(true)
    // Redirect to backend OAuth endpoint
    window.location.href = "/auth/google"
  }

  return (
    <div class="min-h-screen flex flex-col items-center justify-center bg-background-base px-4">
      {/* Logo */}
      <div class="mb-8">
        <Logo class="h-12" />
      </div>

      {/* Login Card */}
      <div class="w-full max-w-md bg-surface-base rounded-2xl border border-border-weak shadow-xl p-8">
        {/* Title */}
        <h1 class="text-24-semibold text-text-strong mb-2 text-center">
          Welcome to Clawdone
        </h1>
        <p class="text-14-regular text-text-weak mb-8 text-center">
          Sign in to continue to your workspace
        </p>

        {/* Error Message */}
        {error() && (
          <div class="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
            <svg class="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
            </svg>
            <div class="flex-1">
              <p class="text-14-medium text-red-700">Authentication Error</p>
              <p class="text-13-regular text-red-600 mt-1">{error()}</p>
            </div>
          </div>
        )}

        {/* Google OAuth Button */}
        <Button
          variant="primary"
          size="large"
          class="w-full mb-4"
          onClick={handleGoogleLogin}
          disabled={isLoading()}
        >
          <div class="flex items-center justify-center gap-3">
            {isLoading() ? (
              <div class="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <svg class="w-5 h-5" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
            )}
            <span>Continue with Google</span>
          </div>
        </Button>

        {/* Terms and Privacy */}
        <p class="text-12-regular text-text-weak text-center mt-6">
          By signing in, you agree to our{" "}
          <a href="/terms" class="text-text-brand hover:underline">
            Terms of Service
          </a>{" "}
          and{" "}
          <a href="/privacy" class="text-text-brand hover:underline">
            Privacy Policy
          </a>
        </p>
      </div>

      {/* Footer */}
      <p class="text-12-regular text-text-weak mt-8">
        Powered by Clawdone AI
      </p>
    </div>
  )
}
