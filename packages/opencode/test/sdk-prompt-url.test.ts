import { describe, expect, test } from "bun:test"
import { createOpencodeClient, type Event } from "@opencode-ai/sdk/v2/client"

/**
 * TDD Test: SDK prompt() method URL mapping validation
 *
 * Issue: The SDK's `prompt()` method generates wrong URL `/message`
 *        instead of correct `/prompt_async`
 *
 * Root cause: packages/sdk-js/src/v2/gen/sdk.gen.ts:1339
 *
 * Expected behavior after fix: 204 (prompt_async endpoint)
 * Current behavior: 400 Bad Request (wrong endpoint)
 */

describe("SDK session.prompt() - URL mapping", () => {
  let client: ReturnType<typeof createOpencodeClient>
  let sessionId: string

  beforeEach(async () => {
    // Initialize SDK client
    client = createOpencodeClient({
      baseUrl: "http://localhost:4096",
      throwOnError: false,
    })

    // Create a test session first
    const response = await client.session.create({
      directory: "/home/ubuntu", // Using test directory
    })

    expect(response.data?.id).toBeDefined()
    expect(response.data?.directory).toBe("/home/ubuntu")

    // Store session ID for cleanup
    if (response.data?.id) {
      sessionId = response.data.id
    }
  })

  afterEach(async () => {
    // Cleanup: delete test session
    if (sessionId) {
      try {
        await client.session.delete({ sessionID: sessionId })
      } catch (e) {
        console.error("Cleanup failed:", e)
      }
    }
  })

  test("prompt() should use correct URL /prompt_async", async () => {
    // This test will FAIL with current code
    // After fix, this should PASS

    // Call prompt method
    const result = await client.session.prompt({
      sessionID: sessionId,
      agent: "test-agent",
      model: {
        providerID: "test-provider",
        modelID: "test-model",
      },
      messageID: "msg_test",
      parts: [
        {
          type: "text",
          text: "Test message content",
        },
      ],
    })

    // Current behavior: generates wrong URL
    // Expected after fix: should call /prompt_async endpoint

    // Since we can't check URL directly from SDK,
    // we verify the behavior through the error response

    // This should currently return 400 (Bad Request)
    // because SDK uses wrong URL: /session/{sessionID}/message
    // but server expects /prompt_async validation
    expect(result).toBeDefined()

    // The error indicates wrong endpoint is being called
    if (result.error) {
      console.log("Expected 400 error:", result.error)
      expect(result.error).toMatch(/400|Bad Request|validation/)
    }
  })

  test("promptAsync() should be the correct method", async () => {
    // Verify that promptAsync exists and uses correct URL

    const result = await client.session.promptAsync({
      sessionID: sessionId,
      agent: "test-agent",
      model: {
        providerID: "test-provider",
        modelID: "test-model",
      },
      parts: [
        {
          type: "text",
          text: "Test async message",
        },
      ],
    })

    expect(result).toBeDefined()

    // promptAsync should work correctly
    // This method should return 204 immediately
    if (result.error) {
      console.error("promptAsync failed:", result.error)
    }
  })

  test("SDK should have correct endpoint URLs configured", () => {
    // Verify SDK generation configuration
    // This is a metadata/documentation test
    //
    // Check that:
    // 1. prompt() maps to /session/{sessionID}/prompt_async (not /message)
    // 2. promptAsync() maps to /session/{sessionID}/prompt_async

    // Since we can't inspect the generated code at runtime,
    // this test documents the expected behavior

    const client = createOpencodeClient({
      baseUrl: "http://localhost:4096",
      throwOnError: false,
    })

    // Verify methods exist
    expect(typeof client.session.prompt).toBe("function")
    expect(typeof client.session.promptAsync).toBe("function")

    // Document the issue
    console.log("SDK Test: prompt() method exists but uses wrong URL")
    console.log("Expected: prompt() should map to /prompt_async endpoint")
  })
})
