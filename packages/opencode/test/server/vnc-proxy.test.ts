import { describe, it, expect, beforeAll, afterAll } from "bun:test"
import { Identifier } from "../../src/id"
import { Session } from "../../src/session"
import { getDockerManager } from "../../src/docker/docker-manager"
import { Hono } from "hono"
import path from "path"

const projectRoot = path.join(__dirname, "../..")

describe("VNC Proxy Route", () => {
  const app = new Hono()
  let sessionId: string

  beforeAll(async () => {
    // Skip if Docker not available
    const dockerManager = getDockerManager()
    const dockerAvailable = await dockerManager.isAvailable()
    if (!dockerAvailable) {
      return
    }

    sessionId = Identifier.descending("session")

    // Create session
    await Session.create({
      title: "VNC Test Session",
    })
  })

  afterAll(async () => {
    const dockerManager = getDockerManager()
    const dockerAvailable = await dockerManager.isAvailable()
    if (!dockerAvailable) {
      return
    }

    // Cleanup container if exists
    try {
      await dockerManager.destroy(sessionId)
    } catch {
      // Ignore
    }

    // Cleanup session
    try {
      await Session.remove(sessionId)
    } catch {
      // Ignore
    }
  })

  it("should register VNC proxy module", async () => {
    // Check if vnc-proxy module can be imported
    const vncProxy = await import("../../src/server/vnc-proxy")
    expect(vncProxy).toBeDefined()
  })

  it("should have vncProxyRoute export", async () => {
    const { vncProxyRoute } = await import("../../src/server/vnc-proxy")
    expect(vncProxyRoute).toBeDefined()
  })

  it("should have VNC WebSocket endpoint defined", async () => {
    const { vncProxyRoute } = await import("../../src/server/vnc-proxy")

    // Create a test app with the route
    const testApp = new Hono()
    testApp.route("/", vncProxyRoute)

    // Test that the route is registered (should not be 404)
    const response = await testApp.request(`/session/${sessionId}/vnc/ws`)
    // WebSocket upgrade request from HTTP client returns 426 Upgrade Required
    // or similar status code, not 404
    expect(response.status).not.toBe(404)
  })
})
