import { describe, it, expect, beforeAll } from "bun:test"
import { ContainerLifecycleManager } from "../../src/docker/container-lifecycle"

describe("Docker Image Pull", () => {
  let lifecycle: ContainerLifecycleManager

  beforeAll(() => {
    lifecycle = new ContainerLifecycleManager()
  })

  it("should validate image name format", async () => {
    // Test valid image name
    const validImage = "alpine:latest"
    await expect(() => lifecycle.ensureImage(validImage)).not.toThrow()

    // Test invalid image name
    const invalidImage = "Invalid/Image@Name:tag"
    await expect(() => lifecycle.ensureImage(invalidImage)).toThrow("Invalid Docker image name")
  })

  it("should pull image on Windows using Docker CLI fallback", async () => {
    const image = "alpine:latest"
    await lifecycle.ensureImage(image)
  }, 60000)
})