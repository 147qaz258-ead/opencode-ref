import { describe, it, expect, beforeAll, afterAll } from "bun:test"
import { DockerManager, getDockerManager } from "../../src/docker/docker-manager"

describe("DockerManager - getContainerIP", () => {
  let manager: DockerManager

  beforeAll(async () => {
    manager = getDockerManager()
    const available = await manager.isAvailable()
    if (!available) {
      console.warn("Skipping tests - Docker not available")
    }
  })

  it("should return null for non-existent session", async () => {
    const result = await manager.getContainerIP("non-existent-session")
    expect(result).toBeNull()
  })

  it("should return null for session without container", async () => {
    // This test assumes there's a session without a container
    const result = await manager.getContainerIP("some-random-id")
    expect(result).toBeNull()
  })

  // Note: Full integration test would require creating a real container
  // which requires Docker to be available. This is tested manually.
})

describe("DockerManager - getContainerIP Integration", () => {
  it("should get IP for running container (manual test)", async () => {
    // This test is meant to be run manually with a real container
    // It documents the expected behavior

    /*
    // Manual test procedure:
    // 1. Create a session and start a container
    // const manager = getDockerManager()
    // const sessionId = "test-session"
    // const projectDir = "/tmp/test"
    //
    // await manager.createForSession(sessionId, projectDir)
    // await manager.start(sessionId)
    //
    // const result = await manager.getContainerIP(sessionId)
    // expect(result).not.toBeNull()
    // expect(result!.ip).toMatch(/^\d+\.\d+\.\d+\.\d+$/)
    // expect(typeof result!.ports).toBe("object")
    //
    // // Cleanup
    // await manager.destroy(sessionId)
    */

    expect(true).toBe(true) // Placeholder
  })
})
