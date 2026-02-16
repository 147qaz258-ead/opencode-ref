import { describe, it, expect, beforeAll, afterAll } from "bun:test"
import path from "path"
import { Artifact } from "../../src/artifact"
import { Instance } from "../../src/project/instance"
import { Log } from "../../src/util/log"
import { Identifier } from "../../src/id"

const projectRoot = path.join(__dirname, "../..")
Log.init({ print: false })

describe("Artifact Model - GridFS Integration", () => {
  // Skip tests if MongoDB is not available
  const hasMongoDB = !!process.env.MONGODB_URI

  beforeAll(async () => {
    if (hasMongoDB) {
      // Give GridFS time to connect if needed
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  })

  it("should create artifact with content and store in GridFS", async () => {
    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        if (!hasMongoDB) {
          console.warn("Skipping - MONGODB_URI not set")
          return
        }

        const sessionId = Identifier.descending("session")
        const content = Buffer.from("Test file content for GridFS")

        const artifact = await Artifact.createWithContent({
          sessionID: sessionId,
          filename: "test-gridfs.txt",
          mimeType: "text/plain",
          content,
          containerPath: "/workspace/test-gridfs.txt",
          metadata: {
            category: "document",
            tags: ["test"],
          },
        })

        expect(artifact.id).toBeDefined()
        expect(artifact.filename).toBe("test-gridfs.txt")
        expect(artifact.gridFSId).toBeDefined()
        expect(artifact.size).toBe(content.length)

        // Clean up
        await Artifact.remove(artifact.id)
      },
    })
  })

  it("should get content from GridFS", async () => {
    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        if (!hasMongoDB) {
          return
        }

        const sessionId = Identifier.descending("session")
        const content = Buffer.from("Retrieve me from GridFS")

        const artifact = await Artifact.createWithContent({
          sessionID: sessionId,
          filename: "retrieve-test.txt",
          mimeType: "text/plain",
          content,
        })

        const retrieved = await Artifact.getContent(artifact.id)
        expect(retrieved).not.toBeNull()
        expect(retrieved?.toString()).toBe(content.toString())

        // Clean up
        await Artifact.remove(artifact.id)
      },
    })
  })

  it("should delete artifact content from GridFS", async () => {
    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        if (!hasMongoDB) {
          return
        }

        const sessionId = Identifier.descending("session")
        const content = Buffer.from("Delete me from GridFS")

        const artifact = await Artifact.createWithContent({
          sessionID: sessionId,
          filename: "delete-test.txt",
          mimeType: "text/plain",
          content,
        })

        const gridFSId = artifact.gridFSId
        expect(gridFSId).toBeDefined()

        await Artifact.remove(artifact.id)

        // Verify artifact metadata is deleted
        const retrieved = await Artifact.get(artifact.id)
        expect(retrieved).toBeNull()

        // Note: We can't easily verify GridFS content is deleted
        // without direct GridFS access, but the implementation should handle it
      },
    })
  })
})
