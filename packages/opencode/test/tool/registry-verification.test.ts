import { describe, it, expect, mock } from "bun:test"
import { Instance } from "../../src/project/instance"

// Mock the required dependencies
mock.module("../../src/config/config", () => ({
  Config: {
    get: async () => ({
      experimental: { batch_tool: false }
    }),
    directories: async () => []
  }
}))

mock.module("../../src/plugin", () => ({
  Plugin: {
    list: async () => []
  }
}))

mock.module("../../src/session", () => ({
  Session: {
    get: async () => ({
      id: "ses_test",
      projectID: "test-project",
      title: "Test Session"
    })
  }
}))

mock.module("../../src/docker/docker-manager", () => {
  class DockerManager {
    getContainerIP() {
      return Promise.resolve({ ip: "127.0.0.1" })
    }
  }
  return {
    DockerManager,
    getDockerManager: () => new DockerManager()
  }
})

mock.module("../../src/browser/playwright-client", () => ({
  PlaywrightClient: class {
    constructor() {}
    async initialize() { return true }
    async navigate() { return ["e0:<a>Link</a>"] }
    async click() {}
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

describe("Browser Tool Registry Verification", () => {
  it("should register unified browser tool", async () => {
    await Instance.provide({
      fn: async () => {
        const { ToolRegistry } = await import("../../src/tool/registry")
        const tools = await ToolRegistry.all()
        const browserTools = tools.filter(t => t.id === "browser")

        expect(browserTools.length).toBe(1)
        expect(browserTools[0].id).toBe("browser")
      }
    })
  })

  it("should not have old browser tools", async () => {
    await Instance.provide({
      fn: async () => {
        const { ToolRegistry } = await import("../../src/tool/registry")
        const tools = await ToolRegistry.all()
        const toolIds = tools.map(t => t.id)

        expect(toolIds).not.toContain("browser_navigate")
        expect(toolIds).not.toContain("browser_click")
        expect(toolIds).not.toContain("browser_input")
        expect(toolIds).not.toContain("browser_screenshot")
      }
    })
  })

  it("should have valid browser tool definition", async () => {
    await Instance.provide({
      fn: async () => {
        const { ToolRegistry } = await import("../../src/tool/registry")
        const tools = await ToolRegistry.all()
        const browserTool = tools.find(t => t.id === "browser")

        expect(browserTool).toBeDefined()

        const init = await browserTool.init()
        expect(init.description).toBeDefined()
        expect(init.parameters).toBeDefined()

        // Test parameter parsing
        const validParams = init.parameters.safeParse({
          action: "navigate",
          url: "https://example.com"
        })
        expect(validParams.success).toBe(true)

        const invalidParams = init.parameters.safeParse({
          action: "navigate"
        })
        expect(invalidParams.success).toBe(false)
      }
    })
  })
})
