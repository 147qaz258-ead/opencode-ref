/**
 * Sandbox Backend Interface
 *
 * Defines the contract for sandbox execution backends.
 * Supports multiple implementations: Docker Exec, E2B, Local, etc.
 */

export interface SandboxBackend {
  /** Backend type identifier */
  readonly type: string

  /**
   * Execute a command in the sandbox
   */
  exec(command: string, options: ExecOptions): Promise<ExecResult>

  /**
   * Read file content
   */
  readFile(path: string, options?: ReadOptions): Promise<string>

  /**
   * Write file content
   */
  writeFile(path: string, content: string, options?: WriteOptions): Promise<WriteResult>

  /**
   * Check if file/directory exists
   */
  fileExists(path: string): Promise<boolean>

  /**
   * Get file status
   */
  fileStat(path: string): Promise<FileStat>

  /**
   * List directory contents
   */
  listDir(path: string): Promise<DirEntry[]>

  /**
   * Find files matching glob pattern
   */
  findFiles(path: string, pattern: string): Promise<string[]>

  /**
   * Cleanup resources (optional)
   */
  cleanup?(): Promise<void>
}

export interface ExecOptions {
  /** Session ID */
  sessionId: string
  /** Working directory */
  workdir?: string
  /** Timeout in milliseconds */
  timeout?: number
  /** Abort signal */
  abort?: AbortSignal
}

export interface ExecResult {
  /** Exit code */
  exitCode: number
  /** Standard output */
  stdout: string
  /** Standard error */
  stderr: string
  /** Whether execution timed out */
  timedOut?: boolean
}

export interface ReadOptions {
  /** Start line (1-indexed) */
  startLine?: number
  /** End line (1-indexed) */
  endLine?: number
  /** Use sudo */
  sudo?: boolean
}

export interface WriteOptions {
  /** Append mode */
  append?: boolean
  /** Use sudo */
  sudo?: boolean
}

export interface WriteResult {
  /** File path */
  path: string
  /** File size */
  size: number
  /** Whether write was successful */
  written: boolean
}

export interface FileStat {
  /** Whether exists */
  exists: boolean
  /** Type: file or directory */
  type?: "file" | "directory"
  /** Size in bytes */
  size?: number
  /** Modified timestamp */
  modified?: number
}

export interface DirEntry {
  /** Entry name */
  name: string
  /** Entry type */
  type: "file" | "directory"
  /** Entry size (optional) */
  size?: number
}

export interface InitOptions {
  /** Session ID */
  sessionId?: string
  /** Container ID (required for http-api backend) */
  containerId?: string
  /** Host to connect to (localhost or container IP) */
  host?: string
  /** HTTP API port (for http-api backend) */
  port?: number
  /** Request timeout (for http-api backend) */
  timeout?: number
}

/**
 * Backend factory - creates appropriate backend instance
 *
 * Supported backends:
 * - "http-api": HTTP API to Docker containers
 * - "e2b": E2B cloud sandbox
 */
export async function createBackend(type: "http-api" | "e2b", options?: InitOptions): Promise<SandboxBackend>
export async function createBackend(type: string, options?: InitOptions): Promise<SandboxBackend> {
  if (type === "http-api") {
    const { HttpApiBackend } = await import("./http-api")
    return new HttpApiBackend({
      containerId: options?.host || options?.containerId || "localhost",
      port: options?.port || 8080,
      timeout: options?.timeout as number,
      sessionId: options?.sessionId,
    })
  }

  if (type === "e2b") {
    const { E2BBackend } = await import("./e2b")
    return new E2BBackend({
      apiKey: process.env.E2B_API_KEY || "",
      templateId: process.env.E2B_TEMPLATE_ID,
      sessionId: options?.sessionId,
      timeout: options?.timeout,
    })
  }

  throw new Error(`Unknown backend type: ${type}. Supported types: "http-api", "e2b"`)
}