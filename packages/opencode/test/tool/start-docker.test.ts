import { describe, it, expect, beforeAll, afterAll } from "bun:test"
import path from "path"
import { StartDockerTool } from "../../src/tool/start-docker"
import { getDockerManager } from "../../src/docker/docker-manager"
import { Session } from "../../src/session"
import { Instance } from "../../src/project/instance"
import { Log } from "../../src/util/log"
import { Identifier } from "../../src/id"

const projectRoot = path.join(__dirname, "../..")
Log.init({ print: false })

describe("start_docker Tool", () => {
  const dockerManager = getDockerManager()
  const hasDocker = process.env.DOCKER_AVAILABLE === "true"

  beforeAll(async () => {
    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        // Cleanup any existing test containers
        try {
          const sessions = dockerManager.listSessions()
          for (const session of sessions) {
            if (session.sessionId.startsWith("test-docker-")) {
              await dockerManager.destroy(session.sessionId)
            }
          }
        } catch {
          // Ignore cleanup errors
        }
      },
    })
  })

  it("should define tool structure", async () => {
    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        const tool = await StartDockerTool.init()

        expect(tool).toBeDefined()
        expect(tool.id).toBe("start_docker")
        expect(tool.description).toContain("Docker sandbox")
        expect(tool.parameters).toBeDefined()
      },
    })
  })

  it("should fail when Docker is not available", async () => {
    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        if (hasDocker) {
          console.log("Skipping - Docker is available")
          return
        }

        const tool = await StartDockerTool.init()
        const result = await tool.execute(
          { image: undefined, workspace: undefined },
          {
            sessionID: Identifier.descending("session"),
            messageID: Identifier.descending("message"),
            agent: "test",
            abort: new AbortController().signal,
            metadata: () => {},
            ask: async () => {},
          }
        )

        expect(result.title).toContain("Docker Not Available")
      },
    })
  })

  it("should fail for non-existent session", async () => {
    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        const tool = await StartDockerTool.init()
        const result = await tool.execute(
          { image: undefined, workspace: undefined },
          {
            sessionID: Identifier.descending("session"),
            messageID: Identifier.descending("message"),
            agent: "test",
            abort: new AbortController().signal,
            metadata: () => {},
            ask: async () => {},
          }
        )

        expect(result.title).toContain("Session Not Found")
      },
    })
  })

  // Full integration test requires actual Docker - skipped by default
  it.skip("should create and start sandbox container (requires Docker)", async () => {
    // This test would require:
    // 1. Docker to be running
    // 2. manus-sandbox image to be available
    // 3. Sufficient resources
    //
    // The implementation is tested manually
    expect(true).toBe(true)
  })
})
