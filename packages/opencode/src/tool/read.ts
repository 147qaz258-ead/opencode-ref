/**
 * Read Tool - Docker Exec Implementation
 *
 * Reads file contents from the sandbox workspace via Docker exec.
 */

import z from "zod"
import { Tool } from "./tool"
import { FileTime } from "../file/time"
import DESCRIPTION from "./read.txt"
import { Instance } from "../project/instance"
import { Identifier } from "../id/id"
import { Session } from "../session"
import { createExecutorForSession } from "../sandbox/executor-v2"
import { getUserContainerForSession } from "../session/docker"

const DEFAULT_READ_LIMIT = 2000
const MAX_LINE_LENGTH = 2000

export const ReadTool = Tool.define("read", {
  description: DESCRIPTION,
  parameters: z.object({
    filePath: z.string().describe("The absolute path to the file to read (e.g., /home/ubuntu/src/index.ts)"),
    offset: z.coerce.number().describe("The line number to start reading from (0-based)").optional(),
    limit: z.coerce.number().describe("The number of lines to read (defaults to 2000)").optional(),
  }),
  async execute(params, ctx) {
    // Use raw file path (absolute path preferred by backend)
    const filepath = params.filePath

    const title = filepath

    // Request permission
    await ctx.ask({
      permission: "read",
      patterns: [filepath],
      always: ["*"],
      metadata: {},
    })

    const executor = await createExecutorForSession(ctx.sessionID, getUserContainerForSession)

    // Direct approach: check file type using test command (faster than stat, no fallback)
    const typeCheckResult = await executor.exec(`test -f "${filepath}" && echo "FILE" || (test -d "${filepath}" && echo "DIR" || echo "NOT_FOUND")`)
    const fileType = typeCheckResult.stdout.trim()

    if (fileType === "NOT_FOUND") {
      throw new Error(`File not found: ${filepath}`)
    }

    if (fileType === "DIR") {
      throw new Error(`Path is a directory, not a file: ${filepath}`)
    }

    // fileType === "FILE" - continue





    // Handle image files
    const ext = filepath.split(".").pop()?.toLowerCase() || ""
    const imageExts = ["png", "jpg", "jpeg", "gif", "bmp", "webp", "svg", "ico"]
    const pdfExts = ["pdf"]

    const isImage = imageExts.includes(ext) && ext !== "svg"
    const isPdf = pdfExts.includes(ext)

    if (isImage || isPdf) {
      const mime = isImage
        ? `image/${ext === "jpg" ? "jpeg" : ext}`
        : "application/pdf"

      // Read file as base64 for images/PDFs
      const result = await executor.exec(`base64 "${filepath}"`)

      if (result.exitCode !== 0) {
        throw new Error(`Failed to read file: ${result.stderr}`)
      }

      const base64Content = result.stdout.trim()

      return {
        title,
        output: `${isImage ? "Image" : "PDF"} read successfully`,
        metadata: {
          preview: `${isImage ? "Image" : "PDF"} read successfully`,
        },
        attachments: [
          {
            id: Identifier.ascending("part"),
            sessionID: ctx.sessionID,
            messageID: ctx.messageID,
            type: "file",
            mime,
            url: `data:${mime};base64,${base64Content}`,
          },
        ],
      }
    }

    // Check for binary files by extension
    const binaryExts = [
      "zip", "tar", "gz", "exe", "dll", "so", "class", "jar", "war",
      "7z", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "ods",
      "odp", "bin", "dat", "obj", "o", "a", "lib", "wasm", "pyc", "pyo"
    ]
    if (binaryExts.includes(ext)) {
      throw new Error(`Cannot read binary file: ${filepath}`)
    }

    // Read text file with optional offset/limit
    const limit = params.limit ?? DEFAULT_READ_LIMIT
    const offset = params.offset || 0

    let content = await executor.readFile(filepath, {
      startLine: offset + 1, // Backend is 1-indexed
      endLine: offset + limit,
    })

    // Clean up any remaining control characters or encoding artifacts
    // Remove BOM if present and other invisible control characters
    content = content.replace(/^\uFEFF/, "") // Remove UTF-8 BOM
    content = content.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "") // Remove control chars
    content = content.replace(/\r\n/g, "\n").replace(/\r/g, "") // Normalize line endings

    const lines = content.split("\n")
    const raw = lines.map((line) => {
      // Replace any remaining invalid UTF-8 sequences with replacement character
      const cleaned = line.replace(/[^\x20-\x7E\u4E00-\u9FFF\u3000-\u303F\u3040-\u309F\u30A0-\u30FF\uAC00-\uD7AF]/g, "�")
      return cleaned.length > MAX_LINE_LENGTH ? cleaned.substring(0, MAX_LINE_LENGTH) + "..." : cleaned
    })
    const formatted = raw.map((line, index) => {
      return `${(index + offset + 1).toString().padStart(5, "0")}| ${line}`
    })
    const preview = raw.slice(0, 20).join("\n")

    // Get total line count
    const fullContent = await executor.readFile(filepath)
    const totalLines = fullContent.split("\n").length

    const lastReadLine = offset + formatted.length
    const hasMoreLines = totalLines > lastReadLine

    let output = "<file>\n"
    output += formatted.join("\n")

    if (hasMoreLines) {
      output += `\n\n(File has more lines. Use 'offset' parameter to read beyond line ${lastReadLine})`
    } else {
      output += `\n\n(End of file - total ${totalLines} lines)`
    }
    output += "\n</file>"

    FileTime.read(ctx.sessionID, filepath)

    return {
      title,
      output,
      metadata: {
        preview,
      },
    }
  },
})
