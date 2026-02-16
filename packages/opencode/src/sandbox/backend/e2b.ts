/**
 * E2B Sandbox Backend
 *
 * Sandbox backend implementation using E2B cloud infrastructure.
 * E2B provides secure, isolated cloud sandboxes for code execution.
 *
 * @see https://e2b.dev/docs
 */

import { Log } from "@/util/log"
import { SessionLogger } from "@/util/session-logger"
import type {
  DirEntry,
  ExecOptions,
  ExecResult,
  FileStat,
  ReadOptions,
  SandboxBackend,
  WriteOptions,
  WriteResult,
} from "./index"

const log = Log.create({ service: "sandbox.backend.e2b" })

export interface E2BBackendConfig {
  /** E2B sandbox ID (reuses existing sandbox) or template ID (creates new) */
  sandboxId?: string
  /** E2B API key */
  apiKey: string
  /** Session ID (optional, for logging) */
  sessionId?: string
  /** Request timeout in milliseconds */
  timeout?: number
  /** Custom E2B template ID (optional) */
  templateId?: string
}

/**
 * E2B Sandbox Backend
 *
 * Implements SandboxBackend interface using E2B's JavaScript SDK.
 */
export class E2BBackend implements SandboxBackend {
  readonly type = "e2b"
  private sandbox: any = null
  private timeout: number
  private logger?: SessionLogger
  private apiKey: string
  private templateId?: string

  constructor(config: E2BBackendConfig) {
    this.apiKey = config.apiKey
    this.templateId = config.templateId
    this.timeout = config.timeout || 120000

    if (config.sessionId) {
      this.logger = SessionLogger.get(config.sessionId)
    }

    log.info("E2B backend created", {
      sandboxId: config.sandboxId,
      templateId: config.templateId,
      sessionId: config.sessionId,
    })
  }

  /**
   * Initialize E2B sandbox connection
   */
  private async initialize(): Promise<void> {
    if (this.sandbox) {
      return // Already initialized
    }

    try {
      // Import from underlying e2b package for full API support
      const { Sandbox } = await import("e2b")
      this.sandbox = await Sandbox.create({
        apiKey: this.apiKey,
        id: this.templateId,
        timeoutMs: this.timeout,
      })

      log.info("E2B sandbox created", { sandboxId: this.sandbox.sandboxId })
    } catch (error) {
      log.error("Failed to create E2B sandbox", { error })
      throw new Error(
        `Failed to create E2B sandbox: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  /**
   * Ensure sandbox is initialized before operations
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.sandbox) {
      await this.initialize()
    }
  }

  /**
   * Execute a shell command in the E2B sandbox
   */
  async exec(command: string, options: ExecOptions = {}): Promise<ExecResult> {
    await this.ensureInitialized()

    if (!this.sandbox) {
      throw new Error("Sandbox not initialized")
    }

    const { sessionId, workdir = "/home", timeout = this.timeout, abort } = options

    log.debug("Executing command via E2B", { sessionId, command, workdir, timeout })

    // Check if signal is already aborted
    if (abort?.aborted) {
      throw new DOMException("The operation was aborted", "AbortError")
    }

    try {
      // E2B's runCode with shell command
      const startTime = Date.now()

      // Change to workdir first, then execute command
      const fullCommand = workdir ? `cd "${workdir}" && ${command}` : command

      // Use commands.exec() instead of process.output()
      const result = await this.sandbox.commands.run(fullCommand, {
        timeoutMs: timeout,
      })

      const duration = Date.now() - startTime

      if (this.logger) {
        this.logger.log({
          type: "sandbox.exec",
          command: fullCommand,
          exitCode: result.exitCode,
          duration,
        })
      }

      return {
        exitCode: result.exitCode ?? 0,
        stdout: result.stdout || "",
        stderr: result.stderr || "",
      }
    } catch (error) {
      log.error("E2B exec failed", { error, command })

      // Handle abort signal
      if (abort?.aborted || error instanceof DOMException) {
        throw new DOMException("The operation was aborted", "AbortError")
      }

      throw error
    }
  }

  /**
   * Read file content from the sandbox
   */
  async readFile(path: string, options?: ReadOptions): Promise<string> {
    await this.ensureInitialized()

    if (!this.sandbox) {
      throw new Error("Sandbox not initialized")
    }

    log.debug("Reading file via E2B", { path, options })

    try {
      // E2B SDK: use files.read(path) for string content
      const content = await this.sandbox.files.read(path)

      // Handle line range if specified
      if (options?.startLine || options?.endLine) {
        const lines = content.split("\n")
        const start = options.startLine ? options.startLine - 1 : 0
        const end = options.endLine ? options.endLine : lines.length
        return lines.slice(start, end).join("\n")
      }

      return content
    } catch (error) {
      log.error("E2B file read failed", { error, path })
      throw new Error(
        `Failed to read file ${path}: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  /**
   * Write file content to the sandbox
   */
  async writeFile(path: string, content: string, options?: WriteOptions): Promise<WriteResult> {
    await this.ensureInitialized()

    if (!this.sandbox) {
      throw new Error("Sandbox not initialized")
    }

    log.debug("Writing file via E2B", { path, size: content.length, options })

    try {
      if (options?.append) {
        // Read existing content and append
        try {
          const existing = await this.sandbox.files.read(path)
          await this.sandbox.files.write(path, existing + content)
        } catch {
          // File doesn't exist, just write new content
          await this.sandbox.files.write(path, content)
        }
      } else {
        await this.sandbox.files.write(path, content)
      }

      return {
        path,
        size: content.length,
        written: true,
      }
    } catch (error) {
      log.error("E2B file write failed", { error, path })
      throw new Error(
        `Failed to write file ${path}: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  /**
   * Check if file/directory exists in the sandbox
   */
  async fileExists(path: string): Promise<boolean> {
    await this.ensureInitialized()

    if (!this.sandbox) {
      throw new Error("Sandbox not initialized")
    }

    log.debug("Checking file existence via E2B", { path })

    try {
      // Try to list files in parent directory
      const parts = path.split("/")
      const parentDir = parts.slice(0, -1).join("/") || "/"
      const fileName = parts[parts.length - 1]

      const files = await this.sandbox.files.list(parentDir)
      return files.some((f) => f.name === fileName || f.name === fileName + "/")
    } catch (error) {
      log.debug("File exists check failed", { path, error })
      return false
    }
  }

  /**
   * Get file status from the sandbox
   */
  async fileStat(path: string): Promise<FileStat> {
    await this.ensureInitialized()

    if (!this.sandbox) {
      throw new Error("Sandbox not initialized")
    }

    log.debug("Getting file stat via E2B", { path })

    try {
      // Use shell command to get file stats
      const cmd = `stat -c '{"exists":true,"type":"%F","size":%s,"modified":%Y}' "${path}" 2>/dev/null || echo '{"exists":false}'`

      const result = await this.sandbox.commands.run(cmd, {
        timeoutMs: 5000,
      })

      if (result.exitCode !== 0 || !result.stdout) {
        return { exists: false }
      }

      const statInfo = JSON.parse(result.stdout.trim())

      if (!statInfo.exists) {
        return { exists: false }
      }

      // Map E2B file types to our types
      let type: "file" | "directory" = "file"
      if (statInfo.type && statInfo.type.toLowerCase().includes("directory")) {
        type = "directory"
      }

      return {
        exists: true,
        type,
        size: statInfo.size,
        modified: statInfo.modified * 1000, // Convert to milliseconds
      }
    } catch (error) {
      log.debug("File stat failed", { path, error })
      return { exists: false }
    }
  }

  /**
   * List directory contents in the sandbox
   */
  async listDir(path: string): Promise<DirEntry[]> {
    await this.ensureInitialized()

    if (!this.sandbox) {
      throw new Error("Sandbox not initialized")
    }

    log.debug("Listing directory via E2B", { path })

    try {
      const files = await this.sandbox.files.list(path)

      const entries: DirEntry[] = []

      for (const file of files) {
        entries.push({
          name: file.name,
          type: file.type === "dir" ? "directory" : "file",
        })
      }

      return entries
    } catch (error) {
      log.error("E2B list directory failed", { error, path })
      throw new Error(
        `Failed to list directory ${path}: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  /**
   * Find files matching glob pattern in the sandbox
   */
  async findFiles(path: string, pattern: string): Promise<string[]> {
    await this.ensureInitialized()

    if (!this.sandbox) {
      throw new Error("Sandbox not initialized")
    }

    log.debug("Finding files via E2B", { path, pattern })

    try {
      // E2B's files.list() returns all files, we need to filter
      const files = await this.sandbox.files.list(path)

      // Convert glob pattern to regex for filtering
      const regex = new RegExp(
        "^" +
          pattern
            .replace(/\*/g, ".*")
            .replace(/\?/g, ".") +
          "$"
      )

      // Filter files by pattern
      const matchedFiles = files.filter((f) => regex.test(f.name))

      // Return full paths
      return matchedFiles.map((f) => `${path}/${f.name}`.replace(/\/+/g, "/"))
    } catch (error) {
      log.error("E2B find files failed", { error, path, pattern })
      throw new Error(
        `Failed to find files: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  /**
   * Cleanup E2B sandbox resources
   */
  async cleanup(): Promise<void> {
    if (this.sandbox) {
      try {
        await this.sandbox.kill()
        log.info("E2B sandbox killed", { sandboxId: this.sandbox.sandboxId })
      } catch (error) {
        log.warn("Failed to kill E2B sandbox", { error })
      }
      this.sandbox = null
    }
  }
}
