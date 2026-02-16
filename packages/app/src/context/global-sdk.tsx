import { createOpencodeClient, jsonBodySerializer, type Event } from "@opencode-ai/sdk/v2/client"
import { createSimpleContext } from "@opencode-ai/ui/context"
import { createGlobalEmitter } from "@solid-primitives/event-bus"
import { batch, onCleanup } from "solid-js"
import { usePlatform } from "./platform"
import { useServer } from "./server"
import { useAuth } from "./auth"

export const { use: useGlobalSDK, provider: GlobalSDKProvider } = createSimpleContext({
  name: "GlobalSDK",
  init: () => {
    const server = useServer()
    const auth = useAuth()
    const platform = usePlatform() // Capture platform here, NOT inside authFetch
    const abort = new AbortController()

    // Create auth fetch wrapper that includes JWT token
    const authFetch = async (input: any, init: any) => {
      const token = auth.token

      // Create new headers object
      const headers = new Headers(init?.headers)

      // Add Authorization header if token exists
      if (token) {
        headers.set("Authorization", `Bearer ${token}`)
      }

      // Only set default JSON headers if they are missing
      // IMPORTANT: SSE requests need 'text/event-stream', so we shouldn't force 'application/json' if it's an SSE request or if headers are already set
      const isEventSource = typeof input === 'string' && input.endsWith('/event');
      
      if (!headers.has("Accept")) {
        headers.set("Accept", isEventSource ? "text/event-stream" : "application/json")
      }

      if (!headers.has("Content-Type") && !isEventSource) {
        headers.set("Content-Type", "application/json")
      }

      // Use the captured platform reference
      if (!platform?.fetch) {
        throw new Error("platform.fetch is not available")
      }

      const result = await platform.fetch(input, {
        ...init,
        headers,
      })

      return result
    }

    const eventSdk = createOpencodeClient({
      baseUrl: server.url,
      signal: abort.signal,
      fetch: authFetch,
      bodySerializer: jsonBodySerializer.bodySerializer,
    })
    const emitter = createGlobalEmitter<{
      [key: string]: Event
    }>()

    type Queued = { directory: string; payload: Event }

    let queue: Array<Queued | undefined> = []
    const coalesced = new Map<string, number>()
    let timer: ReturnType<typeof setTimeout> | undefined
    let last = 0

    const key = (directory: string, payload: Event) => {
      if (payload.type === "session.status") return `session.status:${directory}:${payload.properties.sessionID}`
      // "lsp.updated" is no longer a valid event type
      if (payload.type === "message.part.updated") {
        const part = payload.properties.part
        return `message.part.updated:${directory}:${part.messageID}:${part.id}`
      }
    }

    const flush = () => {
      if (timer) clearTimeout(timer)
      timer = undefined

      const events = queue
      queue = []
      coalesced.clear()
      if (events.length === 0) return

      last = Date.now()
      batch(() => {
        for (const event of events) {
          if (!event) continue
          emitter.emit(event.directory, event.payload)
        }
      })
    }

    const schedule = () => {
      if (timer) return
      const elapsed = Date.now() - last
      timer = setTimeout(flush, Math.max(0, 16 - elapsed))
    }

    const stop = () => {
      flush()
    }

    void (async () => {
      const events = await eventSdk.global.event()
      let yielded = Date.now()
      for await (const event of events.stream) {
        const directory = event.directory ?? "global"
        const payload = event.payload
        const k = key(directory, payload)
        if (k) {
          const i = coalesced.get(k)
          if (i !== undefined) {
            queue[i] = undefined
          }
          coalesced.set(k, queue.length)
        }
        queue.push({ directory, payload })
        schedule()

        if (Date.now() - yielded < 8) continue
        yielded = Date.now()
        await new Promise<void>((resolve) => setTimeout(resolve, 0))
      }
    })()
      .finally(stop)
      .catch(() => undefined)

    onCleanup(() => {
      abort.abort()
      stop()
    })

    const sdk = createOpencodeClient({
      baseUrl: server.url,
      fetch: authFetch,
      throwOnError: true,
      bodySerializer: jsonBodySerializer.bodySerializer,
    })

    // Debug log to verify server URL
    console.log("[GlobalSDK] Initialized with server URL:", server.url)

    return { url: server.url, client: sdk, event: emitter, fetch: authFetch }
  },
})
