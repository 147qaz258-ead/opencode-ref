/**
 * User Container Skills Mount Tests
 *
 * TDD Cycle for fixing skills directory not mounted in user containers.
 *
 * Phase 1 (RED): Write failing tests first
 * Phase 2 (GREEN): Implement to pass tests
 * Phase 3 (IMPROVE): Refactor for better design
 *
 * Root Issue: In `packages/opencode/src/container/user-lifecycle.ts` line 295,
 * `createForSession()` is called with `undefined` for `skillsDir`, causing
 * "File not found /skills/skill-creator/SKILL.md" errors.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "bun:test"
import { UserContainerManager } from "@/container/user-lifecycle"
import { getDockerManager } from "@/docker/docker-manager"
import { randomUUID } from "crypto"
import path from "node:path"
import { execSync } from "node:child_process"

describe("UserContainerManager - Skills Directory Mount", () => {
  const manager = new UserContainerManager()
  const docker = getDockerManager()
  const testUserId = `test-skills-${randomUUID()}`
  const skillsDir = path.join(process.cwd(), ".opencode", "skills")

  beforeAll(async () => {
    // Initialize manager
    await manager.initialize()

    // Check if Docker is available
    const isAvailable = await docker.isAvailable()
    if (!isAvailable) {
      console.warn("Docker not available, skipping skills mount tests")
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

  describe("getOrCreateContainer - skills directory mount", () => {
    it("should create container with /skills directory mounted", async () => {
      const isAvailable = await docker.isAvailable()
      if (!isAvailable) {
        console.warn("Docker not available, skipping test")
        return
      }

      // Create container
      const container = await manager.getOrCreateContainer({
        userId: testUserId,
      })

      expect(container).toBeDefined()
      expect(container.containerId).toBeTruthy()

      // Verify /skills directory exists inside container
      // Use docker exec to check if directory exists
      const result = execSync(
        `docker exec ${container.containerId} test -d /skills && echo EXISTS || echo NOT_EXISTS`,
        { encoding: "utf-8", timeout: 5000 }
      )

      expect(result.trim()).toBe("EXISTS")
    })

    it("should have /skills directory readable from inside container", async () => {
      const isAvailable = await docker.isAvailable()
      if (!isAvailable) {
        console.warn("Docker not available, skipping test")
        return
      }

      // Create container
      const container = await manager.getOrCreateContainer({
        userId: testUserId,
      })

      // List contents of /skills directory
      const result = execSync(
        `docker exec ${container.containerId} ls -la /skills`,
        { encoding: "utf-8", timeout: 5000 }
      )

      expect(result).toBeTruthy()
      expect(result.length).toBeGreaterThan(0)

      // Should contain at least some skill directories
      const lines = result.trim().split("\n")
      expect(lines.length).toBeGreaterThan(1) // At least header + one entry
    })

    it("should have SKILL.md files at /skills/{skill-name}/SKILL.md", async () => {
      const isAvailable = await docker.isAvailable()
      if (!isAvailable) {
        console.warn("Docker not available, skipping test")
        return
      }

      // Create container
      const container = await manager.getOrCreateContainer({
        userId: testUserId,
      })

      // Check for specific skill-creator SKILL.md file
      const result = execSync(
        `docker exec ${container.containerId} test -f /skills/skill-creator/SKILL.md && echo EXISTS || echo NOT_EXISTS`,
        { encoding: "utf-8", timeout: 5000 }
      )

      expect(result.trim()).toBe("EXISTS")
    })

    it("should mount skills directory read-only (ro)", async () => {
      const isAvailable = await docker.isAvailable()
      if (!isAvailable) {
        console.warn("Docker not available, skipping test")
        return
      }

      // Create container
      const container = await manager.getOrCreateContainer({
        userId: testUserId,
      })

      // Try to create a file in /skills (should fail due to read-only mount)
      let errorOccurred = false
      try {
        execSync(
          `docker exec ${container.containerId} touch /skills/test-write-test.txt 2>&1`,
          { encoding: "utf-8", timeout: 5000 }
        )
      } catch (error) {
        // Should fail with "Read-only file system" error
        errorOccurred = true
      }

      expect(errorOccurred).toBe(true)
    })

    it("should mount host skills directory to container /skills", async () => {
      const isAvailable = await docker.isAvailable()
      if (!isAvailable) {
        console.warn("Docker not available, skipping test")
        return
      }

      // Create container
      const container = await manager.getOrCreateContainer({
        userId: testUserId,
      })

      // Get a list of skills on host
      const hostSkills = execSync(
        `ls "${skillsDir}"`,
        { encoding: "utf-8", timeout: 5000 }
      )

      // Get list of skills in container
      const containerSkills = execSync(
        `docker exec ${container.containerId} ls /skills`,
        { encoding: "utf-8", timeout: 5000 }
      )

      // Split into arrays for comparison
      const hostSkillList = hostSkills.trim().split("\n").sort()
      const containerSkillList = containerSkills.trim().split("\n").sort()

      // Should have at least some skills in common
      expect(containerSkillList.length).toBeGreaterThan(0)

      // Check if skill-creator exists in both
      expect(hostSkillList).toContain("skill-creator")
      expect(containerSkillList).toContain("skill-creator")
    })
  })
})
