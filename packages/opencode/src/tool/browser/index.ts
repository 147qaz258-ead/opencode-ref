// File: packages/opencode/src/tool/browser/index.ts

import { z } from "zod"
import { Tool } from "../tool"
import { getDockerManager } from "../../docker/docker-manager"
import { PlaywrightHttpClient } from "../../browser/playwright-http-client"
import { Session } from "../../session"
import { BrowserActionHandlers } from "./handlers"
import {
  BrowserToolSchema,
  BrowserActionType,
  type BrowserToolParams,
  type BrowserToolResult,
  type BrowserAction,
  type PlaywrightClientExtended
} from "./schema"
import DESCRIPTION from "./browser.txt"
import { getUserContainerForSession } from "../../session/docker"

/**
 * Tool execution result type
 * Matches the return type of tool execute functions
 */
type ToolResult = {
  title: string
  metadata: { [key: string]: any }
  output: string
  attachments?: any[]
}

/**
 * Maximum number of elements to display in output
 */
const MAX_ELEMENTS_TO_DISPLAY = 20

/**
 * Container client connection result
 */
interface ContainerClientResult {
  client: PlaywrightClientExtended
  apiUrl: string
}

/**
 * Unified Browser Tool
 *
 * Consolidates browser_navigate, browser_click, browser_input, browser_screenshot
 * into a single tool with action-based dispatch.
 *
 * @returns Tool.Info definition for browser automation
 *
 * @example
 * ```typescript
 * const result = await browserTool.execute({
 *   action: "navigate",
 *   url: "https://example.com"
 * }, context)
 * ```
 */
export const BrowserTool = async () => {
  return {
    description: DESCRIPTION,
    parameters: BrowserToolSchema,

    async execute(args: BrowserToolParams, ctx: Tool.Context) {
      const containerResult = await getContainerClient(ctx.sessionID, args.action)

      if (!containerResult.success) {
        return containerResult.response
      }

      const { client } = containerResult.data

      try {
        const initialized = await client.initialize()

        if (!initialized) {
          return createConnectionFailedError(containerResult.data.apiUrl, args.action)
        }

        const result = await dispatchAction(args, client, ctx.sessionID)
        await safeCleanup(client)

        return formatResponse(result)
      } catch (error) {
        await safeCleanup(client)
        return createUnexpectedError(args.action, error)
      }
    },
  }
}

/**
 * Get or create container client for the session
 * Uses the same pattern as bash tool - getUserContainerForSession
 */
async function getContainerClient(
  sessionID: string,
  action: BrowserAction
): Promise<{
  success: false
  response: ToolResult
} | {
  success: true
  data: ContainerClientResult
}> {

  const session = await Session.get(sessionID)

  // Use getUserContainerForSession (same pattern as bash tool)
  const userContainer = await getUserContainerForSession(session)

  if (!userContainer) {
    console.error("[BrowserTool] ❌ UserContainer not available!")
    console.error("[BrowserTool] Session:", { id: session.id, projectID: session.projectID })

    return {
      success: false,
      response: {
        title: "Browser Not Available",
        output: "Browser not available. The user container may not be running. Docker may not be enabled.",
        metadata: {
          success: false,
          action,
          error: {
            code: "container_not_found",
            message: "Browser not available. The user container may not be running. Docker may not be enabled.",
            diagnostic: `SessionID: ${sessionID}, ProjectID: ${session.projectID}`
          },
          recovery: {
            suggestedNextAction: {
              action: "status",
              params: {},
              reason: "Check browser and container status"
            }
          }
        } satisfies BrowserToolResult
      }
    }
  }


  // Connect to Playwright HTTP server inside container directly
  // Use the Playwright HTTP API port (9223) which is exposed from the container
  const apiUrl = `http://${userContainer.host}:${userContainer.playwrightPort}`

  const client = new PlaywrightHttpClient({ baseUrl: apiUrl }) as PlaywrightClientExtended

  return {
    success: true,
    data: { client, apiUrl }
  }
}

/**
 * Dispatch action to appropriate handler
 */
async function dispatchAction(
  args: BrowserToolParams,
  client: PlaywrightClientExtended,
  sessionID: string
): Promise<BrowserToolResult> {
  switch (args.action) {
    case "navigate":
      if (!args.url) {
        throw new Error("url is required for navigate action")
      }
      return await BrowserActionHandlers.navigate(
        { url: args.url, timeout: args.timeout },
        { client, sessionID }
      )

    case "snapshot":
      return await BrowserActionHandlers.snapshot({}, { client, sessionID })

    case "act":
      if (!args.request) {
        throw new Error("request is required for act action")
      }
      return await BrowserActionHandlers.act({ request: args.request }, { client, sessionID })

    case "screenshot":
      return await BrowserActionHandlers.screenshot(
        { fullPage: args.fullPage, filename: args.filename },
        { client, sessionID }
      )

    case "status":
      return await BrowserActionHandlers.status({}, { client, sessionID })

    default:
      return {
        success: false,
        action: args.action,
        error: {
          code: "unknown_action",
          message: `Unknown action: ${args.action}`
        }
      }
  }
}

/**
 * Format handler result as ToolResult
 */
function formatResponse(result: BrowserToolResult): ToolResult {
  if (result.success) {
    return formatSuccessResponse(result)
  } else {
    return formatErrorResponse(result)
  }
}

/**
 * Format successful action result
 */
function formatSuccessResponse(result: BrowserToolResult): ToolResult {
  let output = ""
  let title = ""

  switch (result.action) {
    case "navigate":
      title = `Navigated to ${result.snapshot?.url}`
      output = formatSnapshotOutput(result.snapshot?.url, result.snapshot?.elements)
      break

    case "snapshot":
      title = `Snapshot: ${result.snapshot?.title}`
      output = formatSnapshotOutput(result.snapshot?.url, result.snapshot?.elements, result.snapshot?.title)
      break

    case "act":
      title = formatActTitle(result)
      output = formatActOutput(result)
      break

    case "screenshot":
      title = "Screenshot captured"
      output = `Screenshot saved as artifact: ${result.screenshot?.artifactId}`
      break

    case "status":
      title = `Browser Status: ${result.status?.title}`
      output = formatStatusOutput(result.status)
      break
  }

  return { title, output, metadata: result }
}

/**
 * Format snapshot output with element list
 */
function formatSnapshotOutput(
  url?: string,
  elements?: string[],
  title?: string
): string {
  const lines: string[] = []

  if (title) {
    lines.push(`URL: ${url}`, `Title: ${title}`, "")
  } else if (url) {
    lines.push(`Successfully navigated to ${url}`, "")
  }

  lines.push("Interactive elements:")

  const displayElements = (elements || []).slice(0, MAX_ELEMENTS_TO_DISPLAY)
  lines.push(...displayElements)

  if (elements && elements.length > MAX_ELEMENTS_TO_DISPLAY) {
    lines.push(`... and ${elements.length - MAX_ELEMENTS_TO_DISPLAY} more elements`)
  }

  return lines.filter(Boolean).join("\n")
}

/**
 * Format title for act action
 */
function formatActTitle(result: BrowserToolResult): string {
  const status = result.result?.status

  switch (status) {
    case "clicked":
      return `Clicked element ${result.result.ref}`
    case "typed":
      return `Typed into element ${result.result.ref}`
    case "executed":
      return "Script executed"
    case "waited":
      return "Wait completed"
    default:
      return "Action completed"
  }
}

/**
 * Format output for act action
 */
function formatActOutput(result: BrowserToolResult): string {
  const status = result.result?.status

  switch (status) {
    case "clicked":
      return `Successfully clicked element ${result.result.ref}`
    case "typed":
      return `Successfully typed "${result.result.value}" into element ${result.result.ref}`
    case "executed":
      return `Script executed, result: ${JSON.stringify(result.result.value)}`
    case "waited":
      return `Wait condition met: ${result.result.value}`
    default:
      return "Action completed successfully"
  }
}

/**
 * Format status output
 */
function formatStatusOutput(status?: { url: string; title: string; elementCount: number; vncAvailable: boolean }): string {
  if (!status) return ""

  return [
    `URL: ${status.url}`,
    `Title: ${status.title}`,
    `Elements: ${status.elementCount}`,
    `VNC: ${status.vncAvailable ? "Available" : "Not available"}`
  ].join("\n")
}

/**
 * Format error response with recovery suggestion
 */
function formatErrorResponse(result: BrowserToolResult): ToolResult {
  const recoveryText = result.recovery
    ? `\n\nRecovery: ${result.recovery.suggestedNextAction.action} - ${result.recovery.suggestedNextAction.reason}`
    : ""

  return {
    title: `Browser ${result.action} Failed`,
    output: result.error?.message + recoveryText,
    metadata: result
  }
}

/**
 * Create connection failed error response
 */
function createConnectionFailedError(apiUrl: string, action: BrowserAction): ToolResult {
  const errorResult: BrowserToolResult = {
    success: false,
    action,
    error: {
      code: "browser_connection_failed",
      message: "Failed to connect to Playwright server in the container.",
      diagnostic: `API URL: ${apiUrl}`
    },
    recovery: {
      suggestedNextAction: {
        action: "status",
        params: {},
        reason: "Check browser status"
      }
    }
  }

  return {
    title: "Browser Connection Failed",
    output: errorResult.error.message,
    metadata: errorResult
  }
}

/**
 * Create unexpected error response
 */
function createUnexpectedError(action: BrowserAction, error: unknown): ToolResult {
  const errorResult: BrowserToolResult = {
    success: false,
    action,
    error: {
      code: "unexpected_error",
      message: error instanceof Error ? error.message : String(error)
    }
  }

  return {
    title: "Browser Tool Error",
    output: errorResult.error.message,
    metadata: errorResult
  }
}

/**
 * Safely cleanup client without throwing
 */
async function safeCleanup(client: PlaywrightClientExtended): Promise<void> {
  try {
    await client.cleanup()
  } catch (cleanupError) {
    // Log cleanup error but don't lose original error
    console.error("Client cleanup failed:", cleanupError)
  }
}
