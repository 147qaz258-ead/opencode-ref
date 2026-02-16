/**
 * Concurrent Container Creation Tests
 *
 * Tests for container creation lock mechanism following TDD approach.
 * Phase 1 (RED): Write failing tests first
 * Phase 2 (GREEN): Implement to pass tests
 * Phase 3 (IMPROVE): Refactor for better design
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { UserContainerManager } from "@/container/user-lifecycle"

describe("UserContainerManager - Concurrent Creation Locks", () => {
  let manager: UserContainerManager

  beforeEach(() => {
    manager = new UserContainerManager()
  })

  afterEach(() => {
    manager.cleanup()
  })

  describe("creationLocks mechanism", () => {
    it("should track creation locks per userId", async () => {
      // This test verifies that creationLocks Map exists and works
      // Initially, no locks should exist
      const locksBefore = (manager as any).creationLocks as Map<string, Promise<unknown>>
      expect(locksBefore).toBeDefined()
      expect(locksBefore.size).toBe(0)
    })

    it("should prevent duplicate container creation during concurrent calls", async () => {
      // Mock docker.createForSession to track call count
      let createCallCount = 0
      const mockContainerId = "test-container-123"

      // We need to mock the docker manager
      const dockerMock = {
        createForSession: async () => {
          createCallCount++
          // Simulate slow creation to allow race conditions
          await new Promise(resolve => setTimeout(resolve, 50))
          return mockContainerId
        },
        destroy: async () => {},
      }

      // Replace the docker manager on the instance
      ;(manager as any).docker = dockerMock

      // Also mock resolveContainerPort to avoid Docker calls
      ;(manager as any).resolveContainerPort = async () => ({
        host: "localhost",
        apiPort: 8080,
        playwrightPort: 9223,
      })

      const testUserId = "test-user-concurrent"

      // Make concurrent requests for the same user
      const concurrentPromises = [
        manager.getOrCreateContainer({ userId: testUserId }),
        manager.getOrCreateContainer({ userId: testUserId }),
        manager.getOrCreateContainer({ userId: testUserId }),
      ]

      // Wait for all to complete
      const results = await Promise.all(concurrentPromises)

      // CRITICAL: With proper locking, createForSession should only be called ONCE
      // Without locking, it would be called 3 times (race condition)
      expect(createCallCount).toBe(1)

      // All should return the same container
      expect(results).toHaveLength(3)
      const containerIds = new Set(results.map(r => r.containerId))
      expect(containerIds.size).toBe(1)
    })

    it("should allow different users to create containers concurrently", async () => {
      let createCallCount = 0
      const mockContainerIds = ["container-1", "container-2", "container-3"]

      const dockerMock = {
        createForSession: async (userId: string) => {
          createCallCount++
          // Simulate slow creation
          await new Promise(resolve => setTimeout(resolve, 30))
          // Return different container for different users
          const index = parseInt(userId.slice(-1)) - 1
          return mockContainerIds[index] || `container-${createCallCount}`
        },
        destroy: async () => {},
      }

      ;(manager as any).docker = dockerMock
      ;(manager as any).resolveContainerPort = async () => ({
        host: "localhost",
        apiPort: 8080,
        playwrightPort: 9223,
      })

      // Make concurrent requests for different users
      const [container1, container2, container3] = await Promise.all([
        manager.getOrCreateContainer({ userId: "user-1" }),
        manager.getOrCreateContainer({ userId: "user-2" }),
        manager.getOrCreateContainer({ userId: "user-3" }),
      ])

      // All 3 users should get separate containers
      expect(container1.userId).toBe("user-1")
      expect(container2.userId).toBe("user-2")
      expect(container3.userId).toBe("user-3")

      expect(container1.containerId).not.toBe(container2.containerId)
      expect(container2.containerId).not.toBe(container3.containerId)
    })

    it("should return cached container if it exists", async () => {
      let createCallCount = 0
      const mockContainerId = "test-container-456"

      const dockerMock = {
        createForSession: async () => {
          createCallCount++
          await new Promise(resolve => setTimeout(resolve, 10))
          return mockContainerId
        },
        destroy: async () => {},
      }

      ;(manager as any).docker = dockerMock
      ;(manager as any).resolveContainerPort = async () => ({
        host: "localhost",
        apiPort: 8080,
        playwrightPort: 9223,
      })

      const testUserId = "test-user-cached"

      // First call creates container
      const container1 = await manager.getOrCreateContainer({ userId: testUserId })
      expect(createCallCount).toBe(1)
      expect(container1.containerId).toBe(mockContainerId)

      // Second call should return cached container (no new creation)
      const container2 = await manager.getOrCreateContainer({ userId: testUserId })
      expect(createCallCount).toBe(1) // Still 1, not 2
      expect(container2.containerId).toBe(mockContainerId)
    })
  })

  describe("lock cleanup on error", () => {
    it("should release lock even if container creation fails", async () => {
      let createCallCount = 0

      const dockerMock = {
        createForSession: async () => {
          createCallCount++
          // First call fails, second succeeds
          if (createCallCount === 1) {
            throw new Error("Simulated Docker error")
          }
          return "container-789"
        },
        destroy: async () => {},
      }

      ;(manager as any).docker = dockerMock
      ;(manager as any).resolveContainerPort = async () => ({
        host: "localhost",
        apiPort: 8080,
        playwrightPort: 9223,
      })

      const testUserId = "test-user-fail-retry"

      // First call should fail
      await expect(
        manager.getOrCreateContainer({ userId: testUserId })
      ).rejects.toThrow("Simulated Docker error")

      // Verify lock is released by checking if second call succeeds
      // If lock wasn't released, this would hang or fail
      const container = await manager.getOrCreateContainer({ userId: testUserId })
      expect(container).toBeDefined()
      expect(container.userId).toBe(testUserId)
    })

    it("should maintain lock during container creation", async () => {
      let createCallCount = 0

      const dockerMock = {
        createForSession: async () => {
          createCallCount++
          // Simulate slow creation
          await new Promise(resolve => setTimeout(resolve, 100))
          return "container-slow"
        },
        destroy: async () => {},
      }

      ;(manager as any).docker = dockerMock
      ;(manager as any).resolveContainerPort = async () => ({
        host: "localhost",
        apiPort: 8080,
        playwrightPort: 9223,
      })

      const testUserId = "test-user-slow-creation"

      // Start first request (don't await yet)
      const firstRequest = manager.getOrCreateContainer({ userId: testUserId })

      // Wait a bit to ensure first request is in progress
      await new Promise(resolve => setTimeout(resolve, 20))

      // Check that lock exists
      const locks = (manager as any).creationLocks as Map<string, Promise<unknown>>
      expect(locks.has(testUserId)).toBe(true)

      // Second concurrent request should wait for the same promise
      const secondRequest = manager.getOrCreateContainer({ userId: testUserId })

      // Both should resolve to the same container
      const [first, second] = await Promise.all([firstRequest, secondRequest])

      expect(first.containerId).toBe("container-slow")
      expect(second.containerId).toBe("container-slow")

      // Only one creation should have occurred
      expect(createCallCount).toBe(1)

      // Lock should be released after completion
      expect(locks.has(testUserId)).toBe(false)
    })
  })
})
