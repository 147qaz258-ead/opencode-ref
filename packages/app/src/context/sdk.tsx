import { createOpencodeClient, jsonBodySerializer, type Event } from "@opencode-ai/sdk/v2/client"
import { createSimpleContext } from "@opencode-ai/ui/context"
import { createGlobalEmitter } from "@solid-primitives/event-bus"
import { onCleanup } from "solid-js"
import { useNavigate } from "@solidjs/router"
import { useGlobalSDK } from "./global-sdk"
import { usePlatform } from "./platform"
import { useAuth } from "./auth"

export const { use: useSDK, provider: SDKProvider } = createSimpleContext({
  name: "SDK",
  init: (props: { directory: string }) => {
    const platform = usePlatform()
    const globalSDK = useGlobalSDK()
    const auth = useAuth()

    const isPlainObject = (value: any) => {
      if (typeof value !== "object" || value === null) return false
      const proto = Object.getPrototypeOf(value)
      return proto === null || proto === Object.prototype
    }

    const navigate = useNavigate()

    // Create auth fetch wrapper that includes JWT token
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const authFetch: any = async (input: any, init?: any) => {
      // Check if user is authenticated before making request
      const token = auth.token
      if (!token && typeof window !== "undefined") {
        // User not logged in - redirect to login page
        const currentPath = window.location.pathname
        if (currentPath !== "/login" && currentPath !== "/login-callback") {
          console.log("[SDK] User not authenticated, redirecting to login...")
          navigate("/login", { replace: true })
          throw new Error("UNAUTHORIZED")
        }
      }

      // Handle Request objects directly - SDK creates Request objects internally
      if (input instanceof Request) {
        const request = input

        // Clone request to avoid consuming the body
        const newHeaders = new Headers(request.headers)
        if (token && typeof token === "string") {
          newHeaders.set("Authorization", `Bearer ${token}`)
        }

        const newRequest = new Request(request, {
          headers: newHeaders,
        })

        return platform.fetch?.(newRequest) ?? fetch(newRequest)
      }

      // Diagnostic log to see what the SDK is passing
      console.log(`[DEBUG] authFetch called with:`, {
        input: typeof input === "object" ? "Plain object" : input,
        inputKeys: typeof input === "object" ? Object.keys(input) : [],
        hasInit: !!init,
      })

      // If input is an object and init is missing, it might be the all-in-one options object
      const isWrapped = !init && typeof input === "object" && !(input instanceof Request)
      const options = isWrapped ? input : init || {}
      const url = isWrapped ? input.url : input

      // Create headers safely
      const headers = new Headers(options.headers)

      // Add Authorization header if token exists and is a string
      if (token && typeof token === "string") {
        headers.set("Authorization", `Bearer ${token}`)
      }

      // Ensure Content-Type is set for JSON requests
      if (!headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json")
      }

      let body = options.body
      const isJson = headers.get("Content-Type")?.includes("application/json")

      if (isJson && isPlainObject(body)) {
        console.log(`[DEBUG] authFetch: Stringifying body for ${url}`)
        body = JSON.stringify(body)
      } else if (isJson && typeof body === "object" && body !== null) {
        console.warn(`[DEBUG] authFetch: JSON target but body is ${body.constructor?.name}`, body)
      }

      // Handle undefined/null body for JSON requests - send empty object instead
      if (isJson && (body === undefined || body === null)) {
        body = "{}"
      }

      const finalInit = {
        ...options,
        headers,
        body,
      }

      // If it was originally a Request object, standard fetch(request, init) will work.
      // If it was a wrapped options object, we now call fetch(url, finalInit).
      return platform.fetch?.(url, finalInit) ?? fetch(url, finalInit)
    }

    // 添加响应验证 - 拒绝接受 HTML 响应，处理 401
    const validatedFetch: any = async (input: any, init?: any) => {
      const response = await authFetch(input, init)

      // 检查 401 未授权
      if (response.status === 401) {
        console.log("[SDK] Received 401 Unauthorized, redirecting to login...")
        if (typeof window !== "undefined") {
          const currentPath = window.location.pathname
          if (currentPath !== "/login" && currentPath !== "/login-callback") {
            navigate("/login", { replace: true })
          }
        }
        throw new Error("UNAUTHORIZED")
      }

      // 检查响应类型
      const contentType = response.headers.get("Content-Type")
      if (contentType && contentType.includes("text/html")) {
        console.error("[SDK Error] 收到 HTML 响应（API 错误），拒绝解析")
        throw new Error(`API 返回了 HTML 错误页面而不是 JSON 响应。请检查 API 端点和配置。`)
      }

      return response
    }

    const sdk = createOpencodeClient({
      baseUrl: globalSDK.url,
      fetch: validatedFetch,
      directory: props.directory,
      throwOnError: true,
      bodySerializer: jsonBodySerializer.bodySerializer,
    })

    const emitter = createGlobalEmitter<{
      [key in Event["type"]]: Extract<Event, { type: key }>
    }>()

    const unsub = globalSDK.event.on(props.directory, (event) => {
      emitter.emit(event.type, event)
    })
    onCleanup(unsub)

    return {
      directory: props.directory,
      client: sdk,
      event: emitter,
      url: globalSDK.url,
      userId: auth.user?.userId,
      validatedFetch, // 导出验证后的 fetch
    }
  },
})
