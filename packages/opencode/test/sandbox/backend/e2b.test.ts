/**
 * E2B Backend Tests
 *
 * Test suite for E2B sandbox backend implementation.
 * Tests follow TDD methodology: RED → GREEN → REFACTOR
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { E2BBackend } from "@/sandbox/backend/e2b"
import type { ExecOptions, ExecResult } from "@/sandbox/backend/index"

// Mock E2B SDK
vi.mock("@e2b/code-interpreter", () => ({
  Sandbox: {
    create: vi.fn(),
  },
}))

describe("E2BBackend", () => {
  let backend: E2BBackend
  const mockSandbox = {
    kill: vi.fn(),
    sandboxId: "test-sandbox-id",
    commands: {
      run: vi.fn(),  // E2B SDK uses commands.run(cmd, options)
    },
    files: {
      write: vi.fn(),   // E2B SDK uses files.write(path, data)
      read: vi.fn(),    // E2B SDK uses files.read(path)
      list: vi.fn(),    // E2B SDK uses files.list(path) -> returns {name, type}[]
    },
  }

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks()

    // Create backend instance
    backend = new E2BBackend({
      sandboxId: "test-sandbox-id",
      apiKey: "test-api-key",
      sessionId: "test-session-id",
      timeout: 120000,
    })
  })

  afterEach(async () => {
    await backend.cleanup?.()
  })

  describe("exec", () => {
    it("should execute command successfully and return stdout", async () => {
      const command = "echo 'Hello World'"
      const options: ExecOptions = {
        sessionId: "test-session",
        workdir: "/home/test",
        timeout: 5000,
      }

      // Mock E2B process execution
      mockSandbox.commands.run.mockResolvedValue({
        stdout: "Hello World\n",
        stderr: "",
        exitCode: 0,
      })

      // Inject mock sandbox
      ;(backend as any).sandbox = mockSandbox

      const result: ExecResult = await backend.exec(command, options)

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toBe("Hello World\n")
      expect(result.stderr).toBe("")
      expect(mockSandbox.commands.run).toHaveBeenCalledWith(
        expect.stringContaining("echo"),
        { timeoutMs: 5000 }
      )
    })

    it("should handle command execution with errors", async () => {
      const command = "ls /nonexistent"
      const options: ExecOptions = {
        sessionId: "test-session",
        workdir: "/home/test",
      }

      mockSandbox.commands.run.mockResolvedValue({
        stdout: "",
        stderr: "ls: /nonexistent: No such file or directory\n",
        exitCode: 2,
      })

      ;(backend as any).sandbox = mockSandbox

      const result = await backend.exec(command, options)

      expect(result.exitCode).toBe(2)
      expect(result.stdout).toBe("")
      expect(result.stderr).toContain("No such file or directory")
    })

    it("should handle command timeout", async () => {
      const command = "sleep 100"
      const options: ExecOptions = {
        sessionId: "test-session",
        timeout: 100, // 100ms timeout
      }

      mockSandbox.commands.run.mockRejectedValue(
        new Error("Execution timeout")
      )

      ;(backend as any).sandbox = mockSandbox

      await expect(backend.exec(command, options)).rejects.toThrow(
        "Execution timeout"
      )
    })

    it("should respect abort signal", async () => {
      const command = "long-running-command"
      const abortController = new AbortController()
      const options: ExecOptions = {
        sessionId: "test-session",
        abort: abortController.signal,
      }

      // Abort immediately
      abortController.abort()

      mockSandbox.commands.run.mockRejectedValue(
        new DOMException("Aborted", "AbortError")
      )

      ;(backend as any).sandbox = mockSandbox

      await expect(backend.exec(command, options)).rejects.toThrow("operation was aborted")
    })
  })

  describe("readFile", () => {
    it("should read file content successfully", async () => {
      const filePath = "/home/test/file.txt"
      const content = "File content here"

      mockSandbox.files.read.mockResolvedValue(content)

      ;(backend as any).sandbox = mockSandbox

      const result = await backend.readFile(filePath)

      expect(result).toBe(content)
      expect(mockSandbox.files.read).toHaveBeenCalledWith(filePath)
    })

    it("should read file with line range", async () => {
      const filePath = "/home/test/file.txt"
      const content = "line1\nline2\nline3\nline4\nline5"

      mockSandbox.files.read.mockResolvedValue(content)

      ;(backend as any).sandbox = mockSandbox

      const result = await backend.readFile(filePath, {
        startLine: 2,
        endLine: 4,
      })

      expect(result).toBe("line2\nline3\nline4")
    })

    it("should throw error when file not found", async () => {
      const filePath = "/nonexistent/file.txt"

      mockSandbox.files.read.mockRejectedValue(
        new Error("File not found")
      )

      ;(backend as any).sandbox = mockSandbox

      await expect(backend.readFile(filePath)).rejects.toThrow("File not found")
    })
  })

  describe("writeFile", () => {
    it("should write file content successfully", async () => {
      const filePath = "/home/test/newfile.txt"
      const content = "New file content"

      mockSandbox.files.write.mockResolvedValue(undefined)

      ;(backend as any).sandbox = mockSandbox

      const result = await backend.writeFile(filePath, content)

      expect(result.written).toBe(true)
      expect(result.path).toBe(filePath)
      expect(result.size).toBe(content.length)
      expect(mockSandbox.files.write).toHaveBeenCalledWith(
        filePath,
        content
      )
    })

    it("should append to existing file when append option is true", async () => {
      const filePath = "/home/test/existing.txt"
      const content = "Appended content"
      const existingContent = "Existing content"

      mockSandbox.files.read.mockResolvedValue(existingContent)
      mockSandbox.files.write.mockResolvedValue(undefined)

      ;(backend as any).sandbox = mockSandbox

      const result = await backend.writeFile(filePath, content, {
        append: true,
      })

      expect(result.written).toBe(true)
      // E2B may need special handling for append mode
      expect(mockSandbox.files.write).toHaveBeenCalled()
      expect(mockSandbox.files.read).toHaveBeenCalledWith(filePath)
    })
  })

  describe("fileExists", () => {
    it("should return true when file exists", async () => {
      const filePath = "/home/test/existing.txt"

      mockSandbox.files.list.mockResolvedValue([
        { name: "existing.txt", type: "file" },
      ])

      ;(backend as any).sandbox = mockSandbox

      const exists = await backend.fileExists(filePath)

      expect(exists).toBe(true)
    })

    it("should return false when file does not exist", async () => {
      const filePath = "/home/test/nonexistent.txt"

      mockSandbox.files.list.mockResolvedValue([])

      ;(backend as any).sandbox = mockSandbox

      const exists = await backend.fileExists(filePath)

      expect(exists).toBe(false)
    })

    it("should handle errors gracefully", async () => {
      const filePath = "/invalid/path"

      mockSandbox.files.list.mockRejectedValue(new Error("Path error"))

      ;(backend as any).sandbox = mockSandbox

      const exists = await backend.fileExists(filePath)

      expect(exists).toBe(false)
    })
  })

  describe("fileStat", () => {
    it("should return file stats for existing file", async () => {
      const filePath = "/home/test/file.txt"
      const mockStat = {
        exists: true,
        type: "file" as const,
        size: 1024,
        modified: Date.now(),
      }

      mockSandbox.commands.run.mockResolvedValue({
        stdout: JSON.stringify(mockStat),
        stderr: "",
        exitCode: 0,
      })

      ;(backend as any).sandbox = mockSandbox

      const stat = await backend.fileStat(filePath)

      expect(stat.exists).toBe(true)
      expect(stat.type).toBe("file")
      expect(stat.size).toBe(1024)
    })

    it("should return exists: false for non-existent file", async () => {
      const filePath = "/nonexistent/file.txt"

      mockSandbox.commands.run.mockResolvedValue({
        stdout: "",
        stderr: "stat: cannot stat",
        exitCode: 1,
      })

      ;(backend as any).sandbox = mockSandbox

      const stat = await backend.fileStat(filePath)

      expect(stat.exists).toBe(false)
    })

    it("should identify directories", async () => {
      const filePath = "/home/test/folder"
      const mockStat = {
        exists: true,
        type: "directory" as const,
        size: 4096,
        modified: Date.now(),
      }

      mockSandbox.commands.run.mockResolvedValue({
        stdout: JSON.stringify(mockStat),
        stderr: "",
        exitCode: 0,
      })

      ;(backend as any).sandbox = mockSandbox

      const stat = await backend.fileStat(filePath)

      expect(stat.exists).toBe(true)
      expect(stat.type).toBe("directory")
    })
  })

  describe("listDir", () => {
    it("should list directory contents", async () => {
      const dirPath = "/home/test"
      const entries = [
        { name: "file1.txt", type: "file" as const },
        { name: "file2.txt", type: "file" as const },
        { name: "subfolder", type: "dir" as const },
      ]

      mockSandbox.files.list.mockResolvedValue(entries)

      ;(backend as any).sandbox = mockSandbox

      const result = await backend.listDir(dirPath)

      expect(result).toHaveLength(3)
      expect(result[0].name).toBe("file1.txt")
      expect(result[0].type).toBe("file")
    })

    it("should handle empty directory", async () => {
      const dirPath = "/home/test/empty"

      mockSandbox.files.list.mockResolvedValue([])

      ;(backend as any).sandbox = mockSandbox

      const result = await backend.listDir(dirPath)

      expect(result).toEqual([])
    })
  })

  describe("findFiles", () => {
    it("should find files matching glob pattern", async () => {
      const dirPath = "/home/test"
      const pattern = "*.txt"

      mockSandbox.files.list.mockResolvedValue([
        { name: "file1.txt", type: "file" },
        { name: "file2.txt", type: "file" },
        { name: "notes.txt", type: "file" },
      ])

      ;(backend as any).sandbox = mockSandbox

      const result = await backend.findFiles(dirPath, pattern)

      expect(result).toHaveLength(3)
      expect(result).toContain("/home/test/file1.txt")
      expect(result).toContain("/home/test/file2.txt")
      expect(result).toContain("/home/test/notes.txt")
    })

    it("should handle recursive pattern", async () => {
      const dirPath = "/home/test"
      const pattern = "**/*.ts"

      mockSandbox.files.list.mockResolvedValue([
        { name: "src/index.ts", type: "file" },
        { name: "src/utils/helper.ts", type: "file" },
        { name: "test/test.spec.ts", type: "file" },
      ])

      ;(backend as any).sandbox = mockSandbox

      const result = await backend.findFiles(dirPath, pattern)

      expect(result.length).toBeGreaterThan(0)
      expect(result.some((f) => f.endsWith(".ts"))).toBe(true)
    })

    it("should return empty array when no matches", async () => {
      const dirPath = "/home/test"
      const pattern = "*.nonexistent"

      mockSandbox.files.list.mockResolvedValue([])

      ;(backend as any).sandbox = mockSandbox

      const result = await backend.findFiles(dirPath, pattern)

      expect(result).toEqual([])
    })
  })

  describe("cleanup", () => {
    it("should kill sandbox on cleanup", async () => {
      ;(backend as any).sandbox = mockSandbox

      await backend.cleanup?.()

      expect(mockSandbox.kill).toHaveBeenCalled()
    })

    it("should handle cleanup when sandbox is null", async () => {
      ;(backend as any).sandbox = null

      await expect(backend.cleanup?.()).resolves.toBeUndefined()
    })

    it("should handle errors during cleanup", async () => {
      mockSandbox.kill.mockRejectedValue(new Error("Cleanup failed"))

      ;(backend as any).sandbox = mockSandbox

      // Cleanup should not throw
      await expect(backend.cleanup?.()).resolves.toBeUndefined()
    })
  })

  describe("backend type", () => {
    it("should have correct backend type identifier", () => {
      expect(backend.type).toBe("e2b")
    })
  })
})
