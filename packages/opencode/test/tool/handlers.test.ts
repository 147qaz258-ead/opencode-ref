// File: packages/opencode/test/tool/handlers.test.ts

import { describe, it, expect, mock } from "bun:test"
import { BrowserActionHandlers } from "../../src/tool/browser/handlers"
import type { PlaywrightClient } from "../../src/browser/playwright-client"
import type { HandlerContext } from "../../src/tool/browser/schema"

// Mock Bus.publish to avoid actual event publishing
mock.module("../../src/bus", () => ({
  Bus: {
    publish: mock(() => Promise.resolve()),
    MonitorAction: { properties: {} },
    subscribe: mock(() => () => {})
  }
}))

// Mock Artifact.createWithContent
mock.module("../../src/artifact", () => ({
  Artifact: {
    createWithContent: mock(() => Promise.resolve({
      id: "artifact-123"
    }))
  }
}))

// Unit tests for BrowserActionHandlers - no container required
describe("BrowserActionHandlers (Unit Tests)", () => {
  describe("navigate handler", () => {
    it("should return success result on successful navigate", async () => {
      const mockClient = {
        navigate: mock(() => Promise.resolve(["e0:<a>Link</a>", "e1:<button>Button</button>"]))
      } as unknown as PlaywrightClient

      const ctx: HandlerContext = {
        client: mockClient,
        sessionID: "test-session"
      }

      const result = await BrowserActionHandlers.navigate(
        { url: "https://example.com", timeout: 15000 },
        ctx
      )

      expect(result.success).toBe(true)
      expect(result.action).toBe("navigate")
      expect(result.snapshot?.elements).toEqual(["e0:<a>Link</a>", "e1:<button>Button</button>"])
      expect(mockClient.navigate).toHaveBeenCalledWith("https://example.com", 15000)
    })

    it("should return error with recovery on navigation failure", async () => {
      const mockClient = {
        navigate: mock(() => Promise.reject(new Error("Network error")))
      } as unknown as PlaywrightClient

      const ctx: HandlerContext = {
        client: mockClient,
        sessionID: "test-session"
      }

      const result = await BrowserActionHandlers.navigate(
        { url: "https://example.com", timeout: 15000 },
        ctx
      )

      expect(result.success).toBe(false)
      expect(result.action).toBe("navigate")
      expect(result.error?.code).toBe("navigation_failed")
      expect(result.error?.message).toBe("Network error")
      expect(result.recovery?.suggestedNextAction.action).toBe("navigate")
    })
  })

  describe("snapshot handler", () => {
    it("should extract elements from current page", async () => {
      const mockPage = {
        url: mock(() => "https://example.com"),
        title: mock(() => Promise.resolve("Example Page"))
      }

      const mockClient = {
        ensurePage: mock(() => Promise.resolve(mockPage)),
        extractInteractiveElements: mock(() => Promise.resolve(["e0:<a>Link</a>"]))
      } as unknown as PlaywrightClient

      const ctx: HandlerContext = {
        client: mockClient,
        sessionID: "test-session"
      }

      const result = await BrowserActionHandlers.snapshot({}, ctx)

      expect(result.success).toBe(true)
      expect(result.action).toBe("snapshot")
      expect(result.snapshot?.url).toBe("https://example.com")
      expect(result.snapshot?.title).toBe("Example Page")
      expect(result.snapshot?.elements).toEqual(["e0:<a>Link</a>"])
    })

    it("should return error with recovery on snapshot failure", async () => {
      const mockClient = {
        ensurePage: mock(() => Promise.reject(new Error("Page not available")))
      } as unknown as PlaywrightClient

      const ctx: HandlerContext = {
        client: mockClient,
        sessionID: "test-session"
      }

      const result = await BrowserActionHandlers.snapshot({}, ctx)

      expect(result.success).toBe(false)
      expect(result.action).toBe("snapshot")
      expect(result.error?.code).toBe("snapshot_failed")
      expect(result.recovery?.suggestedNextAction.action).toBe("navigate")
    })
  })

  describe("act handler - script", () => {
    it("should execute JavaScript and return result", async () => {
      const mockPage = {
        evaluate: mock((code: string) => Promise.resolve("Example Domain"))
      }

      const mockClient = {
        ensurePage: mock(() => Promise.resolve(mockPage))
      } as unknown as PlaywrightClient

      const ctx: HandlerContext = {
        client: mockClient,
        sessionID: "test-session"
      }

      const result = await BrowserActionHandlers.act(
        {
          request: {
            script: {
              code: "document.title"
            }
          }
        },
        ctx
      )

      expect(result.success).toBe(true)
      expect(result.action).toBe("act")
      expect(result.result?.status).toBe("executed")
      expect(result.result?.value).toBe("Example Domain")
      expect(mockPage.evaluate).toHaveBeenCalledWith("document.title")
    })

    it("should handle script execution errors", async () => {
      const mockPage = {
        evaluate: mock(() => Promise.reject(new Error("Syntax error")))
      }

      const mockClient = {
        ensurePage: mock(() => Promise.resolve(mockPage))
      } as unknown as PlaywrightClient

      const ctx: HandlerContext = {
        client: mockClient,
        sessionID: "test-session"
      }

      const result = await BrowserActionHandlers.act(
        {
          request: {
            script: {
              code: "invalid syntax"
            }
          }
        },
        ctx
      )

      expect(result.success).toBe(false)
      expect(result.error?.code).toBe("action_failed")
    })
  })

  describe("act handler - click", () => {
    it("should click element by ref", async () => {
      const mockClient = {
        click: mock((index: number) => Promise.resolve())
      } as unknown as PlaywrightClient

      const ctx: HandlerContext = {
        client: mockClient,
        sessionID: "test-session"
      }

      const result = await BrowserActionHandlers.act(
        {
          request: {
            click: { ref: "e5" }
          }
        },
        ctx
      )

      expect(result.success).toBe(true)
      expect(result.result?.status).toBe("clicked")
      expect(result.result?.ref).toBe("e5")
      expect(mockClient.click).toHaveBeenCalledWith(5)
    })

    it("should return error with recovery on click failure", async () => {
      const mockClient = {
        click: mock((index: number) => Promise.reject(new Error("Element 5 not found")))
      } as unknown as PlaywrightClient

      const ctx: HandlerContext = {
        client: mockClient,
        sessionID: "test-session"
      }

      const result = await BrowserActionHandlers.act(
        {
          request: {
            click: { ref: "e5" }
          }
        },
        ctx
      )

      expect(result.success).toBe(false)
      expect(result.error?.code).toBe("element_not_found")
      expect(result.recovery?.suggestedNextAction.action).toBe("snapshot")
      expect(result.recovery?.suggestedNextAction.reason).toContain("fresh element indices")
    })
  })

  describe("act handler - type", () => {
    it("should type text into element", async () => {
      const mockClient = {
        input: mock((text: string, index: number, submit: boolean) => Promise.resolve())
      } as unknown as PlaywrightClient

      const ctx: HandlerContext = {
        client: mockClient,
        sessionID: "test-session"
      }

      const result = await BrowserActionHandlers.act(
        {
          request: {
            type: {
              ref: "e3",
              text: "hello world",
              submit: true
            }
          }
        },
        ctx
      )

      expect(result.success).toBe(true)
      expect(result.result?.status).toBe("typed")
      expect(result.result?.ref).toBe("e3")
      expect(result.result?.value).toBe("hello world")
      expect(mockClient.input).toHaveBeenCalledWith("hello world", 3, true)
    })
  })

  describe("act handler - wait", () => {
    it("should wait for ready state", async () => {
      const mockPage = {
        waitForLoadState: mock(() => Promise.resolve())
      }

      const mockClient = {
        ensurePage: mock(() => Promise.resolve(mockPage))
      } as unknown as PlaywrightClient

      const ctx: HandlerContext = {
        client: mockClient,
        sessionID: "test-session"
      }

      const result = await BrowserActionHandlers.act(
        {
          request: {
            wait: {
              condition: "ready",
              timeout: 5000
            }
          }
        },
        ctx
      )

      expect(result.success).toBe(true)
      expect(result.result?.status).toBe("waited")
      expect(result.result?.value).toBe("ready")
      expect(mockPage.waitForLoadState).toHaveBeenCalledWith("domcontentloaded", { timeout: 5000 })
    })

    it("should wait for element to be visible", async () => {
      const mockPage = {
        waitForSelector: mock(() => Promise.resolve())
      }

      const mockClient = {
        ensurePage: mock(() => Promise.resolve(mockPage))
      } as unknown as PlaywrightClient

      const ctx: HandlerContext = {
        client: mockClient,
        sessionID: "test-session"
      }

      const result = await BrowserActionHandlers.act(
        {
          request: {
            wait: {
              condition: "visible",
              ref: "e10",
              timeout: 3000
            }
          }
        },
        ctx
      )

      expect(result.success).toBe(true)
      expect(mockPage.waitForSelector).toHaveBeenCalledWith(
        "[data-opencode-id=\"opencode-element-10\"]",
        { state: "visible", timeout: 3000 }
      )
    })
  })

  describe("screenshot handler", () => {
    it("should capture screenshot and create artifact", async () => {
      const screenshotBuffer = Buffer.from("fake-image-data")

      const mockClient = {
        screenshot: mock(() => Promise.resolve(screenshotBuffer))
      } as unknown as PlaywrightClient

      const ctx: HandlerContext = {
        client: mockClient,
        sessionID: "test-session"
      }

      const result = await BrowserActionHandlers.screenshot(
        { fullPage: false, filename: "test.png" },
        ctx
      )

      expect(result.success).toBe(true)
      expect(result.action).toBe("screenshot")
      expect(result.screenshot?.path).toBe("test.png")
      expect(result.screenshot?.artifactId).toBe("artifact-123")
      expect(mockClient.screenshot).toHaveBeenCalledWith(false)
    })
  })

  describe("status handler", () => {
    it("should return browser status", async () => {
      const mockPage = {
        url: mock(() => "https://example.com"),
        title: mock(() => Promise.resolve("Example Domain"))
      }

      const mockClient = {
        ensurePage: mock(() => Promise.resolve(mockPage)),
        extractInteractiveElements: mock(() => Promise.resolve(["e0:<a>Link</a>", "e1:<button>Click</button>"]))
      } as unknown as PlaywrightClient

      const ctx: HandlerContext = {
        client: mockClient,
        sessionID: "test-session"
      }

      const result = await BrowserActionHandlers.status({}, ctx)

      expect(result.success).toBe(true)
      expect(result.action).toBe("status")
      expect(result.status?.url).toBe("https://example.com")
      expect(result.status?.title).toBe("Example Domain")
      expect(result.status?.elementCount).toBe(2)
      expect(result.status?.vncAvailable).toBe(true)
      expect(result.status?.vncUrl).toBe("/api/session/test-session/vnc/ws")
    })
  })

  describe("act handler - invalid request", () => {
    it("should return error for invalid act request", async () => {
      const ctx: HandlerContext = {
        client: {} as PlaywrightClient,
        sessionID: "test-session"
      }

      const result = await BrowserActionHandlers.act(
        {
          request: {}
        },
        ctx
      )

      expect(result.success).toBe(false)
      expect(result.error?.code).toBe("invalid_request")
      expect(result.error?.message).toContain("No valid action specified")
    })
  })
})
