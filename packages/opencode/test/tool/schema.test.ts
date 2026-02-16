// File: packages/opencode/test/tool/schema.test.ts

import { describe, it, expect } from "bun:test"
import { BrowserToolSchema, BrowserActionType } from "../../src/tool/browser/schema"

describe("BrowserTool Schema", () => {
  describe("action validation", () => {
    it("should accept valid action types", () => {
      const result = BrowserToolSchema.safeParse({
        action: "navigate",
        url: "https://example.com"
      })
      expect(result.success).toBe(true)
    })

    it("should reject invalid action types", () => {
      const result = BrowserToolSchema.safeParse({
        action: "invalid_action"
      })
      expect(result.success).toBe(false)
    })
  })

  describe("navigate action", () => {
    it("should require url for navigate action", () => {
      const result = BrowserToolSchema.safeParse({
        action: "navigate"
      })
      expect(result.success).toBe(false)
    })

    it("should accept navigate with url", () => {
      const result = BrowserToolSchema.safeParse({
        action: "navigate",
        url: "https://example.com",
        timeout: 15000
      })
      expect(result.success).toBe(true)
    })
  })

  describe("act action", () => {
    it("should require request for act action", () => {
      const result = BrowserToolSchema.safeParse({
        action: "act"
      })
      expect(result.success).toBe(false)
    })

    it("should accept click request", () => {
      const result = BrowserToolSchema.safeParse({
        action: "act",
        request: {
          click: {
            ref: "e0"
          }
        }
      })
      expect(result.success).toBe(true)
    })

    it("should accept type request", () => {
      const result = BrowserToolSchema.safeParse({
        action: "act",
        request: {
          type: {
            ref: "e5",
            text: "hello world",
            submit: true
          }
        }
      })
      expect(result.success).toBe(true)
    })

    it("should accept script request", () => {
      const result = BrowserToolSchema.safeParse({
        action: "act",
        request: {
          script: {
            code: "document.title"
          }
        }
      })
      expect(result.success).toBe(true)
    })

    it("should accept wait request", () => {
      const result = BrowserToolSchema.safeParse({
        action: "act",
        request: {
          wait: {
            condition: "visible",
            ref: "e0",
            timeout: 5000
          }
        }
      })
      expect(result.success).toBe(true)
    })

    it("should reject act with multiple actions", () => {
      const result = BrowserToolSchema.safeParse({
        action: "act",
        request: {
          click: { ref: "e0" },
          type: { ref: "e1", text: "test" }
        }
      })
      expect(result.success).toBe(false)
    })
  })

  describe("screenshot action", () => {
    it("should accept screenshot with optional params", () => {
      const result = BrowserToolSchema.safeParse({
        action: "screenshot",
        fullPage: true,
        filename: "test.png"
      })
      expect(result.success).toBe(true)
    })

    it("should accept screenshot with no params", () => {
      const result = BrowserToolSchema.safeParse({
        action: "screenshot"
      })
      expect(result.success).toBe(true)
    })
  })

  describe("snapshot action", () => {
    it("should accept snapshot with no extra params", () => {
      const result = BrowserToolSchema.safeParse({
        action: "snapshot"
      })
      expect(result.success).toBe(true)
    })
  })

  describe("status action", () => {
    it("should accept status with no extra params", () => {
      const result = BrowserToolSchema.safeParse({
        action: "status"
      })
      expect(result.success).toBe(true)
    })
  })
})
