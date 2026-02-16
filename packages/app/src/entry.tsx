// @refresh reload
import { render } from "solid-js/web"
import { App } from "@/app"
import { Platform, PlatformProvider } from "@/context/platform"
import pkg from "../package.json"

/**
 * Fix for floating-ui errors when components are unmounted while autoUpdate
 * is still running. This is a known issue with floating-ui that doesn't affect
 * functionality.
 */
if (typeof window !== "undefined") {
  // Create a safe dummy element once
  const dummyElement = document.createElement("div")
  dummyElement.style.display = "none"
  document.body.appendChild(dummyElement)

  // Patch getComputedStyle to handle invalid elements gracefully
  const originalGetComputedStyle = window.getComputedStyle
  window.getComputedStyle = function (element: Element, ...rest: [string | null | undefined]) {
    // Defensive check: handle null, undefined, or non-Element values
    if (!element || typeof (element as any).nodeType !== "number") {
      return originalGetComputedStyle.call(this, dummyElement, ...rest)
    }
    // Check if element is connected to DOM
    if (!(element as Element).isConnected) {
      return originalGetComputedStyle.call(this, dummyElement, ...rest)
    }
    try {
      return originalGetComputedStyle.call(this, element, ...rest)
    } catch {
      // If getComputedStyle fails for any reason, return dummy style
      return originalGetComputedStyle.call(this, dummyElement, ...rest)
    }
  }

  // Global error handler for uncaught errors
  window.addEventListener("error", (event) => {
    console.error("[GLOBAL ERROR]", {
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      error: event.error,
      stack: event.error?.stack,
    })

    if (
      event.message?.includes("getComputedStyle") ||
      event.message?.includes("parameter 1 is not of type 'Element'")
    ) {
      event.preventDefault()
      event.stopPropagation()
      return false
    }
  })

  // Also handle promise rejections
  window.addEventListener("unhandledrejection", (event) => {
    console.error("[GLOBAL UNHANDLED REJECTION]", {
      reason: event.reason,
      message: event.reason?.message,
      stack: event.reason?.stack,
    })

    if (
      event.reason?.message?.includes("getComputedStyle") ||
      event.reason?.message?.includes("parameter 1 is not of type 'Element'")
    ) {
      event.preventDefault()
    }
  })
}

const root = document.getElementById("root")
if (import.meta.env.DEV && !(root instanceof HTMLElement)) {
  throw new Error(
    "Root element not found. Did you forget to add it to your index.html? Or maybe the id attribute got misspelled?",
  )
}

const platform: Platform = {
  platform: "web",
  version: pkg.version,
  openLink(url: string) {
    window.open(url, "_blank")
  },
  restart: async () => {
    window.location.reload()
  },
  // Use native fetch with credentials for cookies
  fetch: window.fetch.bind(window),
  notify: async (title, description, href) => {
    if (!("Notification" in window)) return

    const permission =
      Notification.permission === "default"
        ? await Notification.requestPermission().catch(() => "denied")
        : Notification.permission

    if (permission !== "granted") return

    const inView = document.visibilityState === "visible" && document.hasFocus()
    if (inView) return

    await Promise.resolve()
      .then(() => {
        const notification = new Notification(title, {
          body: description ?? "",
          icon: "https://opencode.ai/favicon-96x96.png",
        })
        notification.onclick = () => {
          window.focus()
          if (href) {
            window.history.pushState(null, "", href)
            window.dispatchEvent(new PopStateEvent("popstate"))
          }
          notification.close()
        }
      })
      .catch(() => undefined)
  },
}

render(
  () => (
    <PlatformProvider value={platform}>
      <App />
    </PlatformProvider>
  ),
  root!,
)
