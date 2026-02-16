/**
 * GridFS Storage
 *
 * MongoDB GridFS client for storing large file artifacts.
 * Used for artifact content that exceeds normal KV storage limits.
 */

import { MongoClient, Db, GridFSBucket, ObjectId } from "mongodb"
import type { GridFSFile } from "mongodb"
import { Log } from "../util/log"
import { NamedError } from "@opencode-ai/util/error"
import { z } from "zod"

// ============================================================================
// Error Types
// ============================================================================

export const GridFSConnectionError = NamedError.create(
  "GridFSConnectionError",
  z.object({
    uri: z.string(),
    message: z.string(),
  })
)

export const GridFSUploadError = NamedError.create(
  "GridFSUploadError",
  z.object({
    filename: z.string(),
    message: z.string(),
  })
)

export const GridFSDownloadError = NamedError.create(
  "GridFSDownloadError",
  z.object({
    fileId: z.string(),
    message: z.string(),
  })
)

export const GridFSDeleteError = NamedError.create(
  "GridFSDeleteError",
  z.object({
    fileId: z.string(),
    message: z.string(),
  })
)

// ============================================================================
// Types
// ============================================================================

export interface GridFSUploadOptions {
  contentType?: string
  metadata?: Record<string, unknown>
  chunkSizeBytes?: number
}

export interface GridFSFileInfo {
  fileId: string
  filename: string
  length: number
  contentType: string | null
  uploadDate: Date
  metadata: Record<string, unknown> | null
}

// Extended GridFS file with contentType
interface ExtendedGridFSFile extends Omit<GridFSFile, 'contentType' | 'metadata'> {
  contentType?: string
  metadata?: Record<string, unknown> & { contentType?: string }
}

// ============================================================================
// GridFSStorage Class
// ============================================================================

const log = Log.create({ service: "storage.gridfs" })

export class GridFSStorage {
  private client: MongoClient | null = null
  private db: Db | null = null
  private bucket: GridFSBucket | null = null
  private connected = false

  constructor(
    private uri: string,
    private dbName: string,
    private bucketName = "artifacts"
  ) {}

  /**
   * Connect to MongoDB and initialize GridFS bucket
   */
  async connect(): Promise<void> {
    if (this.connected) {
      return
    }

    try {
      this.client = new MongoClient(this.uri)
      await this.client.connect()

      this.db = this.client.db(this.dbName)
      this.bucket = new GridFSBucket(this.db, {
        bucketName: this.bucketName,
      })

      this.connected = true
      log.info("Connected to GridFS", { uri: this.uri, db: this.dbName })
    } catch (error) {
      throw new GridFSConnectionError({
        uri: this.uri,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  /**
   * Disconnect from MongoDB
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close()
      this.client = null
      this.db = null
      this.bucket = null
      this.connected = false
      log.info("Disconnected from GridFS")
    }
  }

  /**
   * Ensure connected, throw error if not
   */
  private ensureConnected(): void {
    if (!this.connected || !this.bucket) {
      throw new Error("GridFS not connected. Call connect() first.")
    }
  }

  /**
   * Upload file to GridFS
   * @returns fileId - The GridFS file ID
   */
  async upload(
    filename: string,
    content: Buffer,
    options?: GridFSUploadOptions
  ): Promise<string> {
    this.ensureConnected()

    try {
      // Build metadata with contentType if provided
      const metadata = {
        ...(options?.metadata || {}),
        ...(options?.contentType ? { contentType: options.contentType } : {}),
      }

      const stream = this.bucket!.openUploadStream(filename, {
        metadata,
        chunkSizeBytes: options?.chunkSizeBytes,
      })

      return new Promise((resolve, reject) => {
        stream.on("error", (error: Error) => {
          log.error("GridFS upload error", { filename, error })
          reject(
            new GridFSUploadError({
              filename,
              message: error.message,
            })
          )
        })

        stream.on("finish", (doc: { _id: { toString: () => string } }) => {
          log.debug("File uploaded to GridFS", { filename, fileId: doc._id.toString() })
          resolve(doc._id.toString())
        })

        stream.end(content)
      })
    } catch (error) {
      throw new GridFSUploadError({
        filename,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  /**
   * Download file from GridFS by ID
   * @returns Buffer content or null if not found
   */
  async download(fileId: string): Promise<Buffer | null> {
    this.ensureConnected()

    try {
      const oid = new ObjectId(fileId)
      const stream = this.bucket!.openDownloadStream(oid)

      return new Promise((resolve, reject) => {
        const chunks: Buffer[] = []

        stream.on("data", (chunk: Buffer) => {
          chunks.push(chunk)
        })

        stream.on("error", (error: Error) => {
          if (error.message.includes("FileNotFound")) {
            log.debug("File not found in GridFS", { fileId })
            resolve(null)
          } else {
            log.error("GridFS download error", { fileId, error })
            reject(
              new GridFSDownloadError({
                fileId,
                message: error.message,
              })
            )
          }
        })

        stream.on("end", () => {
          const content = Buffer.concat(chunks)
          log.debug("File downloaded from GridFS", { fileId, size: content.length })
          resolve(content)
        })
      })
    } catch (error) {
      if (error instanceof Error && error.message.includes("invalid object ID")) {
        return null
      }
      throw new GridFSDownloadError({
        fileId,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  /**
   * Delete file from GridFS by ID
   */
  async delete(fileId: string): Promise<void> {
    this.ensureConnected()

    try {
      const oid = new ObjectId(fileId)
      await this.bucket!.delete(oid)
      log.debug("File deleted from GridFS", { fileId })
    } catch (error) {
      // Ignore FileNotFound errors
      if (error instanceof Error && error.message.includes("FileNotFound")) {
        log.debug("File not found in GridFS (already deleted?)", { fileId })
        return
      }
      throw new GridFSDeleteError({
        fileId,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  /**
   * Get file metadata/info by ID
   */
  async getFileInfo(fileId: string): Promise<GridFSFileInfo | null> {
    this.ensureConnected()

    try {
      const oid = new ObjectId(fileId)
      const file = await this.bucket!.find({ _id: oid }).next() as ExtendedGridFSFile | null

      if (!file) {
        return null
      }

      // Extract contentType from metadata or top-level property
      const contentType = file.contentType || file.metadata?.contentType || null

      return {
        fileId: file._id.toString(),
        filename: file.filename,
        length: file.length,
        contentType,
        uploadDate: file.uploadDate,
        metadata: (file.metadata as Record<string, unknown>) || null,
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes("invalid object ID")) {
        return null
      }
      throw new Error(`Failed to get file info: ${error}`)
    }
  }

  /**
   * Find files by metadata query
   */
  async findByMetadata(query: Record<string, unknown>): Promise<GridFSFileInfo[]> {
    this.ensureConnected()

    try {
      const files = await this.bucket!.find({ metadata: query }).toArray() as ExtendedGridFSFile[]
      return files.map((file) => {
        // Extract contentType from metadata or top-level property
        const contentType = file.contentType || file.metadata?.contentType || null

        return {
          fileId: file._id.toString(),
          filename: file.filename,
          length: file.length,
          contentType,
          uploadDate: file.uploadDate,
          metadata: (file.metadata as Record<string, unknown>) || null,
        }
      })
    } catch (error) {
      throw new Error(`Failed to find files: ${error}`)
    }
  }

  /**
   * Check if connection is active
   */
  isConnected(): boolean {
    return this.connected
  }
}
