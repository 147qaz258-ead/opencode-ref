import { createOpencodeClient } from "@opencode-ai/sdk/v2/client"

export const serverHost = process.env.PLAYWRIGHT_SERVER_HOST ?? "localhost"
export const serverPort = process.env.PLAYWRIGHT_SERVER_PORT ?? "4096"
export const serverUrl = `http://${serverHost}:${serverPort}`

export const modKey = process.platform === "darwin" ? "Meta" : "Control"

export function createSdk(directory?: string) {
  return createOpencodeClient({ 
    baseUrl: serverUrl, 
    // In opencode-ref SDK, directory might be handled differently or as part of the client state
    fetch: fetch as any,
    throwOnError: true 
  })
}

export function dirPath(directory: string) {
  // Simple path for now, adjust if slugging is required as in reference
  return `/${directory}`
}

export function sessionPath(directory: string, sessionID?: string) {
  return `${dirPath(directory)}/session${sessionID ? `/${sessionID}` : ""}`
}
