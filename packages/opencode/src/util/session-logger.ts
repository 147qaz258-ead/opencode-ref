import path from "path"
import fs from "fs/promises"
import { Global } from "../global"
import { Log } from "./log"

export type LogEvent =
  | { type: "tool.start"; tool: string; input: any }
  | { type: "tool.end"; tool: string; output?: any; error?: string; duration: number }
  | { type: "http.request"; method: string; url: string; body?: any }
  | { type: "http.response"; status: number; body?: any; duration: number }
  | { type: "info"; message: string; data?: any }
  | { type: "error"; message: string; error?: any }

export class SessionLogger {
  private logPath: string
  private queue: string[] = []
  private flushing = false
  private sessionId: string

  private constructor(sessionId: string) {
    this.sessionId = sessionId
    this.logPath = path.join(Global.Path.log, `session-${sessionId}.log`)
  }

  private static instances = new Map<string, SessionLogger>()

  static get(sessionId: string): SessionLogger {
    if (!this.instances.has(sessionId)) {
      this.instances.set(sessionId, new SessionLogger(sessionId))
    }
    return this.instances.get(sessionId)!
  }

  log(event: LogEvent) {
    const entry = JSON.stringify({
      ts: new Date().toISOString(),
      sid: this.sessionId,
      ...event,
    }) + "\n"

    this.queue.push(entry)
    this.flush().catch((err) => {
      console.error("Failed to write to session log:", err)
    })
  }

  info(message: string, data?: any) {
    this.log({ type: "info", message, data })
  }

  error(message: string, error?: any) {
    this.log({
      type: "error",
      message,
      error: error instanceof Error ? { message: error.message, stack: error.stack } : error,
    })
  }

  private async flush() {
    if (this.flushing || this.queue.length === 0) return
    this.flushing = true

    try {
      // Ensure log directory exists (it should, but just in case)
      await fs.mkdir(Global.Path.log, { recursive: true }).catch(() => {})

      while (this.queue.length > 0) {
        const chunk = this.queue.join("")
        this.queue = [] // Clear queue immediately
        await fs.appendFile(this.logPath, chunk, "utf-8")
      }
    } finally {
      this.flushing = false
      // If new logs came in while flushing, flush again
      if (this.queue.length > 0) {
        this.flush()
      }
    }
  }
}
