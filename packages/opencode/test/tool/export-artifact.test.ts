import { describe, it, expect, beforeAll, afterAll } from "bun:test"
import path from "path"
import { Identifier } from "@/id"
import { Session } from "@/session"
import { getDockerManager } from "@/docker/docker-manager"
import { Instance } from "@/project/instance"
import { Log } from "@/util/log"
import { ToolRegistry } from "@/tool/registry"
import { Artifact } from "@/artifact"

const projectRoot = path.join(__dirname, "../../../..")
Log.init({ print: false })

describe("export_artifact Tool", () => {
  const hasDocker = process.env.DOCKER_AVAILABLE === "true"
  let sessionId: string

  beforeAll(async () => {
    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        if (!hasDocker) return

        sessionId = Identifier.descending("session")
        await Session.create({
          title: "Export Test",
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

        const { SandboxHttpClient } = await import("@/sandbox/http-client")
        const httpClient = new SandboxHttpClient({ sessionId })
        await httpClient.fileWrite("/workspace/test.py", "print('Hello, Artifact!')")
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

  it("should define export_artifact tool", async () => {
    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        const toolIds = await ToolRegistry.ids()
        expect(toolIds).toContain("export_artifact")
      },
    })
  })

  it("should create tool instance", async () => {
    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        const tools = await ToolRegistry.tools("opencode")
        const tool = tools.find(t => t.id === "export_artifact")
        expect(tool).toBeDefined()
      },
    })
  })

  it.skip("should export file from container as artifact (requires Docker)", async () => {
    // Integration test - requires running container
    expect(true).toBe(true)
  })
})
