/**
 * Playwright HTTP Client
 *
 * Connects to Playwright HTTP server running inside the container.
 * Replaces CDP-based client with HTTP API calls.
 */

import { Log } from "@/util/log"

const log = Log.create({ service: "browser.playwright-http" })

export interface PlaywrightHttpClientConfig {
  /** Container HTTP API URL (e.g., http://localhost:8080) */
  baseUrl: string
  /** Request timeout in milliseconds */
  timeout?: number
}

/**
 * Playwright HTTP Client response types
 */
interface NavigateResponse {
  success: boolean
  url: string
  title?: string
  status?: number
}

interface SnapshotResponse {
  success: boolean
  url: string
  title: string
  elements: Array<{
    ref: string
    tag: string
    role: string
    name: string
    id?: string
    class?: string
  }>
}

interface ActResponse {
  success: boolean
  action: string
  ref?: string
  value?: string
  result?: any
}

interface StatusResponse {
  success: boolean
  browser: string
  url: string
  title: string
  elementCount: number
}

interface ErrorResponse {
  success: false
  error: {
    code: string
    message: string
  }
}

/**
 * Playwright HTTP Client
 *
 * Communicates with Playwright server running inside the container via HTTP API.
 */
export class PlaywrightHttpClient {
  private readonly baseUrl: string
  private readonly timeout: number
  private initialized = false

  constructor(config: PlaywrightHttpClientConfig) {
    // Use container's API gateway, forward to Playwright server on port 9223
    // The container should route /browser/* requests to the Playwright server
    this.baseUrl = config.baseUrl.replace(/\/$/, "")
    this.timeout = config.timeout || 30000
    log.info("PlaywrightHttpClient created", { baseUrl: this.baseUrl })
  }

  /**
   * Initialize client (check health)
   */
  async initialize(): Promise<boolean> {
    try {
      log.info("Initializing Playwright HTTP client...")

      // Check health endpoint
      const response = await this.request("/health", {
        method: "GET",
        timeout: 10000
      })

      if (response.ok) {
        const data = await response.json()
        log.info("Playwright server health check OK", data)
        this.initialized = true
        return true
      } else {
        log.warn("Playwright server health check failed", { status: response.status })
        return false
      }
    } catch (error) {
      log.error("Failed to initialize Playwright client", { error })
      return false
    }
  }

  /**
   * Navigate to URL
   * Note: Also calls snapshot to get elements since the server doesn't return them in navigate response
   */
  async navigate(url: string, options?: { timeout?: number }): Promise<{ url: string; title: string; elements: string[] }> {
    log.info("Navigating to", { url })

    const response = await this.request("/navigate", {
      method: "POST",
      body: JSON.stringify({ url, timeout: options?.timeout || this.timeout })
    })

    if (!response.ok) {
      throw new Error(`Navigate failed: ${response.status}`)
    }

    const data = await response.json() as { success: boolean; url: string; title: string; status?: number }

    // Get snapshot to extract elements
    const snapshotData = await this.snapshot()

    return {
      url: data.url,
      title: data.title || "",
      elements: snapshotData.elements
    }
  }

  /**
   * Get page snapshot with interactive elements
   */
  async snapshot(): Promise<{ url: string; title: string; elements: string[] }> {
    log.debug("Getting snapshot")

    const response = await this.request("/snapshot", {
      method: "GET"
    })

    if (!response.ok) {
      throw new Error(`Snapshot failed: ${response.status}`)
    }

    const data = await response.json() as {
      success: boolean
      url: string
      title: string
      elements: Array<{ ref: string; tag: string; role: string; name: string; id?: string; class?: string }>
    }

    // Transform response to match PlaywrightClientExtended interface
    // Convert element objects to simple string representation
    const elements = data.elements.map((el) =>
      `${el.ref}:${el.tag}:${el.name || el.role || ''}`
    )

    return {
      url: data.url,
      title: data.title || "",
      elements
    }
  }

  /**
   * Perform action on element
   */
  async act(params: {
    ref?: string
    selector?: string
    action: "click" | "fill" | "script"
    value?: string
  }): Promise<{ status: string; ref?: string; value?: any }> {
    log.info("Acting", { ref: params.ref, action: params.action })

    const response = await this.request("/act", {
      method: "POST",
      body: JSON.stringify(params)
    })

    if (!response.ok) {
      const error = await response.json() as ErrorResponse
      throw new Error(error.error?.message || `Act failed: ${response.status}`)
    }

    const data = await response.json() as { success: boolean; action: string; ref?: string; value?: any; result?: any }

    // Transform response to match PlaywrightClientExtended interface
    return {
      status: data.action, // Use 'action' as 'status'
      ref: data.ref,
      value: data.value !== undefined ? data.value : data.result
    }
  }

  /**
   * Take screenshot
   */
  async screenshot(options?: { fullPage?: boolean }): Promise<Buffer> {
    log.debug("Taking screenshot")

    const url = `/screenshot${options?.fullPage ? "?fullPage=true" : ""}`
    const response = await this.request(url, {
      method: "GET"
    })

    if (!response.ok) {
      throw new Error(`Screenshot failed: ${response.status}`)
    }

    // Get binary data
    const arrayBuffer = await response.arrayBuffer()
    return Buffer.from(arrayBuffer)
  }

  /**
   * Get browser status
   */
  async status(): Promise<{ url: string; title: string; elementCount: number; vncAvailable: boolean }> {
    const response = await this.request("/status", {
      method: "GET"
    })

    if (!response.ok) {
      throw new Error(`Status failed: ${response.status}`)
    }

    const data = await response.json() as StatusResponse
    // Transform response to match PlaywrightClientExtended interface
    return {
      url: data.url || "",
      title: data.title || "",
      elementCount: data.elementCount || 0,
      vncAvailable: true // Always true for containers with VNC
    }
  }

  /**
   * Cleanup resources
   * For HTTP client, this is a no-op since we don't maintain persistent connections
   */
  async cleanup(): Promise<void> {
    this.initialized = false
    log.info("Playwright HTTP client cleaned up")
  }

  /**
   * Make HTTP request to Playwright server
   */
  private async request(
    path: string,
    init: RequestInit & { body?: string; timeout?: number }
  ): Promise<Response> {
    const url = `${this.baseUrl}${path}`
    const timeout = init.timeout || this.timeout

    log.debug("HTTP request", { method: init.method, url })

    // Create abort controller for timeout
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
        headers: {
          ...init.headers,
          "Content-Type": "application/json"
        }
      })

      clearTimeout(timeoutId)
      return response
    } catch (error) {
      clearTimeout(timeoutId)

      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`Request timeout after ${timeout}ms`)
      }

      throw error
    }
  }
}
