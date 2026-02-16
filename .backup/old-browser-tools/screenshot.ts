import { z } from "zod"
import { Tool } from "../tool"
import { getDockerManager } from "../../docker/docker-manager"
import { PlaywrightClient } from "../../browser/playwright-client"
import { Artifact } from "../../artifact"
import { Session } from "../../session"

export const BrowserScreenshotTool = Tool.define("browser_screenshot", async () => {
  return {
    description: [
      "Take a screenshot of the current browser page.",
      "",
      "The screenshot is saved as an artifact that can be downloaded.",
      "",
      "Set fullPage to true to capture the entire scrollable page.",
    ].join("\n"),

    parameters: z.object({
      fullPage: z.boolean().optional()
        .describe("Capture the full scrollable page (default: false)"),
      filename: z.string().optional()
        .describe("Artifact filename (default: screenshot-<timestamp>.png)"),
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
        const buffer = await client.screenshot(args.fullPage || false)

        const filename = args.filename || `screenshot-${Date.now()}.png`
        const artifact = await Artifact.createWithContent({
          sessionID,
          filename,
          mimeType: "image/png",
          content: buffer,
          metadata: {
            category: "image",
            tags: ["screenshot", "browser"],
          },
        })

        await client.cleanup()

        return {
          title: "Screenshot captured",
          output: `Screenshot saved as artifact: ${artifact.id}`,
          metadata: {
            artifactId: artifact.id,
            filename,
            size: buffer.length,
          },
        }
      } catch (error) {
        await client.cleanup()
        return {
          error: `Screenshot failed: ${error instanceof Error ? error.message : error}`,
        }
      }
    },
  }
})
