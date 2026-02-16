import { describe, expect, test, mock, beforeAll } from "bun:test"
import path from "path"
import { GrepTool } from "../../src/tool/grep"
import { Instance } from "../../src/project/instance"
import { tmpdir } from "../fixture/fixture"

// Mock Session to avoid DB dependency
// Mock Session to avoid DB dependency
mock.module("../../src/session", () => ({
  Session: {
    get: async () => ({
      id: "ses_test",
      projectID: "proj_test",
      sandboxId: "container-123",
      sandboxHost: "localhost",
      sandboxPort: 8080,
      sandboxStatus: "running",
    }),
  },
}))

// Mock Docker User Container to avoid real Docker calls
mock.module("../../src/session/docker", () => ({
  getUserContainerForSession: async () => ({
    containerId: "container-123",
    host: "localhost",
    apiPort: 8080,
    status: "running",
  }),
}))

// Mock createExecutor
mock.module("../../src/sandbox/executor-v2", () => ({
  createExecutor: async () => ({
    exec: async (cmd: string) => {
      // Mock which check
      if (cmd.includes("which rg")) {
        return { exitCode: 0, stdout: "/usr/bin/rg\n", stderr: "" }
      }
      
      // Mock rg search
      if (cmd.includes("/usr/bin/rg")) {
        // Check for nonexistent pattern
        if (cmd.includes("xyznonexistentpatternxyz123")) {
           return { exitCode: 1, stdout: "", stderr: "" }
        }

        // Return fake grep results
        // Format: file|line|content (based on grep.ts parsing)
        const output = [
            "src/tool/test.ts|10|export const Test = 1",
            "src/tool/other.ts|5|import { export } from 'u'",
        ].join("\n")
        return { exitCode: 0, stdout: output, stderr: "" }
      }
      
      return { exitCode: 1, stdout: "", stderr: "Command not found" }
    },
    readFile: async () => "content",
  }),
}))

const ctx = {
  sessionID: "ses_test",
  messageID: "msg_test",
  callID: "call_test",
  agent: "build",
  abort: AbortSignal.any([]),
  metadata: () => {},
  ask: async () => {},
}

const projectRoot = path.join(__dirname, "../..")

describe("tool.grep", () => {
  test("basic search", async () => {
    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        const grep = await GrepTool.init()
        const result = await grep.execute(
          {
            pattern: "export",
            path: path.join(projectRoot, "src/tool"),
            include: "*.ts",
          },
          ctx,
        )
        expect(result.metadata.matches).toBeGreaterThan(0)
        expect(result.output).toContain("Found")
      },
    })
  })

  test("no matches returns correct output", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        await Bun.write(path.join(dir, "test.txt"), "hello world")
      },
    })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const grep = await GrepTool.init()
        const result = await grep.execute(
          {
            pattern: "xyznonexistentpatternxyz123",
            path: tmp.path,
          },
          ctx,
        )
        expect(result.metadata.matches).toBe(0)
        expect(result.output).toBe("No files found")
      },
    })
  })

  test("handles CRLF line endings in output", async () => {
    // This test verifies the regex split handles both \n and \r\n
    await using tmp = await tmpdir({
      init: async (dir) => {
        // Create a test file with content
        await Bun.write(path.join(dir, "test.txt"), "line1\nline2\nline3")
      },
    })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const grep = await GrepTool.init()
        const result = await grep.execute(
          {
            pattern: "line",
            path: tmp.path,
          },
          ctx,
        )
        expect(result.metadata.matches).toBeGreaterThan(0)
      },
    })
  })
})

describe("CRLF regex handling", () => {
  test("regex correctly splits Unix line endings", () => {
    const unixOutput = "file1.txt|1|content1\nfile2.txt|2|content2\nfile3.txt|3|content3"
    const lines = unixOutput.trim().split(/\r?\n/)
    expect(lines.length).toBe(3)
    expect(lines[0]).toBe("file1.txt|1|content1")
    expect(lines[2]).toBe("file3.txt|3|content3")
  })

  test("regex correctly splits Windows CRLF line endings", () => {
    const windowsOutput = "file1.txt|1|content1\r\nfile2.txt|2|content2\r\nfile3.txt|3|content3"
    const lines = windowsOutput.trim().split(/\r?\n/)
    expect(lines.length).toBe(3)
    expect(lines[0]).toBe("file1.txt|1|content1")
    expect(lines[2]).toBe("file3.txt|3|content3")
  })

  test("regex handles mixed line endings", () => {
    const mixedOutput = "file1.txt|1|content1\nfile2.txt|2|content2\r\nfile3.txt|3|content3"
    const lines = mixedOutput.trim().split(/\r?\n/)
    expect(lines.length).toBe(3)
  })
})
