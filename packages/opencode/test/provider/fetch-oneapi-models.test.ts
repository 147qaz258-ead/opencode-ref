import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { fetchOneAPIModels } from "../../src/provider/fetch-oneapi-models"

// Mock fetch responses queue
let mockResponses: Array<(url: string) => { status: number; body?: any; error?: Error } | null> = []

function mockFetch(url: RequestInfo | URL, init?: RequestInit) {
  const urlStr = String(url)
  // Find matching response handler
  for (let i = 0; i < mockResponses.length; i++) {
    const handler = mockResponses[i]
    const result = handler(urlStr)
    if (result) {
      // Remove used response
      mockResponses.splice(i, 1)
      if (result.error) {
        return Promise.reject(result.error)
      }
      return Promise.resolve({
        ok: result.status >= 200 && result.status < 300,
        status: result.status,
        statusText: result.status === 401 ? "Unauthorized" : "Error",
        json: async () => result.body,
        text: async () => typeof result.body === "string" ? result.body : JSON.stringify(result.body),
      } as Response)
    }
  }
  return Promise.reject(new Error(`No mock response configured for: ${urlStr}`))
}

describe("fetchOneAPIModels", () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    mockResponses = []
    global.fetch = mockFetch as any
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it("should fetch and parse models successfully", async () => {
    // Mock models.dev API call (refresh)
    mockResponses.push((url) => {
      if (url.includes("models.dev")) {
        return { status: 200, body: {} }
      }
      return null
    })

    // Mock one-api /v1/models call
    mockResponses.push((url) => {
      if (url.includes("/v1/models")) {
        return {
          status: 200,
          body: {
            object: "list",
            data: [
              { id: "gpt-4o", object: "model" },
              { id: "claude-3-5-sonnet-20241022", object: "model" },
              { id: "unknown-model-x", object: "model" },
            ],
          },
        }
      }
      return null
    })

    const result = await fetchOneAPIModels({
      baseURL: "http://localhost:3001",
      apiKey: "sk-test",
    })

    expect(result.errors).toHaveLength(0)
    expect(Object.keys(result.models)).toHaveLength(3)
    expect(result.models["gpt-4o"]).toBeDefined()
    expect(result.models["gpt-4o"].providerID).toBe("oneapi")
    expect(result.models["gpt-4o"].api.npm).toBe("@ai-sdk/openai-compatible")
    expect(result.models["unknown-model-x"]).toBeDefined()
  })

  it("should handle 401 authentication errors", async () => {
    mockResponses.push((url) => {
      if (url.includes("models.dev")) {
        return { status: 200, body: {} }
      }
      return null
    })

    mockResponses.push((url) => {
      if (url.includes("/v1/models")) {
        return {
          status: 401,
          body: { error: { message: "Invalid API key" } },
        }
      }
      return null
    })

    await expect(fetchOneAPIModels({
      baseURL: "http://localhost:3001",
      apiKey: "sk-invalid",
    })).rejects.toThrow("Authentication failed")
  })

  it("should handle timeout errors", async () => {
    mockResponses.push((url) => {
      if (url.includes("models.dev")) {
        return { status: 200, body: {} }
      }
      return null
    })

    mockResponses.push((url) => {
      if (url.includes("/v1/models")) {
        return {
          status: 200,
          body: { object: "list", data: [] },
          error: new Error("Aborted") as any,
        }
      }
      return null
    })

    // Set a very short timeout
    await expect(fetchOneAPIModels({
      baseURL: "http://localhost:3001",
      apiKey: "sk-test",
      timeout: 1,
    })).rejects.toThrow()
  })

  it("should handle network errors gracefully", async () => {
    mockResponses.push((url) => {
      if (url.includes("models.dev")) {
        return { status: 200, body: {} }
      }
      return null
    })

    mockResponses.push((url) => {
      if (url.includes("/v1/models")) {
        return {
          status: 0,
          error: new Error("ECONNREFUSED"),
        }
      }
      return null
    })

    await expect(fetchOneAPIModels({
      baseURL: "http://localhost:3001",
      apiKey: "sk-test",
    })).rejects.toThrow("ECONNREFUSED")
  })

  it("should handle empty models list", async () => {
    mockResponses.push((url) => {
      if (url.includes("models.dev")) {
        return { status: 200, body: {} }
      }
      return null
    })

    mockResponses.push((url) => {
      if (url.includes("/v1/models")) {
        return {
          status: 200,
          body: { object: "list", data: [] },
        }
      }
      return null
    })

    const result = await fetchOneAPIModels({
      baseURL: "http://localhost:3001",
      apiKey: "sk-test",
    })

    expect(result.models).toEqual({})
    expect(result.errors).toHaveLength(0)
  })

  it("should handle HTTP errors properly", async () => {
    mockResponses.push((url) => {
      if (url.includes("models.dev")) {
        return { status: 200, body: {} }
      }
      return null
    })

    mockResponses.push((url) => {
      if (url.includes("/v1/models")) {
        return {
          status: 500,
          body: { error: { message: "Internal server error" } },
        }
      }
      return null
    })

    await expect(fetchOneAPIModels({
      baseURL: "http://localhost:3001",
      apiKey: "sk-test",
    })).rejects.toThrow("HTTP 500")
  })
})
