/**
 * Write Tool - Docker Exec Implementation
 *
 * Writes file contents to the sandbox workspace via Docker exec.
 */

import z from "zod"
import { Tool } from "./tool"
import { createTwoFilesPatch } from "diff"
import DESCRIPTION from "./write.txt"
import { Bus } from "../bus"
import { File } from "../file"
import { FileTime } from "../file/time"
import { Session } from "../session"
import { createExecutorForSession } from "../sandbox/executor-v2"
import { getUserContainerForSession } from "../session/docker"
import { trimDiff } from "./edit"

const MAX_DIAGNOSTICS_PER_FILE = 20
const MAX_PROJECT_DIAGNOSTICS_FILES = 5

export const WriteTool = Tool.define("write", {
  description: DESCRIPTION,
  parameters: z.object({
    content: z.string().describe("The content to write to the file"),
    filePath: z.string().describe("The absolute path to the file in sandbox (e.g., /home/ubuntu/src/index.ts)"),
  }),
  async execute(params, ctx) {
    // Use raw file path (absolute path preferred by backend)
    const filepath = params.filePath

    const executor = await createExecutorForSession(ctx.sessionID, getUserContainerForSession)

    // Check if file exists
    const stat = await executor.fileStat(filepath)
    const exists = stat.exists

    // Get old content for diff if file exists
    let contentOld = ""
    if (exists) {
      contentOld = await executor.readFile(filepath)
      await FileTime.assert(ctx.sessionID, filepath)
    }

    // Create diff for preview
    const diff = trimDiff(createTwoFilesPatch(filepath, filepath, contentOld, params.content))

    // Ask for permission
    await ctx.ask({
      permission: "edit",
      patterns: [filepath],
      always: ["*"],
      metadata: {
        filepath,
        diff,
      },
    })

    // Write file to sandbox via Docker exec
    const writeResult = await executor.writeFile(filepath, params.content)

    // Publish edit event
    await Bus.publish(File.Event.Edited, {
      file: filepath,
    })
    FileTime.read(ctx.sessionID, filepath)

    // 发布渲染事件到多态容器
    const ext = filepath.split(".").pop()?.toLowerCase()
    let renderType: "markdown" | "code" | "image" = "code"
    let language = "text"

    if (ext === "md") {
      renderType = "markdown"
    } else if (["png", "jpg", "jpeg", "gif", "svg", "webp"].includes(ext || "")) {
      renderType = "image"
    } else {
      const langMap: Record<string, string> = {
        ts: "typescript",
        js: "javascript",
        py: "python",
        rs: "rust",
        go: "go",
        java: "java",
        cpp: "cpp",
        html: "html",
        css: "css",
        json: "json",
        xml: "xml",
      }
      language = langMap[ext || ""] || "text"
    }

    const fileContent = await executor.readFile(filepath)

    // DIAGNOSTIC LOG: Before publishing MonitorAction event
    console.log(`[DIAGNOSTIC write.ts] Publishing Bus.MonitorAction:`, {
      ctx_sessionID: ctx.sessionID,
      renderType,
      filePath: filepath,
      timestamp: Date.now(),
    })

    await Bus.publish(Bus.MonitorAction, {
      sessionId: ctx.sessionID,
      actionId: `action-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      timestamp: Date.now(),
      renderType,
      data: {
        filePath: filepath, // 透传原则：直接使用模型提供的路径，不做隐式修改
        content: fileContent,
        language: renderType === "code" ? language : undefined,
      },
    } satisfies z.output<typeof Bus.MonitorAction.properties>)

    // DIAGNOSTIC LOG: After publishing
    console.log(`[DIAGNOSTIC write.ts] Bus.MonitorAction published successfully`)

    // Empty diagnostics for now (could be added later)
    const diagnostics: Record<string, unknown> = {}

    let output = ""

    return {
      title: filepath,
      metadata: {
        diagnostics,
        filepath,
        exists: exists,
        size: writeResult.size,
      },
      output,
    }
  },
})
