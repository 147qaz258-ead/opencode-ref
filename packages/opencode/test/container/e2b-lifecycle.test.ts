/**
 * E2B Sandbox Manager Tests
 *
 * Test suite for E2B sandbox lifecycle management.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { E2BSandboxManager, getE2BManager } from "@/container/e2b-lifecycle"
import type { E2BSandbox } from "@/container/e2b-lifecycle"

// Mock E2B SDK
vi.mock("@e2b/code-interpreter", () => ({
  Sandbox: {
    create: vi.fn(),
  },
}))

// Mock e2b package for SandboxApi
vi.mock("e2b", () => ({
  SandboxApi: {
    kill: vi.fn(),
  },
}))

// Helper to get mocked Sandbox
const getMockedSandbox = async () => {
  const { Sandbox } = await import("@e2b/code-interpreter")
  return {
    create: Sandbox.create as any,
  }
}

// Helper to get mocked SandboxApi
const getMockedSandboxApi = async () => {
  const { SandboxApi } = await import("e2b")
  return {
    kill: SandboxApi.kill as any,
  }
}

describe("E2BSandboxManager", () => {
  let manager: E2BSandboxManager

  beforeEach(() => {
    manager = new E2BSandboxManager()
    vi.clearAllMocks()
    // Set default API key for all tests
    process.env.E2B_API_KEY = "test-api-key"
  })

  afterEach(() => {
    manager.cleanup()
    // Clean up env vars
    delete process.env.E2B_API_KEY
  })

  afterEach(async () => {
    manager.cleanup()
  })

  describe("initialization", () => {
    it("should initialize successfully", async () => {
      await manager.initialize()

      expect(manager).toBeDefined()
    })

    it("should not initialize twice", async () => {
      await manager.initialize()
      await manager.initialize() // Should not throw

      expect(manager).toBeDefined()
    })
  })

  describe("getOrCreateSandbox", () => {
    it("should create new sandbox for user", async () => {
      const mockSandbox = {
        sandboxId: "test-sandbox-123",
        kill: vi.fn(),
      } as any // Use 'as any' because E2B types may differ

      const { create } = await getMockedSandbox()
      create.mockResolvedValue(mockSandbox)

      const result = await manager.getOrCreateSandbox({
        userId: "user-123",
      })

      expect(result.userId).toBe("user-123")
      expect(result.sandboxId).toBe("test-sandbox-123")
      expect(result.status).toBe("running")
      expect(create).toHaveBeenCalledWith({
        apiKey: "test-api-key",
        id: undefined,
        timeoutMs: 120000,
      })
    })

    it("should reuse existing sandbox", async () => {
      const mockSandbox = {
        sandboxId: "test-sandbox-123",
        kill: vi.fn(),
      } as any // Use 'as any' because E2B types may differ

      const { create } = await getMockedSandbox()
      create.mockResolvedValue(mockSandbox)

      // First call creates sandbox
      const result1 = await manager.getOrCreateSandbox({
        userId: "user-123",
      })

      // Second call reuses sandbox
      const result2 = await manager.getOrCreateSandbox({
        userId: "user-123",
      })

      expect(result1.sandboxId).toBe(result2.sandboxId)
      expect(create).toHaveBeenCalledTimes(1) // Only called once
    })

    it("should wake hibernated sandbox", async () => {
      // Create a hibernated sandbox entry
      const existingSandbox: E2BSandbox = {
        userId: "user-123",
        sandboxId: "existing-sandbox",
        status: "hibernated",
        lastActivity: Date.now() - 3600000, // 1 hour ago
        createdAt: Date.now() - 7200000, // 2 hours ago
      }

      ;(manager as any).sandboxes.set("user-123", existingSandbox)

      const result = await manager.getOrCreateSandbox({
        userId: "user-123",
      })

      expect(result.sandboxId).toBe("existing-sandbox")
      expect(result.status).toBe("running")
    })

    it("should throw error when API key is missing", async () => {
      delete process.env.E2B_API_KEY

      await expect(
        manager.getOrCreateSandbox({
          userId: "user-123",
        })
      ).rejects.toThrow("E2B_API_KEY environment variable is required")
    })

    it("should use custom template ID when provided", async () => {
      const mockSandbox = {
        sandboxId: "test-sandbox-123",
        kill: vi.fn(),
      } as any // Use 'as any' because E2B types may differ

      const { create } = await getMockedSandbox()
      create.mockResolvedValue(mockSandbox)

      await manager.getOrCreateSandbox({
        userId: "user-123",
        templateId: "custom-template-456",
      })

      expect(create).toHaveBeenCalledWith({
        apiKey: "test-api-key",
        id: "custom-template-456",
        timeoutMs: 120000,
      })
    })
  })

  describe("updateActivity", () => {
    it("should update last activity timestamp", async () => {
      const mockSandbox = {
        sandboxId: "test-sandbox-123",
        kill: vi.fn(),
      } as any // Use 'as any' because E2B types may differ

      const { create } = await getMockedSandbox()
      create.mockResolvedValue(mockSandbox)

      const result = await manager.getOrCreateSandbox({
        userId: "user-123",
      })

      const oldActivity = result.lastActivity

      // Wait a bit to ensure timestamp difference
      await new Promise((resolve) => setTimeout(resolve, 10))

      manager.updateActivity("user-123")

      const updated = manager.getSandbox("user-123")
      expect(updated?.lastActivity).toBeGreaterThan(oldActivity)
    })

    it("should do nothing when user not found", () => {
      // Should not throw
      expect(() => manager.updateActivity("nonexistent-user")).not.toThrow()
    })
  })

  describe("deleteSandbox", () => {
    it("should delete sandbox successfully", async () => {
      const mockSandbox = {
        sandboxId: "test-sandbox-123",
      }

      const { create } = await getMockedSandbox()
      const { kill } = await getMockedSandboxApi()
      create.mockResolvedValue(mockSandbox)
      kill.mockResolvedValue(true)

      // Create sandbox first
      await manager.getOrCreateSandbox({
        userId: "user-123",
      })

      // Delete sandbox
      await manager.deleteSandbox("user-123")

      const result = manager.getSandbox("user-123")
      expect(result).toBeUndefined()
      expect(kill).toHaveBeenCalledWith("test-sandbox-123", { apiKey: "test-api-key" })
    })

    it("should handle missing sandbox gracefully", async () => {
      const { kill } = await getMockedSandboxApi()
      kill.mockResolvedValue(false) // Sandbox not found

      // Should not throw
      await expect(manager.deleteSandbox("nonexistent-user")).resolves.toBeUndefined()
    })

    it("should handle kill failure gracefully", async () => {
      const mockSandbox = {
        sandboxId: "test-sandbox-123",
      }

      const { create } = await getMockedSandbox()
      const { kill } = await getMockedSandboxApi()
      create.mockResolvedValue(mockSandbox)
      kill.mockRejectedValue(new Error("Kill failed"))

      // Create sandbox first
      await manager.getOrCreateSandbox({
        userId: "user-123",
      })

      // Delete should not throw even if kill fails
      await expect(manager.deleteSandbox("user-123")).resolves.toBeUndefined()

      // But sandbox should still be removed from registry
      const result = manager.getSandbox("user-123")
      expect(result).toBeUndefined()
    })
  })

  describe("getSandbox", () => {
    it("should return sandbox when exists", async () => {
      const mockSandbox = {
        sandboxId: "test-sandbox-123",
        kill: vi.fn(),
      } as any // Use 'as any' because E2B types may differ

      const { create } = await getMockedSandbox()
      create.mockResolvedValue(mockSandbox)

      await manager.getOrCreateSandbox({
        userId: "user-123",
      })

      const result = manager.getSandbox("user-123")

      expect(result).toBeDefined()
      expect(result?.userId).toBe("user-123")
    })

    it("should return undefined when not found", () => {
      const result = manager.getSandbox("nonexistent-user")

      expect(result).toBeUndefined()
    })
  })

  describe("getAllSandboxes", () => {
    it("should return all sandboxes", async () => {
      const mockSandbox = {
        sandboxId: "test-sandbox-123",
        kill: vi.fn(),
      } as any // Use 'as any' because E2B types may differ

      const { create } = await getMockedSandbox()
      create.mockResolvedValue(mockSandbox)

      await manager.getOrCreateSandbox({ userId: "user-1" })
      await manager.getOrCreateSandbox({ userId: "user-2" })
      await manager.getOrCreateSandbox({ userId: "user-3" })

      const result = manager.getAllSandboxes()

      expect(result).toHaveLength(3)
    })

    it("should return empty array when no sandboxes", () => {
      const result = manager.getAllSandboxes()

      expect(result).toEqual([])
    })
  })

  describe("idle monitoring", () => {
    it("should start idle monitoring", () => {
      manager.startIdleMonitoring()

      // Should have an interval set
      expect((manager as any).idleCheckInterval).toBeDefined()
    })

    it("should not start monitoring twice", () => {
      manager.startIdleMonitoring()
      const firstInterval = (manager as any).idleCheckInterval

      manager.startIdleMonitoring()
      const secondInterval = (manager as any).idleCheckInterval

      expect(firstInterval).toBe(secondInterval)
    })

    it("should stop idle monitoring", () => {
      manager.startIdleMonitoring()
      manager.stopIdleMonitoring()

      expect((manager as any).idleCheckInterval).toBeUndefined()
    })
  })

  describe("cleanup", () => {
    it("should clean up resources", async () => {
      manager.startIdleMonitoring()

      await manager.getOrCreateSandbox({ userId: "user-123" })

      manager.cleanup()

      expect((manager as any).idleCheckInterval).toBeUndefined()
      expect(manager.getAllSandboxes()).toEqual([])
    })
  })
})

describe("getE2BManager", () => {
  it("should return singleton instance", () => {
    const manager1 = getE2BManager()
    const manager2 = getE2BManager()

    expect(manager1).toBe(manager2)
  })
})
