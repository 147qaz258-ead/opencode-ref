/**
 * Grep Tool - Docker Exec Implementation
 *
 * Searches for patterns in files using ripgrep in the sandbox.
 */

import z from "zod"
import { Tool } from "./tool"
import DESCRIPTION from "./grep.txt"
import { Session } from "../session"
import { createExecutorForSession } from "../sandbox/executor-v2"
import { getUserContainerForSession } from "../session/docker"

const MAX_LINE_LENGTH = 2000

export const GrepTool = Tool.define("grep", {
  description: DESCRIPTION,
  parameters: z.object({
    pattern: z.string().describe("The regex pattern to search for in file contents"),
    path: z.string().optional().describe("The absolute directory path to search in (e.g., /home/ubuntu/src). Defaults to /home/ubuntu."),
    include: z.string().optional().describe('File pattern to include in the search (e.g. "*.js", "*.{ts,tsx}")'),
    ignoreCase: z.boolean().optional().describe("Case-insensitive search"),
    contextLines: z.number().optional().describe("Number of context lines to show around matches"),
  }),
  async execute(params, ctx) {
    if (!params.pattern) {
      throw new Error("pattern is required")
    }

    await ctx.ask({
      permission: "grep",
      patterns: [params.pattern],
      always: ["*"],
      metadata: {
        pattern: params.pattern,
        path: params.path,
        include: params.include,
      },
    })

    // Build ripgrep command
    const searchPath = params.path || "."

    // First, check if ripgrep is available in the container
    const executor = await createExecutorForSession(ctx.sessionID, getUserContainerForSession)
    const whichResult = await executor.exec("which rg || echo 'NOT_FOUND'", {
      workdir: "/home/ubuntu",
    })

    let rgCommand = whichResult.stdout.trim()

    if (rgCommand === "NOT_FOUND") {
      // Auto-install ripgrep if not available
      console.log("[GrepTool] ripgrep not found, installing...")
      const installResult = await executor.exec(
        "curl -LO https://github.com/BurntSushi/ripgrep/releases/download/14.1.0/ripgrep_14.1.0-1_amd64.deb && " +
        "dpkg -i ripgrep_14.1.0-1_amd64.deb && " +
        "rm ripgrep_14.1.0-1_amd64.deb && " +
        "which rg",
        {
          workdir: "/tmp",
          timeout: 60000, // 60 seconds for download and install
        }
      )

      if (installResult.exitCode !== 0) {
        // Fall back to grep if ripgrep installation fails
        console.warn("[GrepTool] Failed to install ripgrep, falling back to grep")
        rgCommand = "grep"
      } else {
        rgCommand = installResult.stdout.trim().split("\n").pop() || "rg"
        console.log("[GrepTool] ✅ ripgrep installed successfully")
      }
    }

    // If using grep instead of rg, adjust arguments
    const isGrepFallback = rgCommand === "grep"
    const fieldSeparator = isGrepFallback ? ":" : "|"

    let args: string[]
    if (isGrepFallback) {
      // Use standard grep syntax
      args = [rgCommand, "-nH"]
      if (params.ignoreCase) args.push("-i")
      if (params.contextLines !== undefined) args.push(`-C${params.contextLines}`)
      if (params.include) {
        // grep uses --include instead of --glob
        args.push("--include=" + params.include)
      }
      args.push("-e", params.pattern, searchPath)
    } else {
      // Use ripgrep syntax
      args = [rgCommand, "-nH", "--field-match-separator=|"]
      if (params.ignoreCase) args.push("-i")
      if (params.contextLines !== undefined) args.push(`-C${params.contextLines}`)
      if (params.include) args.push("--glob", params.include)
      args.push("--regexp", params.pattern, searchPath)
    }

    const command = args.join(" ")

    // Execute via Docker exec
    const result = await executor.exec(command, {
      workdir: "/home/ubuntu",
    })

    if (result.exitCode === 1) {
      // No matches found
      return {
        title: params.pattern,
        metadata: { matches: 0, truncated: false },
        output: "No files found",
      }
    }

    if (result.exitCode !== 0) {
      throw new Error(`ripgrep failed: ${result.stderr || result.stdout}`)
    }

    // Parse grep/ripgrep output
    const lines = result.stdout.trim().split(/\r?\n/)
    const matches = []

    for (const line of lines) {
      if (!line) continue

      // Split by separator (grep uses ":", ripgrep uses "|")
      const parts = line.split(fieldSeparator)
      if (parts.length < 3) continue

      const filePath = parts[0]
      const lineNumStr = parts[1]
      const lineText = parts.slice(2).join(fieldSeparator)

      const lineNum = parseInt(lineNumStr, 10)
      if (isNaN(lineNum)) continue

      matches.push({
        path: filePath,
        lineNum,
        lineText,
      })
    }

    const limit = 100
    const truncated = matches.length > limit
    const finalMatches = truncated ? matches.slice(0, limit) : matches

    if (finalMatches.length === 0) {
      return {
        title: params.pattern,
        metadata: { matches: 0, truncated: false },
        output: "No files found",
      }
    }

    const outputLines = [`Found ${finalMatches.length} matches`]

    let currentFile = ""
    for (const match of finalMatches) {
      if (currentFile !== match.path) {
        if (currentFile !== "") {
          outputLines.push("")
        }
        currentFile = match.path
        outputLines.push(`${match.path}:`)
      }
      const truncatedLineText =
        match.lineText.length > MAX_LINE_LENGTH
          ? match.lineText.substring(0, MAX_LINE_LENGTH) + "..."
          : match.lineText
      outputLines.push(`  Line ${match.lineNum}: ${truncatedLineText}`)
    }

    if (truncated) {
      outputLines.push("")
      outputLines.push("(Results are truncated. Consider using a more specific path or pattern.)")
    }

    return {
      title: params.pattern,
      metadata: {
        matches: finalMatches.length,
        truncated,
      },
      output: outputLines.join("\n"),
    }
  },
})
