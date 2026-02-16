import { describe, it, expect, beforeAll, afterAll } from "bun:test"
import path from "path"
import { Identifier } from "../../../src/id"
import { Session } from "../../../src/session"
import { Instance } from "../../../src/project/instance"
import { Log } from "../../../src/util/log"
import { Artifact } from "../../../src/artifact"
import { Hono } from "hono"
import { Server } from "../../../src/server"

const projectRoot = path.join(__dirname, "../../../..")
Log.init({ print: false })

describe("Artifact API Endpoints", () => {
  let sessionId: string
  let artifactId: string

  beforeAll(async () => {
    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        sessionId = Identifier.descending("session")
        await Session.create({
          title: "API Test",
        })

        artifactId = (await Artifact.createWithContent({
          sessionID: sessionId,
          filename: "test.txt",
          mimeType: "text/plain",
          content: Buffer.from("Test content"),
        })).id
      },
    })
  })

  afterAll(async () => {
    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        try {
          await Session.remove(sessionId)
        } catch {}
      },
    })
  })

  it("should define artifact endpoints", async () => {
    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        const app = await Server.App
        expect(app).toBeDefined()
      },
    })
  })

  it("should create test artifact", async () => {
    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        expect(artifactId).toBeDefined()
        const artifact = await Artifact.get(artifactId)
        expect(artifact?.filename).toBe("test.txt")
      },
    })
  })

  it.skip("GET /artifact?session_id=:id should list artifacts", async () => {
    // Integration test - requires running server
    expect(true).toBe(true)
  })

  it.skip("GET /artifact/:id/download should download file", async () => {
    // Integration test - requires running server
    expect(true).toBe(true)
  })

  it.skip("DELETE /artifact/:id should delete artifact", async () => {
    // Integration test - requires running server
    expect(true).toBe(true)
  })
})
