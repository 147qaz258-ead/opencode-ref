/**
 * Prompt Schema - Tests
 *
 * TDD Phase 3: RED - Tests for the fixed Zod schema
 * These tests verify that the schema correctly validates prompt input
 * and fixes the 400 error issue.
 */

import { describe, it, expect } from "bun:test"
import { TextPartInput, FilePartInput, AgentPartInput, PartInput, PromptInput } from "@/session/prompt-schema"

describe("Prompt Schema - Zod Validation", () => {
  describe("TextPartInput", () => {
    it("should accept valid text part", () => {
      const part = {
        type: "text",
        text: "Hello, AI!",
        id: "part-123",
      }

      const result = TextPartInput.parse(part)
      expect(result.type).toBe("text")
      expect(result.text).toBe("Hello, AI!")
      expect(result.id).toBe("part-123")
    })

    it("should accept text part without id", () => {
      const part = {
        type: "text",
        text: "No ID here",
      }

      const result = TextPartInput.parse(part)
      expect(result.type).toBe("text")
      expect(result.text).toBe("No ID here")
      expect(result.id).toBeUndefined()
    })

    it("should accept extra fields with passthrough", () => {
      const part = {
        type: "text",
        text: "With extra",
        extraField: "should be allowed",
        anotherExtra: 123,
      }

      const result = TextPartInput.parse(part)
      expect(result.extraField).toBe("should be allowed")
      expect(result.anotherExtra).toBe(123)
    })

    it("should reject invalid type", () => {
      const part = {
        type: "invalid",
        text: "Wrong type",
      }

      expect(() => TextPartInput.parse(part)).toThrow()
    })
  })

  describe("FilePartInput", () => {
    it("should accept valid file part", () => {
      const part = {
        type: "file",
        url: "file:///test.txt",
        mime: "text/plain",
        id: "file-123",
      }

      const result = FilePartInput.parse(part)
      expect(result.type).toBe("file")
      expect(result.url).toBe("file:///test.txt")
      expect(result.mime).toBe("text/plain")
    })

    it("should accept file part without optional fields", () => {
      const part = {
        type: "file",
        url: "file:///test.txt",
        mime: "text/plain",
      }

      const result = FilePartInput.parse(part)
      expect(result.filename).toBeUndefined()
    })
  })

  describe("AgentPartInput", () => {
    it("should accept valid agent part", () => {
      const part = {
        type: "agent",
        name: "code-reviewer",
        id: "agent-123",
      }

      const result = AgentPartInput.parse(part)
      expect(result.type).toBe("agent")
      expect(result.name).toBe("code-reviewer")
    })
  })

  describe("PartInput (union)", () => {
    it("should accept text part via union", () => {
      const part = {
        type: "text",
        text: "Test message",
        id: "p1",
      }

      const result = PartInput.parse(part)
      expect(result.type).toBe("text")
      expect(result.text).toBe("Test message")
    })

    it("should accept file part via union", () => {
      const part = {
        type: "file",
        url: "file:///doc.pdf",
        mime: "application/pdf",
        id: "p2",
      }

      const result = PartInput.parse(part)
      expect(result.type).toBe("file")
    })

    it("should accept agent part via union", () => {
      const part = {
        type: "agent",
        name: "helper",
        id: "p3",
      }

      const result = PartInput.parse(part)
      expect(result.type).toBe("agent")
    })
  })

  describe("PromptInput - Main Schema", () => {
    it("should accept minimal valid input", () => {
      const input = {
        sessionID: "ses-abc123",
        parts: [
          {
            type: "text",
            text: "Hello",
            id: "p1",
          },
        ],
      }

      const result = PromptInput.parse(input)
      expect(result.sessionID).toBe("ses-abc123")
      expect(result.parts).toHaveLength(1)
      expect(result.parts[0].type).toBe("text")
    })

    it("should accept complete input with all fields", () => {
      const input = {
        sessionID: "ses-abc123",
        messageID: "msg-456",
        model: {
          providerID: "openai",
          modelID: "gpt-4",
        },
        agent: "builder",
        noReply: false,
        tools: {
          bash: true,
          edit: false,
        },
        system: "You are a helpful assistant",
        variant: "v1",
        parts: [
          {
            type: "text",
            text: "Complete input test",
            id: "p1",
          },
        ],
      }

      const result = PromptInput.parse(input)
      expect(result.sessionID).toBe("ses-abc123")
      expect(result.messageID).toBe("msg-456")
      expect(result.agent).toBe("builder")
      expect(result.noReply).toBe(false)
      expect(result.parts).toHaveLength(1)
    })

    it("should accept multiple parts of different types", () => {
      const input = {
        sessionID: "ses-abc123",
        parts: [
          {
            type: "text",
            text: "First message",
            id: "p1",
          },
          {
            type: "file",
            url: "file:///test.txt",
            mime: "text/plain",
            id: "p2",
          },
          {
            type: "agent",
            name: "reviewer",
            id: "p3",
          },
        ],
      }

      const result = PromptInput.parse(input)
      expect(result.parts).toHaveLength(3)
      expect(result.parts[0].type).toBe("text")
      expect(result.parts[1].type).toBe("file")
      expect(result.parts[2].type).toBe("agent")
    })

    it("should reject empty parts array", () => {
      const input = {
        sessionID: "ses-abc123",
        parts: [],
      }

      expect(() => PromptInput.parse(input)).toThrow()
    })

    it("should reject missing parts", () => {
      const input = {
        sessionID: "ses-abc123",
      }

      const result = PromptInput.safeParse(input)
      expect(result.success).toBe(false)
    })

    it("should reject missing sessionID", () => {
      const input = {
        parts: [
          {
            type: "text",
            text: "Test",
            id: "p1",
          },
        ],
      }

      const result = PromptInput.safeParse(input)
      expect(result.success).toBe(false)
    })

    it("should allow extra fields with passthrough", () => {
      const input = {
        sessionID: "ses-abc123",
        parts: [
          {
            type: "text",
            text: "Test",
            id: "p1",
          },
        ],
        extraField: "should be allowed",
        nestedExtra: {
          key: "value",
        },
      }

      const result = PromptInput.parse(input)
      expect(result.extraField).toBe("should be allowed")
      expect(result.nestedExtra).toEqual({ key: "value" })
    })

    it("should match real frontend payload format", () => {
      // This is the actual format sent by the frontend
      const input = {
        sessionID: "ses_c52bb6910000iBcfvOfuiKYR97",
        messageID: "msg_c52bb6910001iBcfSdN30e7Eb",
        agent: "build",
        model: {
          modelID: "ZhipuAI/GLM-4.6",
          providerID: "modelscope",
        },
        parts: [
          {
            id: "prt_c52bb6910000kBcfvOfuiKYR97",
            type: "text",
            text: "我想要制作一个专门的落地页",
          },
        ],
      }

      const result = PromptInput.parse(input)
      expect(result.sessionID).toBe("ses_c52bb6910000iBcfvOfuiKYR97")
      expect(result.parts).toHaveLength(1)
      expect(result.parts[0].type).toBe("text")
    })

    it("should handle parts with sessionID and messageID fields", () => {
      // Parts may include these fields from frontend
      const input = {
        sessionID: "ses-test",
        parts: [
          {
            type: "text",
            text: "Test",
            id: "p1",
            sessionID: "ses-test",
            messageID: "msg-test",
          },
        ],
      }

      const result = PromptInput.parse(input)
      expect(result.parts[0].sessionID).toBe("ses-test")
      expect(result.parts[0].messageID).toBe("msg-test")
    })
  })
})
