import { describe, it, expect, beforeAll, afterAll } from "bun:test"
import path from "path"
import { Identifier } from "../../../src/id"
import { Session } from "../../../src/session"
import { getDockerManager } from "../../../src/docker/docker-manager"
import { Instance } from "../../../src/project/instance"
import { Log } from "../../../src/util/log"
import { ToolRegistry } from "../../../src/tool/registry"

const projectRoot = path.join(__dirname, "../../../..")
Log.init({ print: false })

describe("browser_navigate Tool", () => {
  const hasDocker = process.env.DOCKER_AVAILABLE === "true"
  let sessionId: string

  beforeAll(async () => {
    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        if (!hasDocker) return

        sessionId = Identifier.descending("session")
        await Session.create({
          title: "Browser Test",
        })

        const dockerManager = getDockerManager()
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
      },
    })
  })

  afterAll(async () => {
    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        if (!hasDocker) return

        const dockerManager = getDockerManager()
        try {
          await dockerManager.destroy(sessionId)
        } catch {}

        try {
          await Session.remove(sessionId)
        } catch {}
      },
    })
  })

  it("should define browser_navigate tool", async () => {
    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        const toolIds = await ToolRegistry.ids()
        expect(toolIds).toContain("browser_navigate")
      },
    })
  })

  it("should create tool instance", async () => {
    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        const tools = await ToolRegistry.tools("opencode")
        const tool = tools.find(t => t.id === "browser_navigate")
        expect(tool).toBeDefined()
      },
    })
  })

  it.skip("should navigate to URL and return elements (requires Docker)", async () => {
    // Integration test - requires running container with Chrome CDP
    expect(true).toBe(true)
  })
})
