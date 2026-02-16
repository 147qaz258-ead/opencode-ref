import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test"
import { getDockerManager } from "../../src/docker/docker-manager"
import { randomUUID } from "crypto"

describe("VNC Container Info", () => {
  const sessionId = randomUUID()
  const manager = getDockerManager()

  beforeAll(async () => {
    // Check if Docker is available before running tests
    const isAvailable = await manager.isAvailable()
    if (!isAvailable) {
      console.warn("Docker not available, skipping VNC tests")
      return
    }

    await manager.createForSession(sessionId, undefined, undefined, {
      image: "opencode-sandbox-playwright:latest",
    })
    await manager.start(sessionId)
    await new Promise(resolve => setTimeout(resolve, 3000))
  }, 120000)

  afterAll(async () => {
    const isAvailable = await manager.isAvailable()
    if (!isAvailable) {
      return
    }
    await manager.destroy(sessionId)
  })

  it("should return VNC WebSocket URL", async () => {
    const isAvailable = await manager.isAvailable()
    if (!isAvailable) {
      console.warn("Docker not available, skipping VNC test")
      return
    }

    const networkInfo = await manager.getContainerIP(sessionId)
    expect(networkInfo).not.toBeNull()
    expect(networkInfo?.ip).toMatch(/^\d+\.\d+\.\d+\.\d+$/)
    expect(networkInfo?.ports).toBeDefined()
    expect(networkInfo?.ports[6080]).toBeDefined() // websockify port
  })

  it("should return VNC WebSocket URL via getVncUrl", async () => {
    const isAvailable = await manager.isAvailable()
    if (!isAvailable) {
      console.warn("Docker not available, skipping VNC test")
      return
    }

    const vncUrl = await manager.getVncUrl(sessionId)
    expect(vncUrl).not.toBeNull()
    // Should connect to port 6080 (websockify), not 5901 (VNC server)
    expect(vncUrl).toMatch(/^ws:\/\/\d+\.\d+\.\d+\.\d+:\d+$/)
  })
})