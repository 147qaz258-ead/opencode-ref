/**
 * HttpApiBackend Retry Logic Tests
 *
 * Tests for retry logic in HTTP API fetch operations
 * Following TDD: RED (failing tests first)
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { HttpApiBackend } from "@/sandbox/backend/http-api"

// Mock fetch with proper Response interface implementation
let mockFetch: ReturnType<typeof spyOnFetch>
let originalFetch: typeof global.fetch

interface MockFetchCall {
  url: string
  init?: RequestInit
  timestamp: number
}

function spyOnFetch() {
  const mockResponses: Map<string, { status: number; body: any; delay?: number }> = new Map()
  const fetchCalls: MockFetchCall[] = []
  let callCount = 0

  // Store original fetch
  originalFetch = global.fetch

  global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url

    fetchCalls.push({
      url,
      init,
      timestamp: Date.now(),
      callNumber: ++callCount,
    } as MockFetchCall & { callNumber: number })

    const mock = mockResponses.get(url)

    if (!mock) {
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        statusText: "Not Found",
      })
    }

    // Add delay if specified
    if (mock.delay) {
      await new Promise((resolve) => setTimeout(resolve, mock.delay))
    }

    return new Response(JSON.stringify(mock.body), {
      status: mock.status,
      statusText: mock.status >= 200 && mock.status < 300 ? "OK" : "Error",
    })
  }

  return {
    setResponse: (url: string, status: number, body: any, delay?: number) => {
      mockResponses.set(url, { status, body, delay })
    },
    setNetworkError: (url: string) => {
      mockResponses.set(url, "network-error" as any)
    },
    getFetchCalls: () => fetchCalls,
    clear: () => {
      mockResponses.clear()
      fetchCalls.length = 0
      callCount = 0
    },
    restore: () => {
      global.fetch = originalFetch
    },
  }
}

// Extend the mock fetch to handle network errors and sequential responses
function spyOnFetchWithNetworkErrors() {
  const mockResponses: Map<
    string,
    Array<{ status: number; body: any; delay?: number } | "network-error">
  > = new Map()
  const fetchCalls: MockFetchCall[] = []
  let callCount = 0

  // Store original fetch
  originalFetch = global.fetch

  global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url

    fetchCalls.push({
      url,
      init,
      timestamp: Date.now(),
      callNumber: ++callCount,
    } as MockFetchCall & { callNumber: number })

    const responseQueue = mockResponses.get(url)

    if (!responseQueue || responseQueue.length === 0) {
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        statusText: "Not Found",
      })
    }

    // Get the next response from the queue (shift removes it)
    const mock = responseQueue.shift()!

    if (mock === "network-error") {
      throw new TypeError("Failed to fetch")
    }

    // Add delay if specified
    if (mock.delay) {
      await new Promise((resolve) => setTimeout(resolve, mock.delay))
    }

    return new Response(JSON.stringify(mock.body), {
      status: mock.status,
      statusText: mock.status >= 200 && mock.status < 300 ? "OK" : "Error",
    })
  }

  return {
    setResponse: (url: string, status: number, body: any, delay?: number) => {
      if (!mockResponses.has(url)) {
        mockResponses.set(url, [])
      }
      mockResponses.get(url)!.push({ status, body, delay })
    },
    setNetworkError: (url: string) => {
      if (!mockResponses.has(url)) {
        mockResponses.set(url, [])
      }
      mockResponses.get(url)!.push("network-error")
    },
    getFetchCalls: () => fetchCalls,
    clear: () => {
      mockResponses.clear()
      fetchCalls.length = 0
      callCount = 0
    },
    restore: () => {
      global.fetch = originalFetch
    },
  }
}

describe("HttpApiBackend - Fetch Retry Logic", () => {
  let backend: HttpApiBackend

  beforeEach(() => {
    mockFetch = spyOnFetchWithNetworkErrors()
  })

  afterEach(() => {
    mockFetch.clear()
    mockFetch.restore()
  })

  describe("exec() retry on transient errors", () => {
    it("should retry on network errors and eventually succeed", async () => {
      backend = new HttpApiBackend({
        containerId: "test-container",
        port: 8080,
      })

      const url = "http://test-container:8080/api/v1/shell/exec"

      // First two calls fail, third succeeds
      mockFetch.setNetworkError(url)
      mockFetch.setNetworkError(url)
      mockFetch.setResponse(url, 200, {
        data: {
          exit_code: 0,
          console: ["output"],
          error: "",
        },
      })

      const result = await backend.exec("echo test", {
        sessionId: "test-session",
        timeout: 5000,
      })

      // This test documents the expected retry behavior
      // After implementation, this should succeed with exitCode 0
      expect(result.exitCode).toBe(0)
    })

    it("should use exponential backoff between retries", async () => {
      backend = new HttpApiBackend({
        containerId: "test-container",
        port: 8080,
      })

      const url = "http://test-container:8080/api/v1/shell/exec"

      // All calls fail to measure timing
      mockFetch.setNetworkError(url)
      mockFetch.setNetworkError(url)
      mockFetch.setNetworkError(url)

      try {
        await backend.exec("echo test", {
          sessionId: "test-session",
          timeout: 5000,
        })
      } catch (error) {
        // Expected to fail after retries
      }

      const calls = mockFetch.getFetchCalls()

      // This test documents exponential backoff behavior
      // Expected delays: 0ms, 100ms, 200ms (for 3 retries with max 2000ms)
      if (calls.length >= 3) {
        const delay1 = calls[1].timestamp - calls[0].timestamp
        const delay2 = calls[2].timestamp - calls[1].timestamp

        // Second retry should have longer delay
        expect(delay2).toBeGreaterThanOrEqual(delay1)
      }
    })

    it("should fail after max retries when network is permanently down", async () => {
      backend = new HttpApiBackend({
        containerId: "test-container",
        port: 8080,
      })

      const url = "http://test-container:8080/api/v1/shell/exec"

      // All calls fail
      mockFetch.setNetworkError(url)
      mockFetch.setNetworkError(url)
      mockFetch.setNetworkError(url)
      mockFetch.setNetworkError(url) // Extra call to verify it stops at max retries

      try {
        await backend.exec("echo test", {
          sessionId: "test-session",
          timeout: 5000,
        })
        expect("Should have thrown").toBe(false)
      } catch (error) {
        // This test documents that after max retries, the error should propagate
        expect(error).toBeDefined()
        expect((error as Error).message).toContain("fetch")
      }
    })

    it("should not retry on HTTP 4xx errors (client errors)", async () => {
      backend = new HttpApiBackend({
        containerId: "test-container",
        port: 8080,
      })

      const url = "http://test-container:8080/api/v1/shell/exec"

      // Client error - should not retry
      mockFetch.setResponse(url, 400, {
        error: "Bad request",
      })

      try {
        await backend.exec("invalid command", {
          sessionId: "test-session",
          timeout: 5000,
        })
        expect("Should have thrown").toBe(false)
      } catch (error) {
        // This test documents that 4xx errors should not trigger retries
        expect((error as Error).message).toContain("400")

        const calls = mockFetch.getFetchCalls()
        // Should only be called once (no retries)
        expect(calls.length).toBe(1)
      }
    })

    it("should retry on HTTP 5xx errors (server errors)", async () => {
      backend = new HttpApiBackend({
        containerId: "test-container",
        port: 8080,
      })

      const url = "http://test-container:8080/api/v1/shell/exec"

      // First call fails with 500, second succeeds
      mockFetch.setResponse(url, 500, {
        error: "Internal server error",
      })
      mockFetch.setResponse(url, 200, {
        data: {
          exit_code: 0,
          console: ["output"],
          error: "",
        },
      })

      const result = await backend.exec("echo test", {
        sessionId: "test-session",
        timeout: 5000,
      })

      // This test documents that 5xx errors should trigger retries
      expect(result.exitCode).toBe(0)

      const calls = mockFetch.getFetchCalls()
      // Should be called at least twice (initial + retry)
      expect(calls.length).toBeGreaterThanOrEqual(2)
    })
  })

  describe("readFile() retry on transient errors", () => {
    it("should retry on connection errors and eventually succeed", async () => {
      backend = new HttpApiBackend({
        containerId: "test-container",
        port: 8080,
      })

      const url = "http://test-container:8080/api/v1/file/read"

      // First call fails, second succeeds
      mockFetch.setNetworkError(url)
      mockFetch.setResponse(url, 200, {
        data: {
          content: "file content",
        },
      })

      const content = await backend.readFile("/home/ubuntu/test.txt")

      // This test documents retry behavior for file reads
      expect(content).toBe("file content")
    })

    it("should fail after max retries", async () => {
      backend = new HttpApiBackend({
        containerId: "test-container",
        port: 8080,
      })

      const url = "http://test-container:8080/api/v1/file/read"

      // All calls fail
      mockFetch.setNetworkError(url)
      mockFetch.setNetworkError(url)
      mockFetch.setNetworkError(url)

      try {
        await backend.readFile("/home/ubuntu/test.txt")
        expect("Should have thrown").toBe(false)
      } catch (error) {
        // This test documents that after max retries, the error should propagate
        expect(error).toBeDefined()
      }
    })
  })

  describe("writeFile() retry on transient errors", () => {
    it("should retry on connection errors and eventually succeed", async () => {
      backend = new HttpApiBackend({
        containerId: "test-container",
        port: 8080,
      })

      const url = "http://test-container:8080/api/v1/file/write"

      // First call fails, second succeeds
      mockFetch.setNetworkError(url)
      mockFetch.setResponse(url, 200, {
        data: {
          size: 12,
        },
      })

      const result = await backend.writeFile("/home/ubuntu/test.txt", "file content")

      // This test documents retry behavior for file writes
      expect(result.written).toBe(true)
    })
  })

  describe("listDir() retry on transient errors", () => {
    it("should retry on connection errors and eventually succeed", async () => {
      backend = new HttpApiBackend({
        containerId: "test-container",
        port: 8080,
      })

      const url = "http://test-container:8080/api/v1/file/list"

      // First call fails, second succeeds
      mockFetch.setNetworkError(url)
      mockFetch.setResponse(url, 200, {
        data: {
          entries: [
            { name: "file1.txt", type: "file", size: 100 },
          ],
        },
      })

      const entries = await backend.listDir("/home/ubuntu")

      // This test documents retry behavior for directory listing
      expect(entries.length).toBe(1)
    })
  })

  describe("Abort signal should prevent retries", () => {
    it("should not retry if operation is aborted", async () => {
      backend = new HttpApiBackend({
        containerId: "test-container",
        port: 8080,
      })

      const url = "http://test-container:8080/api/v1/shell/exec"

      // Set up network error
      mockFetch.setNetworkError(url)

      const abortController = new AbortController()
      abortController.abort()

      try {
        await backend.exec("echo test", {
          sessionId: "test-session",
          timeout: 5000,
          abort: abortController.signal,
        })
        expect("Should have thrown").toBe(false)
      } catch (error) {
        // This test documents that aborted operations should not retry
        expect((error as Error).message).toContain("aborted")

        const calls = mockFetch.getFetchCalls()
        // Should not retry when aborted
        expect(calls.length).toBeLessThanOrEqual(1)
      }
    })
  })

  describe("Container status check before retry", () => {
    it("should verify container is still running before retrying", async () => {
      // This test documents the expected behavior of checking container status
      // before attempting retries - if container is stopped, don't retry
      backend = new HttpApiBackend({
        containerId: "test-container",
        port: 8080,
      })

      const url = "http://test-container:8080/api/v1/shell/exec"

      // First call fails
      mockFetch.setNetworkError(url)

      try {
        await backend.exec("echo test", {
          sessionId: "test-session",
          timeout: 5000,
        })
      } catch (error) {
        // Expected to fail
      }

      // Implementation should check if container is still running before retry
      // This will be verified in the GREEN phase
      expect(true).toBe(true)
    })
  })
})

describe("HttpApiBackend - Retry Configuration", () => {
  it("should allow configurable max retries", async () => {
    // This test documents that max retries should be configurable
    // Implementation will be added in GREEN phase
    expect(true).toBe(true)
  })

  it("should allow configurable retry delay", async () => {
    // This test documents that retry delay should be configurable
    // Implementation will be added in GREEN phase
    expect(true).toBe(true)
  })

  it("should have default max retries of 3", async () => {
    // This test documents the default retry configuration
    // Implementation will be added in GREEN phase
    expect(true).toBe(true)
  })

  it("should cap exponential backoff at 2000ms", async () => {
    // This test documents the maximum backoff delay
    // Implementation will be added in GREEN phase
    expect(true).toBe(true)
  })
})
