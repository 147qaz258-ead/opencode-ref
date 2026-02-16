import { describe, it, expect } from "bun:test"
import path from "path"
import { Session } from "../../src/session"
import { Instance } from "../../src/project/instance"
import { Log } from "../../src/util/log"

const projectRoot = path.join(__dirname, "../..")
Log.init({ print: false })

describe("Session.Info Schema - Sandbox Extensions", () => {
  it("should accept sandbox mode with optional directory", async () => {
    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        // Create session without directory (NEW BEHAVIOR)
        const session = await Session.createNext({
          title: "Test Session",
          // directory is now optional
        })

        // Verify sandbox mode defaults
        expect(session.mode).toBe("sandbox")
        expect(session.directory).toBeUndefined()
        expect(session.artifactIds).toEqual([])

        await Session.remove(session.id)
      },
    })
  })

  it("should store sandbox-related fields", async () => {
    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        // This test verifies the new sandbox fields exist and work
        const session = await Session.createNext({
          title: "Sandbox Session",
          directory: "/tmp/test",
        })

        // Update with sandbox fields (now properly typed)
        const updated = await Session.update(session.id, (draft) => {
          draft.sandboxId = "container_abc123"
          draft.sandboxStatus = "running"
          draft.vncUrl = "ws://localhost:5901"
          draft.artifactIds = ["art_123", "art_456"]
        })

        expect(updated.sandboxId).toBe("container_abc123")
        expect(updated.sandboxStatus).toBe("running")
        expect(updated.vncUrl).toBe("ws://localhost:5901")
        expect(updated.artifactIds).toEqual(["art_123", "art_456"])

        await Session.remove(session.id)
      },
    })
  })

  it("should validate sandboxStatus enum", async () => {
    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        const session = await Session.createNext({
          title: "Status Test",
          directory: "/tmp/test",
        })

        // Valid status values
        const validStatuses = ["pending", "starting", "running", "stopping", "stopped", "error"] as const

        for (const status of validStatuses) {
          await Session.update(session.id, (draft) => {
            draft.sandboxStatus = status
          })

          const updated = await Session.get(session.id)
          expect(updated?.sandboxStatus).toBe(status)
        }

        await Session.remove(session.id)
      },
    })
  })

  it("should maintain mode default to sandbox", async () => {
    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        const session = await Session.createNext({
          title: "Auto Sandbox",
        })

        expect(session.mode).toBe("sandbox")
        expect(session.artifactIds).toEqual([])

        await Session.remove(session.id)
      },
    })
  })
})
