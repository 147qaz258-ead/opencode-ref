/**
 * MongoDB Storage Layer
 *
 * Cloud-native storage for SaaS deployment.
 * Replaces file-based JSON storage with MongoDB.
 */

import { Log } from "@/util/log"
import { MongoClient, Db, Collection, GridFSBucket, ObjectId, type Filter, type WithId } from "mongodb"

const log = Log.create({ service: "storage.mongodb" })

export interface MongoConfig {
  uri: string
  dbName?: string
}

/**
 * Base document interface for MongoDB storage
 * Allows _id to be either ObjectId or string
 */
export interface StorageDocument {
  _id?: ObjectId | string
  [key: string]: any
}

/**
 * MongoDB storage manager
 */
export class MongoStorage {
  private client: MongoClient | null = null
  private db: Db | null = null
  private gridfs: GridFSBucket | null = null
  private connected = false

  constructor(private config: MongoConfig) {}

  /**
   * Connect to MongoDB
   */
  async connect(): Promise<void> {
    if (this.connected) return

    log.info("Connecting to MongoDB", { uri: this.config.uri })

    this.client = new MongoClient(this.config.uri, {
      maxPoolSize: 10,
      minPoolSize: 2,
      maxIdleTimeMS: 60000,
    })

    await this.client.connect()
    this.db = this.client.db(this.config.dbName || "opencode")
    this.gridfs = new GridFSBucket(this.db)
    this.connected = true

    log.info("Connected to MongoDB", { dbName: this.db.databaseName })
  }

  /**
   * Get collection
   */
  private collection<T extends StorageDocument>(name: string): Collection<T> {
    if (!this.db) {
      throw new Error("MongoDB not connected")
    }
    return this.db.collection<T>(name)
  }

  /**
   * Read a document
   */
  async read<T extends StorageDocument>(collection: string, id: string): Promise<T | null> {
    await this.connect()

    try {
      const oid = new ObjectId(id)
      const filter: Filter<T> = { _id: oid } as Filter<T>
      const doc = await this.collection<T>(collection).findOne(filter)
      if (!doc) return null
      // Convert ObjectId to string in returned document
      return this.convertIdToString(doc) as T
    } catch (error) {
      // If invalid ObjectId format, try as string
      if (error instanceof Error && error.message.includes("invalid object ID")) {
        const filter: Filter<T> = { _id: id } as Filter<T>
        const doc = await this.collection<T>(collection).findOne(filter)
        if (!doc) return null
        return doc as T
      }
      throw error
    }
  }

  /**
   * Write a document
   */
  async write<T extends StorageDocument>(collection: string, id: string, data: Omit<T, '_id'>): Promise<void> {
    await this.connect()

    try {
      const oid = new ObjectId(id)
      const filter: Filter<T> = { _id: oid } as Filter<T>
      await this.collection<T>(collection).updateOne(
        filter,
        { $set: { ...data, _id: oid } },
        { upsert: true }
      )
    } catch (error) {
      // If invalid ObjectId format, try as string
      if (error instanceof Error && error.message.includes("invalid object ID")) {
        const filter: Filter<T> = { _id: id } as Filter<T>
        await this.collection<T>(collection).updateOne(
          filter,
          { $set: { ...data, _id: id } },
          { upsert: true }
        )
        return
      }
      throw error
    }

    log.debug("Document written", { collection, id })
  }

  /**
   * Remove a document
   */
  async remove(collection: string, id: string): Promise<void> {
    await this.connect()

    try {
      const oid = new ObjectId(id)
      await this.collection(collection).deleteOne({ _id: oid } as Filter<any>)
    } catch (error) {
      // If invalid ObjectId format, try as string
      if (error instanceof Error && error.message.includes("invalid object ID")) {
        await this.collection(collection).deleteOne({ _id: id } as Filter<any>)
        return
      }
      throw error
    }

    log.debug("Document removed", { collection, id })
  }

  /**
   * List documents with optional filter
   */
  async list<T extends StorageDocument>(collection: string, filter: Filter<T> = {} as Filter<T>): Promise<T[]> {
    await this.connect()

    const docs = await this.collection<T>(collection).find(filter).toArray()
    return docs.map(doc => this.convertIdToString(doc) as T)
  }

  /**
   * Convert ObjectId _id to string for client compatibility
   */
  private convertIdToString<T>(doc: WithId<T>): T {
    const result = { ...doc }
    if (result._id instanceof ObjectId) {
      ;(result as any)._id = result._id.toString()
    }
    return result
  }

  /**
   * Store large file in GridFS
   */
  async storeFile(
    filename: string,
    data: Buffer,
    metadata?: Record<string, unknown>
  ): Promise<string> {
    await this.connect()

    if (!this.gridfs) {
      throw new Error("GridFS not initialized")
    }

    const uploadStream = this.gridfs.openUploadStream(filename, {
      metadata,
    })

    return new Promise<string>((resolve, reject) => {
      const chunks: Buffer[] = []
      const writable = uploadStream as unknown as { write: (chunk: Buffer) => void }

      writable.write(data)
      uploadStream.end()

      uploadStream.on("error", (error: Error) => {
        reject(error)
      })

      uploadStream.on("finish", (doc: { _id: { toString: () => string } }) => {
        const id = doc._id.toString()
        log.info("File stored in GridFS", { filename, id })
        resolve(id)
      })
    })
  }

  /**
   * Retrieve file from GridFS
   */
  async getFile(id: string): Promise<{ data: Buffer; filename: string; metadata: Record<string, unknown> } | null> {
    await this.connect()

    if (!this.gridfs) {
      throw new Error("GridFS not initialized")
    }

    const downloadStream = this.gridfs.openDownloadStreamByName(id)

    const chunks: Buffer[] = []

    try {
      const file = await new Promise<{ filename: string; metadata: Record<string, unknown> } | null>((resolve) => {
        this.gridfs!.find({ filename: id }).limit(1).toArray((err, files) => {
          if (err) resolve(null)
          else resolve(files[0] ? { filename: files[0].filename, metadata: files[0].metadata || {} } : null)
        })
      })

      if (!file) {
        return null
      }

      await new Promise<void>((resolve, reject) => {
        downloadStream.on("data", (chunk: Buffer) => chunks.push(chunk))
        downloadStream.on("error", reject)
        downloadStream.on("end", resolve)
      })

      return {
        data: Buffer.concat(chunks),
        filename: file.filename,
        metadata: file.metadata,
      }
    } catch (error) {
      log.error("Failed to retrieve file from GridFS", { id, error })
      return null
    }
  }

  /**
   * Delete file from GridFS
   */
  async deleteFile(id: string): Promise<void> {
    await this.connect()

    if (!this.gridfs) {
      throw new Error("GridFS not initialized")
    }

    try {
      const oid = new ObjectId(id)
      await this.gridfs.delete(oid)
    } catch (error) {
      // If invalid ObjectId format, try to find by filename
      if (error instanceof Error && error.message.includes("invalid object ID")) {
        await this.gridfs.delete(id)
      }
      throw error
    }

    log.info("File deleted from GridFS", { id })
  }

  /**
   * Close connection
   */
  async close(): Promise<void> {
    if (this.client) {
      await this.client.close()
      this.client = null
      this.db = null
      this.gridfs = null
      this.connected = false

      log.info("MongoDB connection closed")
    }
  }
}

// Global instance
let globalStorage: MongoStorage | null = null

/**
 * Get MongoDB storage instance
 */
export function getMongoStorage(config?: MongoConfig): MongoStorage {
  if (!globalStorage) {
    const uri = config?.uri || process.env.MONGODB_URI || "mongodb://localhost:27017"
    globalStorage = new MongoStorage({ uri })
  }
  return globalStorage
}

/**
 * Close MongoDB storage
 */
export async function closeMongoStorage(): Promise<void> {
  if (globalStorage) {
    await globalStorage.close()
    globalStorage = null
  }
}
