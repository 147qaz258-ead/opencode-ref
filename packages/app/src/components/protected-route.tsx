/**
 * Protected Route Component
 *
 * Route wrapper that checks authentication status.
 * Shows loading spinner while checking auth.
 * Redirects to /login if not authenticated.
 */

import { ParentProps, onMount, createSignal } from "solid-js"
import { useNavigate } from "@solidjs/router"
import { useAuth } from "@/context/auth"

export function ProtectedRoute(props: ParentProps) {
  const navigate = useNavigate()
  const auth = useAuth()
  const [isChecking, setIsChecking] = createSignal(true)

  onMount(() => {
    // Wait for initial auth check to complete
    const checkAuth = () => {
      if (!auth.isLoading) {
        setIsChecking(false)

        // Redirect to login if not authenticated
        if (!auth.isAuthenticated) {
          const currentPath = window.location.pathname
          // Save current path for redirect after login
          if (currentPath !== "/login" && currentPath !== "/login-callback") {
            sessionStorage.setItem("opencode_redirect", currentPath)
          }
          navigate("/login", { replace: true })
        }
      }
    }

    // If still loading, wait a bit
    if (auth.isLoading) {
      const timeout = setTimeout(checkAuth, 100)
      return () => clearTimeout(timeout)
    } else {
      checkAuth()
    }
  })

  // Show loading state while checking auth
  if (isChecking() || auth.isLoading) {
    return (
      <div class="min-h-screen flex items-center justify-center bg-background-base">
        <div class="flex flex-col items-center gap-4">
          <div class="w-12 h-12 border-4 border-border-weak border-t-text-brand rounded-full animate-spin" />
          <p class="text-14-regular text-text-weak">Checking authentication...</p>
        </div>
      </div>
    )
  }

  // Don't render children if not authenticated (will redirect)
  if (!auth.isAuthenticated) {
    return null
  }

  // Render children if authenticated
  return props.children
}
