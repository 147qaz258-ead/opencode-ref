/**
 * VNC WebSocket Proxy
 *
 * Proxies WebSocket connections between frontend (NoVNC) and
 * container/sandbox VNC service.
 *
 * Supports multiple backends via SANDBOX_BACKEND environment variable:
 * - "docker" (default): Direct connection to Docker container (TCP 5900 or WebSocket 6080)
 * - "e2b": Connection via E2B port forwarding
 *
 * Handles RFB protocol forwarding.
 */

import { Hono } from "hono"
import { upgradeWebSocket } from "hono/bun"
import { getDockerManager } from "../docker/docker-manager"
import { Log } from "../util/log"
import { getE2BVNCUrl } from "./vnc-adapter"
import * as net from "net"

export const log = Log.create({ service: "server.vnc-proxy" })


const app = new Hono()

/**
 * WebSocket upgrade data attached to each connection
 */
interface VNCProxyData {
  sessionId: string
  containerWs: WebSocket | null
  tcpSocket: net.Socket | null
  backend: "docker" | "e2b"
}

/**
 * GET /session/:sessionId/vnc/ws
 *
 * WebSocket proxy for VNC connection using RFB protocol.
 *
 * The frontend NoVNC client connects here.
 * We proxy to:
 * 1. Docker Container:
 *    - TCP 5900 (Raw VNC) -> Transformed to WebSocket
 *    - WebSocket 6080 (Websockify) -> Direct forwarding
 * 2. E2B Sandbox:
 *    - WebSocket -> Direct forwarding
 */
app.get(
  "/session/:sessionId/vnc/ws",
  upgradeWebSocket((c) => {
    return {
      onOpen: async (_event, ws) => {
        const { sessionId } = c.req.param()
        const backend = (process.env.SANDBOX_BACKEND as "docker" | "e2b") || "docker"


        try {
          // ========================================
          // E2B BACKEND
          // ========================================
          if (backend === "e2b") {
            // ... (E2B logic remains same, assuming it returns a WS URL)

            // Get VNC URL from E2B port forwarding
            const vncUrl = await getE2BVNCUrl(sessionId)

            const containerWs = new WebSocket(vncUrl, "binary")

            containerWs.onopen = () => {
            }

            containerWs.onmessage = (event) => {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(event.data)
              }
            }

            containerWs.onerror = (error) => {
               ws.close(1011, "E2B VNC error")
            }

            containerWs.onclose = () => {
              ws.close()
            }

            ;(ws as any).data = {
              sessionId,
              containerWs,
              tcpSocket: null,
              backend: "e2b",
            } as VNCProxyData
            return
          }

          // ========================================
          // DOCKER BACKEND
          // ========================================

          const docker = getDockerManager()
          const containerInfo = await docker.getContainerIP(sessionId)

          if (!containerInfo) {
            ws.close(4004, "Container not found")
            return
          }

          // Priority:
          // 1. Host Port mapped to Container 6080 (Websockify)
          // 2. Host Port mapped to Container 5900 (Raw VNC)
          // 3. Host Port mapped to Container 5901 (Legacy)
          const hostPort6080 = containerInfo.ports[6080]
          const hostPort5900 = containerInfo.ports[5900]
          const hostPort5901 = containerInfo.ports[5901]

          // Strategy: Prefer Raw VNC (5900) via TCP Bridge as we control the simple setup (x11vnc)
          // But if Websockify (6080) is present, use it.
          // Note: In our current setup we expose 5900.

          if (hostPort5900) {
            // TCP BRIDGE MODE

            const tcpSocket = net.createConnection({ port: hostPort5900, host: "localhost" })

            tcpSocket.on("connect", () => {
            })

            tcpSocket.on("data", (data) => {
              // Convert Buffer to ArrayBuffer/Uint8Array for WebSocket
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(new Uint8Array(data as any))
              }
            })

            tcpSocket.on("error", (err) => {
              ws.close(1011, "VNC TCP Error")
            })

            tcpSocket.on("close", () => {
               ws.close()
            })

            ;(ws as any).data = {
              sessionId,
              containerWs: null,
              tcpSocket: tcpSocket,
              backend: "docker",
            } as VNCProxyData

          } else if (hostPort6080 || hostPort5901) {
            // WEBSOCKET RELAY MODE
             // ... (Existing logic for WS relay)
            const hostPort = hostPort6080 || hostPort5901
            const vncUrl = `ws://localhost:${hostPort}`

            const containerWs = new WebSocket(vncUrl, "binary")

            containerWs.onmessage = (e) => {
                if (ws.readyState === WebSocket.OPEN) ws.send(e.data)
            }
            containerWs.onerror = (e) => { ws.close(1011, "Container WS Error") }
            containerWs.onclose = () => { ws.close() }

            ;(ws as any).data = {
              sessionId,
              containerWs: containerWs,
              tcpSocket: null,
              backend: "docker",
            } as VNCProxyData
          } else {
             ws.close(4004, "No VNC port found")
          }

        } catch (error) {
          if (ws.readyState === WebSocket.OPEN) ws.close(1011, "Proxy internal error")
        }
      },

      onMessage: (event, ws) => {
        const data = (ws as any).data as VNCProxyData
        // Forward to TCP Socket
        if (data?.tcpSocket && !data?.tcpSocket.destroyed) {
          if (event.data instanceof ArrayBuffer) {
            data.tcpSocket.write(new Uint8Array(event.data))
          } else if (typeof event.data === "string") {
            data.tcpSocket.write(event.data)
          }
        }
        // Forward to Container WebSocket
        else if (data?.containerWs?.readyState === WebSocket.OPEN) {
          data.containerWs.send(event.data)
        }
      },

      onClose: (_, ws) => {
        const data = (ws as any).data as VNCProxyData
        if (data?.tcpSocket) data.tcpSocket.destroy()
        if (data?.containerWs) data.containerWs.close()
      },

      onError: (_, ws) => {
        const data = (ws as any).data as VNCProxyData
        if (data?.tcpSocket) data.tcpSocket.destroy()
        if (data?.containerWs) data.containerWs.close()
      },
    }
  })
)

export { app as vncProxyRoute }
