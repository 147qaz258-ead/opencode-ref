import { z } from "zod"
import { Tool } from "../tool"
import { getDockerManager } from "../../docker/docker-manager"
import { PlaywrightClient } from "../../browser/playwright-client"
import { Session } from "../../session"

export const BrowserInputTool = Tool.define("browser_input", async () => {
  return {
    description: [
      "Input text into an interactive element on the current page.",
      "",
      "Use the element index from browser_navigate to specify the target.",
      "Set pressEnter to true to submit the form after typing.",
    ].join("\n"),

    parameters: z.object({
      text: z.string().describe("The text to type into the element"),
      index: z.number().describe("The index of the element to type into"),
      pressEnter: z.boolean().optional()
        .describe("Whether to press Enter after typing (default: false)"),
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
        await client.input(args.text, args.index, args.pressEnter)
        await client.cleanup()

        return {
          title: `Input text into element ${args.index}`,
          output: `Successfully typed "${args.text}" into element ${args.index}`,
        }
      } catch (error) {
        await client.cleanup()
        return {
          error: `Input failed: ${error instanceof Error ? error.message : error}`,
        }
      }
    },
  }
})
