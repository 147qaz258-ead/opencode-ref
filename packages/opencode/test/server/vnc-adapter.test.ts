/**
 * VNC Adapter Tests (E2B only)
 *
 * Test suite for E2B VNC adapter functionality.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { getE2BVNCUrl } from "@/server/vnc-adapter"

describe("getE2BVNCUrl", () => {
  let mockSandbox: any

  beforeEach(() => {
    vi.clearAllMocks()
    // Set E2B_API_KEY for tests
    process.env.E2B_API_KEY = "test-api-key"

    // Create mock E2B sandbox
    mockSandbox = {
      getPorts: vi.fn().mockResolvedValue({
        url: "wss://e2b.dev/sandbox-abc/6080",
      }),
    }
  })

  afterEach(() => {
    delete process.env.E2B_API_KEY
  })

  it("should get VNC URL for E2B sandbox", async () => {
    // Use vi.doMock to mock modules
    vi.doMock("@e2b/code-interpreter", () => ({
      Sandbox: {
        reconnect: vi.fn().mockResolvedValue(mockSandbox),
      },
    }))

    vi.doMock("@/container/e2b-lifecycle", () => ({
      getE2BManager: vi.fn().mockReturnValue({
        getSandbox: vi.fn().mockReturnValue({
          userId: "user-123",
          sandboxId: "sandbox-abc",
          status: "running",
        }),
      }),
      E2BSandboxManager: class {},
    }))

    // Need to clear module cache and re-import
    const result = await getE2BVNCUrl("user-123")

    expect(result).toBe("wss://e2b.dev/sandbox-abc/6080")
  })

  it("should throw error when sandbox not found", async () => {
    vi.doMock("@/container/e2b-lifecycle", () => ({
      getE2BManager: vi.fn().mockReturnValue({
        getSandbox: vi.fn().mockReturnValue(null),
      }),
      E2BSandboxManager: class {},
    }))

    await expect(getE2BVNCUrl("user-123")).rejects.toThrow(
      "E2B sandbox not found for user: user-123"
    )
  })

  it("should throw error when E2B_API_KEY not set", async () => {
    delete process.env.E2B_API_KEY

    vi.doMock("@/container/e2b-lifecycle", () => ({
      getE2BManager: vi.fn().mockReturnValue({
        getSandbox: vi.fn().mockReturnValue({
          userId: "user-123",
          sandboxId: "sandbox-abc",
          status: "running",
        }),
      }),
      E2BSandboxManager: class {},
    }))

    await expect(getE2BVNCUrl("user-123")).rejects.toThrow(
      "E2B_API_KEY environment variable is required for VNC"
    )
  })

  it("should throw error when port forwarding not available", async () => {
    mockSandbox.getPorts.mockResolvedValue(null)

    vi.doMock("@e2b/code-interpreter", () => ({
      Sandbox: {
        reconnect: vi.fn().mockResolvedValue(mockSandbox),
      },
    }))

    vi.doMock("@/container/e2b-lifecycle", () => ({
      getE2BManager: vi.fn().mockReturnValue({
        getSandbox: vi.fn().mockReturnValue({
          userId: "user-123",
          sandboxId: "sandbox-abc",
          status: "running",
        }),
      }),
      E2BSandboxManager: class {},
    }))

    await expect(getE2BVNCUrl("user-123")).rejects.toThrow(
      "E2B port forwarding not available"
    )
  })
})
