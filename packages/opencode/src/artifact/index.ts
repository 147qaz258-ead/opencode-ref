/**
 * Artifact 模型
 *
 * 表示从沙箱容器导出的文件产出物（Artifact）。
 * 存储在 MongoDB GridFS 中，以实现独立于容器生命周期的持久化。
 */

import { z } from "zod"
import { Identifier } from "../id"
import { Storage } from "../storage/storage"
import { NamedError } from "@opencode-ai/util/error"
import { GridFSStorage } from "../storage/gridfs"
import { Log } from "../util/log"

const log = Log.create({ service: "artifact" })

// 全局 GridFS 实例 (单例)
let gridFSInstance: GridFSStorage | null = null

/**
 * 获取或初始化 GridFS 存储实例
 */
async function getGridFS(): Promise<GridFSStorage> {
  if (!gridFSInstance) {
    const mongoUri = process.env.MONGODB_URI || "mongodb://localhost:27017"
    const dbName = process.env.MONGODB_DBNAME || "opencode"

    gridFSInstance = new GridFSStorage(mongoUri, dbName)
    await gridFSInstance.connect()
  }
  return gridFSInstance
}

// ============================================================================
// Schema 定义 (数据结构校验)
// ============================================================================

/**
 * 产出物类别
 */
export const ArtifactCategory = z.enum([
  "document", // 文档
  "image",    // 图片
  "video",    // 视频
  "code",     // 代码
  "other",    // 其他
])

export type ArtifactCategory = z.infer<typeof ArtifactCategory>

/**
 * 存储类型
 */
export const ArtifactStorageType = z.enum(["gridfs"])

export type ArtifactStorageType = z.infer<typeof ArtifactStorageType>

/**
 * 产出物元数据
 */
export const ArtifactMetadata = z.object({
  category: ArtifactCategory.optional(), // 类别
  exported: z.boolean().optional(),       // 是否已导出
  tags: z.array(z.string()).optional(),   // 标签
  temporary: z.boolean().optional(),      // 是否为临时文件
})

export type ArtifactMetadata = z.infer<typeof ArtifactMetadata>

/**
 * 产出物详情信息
 */
export const ArtifactInfo = z.object({
  id: z.string(),                         // 唯一标识符
  sessionID: z.string(),                  // 关联的会话 ID
  filename: z.string(),                   // 文件名
  mimeType: z.string(),                   // MIME 类型
  size: z.number(),                       // 文件大小 (字节)
  storageType: ArtifactStorageType,       // 存储类型 (目前仅支持 gridfs)
  gridFSId: z.string().optional(),        // GridFS 中的文件 ID
  containerPath: z.string().optional(),   // 在容器内的原始路径
  createdAt: z.number(),                  // 创建时间戳
  metadata: ArtifactMetadata.optional(),  // 扩展元数据
})

export type ArtifactInfo = z.infer<typeof ArtifactInfo>

// ============================================================================
// 错误类型定义
// ============================================================================

/**
 * 未找到产出物错误
 */
export const ArtifactNotFoundError = NamedError.create(
  "ArtifactNotFound",
  z.object({
    artifactId: z.string(),
  })
)

/**
 * 存储操作错误
 */
export const ArtifactStorageError = NamedError.create(
  "ArtifactStorageError",
  z.object({
    operation: z.string(),
    message: z.string(),
  })
)

// ============================================================================
// Artifact 命名空间 (核心逻辑)
// ============================================================================

export namespace Artifact {
  /**
   * 创建一个新的产出物记录
   */
  export async function create(input: {
    id?: string
    sessionID: string
    filename: string
    mimeType: string
    size: number
    storageType: ArtifactStorageType
    gridFSId?: string
    containerPath?: string
    metadata?: ArtifactMetadata
  }): Promise<ArtifactInfo> {
    const id = input.id || Identifier.descending("artifact")
    const now = Date.now()

    const info: ArtifactInfo = {
      id,
      sessionID: input.sessionID,
      filename: input.filename,
      mimeType: input.mimeType,
      size: input.size,
      storageType: input.storageType,
      gridFSId: input.gridFSId,
      containerPath: input.containerPath,
      createdAt: now,
      metadata: input.metadata,
    }

    // 写入 KV 存储 (通用元数据存储)
    const key = ["artifact", id]
    await Storage.write(key, info)

    // 将产出物 ID 添加到会话的产出物列表中
    const sessionArtifactsKey = ["session", input.sessionID, "artifacts"]
    await Storage.update(sessionArtifactsKey, (draft) => {
      if (!draft) {
        draft = [] as string[]
      }
      ;(draft as string[]).push(id)
      return draft
    }).catch(() => {
      // 如果更新失败 (键不存在), 则写入初始数组
      return Storage.write(sessionArtifactsKey, [id])
    })

    return info
  }

  /**
   * 根据 ID 获取产出物详情
   */
  export async function get(id: string): Promise<ArtifactInfo | null> {
    const key = ["artifact", id]
    try {
      return await Storage.read<ArtifactInfo>(key)
    } catch {
      return null
    }
  }

  /**
   * 根据会话 ID 列出该会话下的所有产出物
   */
  export async function listBySession(sessionID: string): Promise<ArtifactInfo[]> {
    const sessionArtifactsKey = ["session", sessionID, "artifacts"]

    try {
      const artifactIds = await Storage.read<string[]>(sessionArtifactsKey)
      const artifacts: ArtifactInfo[] = []

      for (const id of artifactIds || []) {
        const artifact = await Artifact.get(id)
        if (artifact) {
          artifacts.push(artifact)
        }
      }

      // 按创建时间升序排列
      return artifacts.sort((a, b) => a.createdAt - b.createdAt)
    } catch {
      return []
    }
  }

  /**
   * 创建包含内容的产出物 (直接上传到 GridFS)
   * 这是创建带有实际文件内容的产出物的推荐方式
   */
  export async function createWithContent(input: {
    id?: string
    sessionID: string
    filename: string
    mimeType: string
    content: Buffer
    containerPath?: string
    metadata?: ArtifactMetadata
  }): Promise<ArtifactInfo> {
    const gridFS = await getGridFS()
    const id = input.id || Identifier.descending("artifact")

    // 将内容上传到 GridFS
    const gridFSId = await gridFS.upload(
      `${id}_${input.filename}`,
      input.content,
      {
        contentType: input.mimeType,
        metadata: {
          artifactId: id,
          sessionId: input.sessionID,
          containerPath: input.containerPath,
          ...input.metadata,
        },
      }
    )

    log.info("Uploaded content to GridFS", {
      artifactId: id,
      gridFSId,
      filename: input.filename,
      size: input.content.length,
    })

    // 创建带有 GridFS ID 的产出物记录
    return await Artifact.create({
      id,
      sessionID: input.sessionID,
      filename: input.filename,
      mimeType: input.mimeType,
      size: input.content.length,
      storageType: "gridfs",
      gridFSId,
      containerPath: input.containerPath,
      metadata: input.metadata,
    })
  }

  /**
   * 从 GridFS 获取产出物内容
   * @returns Buffer 内容，如果未找到则返回 null
   */
  export async function getContent(id: string): Promise<Buffer | null> {
    const artifact = await Artifact.get(id)
    if (!artifact) {
      return null
    }

    if (!artifact.gridFSId) {
      log.warn("Artifact has no gridFSId", { artifactId: id })
      return null
    }

    const gridFS = await getGridFS()
    const content = await gridFS.download(artifact.gridFSId)

    if (content) {
      log.debug("Retrieved content from GridFS", {
        artifactId: id,
        size: content.length,
      })
    }

    return content
  }

  /**
   * 删除产出物
   */
  export async function remove(id: string): Promise<void> {
    // 获取产出物以找到对应的 sessionID
    const artifact = await Artifact.get(id)
    if (!artifact) {
      throw new ArtifactNotFoundError({ artifactId: id })
    }

    // 从 KV 存储中移除元数据
    const key = ["artifact", id]
    await Storage.remove(key)

    // 从会话的产出物列表中移除
    const sessionArtifactsKey = ["session", artifact.sessionID, "artifacts"]
    await Storage.update(sessionArtifactsKey, (draft) => {
      if (!draft) return []
      return (draft as string[]).filter((aid: string) => aid !== id)
    }).catch(() => {
      // 静默忽略更新失败的情况
    })

    // 如果存在 GridFS ID，则从 GridFS 中删除实际内容
    if (artifact.gridFSId) {
      try {
        const gridFS = await getGridFS()
        await gridFS.delete(artifact.gridFSId)
        log.info("Deleted content from GridFS", {
          artifactId: id,
          gridFSId: artifact.gridFSId,
        })
      } catch (error) {
        // 记录错误但不中断删除操作
        log.warn("Failed to delete from GridFS", {
          artifactId: id,
          gridFSId: artifact.gridFSId,
          error,
        })
      }
    }
  }
}
