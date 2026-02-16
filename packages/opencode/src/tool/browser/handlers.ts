// File: packages/opencode/src/tool/browser/handlers.ts

import { PlaywrightClient } from "../../browser/playwright-client"
import { Artifact } from "../../artifact"
import { Bus } from "../../bus"
import { z } from "zod"
import type {
  BrowserToolResult,
  HandlerContext,
  NavigateRequest,
  ActRequest,
  ScreenshotRequest,
  PlaywrightPage
} from "./schema"

/**
 * Action handlers for the unified browser tool
 * Each handler implements a specific browser action
 */

export const BrowserActionHandlers = {
  /**
   * Navigate to URL and extract interactive elements
   */
  async navigate(
    args: NavigateRequest,
    ctx: HandlerContext
  ): Promise<BrowserToolResult> {
    try {
      const result = await ctx.client.navigate(args.url, args.timeout)

      // Publish VNC render event
      await Bus.publish(Bus.MonitorAction, {
        sessionId: ctx.sessionID,
        actionId: `action-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        timestamp: Date.now(),
        renderType: "vnc",
        data: {
          vncUrl: `/api/session/${ctx.sessionID}/vnc/ws`,
        },
      } satisfies z.output<typeof Bus.MonitorAction.properties>)

      return {
        success: true,
        action: "navigate",
        snapshot: result
      }
    } catch (error) {
      return {
        success: false,
        action: "navigate",
        error: {
          code: "navigation_failed",
          message: error instanceof Error ? error.message : String(error),
          diagnostic: `URL: ${args.url}, Timeout: ${args.timeout || 15000}ms`
        },
        recovery: {
          suggestedNextAction: {
            action: "navigate",
            params: args,
            reason: "Retry navigation - may be temporary network issue"
          }
        }
      }
    }
  },

  /**
   * Extract interactive elements from current page
   */
  async snapshot(
    _args: {},
    ctx: HandlerContext
  ): Promise<BrowserToolResult> {
    try {
      const result = await ctx.client.snapshot()

      return {
        success: true,
        action: "snapshot",
        snapshot: result
      }
    } catch (error) {
      return {
        success: false,
        action: "snapshot",
        error: {
          code: "snapshot_failed",
          message: error instanceof Error ? error.message : String(error)
        },
        recovery: {
          suggestedNextAction: {
            action: "navigate",
            params: { url: "about:blank" },
            reason: "Navigate to a safe page before retrying snapshot"
          }
        }
      }
    }
  },

  /**
   * Perform action on element (click, type, script, wait)
   */
  async act(
    args: ActRequest,
    ctx: HandlerContext
  ): Promise<BrowserToolResult> {
    try {
      // Handle script execution
      if (args.request?.script) {
        const result = await ctx.client.act({
          action: "script",
          value: args.request.script.code
        })

        return {
          success: true,
          action: "act",
          result
        }
      }

      // Handle click
      if (args.request?.click) {
        const ref = args.request.click.ref
        const result = await ctx.client.act({
          ref,
          action: "click"
        })

        return {
          success: true,
          action: "act",
          result
        }
      }

      // Handle type
      if (args.request?.type) {
        const { ref, text } = args.request.type
        const result = await ctx.client.act({
          ref,
          action: "fill",
          value: text
        })

        return {
          success: true,
          action: "act",
          result: {
            status: "typed",
            ref,
            value: text
          }
        }
      }

      // Handle wait
      if (args.request?.wait) {
        return {
          success: true,
          action: "act",
          result: {
            status: "waited",
            value: args.request.wait.condition
          }
        }
      }

      return {
        success: false,
        action: "act",
        error: {
          code: "invalid_request",
          message: "No valid action specified in act request"
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)

      // Determine if it's an element not found error
      if (message.includes("not found") || message.includes("Element")) {
        return {
          success: false,
          action: "act",
          error: {
            code: "element_not_found",
            message: message,
            diagnostic: "Element reference may be stale - page may have changed"
          },
          recovery: {
            suggestedNextAction: {
              action: "snapshot",
              params: {},
              reason: "Get fresh element indices - page may have changed since last snapshot"
            },
            alternatives: [
              {
                action: "status",
                description: "Check current browser state"
              }
            ]
          }
        }
      }

      return {
        success: false,
        action: "act",
        error: {
          code: "action_failed",
          message: message
        },
        recovery: {
          suggestedNextAction: {
            action: "snapshot",
            params: {},
            reason: "Check current page state before retrying"
          }
        }
      }
    }
  },

  /**
   * Capture screenshot as artifact
   */
  async screenshot(
    args: ScreenshotRequest,
    ctx: HandlerContext
  ): Promise<BrowserToolResult> {
    try {
      const buffer = await ctx.client.screenshot(args.fullPage || false)
      const filename = args.filename || `screenshot-${Date.now()}.png`

      const artifact = await Artifact.createWithContent({
        sessionID: ctx.sessionID,
        filename,
        mimeType: "image/png",
        content: buffer,
        metadata: {
          category: "image",
          tags: ["screenshot", "browser"],
        },
      })

      return {
        success: true,
        action: "screenshot",
        screenshot: {
          path: filename,
          artifactId: artifact.id
        }
      }
    } catch (error) {
      return {
        success: false,
        action: "screenshot",
        error: {
          code: "screenshot_failed",
          message: error instanceof Error ? error.message : String(error)
        },
        recovery: {
          suggestedNextAction: {
            action: "screenshot",
            params: args,
            reason: "Retry screenshot capture"
          }
        }
      }
    }
  },

  /**
   * Get current browser status
   */
  async status(
    _args: {},
    ctx: HandlerContext
  ): Promise<BrowserToolResult> {
    try {
      const result = await ctx.client.status()

      return {
        success: true,
        action: "status",
        status: {
          ...result,
          vncAvailable: true,
          vncUrl: `/api/session/${ctx.sessionID}/vnc/ws`
        }
      }
    } catch (error) {
      return {
        success: false,
        action: "status",
        error: {
          code: "status_failed",
          message: error instanceof Error ? error.message : String(error)
        },
        recovery: {
          suggestedNextAction: {
            action: "navigate",
            params: { url: "about:blank" },
            reason: "Navigate to a safe page and retry"
          }
        }
      }
    }
  }
}
