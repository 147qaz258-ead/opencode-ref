import { describe, it, expect } from "bun:test"
import path from "path"
import { Artifact } from "../../src/artifact"
import { Instance } from "../../src/project/instance"
import { Log } from "../../src/util/log"
import { Identifier } from "../../src/id"

const projectRoot = path.join(__dirname, "../..")
Log.init({ print: false })

describe("Artifact Model", () => {
  it("should create artifact with storage", async () => {
    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        const artifactId = Identifier.descending("artifact")
        const sessionId = Identifier.descending("session")

        const artifact = await Artifact.create({
          id: artifactId,
          sessionID: sessionId,
          filename: "script.py",
          mimeType: "text/x-python",
          size: 1024,
          storageType: "gridfs",
          containerPath: "/workspace/script.py",
          metadata: {
            category: "code",
            exported: false,
            tags: ["python", "automation"],
          },
        })

        expect(artifact.id).toBe(artifactId)
        expect(artifact.filename).toBe("script.py")
        expect(artifact.storageType).toBe("gridfs")
      },
    })
  })

  it("should retrieve artifact by ID", async () => {
    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        const artifactId = Identifier.descending("artifact")
        const sessionId = Identifier.descending("session")

        await Artifact.create({
          id: artifactId,
          sessionID: sessionId,
          filename: "result.json",
          mimeType: "application/json",
          size: 256,
          storageType: "gridfs",
        })

        const retrieved = await Artifact.get(artifactId)
        expect(retrieved?.filename).toBe("result.json")
      },
    })
  })

  it("should list artifacts by session", async () => {
    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        const sessionId = Identifier.descending("session")

        await Artifact.create({
          id: Identifier.descending("artifact"),
          sessionID: sessionId,
          filename: "a.txt",
          mimeType: "text/plain",
          size: 100,
          storageType: "gridfs",
        })

        await Artifact.create({
          id: Identifier.descending("artifact"),
          sessionID: sessionId,
          filename: "b.txt",
          mimeType: "text/plain",
          size: 200,
          storageType: "gridfs",
        })

        const artifacts = await Artifact.listBySession(sessionId)
        expect(artifacts.length).toBe(2)
      },
    })
  })

  it("should delete artifact", async () => {
    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        const artifactId = Identifier.descending("artifact")
        const sessionId = Identifier.descending("session")

        await Artifact.create({
          id: artifactId,
          sessionID: sessionId,
          filename: "delete_me.txt",
          mimeType: "text/plain",
          size: 50,
          storageType: "gridfs",
        })

        await Artifact.remove(artifactId)

        const retrieved = await Artifact.get(artifactId)
        expect(retrieved).toBeNull()
      },
    })
  })
})
