/**
 * VNC Adapter for E2B
 *
 * Provides VNC connection URLs for E2B sandboxes.
 * Used by vnc-proxy.ts when SANDBOX_BACKEND=e2b.
 */

import { Log } from "../util/log"

const log = Log.create({ service: "server.vnc-adapter" })


/**
 * Get E2B VNC connection URL
 *
 * @param sessionId - Session/user ID
 * @returns VNC WebSocket URL (from E2B port forwarding)
 */
export async function getE2BVNCUrl(sessionId: string): Promise<string> {

  // Import E2B manager
  const { getE2BManager } = await import("../container/e2b-lifecycle")
  const e2bManager = getE2BManager()

  // Get sandbox for user
  const sandbox = e2bManager.getSandbox(sessionId)

  if (!sandbox) {
    throw new Error(`E2B sandbox not found for user: ${sessionId}`)
  }

  // Connect to E2B sandbox

  const { Sandbox } = await import("@e2b/code-interpreter")
  const apiKey = process.env.E2B_API_KEY

  if (!apiKey) {
    throw new Error("E2B_API_KEY environment variable is required for VNC")
  }

  try {
    const e2bSandbox = await Sandbox.create({
      apiKey,
      id: sandbox.sandboxId,
    })


    // Get port forwarding URL for noVNC (port 6080)
    // E2B SDK: getHost returns the URL for a given port

    const vncHost = e2bSandbox.getHost(6080)


    if (!vncHost) {
      throw new Error(`E2B port forwarding not available for sandbox: ${sandbox.sandboxId}`)
    }

    // Construct WebSocket URL (wss:// for secure, ws:// for non-secure)
    const vncUrl = `wss://${vncHost}`


    return vncUrl
  } catch (error) {
    throw error
  }
}
