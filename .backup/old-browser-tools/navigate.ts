/*** browser_navigate Tool
 *
 * Navigate the browser to a URL and extract interactive elements.
 */

import { z } from "zod"
import { Tool } from "../tool"
import { getDockerManager } from "../../docker/docker-manager"
import { PlaywrightClient } from "../../browser/playwright-client"
import { Bus } from "../../bus"
import { Session } from "../../session"

export const BrowserNavigateTool = Tool.define("browser_navigate", async () => {
  return {
    description: [
      "Navigate the browser to a URL and extract interactive elements.",
      "",
      "Returns a list of clickable/interactive elements with their indices",
      "that can be used with browser_click and browser_input tools.",
      "",
      "The browser must be available in the user's container.",
    ].join("\n"),

    parameters: z.object({
      url: z.string().describe("The URL to navigate to"),
      timeout: z.number().optional()
        .describe("Navigation timeout in milliseconds (default: 15000)"),
    }),

    async execute(args, ctx) {
      const { sessionID } = ctx
      const dockerManager = getDockerManager()

      // Get session to find projectID (used as userId for user containers)
      const session = await Session.get(sessionID)
      const containerInfo = await dockerManager.getContainerIP(session.projectID)

      if (!containerInfo) {
        return {
          title: "Browser Navigation Failed",
          output: "Browser not available. The user container may not be running.",
          error: "Browser not available. The user container may not be running.",
          metadata: {
            url: args.url,
            elementCount: 0,
            interactiveElements: [],
          },
        }
      }

      const cdpUrl = `http://${containerInfo.ip}:9222`
      const client = new PlaywrightClient(cdpUrl)

      try {
        const initialized = await client.initialize()

        if (!initialized) {
          return {
            title: "Browser Navigation Failed",
            output: "Failed to connect to browser. Chrome may not be running in the sandbox.",
            error: "Failed to connect to browser. Chrome may not be running in the sandbox.",
            metadata: {
              url: args.url,
              elementCount: 0,
              interactiveElements: [],
            },
          }
        }

        const elements = await client.navigate(args.url, args.timeout)

        await client.cleanup()

        // 发布 VNC 渲染事件
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
          title: `Navigated to ${args.url}`,
          output: [
            `Successfully navigated to ${args.url}`,
            "",
            "Interactive elements:",
            ...elements,
          ].join("\n"),
          metadata: {
            url: args.url,
            elementCount: elements.length,
            interactiveElements: elements,
          },
        }

      } catch (error) {
        await client.cleanup()

        return {
          title: "Browser Navigation Failed",
          output: `Navigation failed: ${error instanceof Error ? error.message : error}`,
          error: `Navigation failed: ${error instanceof Error ? error.message : error}`,
          metadata: {
            url: args.url,
            elementCount: 0,
            interactiveElements: [],
          },
        }
      }
    },
  }
})