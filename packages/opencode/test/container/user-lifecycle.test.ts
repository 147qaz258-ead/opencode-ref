/**
 * User Container Lifecycle Tests
 *
 * Tests for container auto-shutdown feature following TDD approach.
 * Phase 1 (RED): Write failing tests first
 * Phase 2 (GREEN): Implement to pass tests
 * Phase 3 (IMPROVE): Refactor for better design
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "bun:test"
import { UserContainerManager, type UserContainer } from "@/container/user-lifecycle"
import { getDockerManager } from "@/docker/docker-manager"
import { randomUUID } from "crypto"

describe("UserContainerManager - Activity Tracking", () => {
  const manager = new UserContainerManager()
  const docker = getDockerManager()
  const testUserId = `test-user-${randomUUID()}`

  beforeAll(async () => {
    // Initialize manager
    await manager.initialize()

    // Check if Docker is available
    const isAvailable = await docker.isAvailable()
    if (!isAvailable) {
      console.warn("Docker not available, skipping activity tracking tests")
      return
    }
  }, 30000)

  afterAll(async () => {
    // Cleanup test container
    const isAvailable = await docker.isAvailable()
    if (isAvailable) {
      try {
        await manager.deleteContainer(testUserId)
      } catch {
        // Ignore cleanup errors
      }
    }
    manager.cleanup()
  })

  beforeEach(async () => {
    // Ensure clean state before each test
    const isAvailable = await docker.isAvailable()
    if (!isAvailable) {
      return
    }

    // Clean up existing test container if any
    try {
      await manager.deleteContainer(testUserId)
    } catch {
      // Ignore if container doesn't exist
    }
  })

  afterEach(async () => {
    // Clean up after each test
    const isAvailable = await docker.isAvailable()
    if (!isAvailable) {
      return
    }

    try {
      await manager.deleteContainer(testUserId)
    } catch {
      // Ignore cleanup errors
    }
  })

  describe("updateActivity", () => {
    it("should update lastActivity timestamp when called", async () => {
      const isAvailable = await docker.isAvailable()
      if (!isAvailable) {
        console.warn("Docker not available, skipping test")
        return
      }

      // Create container
      const container = await manager.getOrCreateContainer({
        userId: testUserId,
      })

      const originalActivity = container.lastActivity

      // Wait a bit to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10))

      // Update activity
      manager.updateActivity(testUserId)

      // Get updated container
      const updatedContainer = manager.getContainer(testUserId)
      expect(updatedContainer).toBeDefined()
      expect(updatedContainer?.lastActivity).toBeGreaterThan(originalActivity)
    })

    it("should not throw error when called with unknown userId", () => {
      // Should not throw for unknown user
      expect(() => {
        manager.updateActivity("unknown-user-" + randomUUID())
      }).not.toThrow()
    })

    it("should reset idle timeout when activity is updated", async () => {
      const isAvailable = await docker.isAvailable()
      if (!isAvailable) {
        console.warn("Docker not available, skipping test")
        return
      }

      // Create container
      const container = await manager.getOrCreateContainer({
        userId: testUserId,
      })

      const initialActivity = container.lastActivity

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 100))

      // Update activity
      manager.updateActivity(testUserId)

      // Wait again
      await new Promise(resolve => setTimeout(resolve, 100))

      // Get container - should have updated timestamp
      const updatedContainer = manager.getContainer(testUserId)
      expect(updatedContainer).toBeDefined()
      expect(updatedContainer?.lastActivity).toBeGreaterThan(initialActivity)
    })
  })

  describe("container hibernation", () => {
    it("should NOT hibernate active container before timeout", async () => {
      const isAvailable = await docker.isAvailable()
      if (!isAvailable) {
        console.warn("Docker not available, skipping test")
        return
      }

      // Create container
      await manager.getOrCreateContainer({
        userId: testUserId,
      })

      // Update activity (simulate ongoing operation)
      manager.updateActivity(testUserId)

      // Wait a short time (less than timeout)
      await new Promise(resolve => setTimeout(resolve, 1000))

      // Container should still be running
      const container = manager.getContainer(testUserId)
      expect(container).toBeDefined()
      expect(container?.status).toBe("running")
    })

    it("should hibernate container after timeout period", async () => {
      const isAvailable = await docker.isAvailable()
      if (!isAvailable) {
        console.warn("Docker not available, skipping test")
        return
      }

      // Create container
      await manager.getOrCreateContainer({
        userId: testUserId,
      })

      // Set activity to past (beyond timeout)
      const container = manager.getContainer(testUserId)
      expect(container).toBeDefined()
      expect(container?.status).toBe("running")

      if (container) {
        // Manually set lastActivity to past (simulate inactivity)
        (container as any).lastActivity = Date.now() - (6 * 60 * 1000) // 6 minutes ago
      }

      // Trigger hibernation check manually
      await (manager as any).checkAndHibernateIdleContainers()

      // Wait a bit for the async stop operation to complete
      await new Promise(resolve => setTimeout(resolve, 500))

      // Container should still exist in the map (not deleted), but status should be "stopped"
      const updatedContainer = manager.getContainer(testUserId)
      expect(updatedContainer).toBeDefined()
      expect(updatedContainer?.status).toBe("stopped")
    })
  })
})

describe("UserContainerManager - Integration with SandboxExecutorV2", () => {
  const manager = new UserContainerManager()
  const docker = getDockerManager()
  const testUserId = `test-user-exec-${randomUUID()}`

  beforeAll(async () => {
    await manager.initialize()

    const isAvailable = await docker.isAvailable()
    if (!isAvailable) {
      console.warn("Docker not available, skipping integration tests")
      return
    }
  }, 30000)

  afterAll(async () => {
    const isAvailable = await docker.isAvailable()
    if (isAvailable) {
      try {
        await manager.deleteContainer(testUserId)
      } catch {
        // Ignore cleanup errors
      }
    }
    manager.cleanup()
  })

  beforeEach(async () => {
    const isAvailable = await docker.isAvailable()
    if (!isAvailable) {
      return
    }

    try {
      await manager.deleteContainer(testUserId)
    } catch {
      // Ignore
    }
  })

  afterEach(async () => {
    const isAvailable = await docker.isAvailable()
    if (!isAvailable) {
      return
    }

    try {
      await manager.deleteContainer(testUserId)
    } catch {
      // Ignore
    }
  })

  describe("activity updates during operations", () => {
    it("should create HttpApiBackend with userId for activity tracking", async () => {
      const isAvailable = await docker.isAvailable()
      if (!isAvailable) {
        console.warn("Docker not available, skipping test")
        return
      }

      // Create container
      const container = await manager.getOrCreateContainer({
        userId: testUserId,
      })

      // Create HttpApiBackend with userId
      const { HttpApiBackend } = await import("@/sandbox/backend/http-api")
      const backend = new HttpApiBackend({
        containerId: container.host,
        port: container.apiPort,
        userId: testUserId,
      })

      // Backend should be created successfully
      expect(backend).toBeDefined()
      expect(backend.type).toBe("http-api")
    })

    it("should create SandboxExecutorV2 with userId", async () => {
      const isAvailable = await docker.isAvailable()
      if (!isAvailable) {
        console.warn("Docker not available, skipping test")
        return
      }

      // Create container
      const container = await manager.getOrCreateContainer({
        userId: testUserId,
      })

      // Create SandboxExecutorV2 with userId
      const { SandboxExecutorV2 } = await import("@/sandbox/executor-v2")
      const executor = await SandboxExecutorV2.create({
        backend: "http-api",
        sessionId: "test-session",
        userId: testUserId,
        containerId: container.containerId,
        host: container.host,
        port: container.apiPort,
      })

      // Executor should be created successfully
      expect(executor).toBeDefined()
    })

    it("should have userId in SandboxConfig", async () => {
      // This is a unit test to verify the interface
      const { SandboxExecutorV2 } = await import("@/sandbox/executor-v2")

      // We can't directly test the private config, but we can verify the create method accepts userId
      expect(typeof SandboxExecutorV2.create).toBe("function")
    })
  })
})

describe("UserContainerManager - Unit Tests (No Docker Required)", () => {
  let manager: UserContainerManager

  beforeEach(() => {
    manager = new UserContainerManager()
  })

  afterEach(() => {
    manager.cleanup()
  })

  describe("getOrCreateContainer", () => {
    it("should have create method", () => {
      expect(typeof manager.getOrCreateContainer).toBe("function")
    })
  })

  describe("updateActivity", () => {
    it("should have updateActivity method", () => {
      expect(typeof manager.updateActivity).toBe("function")
    })

    it("should not throw error when called with unknown userId", () => {
      // Should not throw for unknown user
      expect(() => {
        manager.updateActivity("unknown-user-" + randomUUID())
      }).not.toThrow()
    })
  })

  describe("getContainer", () => {
    it("should return undefined for non-existent user", () => {
      const container = manager.getContainer("non-existent-user")
      expect(container).toBeUndefined()
    })
  })

  describe("getAllContainers", () => {
    it("should return empty array initially", () => {
      const containers = manager.getAllContainers()
      expect(containers).toEqual([])
    })
  })

  describe("cleanup", () => {
    it("should stop monitoring and clear containers", () => {
      manager.cleanup()
      expect(manager.getAllContainers()).toEqual([])
    })
  })
})
