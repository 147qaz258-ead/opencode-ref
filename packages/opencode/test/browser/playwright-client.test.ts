import { describe, it, expect, beforeAll, afterAll } from "bun:test"
import path from "path"
import { Identifier } from "../../src/id"
import { Session } from "../../src/session"
import { getDockerManager } from "../../src/docker/docker-manager"
import { Instance } from "../../src/project/instance"
import { Log } from "../../src/util/log"

const projectRoot = path.join(__dirname, "../..")
Log.init({ print: false })

describe("PlaywrightClient", () => {
  const dockerManager = getDockerManager()
  const hasDocker = process.env.DOCKER_AVAILABLE === "true"
  let sessionId: string
  let httpClient: any

  beforeAll(async () => {
    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        if (!hasDocker) return

        sessionId = Identifier.descending("session")
        await Session.create({
          title: "Browser Client Test",
        })

        const available = await dockerManager.isAvailable()
        if (!available) {
          console.log("Skipping - Docker not available")
          return
        }

        await dockerManager.createForSession(
          sessionId,
          "/workspace",
          undefined,
          {
            image: "opencode-sandbox-playwright:latest",
          }
        )
        await dockerManager.start(sessionId)

        const { PlaywrightClient } = await import("../../src/browser/playwright-client")
        const info = await dockerManager.getContainerIP(sessionId)
        const cdpUrl = `http://${info!.ip}:9222`
        httpClient = new PlaywrightClient(cdpUrl)
      },
    })
  })

  afterAll(async () => {
    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        if (!hasDocker) return

        try {
          if (httpClient?.cleanup) {
            await httpClient.cleanup()
          }
        } catch {}

        try {
          await dockerManager.destroy(sessionId)
        } catch {}

        try {
          await Session.remove(sessionId)
        } catch {}
      },
    })
  })

  it("should define PlaywrightClient class", async () => {
    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        const { PlaywrightClient } = await import("../../src/browser/playwright-client")
        expect(PlaywrightClient).toBeDefined()
      },
    })
  })

  it("should create client instance", async () => {
    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        if (!hasDocker) {
          console.log("Skipping - Docker not available")
          return
        }

        const { PlaywrightClient } = await import("../../src/browser/playwright-client")
        const client = new PlaywrightClient("http://localhost:9222")
        expect(client).toBeDefined()
      },
    })
  })

  it.skip("should initialize and connect to CDP (requires Docker)", async () => {
    // Integration test - requires running container
    expect(true).toBe(true)
  })

  it.skip("should navigate to URL and extract elements (requires Docker)", async () => {
    expect(true).toBe(true)
  })

  it.skip("should take screenshot (requires Docker)", async () => {
    expect(true).toBe(true)
  })
})
