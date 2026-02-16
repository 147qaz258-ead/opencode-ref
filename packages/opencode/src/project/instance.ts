import { Log } from "@/util/log"
import { Context } from "../util/context"
import { Project } from "./project"
import { State } from "./state"
import { iife } from "@/util/iife"
import { GlobalBus } from "@/bus/global"

export const DEFAULT_WORKSPACE = "/workspace"

interface Context {
  directory: string
  worktree: string
  project: Project.Info
  userId?: string
}
const context = Context.create<Context>("instance")
const cache = new Map<string, Promise<Context>>()

export const Instance = {
  async provide<R>(input: { directory?: string; userId?: string; init?: () => Promise<any>; fn: () => R }): Promise<R> {
    // Multi-user support: include userId in cache key for proper isolation
    const baseKey = input.directory || "global"
    const cacheKey = input.userId ? `${baseKey}#${input.userId}` : baseKey
    const effectiveUserId = input.userId || "default"

    let existing = cache.get(cacheKey)
    if (!existing) {
      Log.Default.info("creating instance", { directory: baseKey, userId: effectiveUserId, cacheKey })
      existing = iife(async () => {
        const { project, sandbox } = await Project.fromDirectory(input.directory, effectiveUserId)
        const ctx = {
          directory: baseKey,
          worktree: sandbox,
          project,
          userId: effectiveUserId,
        }
        await context.provide(ctx, async () => {
          await input.init?.()
        })
        return ctx
      })
      cache.set(cacheKey, existing)
    }
    const ctx = await existing
    return context.provide(ctx, async () => {
      return input.fn()
    })
  },

  getWorkspace(): string {
    return "."
  },

  /** @deprecated Use getWorkspace() instead */
  get directory() {
    try {
      return context.use().directory
    } catch {
      return "global"
    }
  },

  /** @deprecated Use getWorkspace() instead */
  get worktree() {
    try {
      return context.use().worktree
    } catch {
      return "."
    }
  },

  get project() {
    try {
      return context.use().project
    } catch {
      return {
        id: "global",
        name: "global",
        directory: "global",
        config: {},
      }
    }
  },

  state<S>(init: () => S, dispose?: (state: Awaited<S>) => Promise<void>): () => S {
    return State.create(
      () => {
        try {
          return Instance.directory
        } catch {
          return "global"
        }
      },
      init,
      dispose
    )
  },

  async dispose() {
    const dir = Instance.directory
    Log.Default.info("disposing instance", { directory: dir })
    await State.dispose(dir)
    cache.delete(dir)
    GlobalBus.emit("event", {
      directory: dir,
      payload: {
        type: "server.instance.disposed",
        properties: {
          directory: dir,
        },
      },
    })
  },
  async disposeAll() {
    Log.Default.info("disposing all instances")
    for (const [_key, value] of cache) {
      const awaited = await value.catch(() => {})
      if (awaited) {
        await context.provide(await value, async () => {
          await Instance.dispose()
        })
      }
    }
    cache.clear()
  },
}
