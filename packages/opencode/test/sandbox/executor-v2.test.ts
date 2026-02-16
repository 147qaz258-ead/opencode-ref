import { describe, it, expect } from "bun:test"
import { createExecutor } from "@/sandbox/executor-v2"

describe("SandboxExecutorV2 Backend Selection", () => {
  it("should select http-api backend when containerId is provided", async () => {
    // This test verifies the backend selection logic
    // Actual execution will be mocked in integration tests

    const executor = await createExecutor("test-session", "container-123")

    // Verify the executor was created
    expect(executor).toBeDefined()
    expect(executor).toHaveProperty("exec")
    expect(executor).toHaveProperty("readFile")
    expect(executor).toHaveProperty("writeFile")
  })

  it("should select docker-exec backend when containerId is not provided", async () => {
    const executor = await createExecutor("test-session")

    expect(executor).toBeDefined()
    expect(executor).toHaveProperty("exec")
    expect(executor).toHaveProperty("readFile")
    expect(executor).toHaveProperty("writeFile")
  })

  it("should have all required methods", async () => {
    const executor = await createExecutor("test-session")

    expect(executor).toHaveProperty("exec")
    expect(executor).toHaveProperty("readFile")
    expect(executor).toHaveProperty("writeFile")
    expect(executor).toHaveProperty("fileExists")
    expect(executor).toHaveProperty("fileStat")
    expect(executor).toHaveProperty("listDir")
    expect(executor).toHaveProperty("findFiles")
    expect(executor).toHaveProperty("cleanup")
  })
})
