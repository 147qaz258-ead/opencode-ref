import { createSignal, onCleanup, onMount, Show } from "solid-js"

// Enhanced logger for VNCViewer with detailed diagnostics
const log = {
  info: (msg: string, data?: any) => {},
  error: (msg: string, data?: any) => console.error(`[VNCViewer:ERROR] ${msg}`, data ?? ""),
  warn: (msg: string, data?: any) => {},
  debug: (msg: string, data?: any) => {},
}

// Log key diagnostic points
const logDiagnostic = (step: string, details: Record<string, any>) => {}

// Use global RFB from CDN (noVNC)
declare global {
  interface Window {
    RFB: any
  }
}

// CDN URLs for noVNC library (in order of preference)
const NOVNC_CDN_URLS = [
  "https://cdn.jsdelivr.net/npm/@novnc/novnc@1.6.0/dist/rfb.js",
  "https://unpkg.com/@novnc/novnc@1.6.0/dist/rfb.js",
  "https://cdn.cloudflare.com/ajax/libs/noVNC/1.6.0/rfb.js",
]

// Retry configuration
const MAX_RETRIES = 3
const BASE_RETRY_DELAY = 1000 // 1 second

// Sleep utility for retry delays
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

interface VNCViewerProps {
  sessionId: string
  vncUrl: () => string | undefined
  width?: number
  height?: number
}

export function VNCViewer(props: VNCViewerProps) {
  const [status, setStatus] = createSignal<"connecting" | "connected" | "error">("connecting")
  const [errorMessage, setErrorMessage] = createSignal<string>("")
  const [scriptLoaded, setScriptLoaded] = createSignal(false)
  let containerRef: HTMLDivElement | undefined
  let rfb: any | undefined

  /**
   * Load noVNC library from CDN with retry logic and exponential backoff
   * - Tries multiple CDN URLs in order
   * - Retries failed loads with exponential backoff
   * - Returns early if library is already loaded in window.RFB
   */
  const loadNoVNCLibrary = async (): Promise<void> => {
    logDiagnostic("LIBRARY_LOAD_START", {
      hasWindowRFB: !!window.RFB,
      method: "cdn_script_with_retry",
      maxRetries: MAX_RETRIES,
      cdnUrls: NOVNC_CDN_URLS.length,
    })

    // Early return if library is already loaded
    if (window.RFB) {
      setScriptLoaded(true)
      log.info("noVNC library already loaded in window.RFB")
      return
    }

    // Try each CDN URL with retries
    for (let urlIndex = 0; urlIndex < NOVNC_CDN_URLS.length; urlIndex++) {
      const cdnUrl = NOVNC_CDN_URLS[urlIndex]
      log.info(`Trying CDN URL ${urlIndex + 1}/${NOVNC_CDN_URLS.length}`, { cdnUrl })

      // Retry the same CDN URL with exponential backoff
      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
          await new Promise<void>((resolve, reject) => {
            const script = document.createElement("script")
            script.src = cdnUrl
            script.async = true

            const cleanup = () => {
              script.onload = null
              script.onerror = null
            }

            script.onload = () => {
              cleanup()
              logDiagnostic("LIBRARY_LOAD_SUCCESS", {
                hasRFB: !!window.RFB,
                rfbType: typeof window.RFB,
                cdnUrl,
                attempt: attempt + 1,
              })

              if (!window.RFB) {
                reject(new Error(`Script loaded but window.RFB is not available`))
                return
              }

              setScriptLoaded(true)
              resolve()
            }

            script.onerror = (error) => {
              cleanup()
              logDiagnostic("LIBRARY_LOAD_FAILED", {
                error: "Failed to load noVNC from CDN",
                cdnUrl,
                attempt: attempt + 1,
              })

              // Reject to trigger retry
              reject(new Error(`Failed to load noVNC from ${cdnUrl}`))
            }

            document.head.appendChild(script)
          })

          // If we get here, the script loaded successfully
          log.info("noVNC library loaded successfully", {
            cdnUrl,
            attempt: attempt + 1,
          })
          return
        } catch (error) {
          const isLastAttempt = attempt === MAX_RETRIES - 1
          const isLastCdn = urlIndex === NOVNC_CDN_URLS.length - 1

          if (isLastAttempt && isLastCdn) {
            // All retries on all CDNs failed
            log.error("Failed to load noVNC from all CDN URLs after all retries", {
              error: error instanceof Error ? error.message : String(error),
            })
            throw new Error(
              `Failed to load noVNC library from all CDN URLs after ${MAX_RETRIES} retries each`
            )
          }

          if (!isLastAttempt) {
            // Retry with exponential backoff
            const delay = Math.min(BASE_RETRY_DELAY * Math.pow(2, attempt), 5000)
            log.warn(`noVNC load failed, retrying... (${attempt + 1}/${MAX_RETRIES})`, {
              delay,
              cdnUrl,
            })
            await sleep(delay)
          }
          // If this is the last attempt for this CDN, try the next CDN URL
        }
      }
    }

    // Should not reach here, but TypeScript needs it
    throw new Error("Failed to load noVNC library")
  }

  const connect = async () => {
    logDiagnostic("CONNECTION_ATTEMPT", {
      sessionId: props.sessionId,
      vncUrlFn: !!props.vncUrl,
      containerRefExists: !!containerRef,
    })

    try {
      logDiagnostic("LOADING_LIBRARY", { step: "before_loadNoVNCLibrary" })
      await loadNoVNCLibrary()
      logDiagnostic("LIBRARY_LOADED", { step: "after_loadNoVNCLibrary" })

      const url = props.vncUrl()
      logDiagnostic("URL_OBTAINED", {
        url: url || "UNDEFINED",
        urlType: typeof url,
        urlStartsWith: url?.substring(0, 20),
      })

      if (!url) {
        logDiagnostic("ERROR_NO_URL", {
          vncUrlFn: String(props.vncUrl),
        })
        setStatus("error")
        setErrorMessage("No VNC URL provided - vncUrl() returned undefined")
        return
      }

      if (!containerRef) {
        logDiagnostic("ERROR_NO_CONTAINER", {})
        setStatus("error")
        setErrorMessage("VNC container element not ready")
        return
      }

      setStatus("connecting")

      // Convert vnc:// to ws://
      const wsUrl = url.replace("vnc://", "ws://")
      if (wsUrl === url) {
        log.debug("URL already in WebSocket format (ws:// or wss://)")
      }

      logDiagnostic("CREATING_RFB", {
        url: wsUrl,
        containerRef: !!containerRef,
        containerSize: {
          width: containerRef.clientWidth,
          height: containerRef.clientHeight,
        },
      })

      rfb = new window.RFB(containerRef!, wsUrl, {
        credentials: { password: "" },
        shared: true,
        wsProtocols: ["binary"],
      })

      logDiagnostic("RFB_CREATED", {
        rfbExists: !!rfb,
        rfbType: typeof rfb,
      })

      rfb.scaleViewport = true
      rfb.resizeSession = true

      // Detailed event listeners with diagnostics
      rfb.addEventListener("connect", () => {
        logDiagnostic("RFB_EVENT_CONNECT", {
          viewportScale: rfb?.scaleViewport,
          resizeMode: rfb?.resizeSession,
        })
        log.info("RFB connected successfully")
        setStatus("connected")
      })

      rfb.addEventListener("disconnect", (e: any) => {
        logDiagnostic("RFB_EVENT_DISCONNECT", {
          detail: e?.detail,
          clean: e?.detail?.clean,
          reason: e?.detail?.reason,
        })
        log.info("RFB disconnected")
        setStatus("error")
        setErrorMessage(`Disconnected: ${e?.detail?.reason || "Unknown reason"}`)
      })

      rfb.addEventListener("credentialsrequired", () => {
        logDiagnostic("RFB_EVENT_CREDENTIALS_REQUIRED", {})
        log.info("RFB requires credentials, sending empty password")
        rfb?.sendCredentials({ password: "" })
      })

      rfb.addEventListener("failure", (err: any) => {
        logDiagnostic("RFB_EVENT_FAILURE", {
          message: err?.message,
          detail: err?.detail,
          name: err?.name,
        })
        log.error("RFB connection failed", { err })
        setStatus("error")
        setErrorMessage(`Connection failed: ${err?.detail?.message || err?.message || "Unknown error"}`)
      })

      // Additional diagnostic events
      rfb.addEventListener("disconnecting", () => {
        log.debug("RFB is disconnecting...")
      })

      rfb.addEventListener("securityfailure", (err: any) => {
        logDiagnostic("RFB_EVENT_SECURITY_FAILURE", {
          reason: err?.reason,
          status: err?.status,
        })
      })

    } catch (error) {
      logDiagnostic("CONNECTION_ERROR", {
        error: error instanceof Error ? {
          name: error.name,
          message: error.message,
          stack: error.stack?.split('\n')?.[0],
        } : String(error),
      })
      log.error("Failed to connect to VNC", { error })
      setStatus("error")
      const message = error instanceof Error ? error.message : "Failed to connect to VNC"
      setErrorMessage(message)
    }
  }

  const disconnect = () => {
    if (rfb) {
      rfb.disconnect()
      rfb = undefined
    }
    setStatus("connecting")
    setErrorMessage("")
  }

  const sendCtrlAltDel = () => {
    if (rfb) {
      rfb.sendCtrlAltDel()
      log.info("VNCViewer: Sent Ctrl+Alt+Del")
    }
  }

  onMount(() => {
    // Auto-connect when component mounts
    connect()
  })

  onCleanup(() => {
    disconnect()
  })

  return (
    <div class="vnc-viewer-container flex flex-col h-full bg-black">
      {/* Status Bar */}
      <div class="flex items-center justify-between px-3 py-2 border-b border-gray-800 bg-gray-900">
        <div class="flex items-center gap-2">
          <Show when={status() === "connecting"}>
            <div class="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
            <span class="text-sm text-gray-300">Connecting to VNC...</span>
          </Show>
          <Show when={status() === "connected"}>
            <div class="w-2 h-2 rounded-full bg-green-500" />
            <span class="text-sm text-gray-300">Connected to remote desktop</span>
          </Show>
          <Show when={status() === "error"}>
            <div class="w-2 h-2 rounded-full bg-red-500" />
            <span class="text-sm text-red-400">{errorMessage()}</span>
          </Show>
        </div>

        <Show when={status() === "connected"}>
          <div class="flex gap-2">
            <button
              type="button"
              class="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-white rounded"
              onClick={sendCtrlAltDel}
            >
              Ctrl+Alt+Del
            </button>
            <button
              type="button"
              class="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-white rounded"
              onClick={disconnect}
            >
              Disconnect
            </button>
          </div>
        </Show>
      </div>

      {/* VNC Canvas */}
      <div
        ref={containerRef}
        class="flex-1 bg-black relative flex items-center justify-center"
        style={{
          width: `${props.width || 1280}px`,
          height: `${props.height || 1024}px`,
        }}
      >
        <Show when={status() === "connecting"}>
          <div class="absolute inset-0 flex items-center justify-center text-white">
            <div class="text-center">
              <div class="inline-block w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin mb-2" />
              <p>Connecting to VNC server...</p>
            </div>
          </div>
        </Show>

        <Show when={status() === "error"}>
          <div class="absolute inset-0 flex items-center justify-center text-white">
            <div class="text-center">
              <div class="text-4xl mb-2">⚠️</div>
              <p class="text-red-400">VNC Connection Failed</p>
              <p class="text-sm text-gray-400 mt-2">{errorMessage()}</p>
              <button
                type="button"
                class="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded"
                onClick={connect}
              >
                Reconnect
              </button>
            </div>
          </div>
        </Show>
      </div>
    </div>
  )
}
