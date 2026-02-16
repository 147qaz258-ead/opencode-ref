import { describe, it, expect, beforeAll, afterAll } from "bun:test"
import { GridFSStorage } from "../../src/storage/gridfs"

describe("GridFS Storage", () => {
  const mongoUri = process.env.MONGODB_URI || "mongodb://localhost:27017"
  const dbName = "opencode_test"

  let gridfs: GridFSStorage

  beforeAll(async () => {
    // Skip tests if MongoDB is not available
    if (!process.env.MONGODB_URI) {
      console.warn("Skipping GridFS tests - MONGODB_URI not set")
      return
    }

    gridfs = new GridFSStorage(mongoUri, dbName)
    await gridfs.connect()
  })

  afterAll(async () => {
    if (gridfs) {
      await gridfs.disconnect()
    }
  })

  it("should upload file to GridFS", async () => {
    if (!process.env.MONGODB_URI) return

    const filename = "test-file.txt"
    const content = Buffer.from("Hello, GridFS!")

    const fileId = await gridfs.upload(filename, content, {
      contentType: "text/plain",
      metadata: { test: true },
    })

    expect(fileId).toBeDefined()
    expect(typeof fileId).toBe("string")
  })

  it("should download file from GridFS", async () => {
    if (!process.env.MONGODB_URI) return

    const filename = "test-download.txt"
    const content = Buffer.from("Download test content")

    const fileId = await gridfs.upload(filename, content, {
      contentType: "text/plain",
    })

    const downloaded = await gridfs.download(fileId)
    expect(downloaded.toString()).toBe(content.toString())
  })

  it("should delete file from GridFS", async () => {
    if (!process.env.MONGODB_URI) return

    const filename = "test-delete.txt"
    const content = Buffer.from("Delete me")

    const fileId = await gridfs.upload(filename, content)

    await gridfs.delete(fileId)

    // Verify file is deleted
    const downloaded = await gridfs.download(fileId)
    expect(downloaded).toBeNull()
  })

  it("should get file metadata", async () => {
    if (!process.env.MONGODB_URI) return

    const filename = "test-metadata.txt"
    const content = Buffer.from("Metadata test")
    const metadata = { category: "test", tags: ["sample"] }

    const fileId = await gridfs.upload(filename, content, {
      contentType: "text/plain",
      metadata,
    })

    const info = await gridfs.getFileInfo(fileId)
    expect(info).toBeDefined()
    expect(info?.filename).toBe(filename)
    expect(info?.length).toBe(content.length)
    expect(info?.metadata).toEqual(metadata)
  })
})
