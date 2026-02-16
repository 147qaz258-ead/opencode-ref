import { describe, expect, test, mock } from "bun:test"
import path from "path"
import { ReadTool } from "../../src/tool/read"
import { Instance } from "../../src/project/instance"
import { tmpdir } from "../fixture/fixture"
import { PermissionNext } from "../../src/permission/next"
import { Agent } from "../../src/agent/agent"

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
    exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
    readFile: async (filepath: string) => {
        // Return content based on filepath if needed
        if (filepath.includes("test.txt")) return "hello world\nline2\nline3"
        if (filepath.includes("secret.txt")) return "secret data"
        if (filepath.includes("internal.txt")) return "internal content"
        return "default content"
    },
    fileStat: async (filepath: string) => ({ 
        exists: true, 
        type: "file",
        size: 100
    }),
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



describe("tool.read env file blocking", () => {
  const cases: [string, boolean][] = [
    [".env", true],
    [".env.local", true],
    [".env.production", true],
    [".env.development.local", true],
    [".env.example", false],
    [".envrc", false],
    ["environment.ts", false],
  ]

  describe.each(["build", "plan"])("agent=%s", (agentName) => {
    test.each(cases)("%s blocked=%s", async (filename, blocked) => {
      await using tmp = await tmpdir({
        init: (dir) => Bun.write(path.join(dir, filename), "content"),
      })
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const agent = await Agent.get(agentName)
          const ctxWithPermissions = {
            ...ctx,
            ask: async (req: Omit<PermissionNext.Request, "id" | "sessionID" | "tool">) => {
              for (const pattern of req.patterns) {
                const rule = PermissionNext.evaluate(req.permission, pattern, agent.permission)
                if (rule.action === "deny") {
                  throw new PermissionNext.DeniedError(agent.permission)
                }
              }
            },
          }
          const read = await ReadTool.init()
          const promise = read.execute({ filePath: path.join(tmp.path, filename) }, ctxWithPermissions)
          if (blocked) {
            await expect(promise).rejects.toThrow(PermissionNext.DeniedError)
          } else {
            expect((await promise).output).toContain("content")
          }
        },
      })
    })
  })
})
