/**
 * Glob Tool - Docker Exec Implementation
 *
 * Finds files matching patterns in the sandbox workspace via Docker exec.
 */

import z from "zod"
import { Tool } from "./tool"
import DESCRIPTION from "./glob.txt"
import * as path from "path"
import { Instance } from "../project/instance"
import { Session } from "../session"
import { createExecutorForSession } from "../sandbox/executor-v2"
import { getUserContainerForSession } from "../session/docker"

export const GlobTool = Tool.define("glob", {
  description: DESCRIPTION,
  parameters: z.object({
    pattern: z.string().describe("The glob pattern to match files against"),
    path: z
      .string()
      .optional()
      .describe(
        `The absolute directory path to search in (e.g., /home/ubuntu/src). Defaults to /home/ubuntu. IMPORTANT: Omit this field to use the default directory. DO NOT enter "undefined" or "null" - simply omit it for the default behavior.`,
      ),
  }),
  async execute(params, ctx) {
    await ctx.ask({
      permission: "glob",
      patterns: [params.pattern],
      always: ["*"],
      metadata: {
        pattern: params.pattern,
        path: params.path,
      },
    })

    // Normalize search path
    let search = path.posix.resolve(Instance.getWorkspace(), params.path || ".")

    const limit = 100
    const executor = await createExecutorForSession(ctx.sessionID, getUserContainerForSession)

    // Use findFiles via Docker exec
    const files = await executor.findFiles(search, params.pattern)
    const truncated = files.length > limit

    const limitedFiles = files.slice(0, limit)

    const output = []
    if (limitedFiles.length === 0) output.push("No files found")
    if (limitedFiles.length > 0) {
      output.push(...limitedFiles)
      if (truncated) {
        output.push("")
        output.push("(Results are truncated. Consider using a more specific path or pattern.)")
      }
    }

    return {
      title: search,
      metadata: {
        count: limitedFiles.length,
        truncated,
      },
      output: output.join("\n"),
    }
  },
})
