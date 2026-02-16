import z from "zod"
import { Log } from "../util/log"
import { Instance } from "../project/instance"
import { BusEvent } from "./bus-event"
import { GlobalBus } from "./global"

export namespace Bus {
  const log = Log.create({ service: "bus" })
  type Subscription = (event: any) => void

  export const InstanceDisposed = BusEvent.define(
    "server.instance.disposed",
    z.object({
      directory: z.string(),
    }),
  )

  export const MonitorAction = BusEvent.define(
    "monitor.action",
    z.object({
      sessionId: z.string(),
      actionId: z.string(),
      timestamp: z.number(),
      renderType: z.enum(["vnc", "markdown", "code", "image", "video"]),
      data: z.object({
        vncUrl: z.string().optional(),
        filePath: z.string().optional(),
        content: z.string().optional(),
        language: z.string().optional(),
        src: z.string().optional(),
      }),
    }),
  )

  const state = Instance.state(
    () => {
      const subscriptions = new Map<any, Subscription[]>()

      return {
        subscriptions,
      }
    },
    async (entry) => {
      const wildcard = entry.subscriptions.get("*")
      if (!wildcard) return
      const event = {
        type: InstanceDisposed.type,
        properties: {
          directory: Instance.directory,
        },
      }
      for (const sub of [...wildcard]) {
        sub(event)
      }
    },
  )

  export async function publish<Definition extends BusEvent.Definition>(
    def: Definition,
    properties: z.output<Definition["properties"]>,
  ) {
    // Inject userId into metadata if available in context
    const { getCurrentUserId } = await import("../server/middleware/user-context")
    const userId = getCurrentUserId()
    
    // Ensure properties has metadata or add it if it doesn't exist
    // Note: properties is often a Zod-validated object, so we might need to be careful.
    // However, most Bus events in this project follow a pattern where properties can have metadata.
    const propertiesWithMetadata = {
      ...properties,
      metadata: {
        ...(properties as any).metadata,
        userId,
      },
    }

    const payload = {
      type: def.type,
      properties: propertiesWithMetadata,
    }

    log.info("publishing", {
      type: def.type,
    })
    const pending = []
    
    // Instance-local subscriptions
    try {
      console.log("[DEBUG Bus.publish] Attempting to get local state")
      const instState = state()
      console.log("[DEBUG Bus.publish] Local state found, notifying subscribers")
      for (const key of [def.type, "*"]) {
        const match = instState.subscriptions.get(key)
        for (const sub of match ?? []) {
          pending.push(sub(payload))
        }
      }
    } catch (e) {
      // No instance context, skip local subscriptions
      console.log("[DEBUG Bus.publish] No instance context found, skipping local subscriptions")
    }

    // Global bus is always notified
    let directory = "global"
    try {
      directory = Instance.directory
    } catch {
      // Fallback to global
    }

    console.log("[DEBUG Bus.publish] Notifying GlobalBus", { directory })
    GlobalBus.emit("event", {
      directory,
      payload,
    })
    return Promise.all(pending)
  }


  export function subscribe<Definition extends BusEvent.Definition>(
    def: Definition,
    callback: (event: { type: Definition["type"]; properties: z.infer<Definition["properties"]> }) => void,
  ) {
    return raw(def.type, callback)
  }

  export function once<Definition extends BusEvent.Definition>(
    def: Definition,
    callback: (event: {
      type: Definition["type"]
      properties: z.infer<Definition["properties"]>
    }) => "done" | undefined,
  ) {
    const unsub = subscribe(def, (event) => {
      if (callback(event)) unsub()
    })
  }

  export function subscribeAll(callback: (event: any) => void) {
    return raw("*", callback)
  }

  function raw(type: string, callback: (event: any) => void) {
    log.info("subscribing", { type })
    
    try {
      const subscriptions = state().subscriptions
      let match = subscriptions.get(type) ?? []
      match.push(callback)
      subscriptions.set(type, match)

      return () => {
        log.info("unsubscribing", { type })
        const match = subscriptions.get(type)
        if (!match) return
        const index = match.indexOf(callback)
        if (index === -1) return
        match.splice(index, 1)
      }
    } catch (e) {
      // No instance context, ignore subscription
      log.debug("Skip subscription: no instance context", { type })
      return () => {}
    }
  }
}