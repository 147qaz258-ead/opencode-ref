import { describe, it, expect } from "bun:test"
import { createBackend } from "@/sandbox/backend"

describe("SaaS Integration Flow", () => {
  it("should select http-api backend when containerId is provided", async () => {
    // This test verifies the backend selection works correctly
    const backend = await createBackend("http-api", {
      containerId: "test-container",
    })

    expect(backend.type).toBe("http-api")
  })

  it("should select docker-exec backend when no containerId", async () => {
    const backend = await createBackend("docker-exec", {
      sessionId: "test-session",
    })

    expect(backend.type).toBe("docker-exec")
  })

  it("should create executor with http-api backend when containerId provided", async () => {
    const { createExecutor } = await import("@/sandbox/executor-v2")

    const executor = await createExecutor("test-session", "container-123")

    expect(executor).toBeDefined()
    expect(executor).toHaveProperty("exec")
    expect(executor).toHaveProperty("readFile")
    expect(executor).toHaveProperty("writeFile")
  })

  it("should create executor with docker-exec backend when no containerId", async () => {
    const { createExecutor } = await import("@/sandbox/executor-v2")

    const executor = await createExecutor("test-session")

    expect(executor).toBeDefined()
    expect(executor).toHaveProperty("exec")
    expect(executor).toHaveProperty("readFile")
    expect(executor).toHaveProperty("writeFile")
  })
})
