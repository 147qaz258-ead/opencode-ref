import { describe, it, expect, beforeAll, afterAll } from "bun:test"
import { MongoStorage } from "@/storage/mongodb"

// Skip tests if MongoDB is not available
const MONGODB_URI = process.env.TEST_MONGODB_URI || "mongodb://localhost:27017"

describe.skipIf(!process.env.TEST_MONGODB_URI)("MongoStorage", () => {
  let storage: MongoStorage

  beforeAll(async () => {
    storage = new MongoStorage({
      uri: MONGODB_URI,
      dbName: "opencode_test",
    })
  })

  afterAll(async () => {
    await storage.close()
  })

  describe("read/write", () => {
    it("should write and read a document", async () => {
      await storage.write("test_collection", "test-id", {
        name: "test",
        value: 123,
      })

      const result = await storage.read<{ name: string; value: number }>(
        "test_collection",
        "test-id"
      )

      expect(result).toBeDefined()
      expect(result?.name).toBe("test")
      expect(result?.value).toBe(123)
    })

    it("should return null for non-existent document", async () => {
      const result = await storage.read("test_collection", "non-existent")

      expect(result).toBeNull()
    })
  })

  describe("list", () => {
    it("should list all documents in collection", async () => {
      await storage.write("test_list", "id1", { name: "item1" })
      await storage.write("test_list", "id2", { name: "item2" })

      const results = await storage.list<{ name: string }>("test_list")

      expect(results.length).toBeGreaterThanOrEqual(2)
    })
  })
})

describe("MongoStorage (without MongoDB)", () => {
  it("should create MongoStorage instance", () => {
    const storage = new MongoStorage({
      uri: "mongodb://localhost:27017",
    })

    expect(storage).toBeDefined()
  })

  it("should have all required methods", () => {
    const storage = new MongoStorage({
      uri: "mongodb://localhost:27017",
    })

    expect(storage).toHaveProperty("connect")
    expect(storage).toHaveProperty("read")
    expect(storage).toHaveProperty("write")
    expect(storage).toHaveProperty("remove")
    expect(storage).toHaveProperty("list")
    expect(storage).toHaveProperty("storeFile")
    expect(storage).toHaveProperty("getFile")
    expect(storage).toHaveProperty("deleteFile")
    expect(storage).toHaveProperty("close")
  })
})
