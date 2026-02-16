import { z } from "zod"
import { Tool } from "../tool"
import { getDockerManager } from "../../docker/docker-manager"
import { PlaywrightClient } from "../../browser/playwright-client"
import { Session } from "../../session"

export const BrowserClickTool = Tool.define("browser_click", async () => {
  return {
    description: [
      "Click an interactive element on the current page.",
      "",
      "Use the element index from browser_navigate output to specify",
      "which element to click.",
    ].join("\n"),

    parameters: z.object({
      index: z.number().describe("The index of the element to click"),
      timeout: z.number().optional().describe("Click timeout in ms (default: 5000)"),
    }),

    async execute(args, ctx) {
      const { sessionID } = ctx
      const dockerManager = getDockerManager()

      // Get session to find projectID (used as userId for user containers)
      const session = await Session.get(sessionID)
      const containerInfo = await dockerManager.getContainerIP(session.projectID)
      if (!containerInfo) {
        return { error: "Browser not available. The user container may not be running." }
      }

      const client = new PlaywrightClient(`http://${containerInfo.ip}:9222`)

      try {
        await client.initialize()
        await client.click(args.index, args.timeout)
        await client.cleanup()

        return {
          title: `Clicked element ${args.index}`,
          output: `Successfully clicked element at index ${args.index}`,
        }
      } catch (error) {
        await client.cleanup()
        return {
          error: `Click failed: ${error instanceof Error ? error.message : error}`,
        }
      }
    },
  }
})
