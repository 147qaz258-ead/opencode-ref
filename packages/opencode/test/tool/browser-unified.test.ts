// File: packages/opencode/test/tool/browser-unified.test.ts

import { describe, it, expect, mock } from "bun:test"
import { Tool } from "../../src/tool/tool"

// Mock the modules that BrowserTool.init() depends on
mock.module("../../src/session", () => ({
  Session: {
    get: async () => ({
      id: "ses_test",
      projectID: "test-project",
      title: "Test Session"
    })
  }
}))

mock.module("../../src/docker/docker-manager", () => ({
  getDockerManager: () => ({
    getContainerIP: async () => ({
      ip: "127.0.0.1"
    })
  })
}))

mock.module("../../src/browser/playwright-client", () => ({
  PlaywrightClient: class {
    constructor() {}
    async initialize() { return true }
    async navigate() { return ["e0:<a>Link</a>"] }
    async click(index: number) {
      if (index > 10) {
        throw new Error("Element 9999 not found")
      }
    }
    async input() {}
    async screenshot() { return Buffer.from("fake") }
    async cleanup() {}
    async ensurePage() {
      return {
        url: () => "https://example.com",
        title: () => Promise.resolve("Example Domain"),
        evaluate: () => Promise.resolve("test"),
        waitForLoadState: () => Promise.resolve(),
        waitForSelector: () => Promise.resolve()
      }
    }
    async extractInteractiveElements() {
      return ["e0:<a>Link</a>"]
    }
  }
}))

mock.module("../../src/bus", () => ({
  Bus: {
    publish: mock(() => Promise.resolve()),
    MonitorAction: { properties: {} }
  }
}))

mock.module("../../src/artifact", () => ({
  Artifact: {
    createWithContent: mock(() => Promise.resolve({ id: "artifact-123" }))
  }
}))

describe("Unified Browser Tool", () => {
  describe("tool definition", () => {
    it("should have correct tool id", async () => {
      const { BrowserTool } = await import("../../src/tool/browser")
      const init = await BrowserTool()

      expect(init.description).toBeDefined()
      expect(init.parameters).toBeDefined()
    })
  })

  describe("parameter validation", () => {
    it("should accept navigate action", async () => {
      const { BrowserTool } = await import("../../src/tool/browser")
      const init = await BrowserTool()

      const result = init.parameters.safeParse({
        action: "navigate",
        url: "https://example.com"
      })
      expect(result.success).toBe(true)
    })

    it("should reject navigate without url", async () => {
      const { BrowserTool } = await import("../../src/tool/browser")
      const init = await BrowserTool()

      const result = init.parameters.safeParse({
        action: "navigate"
      })
      expect(result.success).toBe(false)
    })

    it("should accept act action with click", async () => {
      const { BrowserTool } = await import("../../src/tool/browser")
      const init = await BrowserTool()

      const result = init.parameters.safeParse({
        action: "act",
        request: {
          click: { ref: "e0" }
        }
      })
      expect(result.success).toBe(true)
    })

    it("should accept act action with script", async () => {
      const { BrowserTool } = await import("../../src/tool/browser")
      const init = await BrowserTool()

      const result = init.parameters.safeParse({
        action: "act",
        request: {
          script: { code: "document.title" }
        }
      })
      expect(result.success).toBe(true)
    })

    it("should accept screenshot action", async () => {
      const { BrowserTool } = await import("../../src/tool/browser")
      const init = await BrowserTool()

      const result = init.parameters.safeParse({
        action: "screenshot",
        fullPage: false
      })
      expect(result.success).toBe(true)
    })

    it("should accept snapshot action", async () => {
      const { BrowserTool } = await import("../../src/tool/browser")
      const init = await BrowserTool()

      const result = init.parameters.safeParse({
        action: "snapshot"
      })
      expect(result.success).toBe(true)
    })

    it("should accept status action", async () => {
      const { BrowserTool } = await import("../../src/tool/browser")
      const init = await BrowserTool()

      const result = init.parameters.safeParse({
        action: "status"
      })
      expect(result.success).toBe(true)
    })
  })

  describe("execute actions", () => {
    const ctx = {
      sessionID: "ses_test",
      messageID: "msg_test",
      agent: "test",
      abort: AbortSignal.any([]),
      metadata: () => {}
    }

    it("should execute navigate action", async () => {
      const { BrowserTool } = await import("../../src/tool/browser")
      const init = await BrowserTool()

      const result = await init.execute(
        {
          action: "navigate",
          url: "https://example.com"
        },
        ctx
      )

      expect(result.title).toContain("Navigated")
      expect(result.metadata.snapshot).toBeDefined()
      expect(result.metadata.snapshot.elements).toBeInstanceOf(Array)
    })

    it("should execute snapshot action", async () => {
      const { BrowserTool } = await import("../../src/tool/browser")
      const init = await BrowserTool()

      const result = await init.execute(
        { action: "snapshot" },
        ctx
      )

      expect(result.metadata.snapshot).toBeDefined()
    })

    it("should execute status action", async () => {
      const { BrowserTool } = await import("../../src/tool/browser")
      const init = await BrowserTool()

      const result = await init.execute(
        { action: "status" },
        ctx
      )

      expect(result.metadata.status).toBeDefined()
      expect(result.metadata.status.url).toBeDefined()
    })

    it("should return error with recovery on act failure", async () => {
      const { BrowserTool } = await import("../../src/tool/browser")
      const init = await BrowserTool()

      const result = await init.execute(
        {
          action: "act",
          request: {
            click: { ref: "e9999" }
          }
        },
        ctx
      )

      expect(result.metadata.error).toBeDefined()
      expect(result.metadata.recovery).toBeDefined()
      expect(result.metadata.recovery.suggestedNextAction.action).toBe("snapshot")
    })
  })
})
