import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { HttpApiBackend } from "@/sandbox/backend/http-api"

// Mock fetch with proper Response interface implementation
let mockFetch: ReturnType<typeof spyOnFetch>
let originalFetch: typeof global.fetch

function spyOnFetch() {
  const mockResponses: Map<string, { status: number; body: any }> = new Map()

  // Store original fetch
  originalFetch = global.fetch

  global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
    const mock = mockResponses.get(url)

    if (!mock) {
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        statusText: "Not Found",
      })
    }

    return new Response(JSON.stringify(mock.body), {
      status: mock.status,
      statusText: mock.status >= 200 && mock.status < 300 ? "OK" : "Error",
    })
  }

  return {
    setResponse: (url: string, status: number, body: any) => {
      mockResponses.set(url, { status, body })
    },
    clear: () => {
      mockResponses.clear()
    },
    restore: () => {
      global.fetch = originalFetch
    },
  }
}

describe("HttpApiBackend", () => {
  let backend: HttpApiBackend

  beforeEach(() => {
    mockFetch = spyOnFetch()
  })

  afterEach(() => {
    mockFetch.clear()
    mockFetch.restore()
  })

  describe("exec", () => {
    it("should execute command via HTTP API", async () => {
      backend = new HttpApiBackend({
        containerId: "test-container",
        port: 8080,
      })

      mockFetch.setResponse("http://test-container:8080/api/v1/shell/exec", 200, {
        data: {
          exit_code: 0,
          console: ["output line 1", "output line 2"],
          error: "",
        },
      })

      const result = await backend.exec("ls -la", {
        sessionId: "test-session",
        workdir: "/home/ubuntu",
      })

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toBe("output line 1output line 2")
    })

    it("should handle HTTP errors", async () => {
      backend = new HttpApiBackend({
        containerId: "test-container",
        port: 8080,
      })

      // Set up multiple responses: first fails with 500, then always fails
      // This tests that the retry logic eventually throws an error after max retries
      mockFetch.setResponse("http://test-container:8080/api/v1/shell/exec", 500, {
        error: "Internal server error",
      })
      mockFetch.setResponse("http://test-container:8080/api/v1/shell/exec", 500, {
        error: "Internal server error",
      })
      mockFetch.setResponse("http://test-container:8080/api/v1/shell/exec", 500, {
        error: "Internal server error",
      })

      try {
        await backend.exec("ls -la", {
          sessionId: "test-session",
          workdir: "/home/ubuntu",
        })
        expect("Should have thrown error").toBe(false)
      } catch (error) {
        // After implementing retry logic, HTTP 500 errors trigger retries
        // After max retries, the error is thrown
        expect((error as Error).message).toContain("500")
      }
    })

    it("should handle abort signal", async () => {
      backend = new HttpApiBackend({
        containerId: "test-container",
        port: 8080,
      })

      // Test 1: Pre-aborted signal
      const abortController = new AbortController()
      abortController.abort()

      await expect(
        backend.exec("ls -la", {
          sessionId: "test-session",
          workdir: "/home/ubuntu",
          abort: abortController.signal,
        })
      ).rejects.toThrow("The operation was aborted")
    })
  })

  describe("readFile", () => {
    it("should read file content", async () => {
      backend = new HttpApiBackend({
        containerId: "test-container",
        port: 8080,
      })

      mockFetch.setResponse("http://test-container:8080/api/v1/file/read", 200, {
        data: {
          content: "file content",
        },
      })

      const content = await backend.readFile("/home/ubuntu/test.txt")

      expect(content).toBe("file content")
    })
  })

  describe("writeFile", () => {
    it("should write file content", async () => {
      backend = new HttpApiBackend({
        containerId: "test-container",
        port: 8080,
      })

      mockFetch.setResponse("http://test-container:8080/api/v1/file/write", 200, {
        data: {
          size: 12,
        },
      })

      const result = await backend.writeFile("/home/ubuntu/test.txt", "file content")

      expect(result.written).toBe(true)
      expect(result.size).toBe(12)
    })
  })

  describe("fileExists", () => {
    it("should return true when file exists", async () => {
      backend = new HttpApiBackend({
        containerId: "test-container",
        port: 8080,
      })

      mockFetch.setResponse("http://test-container:8080/api/v1/file/stat", 200, {
        data: {
          exists: true,
          type: "file",
        },
      })

      const exists = await backend.fileExists("/home/ubuntu/test.txt")

      expect(exists).toBe(true)
    })

    it("should return false when file does not exist", async () => {
      backend = new HttpApiBackend({
        containerId: "test-container",
        port: 8080,
      })

      mockFetch.setResponse("http://test-container:8080/api/v1/file/stat", 200, {
        data: {
          exists: false,
        },
      })

      const exists = await backend.fileExists("/home/ubuntu/nonexistent.txt")

      expect(exists).toBe(false)
    })
  })

  describe("fileStat", () => {
    it("should return file stats when file exists", async () => {
      backend = new HttpApiBackend({
        containerId: "test-container",
        port: 8080,
      })

      // fileStat uses exec internally with 'stat' command
      mockFetch.setResponse("http://test-container:8080/api/v1/shell/exec", 200, {
        data: {
          exit_code: 0,
          console: ['{"size":123,"type":"regular file","modified":1672531200}'],
          error: "",
        },
      })

      const stat = await backend.fileStat("/home/ubuntu/test.txt")

      expect(stat.exists).toBe(true)
      expect(stat.type).toBe("file")
      expect(stat.size).toBe(123)
      expect(stat.modified).toBe(1672531200000) // Converted to ms
    })

    it("should return empty stats when file does not exist", async () => {
      backend = new HttpApiBackend({
        containerId: "test-container",
        port: 8080,
      })

      // fileStat uses exec internally - non-zero exit code means file not found
      mockFetch.setResponse("http://test-container:8080/api/v1/shell/exec", 200, {
        data: {
          exit_code: 1,
          console: ["stat: cannot stat '/home/ubuntu/nonexistent.txt': No such file or directory"],
          error: "",
        },
      })

      const stat = await backend.fileStat("/home/ubuntu/nonexistent.txt")

      expect(stat.exists).toBe(false)
    })
  })

  describe("listDir", () => {
    it("should list directory contents", async () => {
      backend = new HttpApiBackend({
        containerId: "test-container",
        port: 8080,
      })

      mockFetch.setResponse("http://test-container:8080/api/v1/file/list", 200, {
        data: {
          entries: [
            { name: "file1.txt", type: "file", size: 100 },
            { name: "dir1", type: "directory", size: 0 },
          ],
        },
      })

      const entries = await backend.listDir("/home/ubuntu")

      expect(entries).toHaveLength(2)
      expect(entries[0]).toEqual({
        name: "file1.txt",
        type: "file",
        size: 100,
      })
      expect(entries[1]).toEqual({
        name: "dir1",
        type: "directory",
        size: 0,
      })
    })
  })

  describe("findFiles", () => {
    it("should find files matching pattern", async () => {
      backend = new HttpApiBackend({
        containerId: "test-container",
        port: 8080,
      })

      mockFetch.setResponse("http://test-container:8080/api/v1/file/find", 200, {
        data: {
          files: ["/home/ubuntu/file1.txt", "/home/ubuntu/file2.txt"],
        },
      })

      const files = await backend.findFiles("/home/ubuntu", "*.txt")

      expect(files).toEqual(["/home/ubuntu/file1.txt", "/home/ubuntu/file2.txt"])
    })
  })

  describe("cleanup", () => {
    it("should clear shell sessions", async () => {
      backend = new HttpApiBackend({
        containerId: "test-container",
        port: 8080,
      })

      // Simulate some sessions
      backend["shellSessions"].set("session1", { id: "session1", workdir: "/home/ubuntu" })
      backend["shellSessions"].set("session2", { id: "session2", workdir: "/home/ubuntu" })

      await backend.cleanup()

      expect(backend["shellSessions"].size).toBe(0)
    })
  })
})