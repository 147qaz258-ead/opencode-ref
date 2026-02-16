/**
 * List Tool - Docker Exec Implementation
 *
 * Lists files and directories in the sandbox workspace via Docker exec.
 */

import z from "zod"
import { Tool } from "./tool"
import * as path from "path"
import DESCRIPTION from "./ls.txt"
import { Session } from "../session"
import { Instance } from "../project/instance"
import { createExecutorForSession } from "../sandbox/executor-v2"
import { getUserContainerForSession } from "../session/docker"

export const IGNORE_PATTERNS = [
  "node_modules/",
  "__pycache__/",
  ".git/",
  "dist/",
  "build/",
  "target/",
  "vendor/",
  "bin/",
  "obj/",
  ".idea/",
  ".vscode/",
  ".zig-cache/",
  "zig-out",
  ".coverage",
  "coverage/",
  "vendor/",
  "tmp/",
  "temp/",
  ".cache/",
  "cache/",
  "logs/",
  ".venv/",
  "venv/",
  "env/",
]

const LIMIT = 100

export const ListTool = Tool.define("list", {
  description: DESCRIPTION,
  parameters: z.object({
    path: z.string().optional().describe("The absolute directory path to list (e.g., /home/ubuntu or /home/ubuntu/src). Defaults to /home/ubuntu"),
    ignore: z.array(z.string()).optional().describe("List of glob patterns to ignore"),
  }),
  async execute(params, ctx) {
    const searchPath = path.posix.resolve(Instance.getWorkspace(), params.path || ".")

    await ctx.ask({
      permission: "list",
      patterns: [searchPath],
      always: ["*"],
      metadata: {
        path: searchPath,
      },
    })

    const executor = await createExecutorForSession(ctx.sessionID, getUserContainerForSession)

    // Get file listing via Docker exec
    const listResult = await executor.listDir(searchPath)

    // Filter out ignored patterns
    const ignoreGlobs = IGNORE_PATTERNS.concat(params.ignore || [])
    const entries = listResult.entries.filter((entry) => {
      const fullPath = path.join(searchPath, entry.name)
      return !ignoreGlobs.some((pattern) => {
        const globPattern = pattern.endsWith("/") ? `${pattern}*` : pattern
        return fullPath.startsWith(globPattern.replace("*", ""))
      })
    })

    // Build directory structure
    const dirs = new Set<string>()
    const filesByDir = new Map<string, string[]>()

    for (const entry of entries.slice(0, LIMIT)) {
      if (entry.type === "directory") {
        dirs.add(entry.name)
      } else {
        // Add to current directory
        if (!filesByDir.has(".")) {
          filesByDir.set(".", [])
        }
        filesByDir.get("." )!.push(entry.name)
      }
    }

    // Build output
    const output = []
    output.push(`${searchPath}/`)

    // List directories first
    for (const dir of Array.from(dirs).sort()) {
      output.push(`  ${dir}/`)
    }

    // List files
    const files = filesByDir.get(".") || []
    for (const file of files.sort()) {
      output.push(`  ${file}`)
    }

    return {
      title: searchPath,
      metadata: {
        count: entries.length,
        truncated: entries.length >= LIMIT,
      },
      output: output.join("\n"),
    }
  },
})
