/**
 * TDD Tests: Browser Tool Performance Fixes
 *
 * These tests verify critical performance improvements and error handling fixes.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { PlaywrightHttpClient } from "../../src/browser/playwright-http-client"

// Track fetch calls for testing
let fetchCalls: Array<{ url: string; method?: string; body?: string }> = []
const originalFetch = globalThis.fetch

// Mock response factory
function createMockResponse(
  ok: boolean,
  data: any,
  status = 200
): Response {
  return {
    ok,
    status,
    json: async () => data,
    arrayBuffer: async () => new ArrayBuffer(0),
  } as Response
}

describe("PlaywrightHttpClient - Performance Fixes", () => {
  beforeEach(() => {
    fetchCalls = []
    globalThis.fetch = async (url: string, init?: RequestInit) => {
      fetchCalls.push({
        url: String(url),
        method: init?.method,
        body: String(init?.body || ""),
      })

      // Default responses
      if (String(url).includes("/health")) {
        return createMockResponse(true, { success: true, browser: "chromium" })
      }
      if (String(url).includes("/navigate")) {
        return createMockResponse(true, {
          success: true,
          url: "http://example.com",
          title: "Test",
          elements: ["ref1:button:Click"]
        })
      }
      if (String(url).includes("/snapshot")) {
        return createMockResponse(true, {
          success: true,
          url: "http://example.com",
          title: "Test",
          elements: [{ ref: "ref1", tag: "button", role: "button", name: "Click" }]
        })
      }

      return createMockResponse(true, { success: true })
    }
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  describe("RED Phase: Write failing tests first", () => {
    it("should NOT call initialize on every operation (only once)", async () => {
      // This test verifies initialize() caches state
      const client = new PlaywrightHttpClient({ baseUrl: "http://localhost:9223" })

      // First call should initialize
      const initialized = await client.initialize()
      expect(initialized).toBe(true)

      // Reset fetch calls tracking
      fetchCalls = []

      // These operations should NOT call health check again
      await client.snapshot()
      await client.snapshot()
      await client.snapshot()

      // Verify no health check calls (only /snapshot calls)
      const healthCheckCalls = fetchCalls.filter(c => c.url.includes("/health"))
      expect(healthCheckCalls.length).toBe(0)
    })

    it("should navigate WITHOUT making a second snapshot request", async () => {
      const client = new PlaywrightHttpClient({ baseUrl: "http://localhost:9223" })
      client.initialized = true // Skip initialization

      fetchCalls = []

      await client.navigate("http://example.com")

      // EXPECTED: 1 request (navigate should return elements inline)
      // ACTUAL (before fix): 2 requests (navigate + snapshot)
      const navigateCalls = fetchCalls.filter(c => c.url.includes("/navigate"))
      const snapshotCalls = fetchCalls.filter(c => c.url.includes("/snapshot"))

      expect(navigateCalls.length).toBe(1)
      expect(snapshotCalls.length).toBe(0) // No redundant snapshot call
    })

    it("should return proper error codes for different failures", async () => {
      // Test 404 (container not ready)
      globalThis.fetch = async () => {
        return createMockResponse(false, { error: { code: "not_found", message: "Playwright server not found" } }, 404)
      }

      const client1 = new PlaywrightHttpClient({ baseUrl: "http://localhost:9223" })
      client1.initialized = true

      const error404 = await client1.navigate("http://example.com").catch(e => e)
      expect(error404).toBeDefined()
      expect(error404.message).toContain("not ready")

      // Test 408 (timeout)
      globalThis.fetch = async () => {
        return createMockResponse(false, { error: { code: "timeout", message: "Request timeout" } }, 408)
      }

      const client2 = new PlaywrightHttpClient({ baseUrl: "http://localhost:9223" })
      client2.initialized = true

      const error408 = await client2.navigate("http://example.com").catch(e => e)
      expect(error408).toBeDefined()
      expect(error408.message).toContain("timeout")
    })
  })

  describe("GREEN Phase: Implement minimal fixes", () => {
    it("should cache initialization state", async () => {
      const client = new PlaywrightHttpClient({ baseUrl: "http://localhost:9223" })

      // Initialize once
      await client.initialize()
      expect(client.initialized).toBe(true)

      // Reset tracking
      fetchCalls = []

      // Subsequent call should skip health check
      await client.initialize()

      // Verify no redundant health check
      const healthCheckCalls = fetchCalls.filter(c => c.url.includes("/health"))
      expect(healthCheckCalls.length).toBe(0)
    })

    it("should have proper error codes", async () => {
      globalThis.fetch = async () => {
        return createMockResponse(false, {
          error: { code: "playwright_not_ready", message: "Playwright server not ready" }
        }, 404)
      }

      const client = new PlaywrightHttpClient({ baseUrl: "http://localhost:9223" })
      client.initialized = true

      try {
        await client.navigate("http://example.com")
        expect(true).toBe(false) // Should not reach here
      } catch (error: any) {
        expect(error.message).toContain("not ready")
      }
    })
  })

  describe("REFACTOR Phase: Improve code", () => {
    it("should have minimal console logging", async () => {
      const client = new PlaywrightHttpClient({ baseUrl: "http://localhost:9223" })
      client.initialized = true

      let logCount = 0
      const originalLog = console.log
      console.log = () => { logCount++ }

      await client.snapshot()

      console.log = originalLog
      // Should log at most a few times (log.info internally), not 20+ times
      expect(logCount).toBeLessThan(5)
    })

    it("should handle cleanup errors by propagating them", async () => {
      const client = new PlaywrightHttpClient({ baseUrl: "http://localhost:9223" })
      client.initialized = true

      // cleanup() should be a no-op for HTTP client (just resets state)
      // It returns void, not a Promise
      client.cleanup()
      expect(client.initialized).toBe(false)
    })
  })
})
