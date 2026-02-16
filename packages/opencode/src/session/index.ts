import { BusEvent } from "@/bus/bus-event"
import { Bus } from "@/bus"
import { Decimal } from "decimal.js"
import z from "zod"
import { type LanguageModelUsage, type ProviderMetadata } from "ai"
import { Config } from "../config/config"
import { Flag } from "../flag/flag"
import { Identifier } from "../id/id"
import { Installation } from "../installation"

import { Storage } from "../storage/storage"
import { Log } from "../util/log"
import { MessageV2 } from "./message-v2"
import { Instance } from "../project/instance"
import { SessionPrompt } from "./prompt"
import { fn } from "@/util/fn"
import { Command } from "../command"
import { Snapshot } from "@/snapshot"

import type { Provider } from "@/provider/provider"
import { PermissionNext } from "@/permission/next"

export namespace Session {
  const log = Log.create({ service: "session" })

  const parentTitlePrefix = "New session - "
  const childTitlePrefix = "Child session - "

  /**
   * Default workspace directory in sandbox containers
   * In sandbox mode, all file operations are relative to this directory
   * For manus-sandbox: /home/ubuntu is writable home directory
   */
  export const DEFAULT_WORKSPACE = "/home/ubuntu"

  function createDefaultTitle(isChild = false) {
    return (isChild ? childTitlePrefix : parentTitlePrefix) + new Date().toISOString()
  }

  export function isDefaultTitle(title: string) {
    return new RegExp(
      `^(${parentTitlePrefix}|${childTitlePrefix})\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$`,
    ).test(title)
  }

  export const Info = z
    .object({
      id: Identifier.schema("session"),
      projectID: z.string(),
      /** User ID from authentication (Google OAuth, etc.) */
      userId: z.string().optional(),
      // directory is now OPTIONAL (for internal use, workspace path in container)
      directory: z.string().optional(),
      parentID: Identifier.schema("session").optional(),
      summary: z
        .object({
          additions: z.number(),
          deletions: z.number(),
          files: z.number(),
          diffs: Snapshot.FileDiff.array().optional(),
        })
        .optional(),
      share: z
        .object({
          url: z.string(),
        })
        .optional(),
      title: z.string(),
      version: z.string(),
      // mode defaults to "sandbox" for new sessions
      mode: z.enum(["sandbox"]).optional(),
      // Sandbox-specific fields
      sandboxId: z.string().optional(),
      /** @deprecated Use UserContainerManager */
      sandboxHost: z.string().optional(),
      /** @deprecated Use UserContainerManager */
      sandboxPort: z.number().optional(),
      sandboxStatus: z.enum(["pending", "starting", "running", "stopping", "stopped", "hibernated", "error"]).optional(),
      vncUrl: z.string().optional(),
      artifactIds: z.string().array().optional(),
      time: z.object({
        created: z.number(),
        updated: z.number(),
        compacting: z.number().optional(),
        archived: z.number().optional(),
      }),
      permission: PermissionNext.Ruleset.optional(),
      revert: z
        .object({
          messageID: z.string(),
          partID: z.string().optional(),
          snapshot: z.string().optional(),
          diff: z.string().optional(),
        })
        .optional(),
    })
    .meta({
      ref: "Session",
    })
  export type Info = z.output<typeof Info>

  export const ShareInfo = z
    .object({
      secret: z.string(),
      url: z.string(),
    })
    .meta({
      ref: "SessionShare",
    })
  export type ShareInfo = z.output<typeof ShareInfo>

  export const Event = {
    Created: BusEvent.define(
      "session.created",
      z.object({
        info: Info,
      }),
    ),
    Updated: BusEvent.define(
      "session.updated",
      z.object({
        info: Info,
      }),
    ),
    Deleted: BusEvent.define(
      "session.deleted",
      z.object({
        info: Info,
      }),
    ),
    Diff: BusEvent.define(
      "session.diff",
      z.object({
        sessionID: z.string(),
        diff: Snapshot.FileDiff.array(),
      }),
    ),
    Error: BusEvent.define(
      "session.error",
      z.object({
        sessionID: z.string().optional(),
        error: MessageV2.Assistant.shape.error,
      }),
    ),
  }

  export const create = fn(
    z
      .object({
        parentID: Identifier.schema("session").optional(),
        title: z.string().optional(),
        mode: z.enum(["sandbox"]).optional(),
        permission: Info.shape.permission,
        userId: z.string().optional(),
      })
      .optional(),
    async (input) => {
      return createNext({
        parentID: input?.parentID,
        directory: undefined, // Sandbox mode - no local directory required
        title: input?.title,
        permission: input?.permission,
        userId: input?.userId,
      })
    },
  )

  export const fork = fn(
    z.object({
      sessionID: Identifier.schema("session"),
      messageID: Identifier.schema("message").optional(),
      userId: z.string().optional(),
    }),
    async (input) => {
      const session = await createNext({
        directory: undefined, // Sandbox mode - no local directory required
        userId: input.userId,
      })
      const msgs = await messages({ sessionID: input.sessionID })
      for (const msg of msgs) {
        if (input.messageID && msg.info.id >= input.messageID) break
        const cloned = await updateMessage({
          ...msg.info,
          sessionID: session.id,
          id: Identifier.ascending("message"),
        })

        for (const part of msg.parts) {
          await updatePart({
            ...part,
            id: Identifier.ascending("part"),
            messageID: cloned.id,
            sessionID: session.id,
          })
        }
      }
      return session
    },
  )

  export async function touch(sessionID: string, userId?: string) {
    await update(sessionID, (draft) => {
      draft.time.updated = Date.now()
    }, userId)
  }


  export async function createNext(input: {
    id?: string
    title?: string
    parentID?: string
    directory?: string // Now optional
    permission?: PermissionNext.Ruleset
    userId?: string
  }) {
    // Try to get userId from context first (for multi-user support)
    const { getCurrentUserId, getSessionStoragePath, getProjectIdForUser, withUserContext } = await import("../server/middleware/user-context")
    const contextUserId = getCurrentUserId()
    const finalUserId = input.userId ?? contextUserId

    return withUserContext({ userId: finalUserId, authenticated: true }, async () => {
      // Use user-scoped project ID for proper isolation
      const projectId = getProjectIdForUser(finalUserId)

      const result: Info = {
        id: Identifier.descending("session", input.id),
        version: Installation.VERSION,
        projectID: projectId, // Use user-scoped project ID
        userId: finalUserId, // Use context userId with parameter as fallback
        directory: input.directory, // Can be undefined
        parentID: input.parentID,
        title: input.title ?? createDefaultTitle(!!input.parentID),
        permission: input.permission,
        mode: "sandbox", // Default to sandbox mode
        artifactIds: [], // Initialize empty artifact list
        time: {
          created: Date.now(),
          updated: Date.now(),
        },
      }
      log.info("created", result)

      // Use user-scoped storage path
      const sessionPath = getSessionStoragePath(finalUserId, result.id)
      await Storage.write(sessionPath, result)

      Bus.publish(Event.Created, {
        info: result,
      })
      const cfg = await Config.get()
      if (!result.parentID && (Flag.OPENCODE_AUTO_SHARE || cfg.share === "auto")) {
        share(result.id)
          .then(async (share) => {
            await update(result.id, (draft) => {
              draft.share = share
            })
          })
          .catch(() => {
            // Silently ignore sharing errors during session creation
          })
      }

      Bus.publish(Event.Updated, {
        info: result,
      })

      // Try to get container/sandbox (with retry)
      const { getUserContainerForSession, updateUserActivity, scheduleContainerRetry } = await import("./docker")

      const sandboxBackend = (process.env.SANDBOX_BACKEND as "docker" | "e2b") || "docker"

      // ========================================
      // E2B BACKEND
      // ========================================
      if (sandboxBackend === "e2b") {
        try {
          const { getE2BManager } = await import("../container/e2b-lifecycle")
          const e2bManager = getE2BManager()

          const e2bSandbox = await e2bManager.getOrCreateSandbox({
            userId: projectId, // Use user-scoped projectID as user identifier
          })

          await update(result.id, (draft) => {
            draft.sandboxId = e2bSandbox.sandboxId
            draft.sandboxStatus = e2bSandbox.status
          })
        } catch (error) {
          log.error("E2B sandbox initialization exception", {
            sessionId: result.id,
            error: error instanceof Error ? error.message : String(error),
          })
          // Set status to pending, don't fail session creation
          await update(result.id, (draft) => {
            draft.sandboxStatus = "pending"
            draft.sandboxId = undefined
          })
        }

        // Update user activity
        updateUserActivity(projectId).catch(() => {
          // Ignore activity update errors
        })

        return result
      }

      // ========================================
      // DOCKER BACKEND (original code)
      // ========================================
      let container: Awaited<ReturnType<typeof getUserContainerForSession>> | null = null

      try {
        // Try to get container with reduced initial retries
        container = await getUserContainerForSession(result, 2)
      } catch (error) {
        log.warn("Container initialization error, will retry in background", {
          sessionId: result.id,
          error: error instanceof Error ? error.message : String(error),
        })
      }

      // ========================================
      // DOCKER BACKEND CONTINUES
      // ========================================
      if (container) {
        await update(result.id, (draft) => {
          draft.sandboxId = container.containerId
          draft.sandboxStatus = container.status
        })
        log.info("Container bound to session", {
          sessionId: result.id,
          containerId: container.containerId,
          host: container.host,
          apiPort: container.apiPort,
          status: container.status,
        })
      } else {
        // Set status to pending, don't fail session creation
        await update(result.id, (draft) => {
          draft.sandboxStatus = "pending"
          draft.sandboxId = undefined
        })
        log.info("Container not ready, session created with pending status", {
          sessionId: result.id,
        })

        // Schedule background retry (don't await)
        scheduleContainerRetry(result.id, finalUserId).catch(() => { })
      }

      // Update user activity
      updateUserActivity(projectId).catch(() => {
        // Ignore activity update errors
      })

      // Return the most up-to-date session info
      return (await get(result.id)) ?? result
    })
  }


  export async function get(id: string, userId?: string) {
    try {
      // Use getSessionStoragePath for user-isolated storage
      const { getCurrentUserId, getSessionStoragePath } = await import("../server/middleware/user-context")
      const finalUserId = userId || getCurrentUserId()
      const sessionPath = getSessionStoragePath(finalUserId, id)

      log.info("Session.get: reading from storage", { userId: finalUserId, id, sessionPath })

      const data = await Storage.read<Info>(sessionPath)
      if (!data) {
        log.warn("session not found in storage", { userId: finalUserId, id, sessionPath })
      }
      return data
    } catch (e) {
      log.error("Session.get: failed to read session", { userId, id, error: e instanceof Error ? e.stack : String(e) })
      // Return null for non-existent sessions
      return null
    }
  }

// Add schema for validation in server routes
get.schema = Identifier.schema("session")


  export const getShare = fn(Identifier.schema("session"), async (id) => {
    return Storage.read<ShareInfo>(["share", id])
  })

  export const share = fn(Identifier.schema("session"), async (id) => {
    const cfg = await Config.get()
    if (cfg.share === "disabled") {
      throw new Error("Sharing is disabled in configuration")
    }
    const { ShareNext } = await import("@/share/share-next")
    const share = await ShareNext.create(id)
    await update(id, (draft) => {
      draft.share = {
        url: share.url,
      }
    })
    return share
  })

  export const unshare = fn(Identifier.schema("session"), async (id) => {
    // Use ShareNext to remove share (same as share function uses ShareNext to create)
    const { ShareNext } = await import("@/share/share-next")
    await ShareNext.remove(id)
    await update(id, (draft) => {
      draft.share = undefined
    })
  })

  export async function update(id: string, editor: (session: Info) => void, userId?: string) {
    const { getCurrentUserId, getSessionStoragePath } = await import("../server/middleware/user-context")
    const finalUserId = userId || getCurrentUserId()
    const sessionPath = getSessionStoragePath(finalUserId, id)

    const result = await Storage.update<Info>(sessionPath, (draft) => {
      editor(draft)
      draft.time.updated = Date.now()
    })
    Bus.publish(Event.Updated, {
      info: result,
    })
    return result
  }


  export const diff = fn(Identifier.schema("session"), async (sessionID) => {
    const diffs = await Storage.read<Snapshot.FileDiff[]>(["session_diff", sessionID])
    return diffs ?? []
  })

  export const messages = fn(
    z.object({
      sessionID: Identifier.schema("session"),
      limit: z.number().optional(),
    }),
    async (input) => {
      const result = [] as MessageV2.WithParts[]
      for await (const msg of MessageV2.stream(input.sessionID)) {
        if (input.limit && result.length >= input.limit) break
        result.push(msg)
      }
      result.reverse()
      return result
    },
  )

  export async function* list() {
    // Use user-scoped project ID for multi-user isolation
    const { getCurrentUserId, getProjectIdForUser } = await import("../server/middleware/user-context")
    const userId = getCurrentUserId()
    const projectId = getProjectIdForUser(userId)

    // List sessions from user-scoped project
    const currentProjectItems = await Storage.list(["session", projectId])

    const yieldedIds = new Set<string>()

    for (const item of currentProjectItems) {
      try {
        const session = await Storage.read<Info>(item)
        yieldedIds.add(session.id)
        yield session
      } catch (e: any) {}
    }

    // Also list sessions from "global" project for backward compatibility
    if (projectId !== "global") {
      const globalItems = await Storage.list(["session", "global"])

      for (const item of globalItems) {
        try {
          const session = await Storage.read<Info>(item)
          // Skip if already yielded from current project
          if (yieldedIds.has(session.id)) {
            continue
          }
          yield session
        } catch (e: any) {}
      }
    }
  }

  export const children = fn(Identifier.schema("session"), async (parentID) => {
    const { getCurrentUserId, getProjectIdForUser } = await import("../server/middleware/user-context")
    const userId = getCurrentUserId()
    const projectId = getProjectIdForUser(userId)

    const result = [] as Session.Info[]
    for (const item of await Storage.list(["session", projectId])) {
      const session = await Storage.read<Info>(item).catch(() => undefined)
      if (!session) continue
      if (session.parentID !== parentID) continue
      result.push(session)
    }
    return result
  })

    export const remove = fn(Identifier.schema("session"), async (sessionID) => {
    // Use getSessionStoragePath for user-isolated storage
    const { getCurrentUserId, getSessionStoragePath } = await import("../server/middleware/user-context")
    const userId = getCurrentUserId()
    const sessionPath = getSessionStoragePath(userId, sessionID)

    try {
      const session = await get(sessionID)
      if (!session) {
        log.warn("session not found for removal", { sessionID })
        return
      }

      // Cancel any pending container retries for this session
      const { cancelContainerRetry } = await import("./docker")
      cancelContainerRetry(sessionID)

      // Note: User container is NOT destroyed when session is removed
      // It persists across sessions and is managed by UserContainerManager

      for (const child of await children(sessionID)) {
        await remove(child.id)
      }
      await unshare(sessionID).catch(() => {})
      for (const msg of await Storage.list(["message", sessionID])) {
        for (const part of await Storage.list(["part", msg.at(-1)!])) {
          await Storage.remove(part)
        }
        await Storage.remove(msg)
      }
      await Storage.remove(sessionPath)
      Bus.publish(Event.Deleted, {
        info: session,
      })
    } catch (e: any) {
      log.error("Failed to remove session", { sessionID, error: e.message, stack: e.stack })
      throw new Error("Failed to delete session " + sessionID + ": " + e.message)
    }
  })

  export const updateMessage = fn(MessageV2.Info, async (msg) => {
    await Storage.write(["message", msg.sessionID, msg.id], msg)
    Bus.publish(MessageV2.Event.Updated, {
      info: msg,
    })
    return msg
  })

  export const removeMessage = fn(
    z.object({
      sessionID: Identifier.schema("session"),
      messageID: Identifier.schema("message"),
    }),
    async (input) => {
      await Storage.remove(["message", input.sessionID, input.messageID])
      Bus.publish(MessageV2.Event.Removed, {
        sessionID: input.sessionID,
        messageID: input.messageID,
      })
      return input.messageID
    },
  )

  export const removePart = fn(
    z.object({
      sessionID: Identifier.schema("session"),
      messageID: Identifier.schema("message"),
      partID: Identifier.schema("part"),
    }),
    async (input) => {
      await Storage.remove(["part", input.messageID, input.partID])
      Bus.publish(MessageV2.Event.PartRemoved, {
        sessionID: input.sessionID,
        messageID: input.messageID,
        partID: input.partID,
      })
      return input.partID
    },
  )

  const UpdatePartInput = z.union([
    MessageV2.Part,
    z.object({
      part: MessageV2.TextPart,
      delta: z.string(),
    }),
    z.object({
      part: MessageV2.ReasoningPart,
      delta: z.string(),
    }),
  ])

  export const updatePart = fn(UpdatePartInput, async (input) => {
    const part = "delta" in input ? input.part : input
    const delta = "delta" in input ? input.delta : undefined
    await Storage.write(["part", part.messageID, part.id], part)
    Bus.publish(MessageV2.Event.PartUpdated, {
      part,
      delta,
    })
    return part
  })

  export const getUsage = fn(
    z.object({
      model: z.custom<Provider.Model>(),
      usage: z.custom<LanguageModelUsage>(),
      metadata: z.custom<ProviderMetadata>().optional(),
    }),
    (input) => {
      const cachedInputTokens = input.usage.cachedInputTokens ?? 0
      const excludesCachedTokens = !!(input.metadata?.["anthropic"] || input.metadata?.["bedrock"])
      const adjustedInputTokens = excludesCachedTokens
        ? (input.usage.inputTokens ?? 0)
        : (input.usage.inputTokens ?? 0) - cachedInputTokens
      const safe = (value: number) => {
        if (!Number.isFinite(value)) return 0
        return value
      }

      const tokens = {
        input: safe(adjustedInputTokens),
        output: safe(input.usage.outputTokens ?? 0),
        reasoning: safe(input.usage?.reasoningTokens ?? 0),
        cache: {
          write: safe(
            (input.metadata?.["anthropic"]?.["cacheCreationInputTokens"] ??
              // @ts-expect-error
              input.metadata?.["bedrock"]?.["usage"]?.["cacheWriteInputTokens"] ??
              0) as number,
          ),
          read: safe(cachedInputTokens),
        },
      }

      const costInfo =
        input.model.cost?.experimentalOver200K && tokens.input + tokens.cache.read > 200_000
          ? input.model.cost.experimentalOver200K
          : input.model.cost
      return {
        cost: safe(
          new Decimal(0)
            .add(new Decimal(tokens.input).mul(costInfo?.input ?? 0).div(1_000_000))
            .add(new Decimal(tokens.output).mul(costInfo?.output ?? 0).div(1_000_000))
            .add(new Decimal(tokens.cache.read).mul(costInfo?.cache?.read ?? 0).div(1_000_000))
            .add(new Decimal(tokens.cache.write).mul(costInfo?.cache?.write ?? 0).div(1_000_000))
            // TODO: update models.dev to have better pricing model, for now:
            // charge reasoning tokens at same rate as output tokens
            .add(new Decimal(tokens.reasoning).mul(costInfo?.output ?? 0).div(1_000_000))
            .toNumber(),
        ),
        tokens,
      }
    },
  )

  export class BusyError extends Error {
    constructor(public readonly sessionID: string) {
      super(`Session ${sessionID} is busy`)
    }
  }

  export const initialize = fn(
    z.object({
      sessionID: Identifier.schema("session"),
      modelID: z.string(),
      providerID: z.string(),
      messageID: Identifier.schema("message"),
    }),
    async (input) => {
      await SessionPrompt.command({
        sessionID: input.sessionID,
        messageID: input.messageID,
        model: input.providerID + "/" + input.modelID,
        command: Command.Default.INIT,
        arguments: "",
      })
    },
  )

  /**
   * Get workspace directory for a session.
   *
   * In sandbox mode, this always returns DEFAULT_WORKSPACE (/home/ubuntu).
   * The `directory` field in Session.Info is deprecated and should not be used.
   *
   * @param session - Session info object
   * @returns Workspace directory path
   */
  export function getWorkspace(session: Info): string {
    if (session.directory) {
      log.warn("Session.directory is deprecated, using DEFAULT_WORKSPACE instead", {
        sessionId: session.id,
        directory: session.directory,
      })
    }
    return DEFAULT_WORKSPACE
  }
}
