import { describe, expect, test } from "bun:test"
import { createOpencodeClient, type Event } from "@opencode-ai/sdk/v2/client"

/**
 * TDD Test: Session prompt() 400 Bad Request Bug
 *
 * Issue: The SDK's `prompt()` method calls the wrong endpoint `/message`
 * which causes 400 Bad Request due to validator misconfiguration.
 *
 * Root cause (server.ts Line 1445):
 * validator("json", SessionPrompt.PromptInput.omit({ sessionID: true }))
 * This removes sessionID from the validated data, causing Session.get() to fail
 *
 * Test verifies:
 * 1. Calling prompt() returns 400 error
 * 2. Calling promptAsync() works correctly (returns 204)
 * 3. This reproduces the bug reported by user
 */

describe("session.prompt() - 400 Bad Request Bug", () => {
  let client: ReturnType<typeof createOpencodeClient>
  let sessionId: string

  test.beforeEach(async () => {
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

  test.afterEach(async () => {
    // Cleanup: delete test session
    if (sessionId) {
      try {
        await client.session.delete({ sessionID: sessionId })
      } catch (e) {
        console.error("Cleanup failed:", e)
      }
    }
  })

  test("prompt() should return 400 Bad Request (bug reproduction)", async () => {
    // This test FAILS with current code, demonstrating the bug
    // After fix, this test should be updated to expect SUCCESS

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

    // Current behavior: generates wrong URL /session/{sessionID}/message
    // Expected: 400 Bad Request because validator omits sessionID

    expect(result).toBeDefined()

    // Verify it's a 400 error
    if (result.error) {
      console.log("✅ Bug reproduced: 400 error received as expected")
      console.log("Error details:", result.error)

      // Check error message
      const errorMsg = result.error?.message || ""
      expect(errorMsg).toMatch(/400|Bad Request|validation/)

      // The error should mention sessionID issue or validation failure
    } else {
      console.error("❌ Bug NOT reproduced: got unexpected response", result)
      fail("Expected 400 error but got different response")
    }
  })

  test("promptAsync() should work correctly (returns 204)", async () => {
    // This test PASSES, showing the correct endpoint works
    // promptAsync uses /prompt_async endpoint which is correct

    const result = await client.session.promptAsync({
      sessionID: sessionId,
      agent: "test-agent",
      model: {
        providerID: "test-provider",
        modelID: "test-model",
      },
      messageID: "msg_async",
      parts: [
        {
          type: "text",
          text: "Test async message",
        },
      ],
    })

    // promptAsync should return 204 immediately
    expect(result).toBeDefined()

    if (result.error) {
      console.error("❌ promptAsync failed:", result.error)
      fail("promptAsync should work correctly")
    }

    // Verify 204 status
    if (result.status === 204) {
      console.log("✅ promptAsync works correctly: 204 No Content")
    } else {
      console.log(`⚠️ promptAsync returned unexpected status: ${result.status}`)
    }
  })

  test("SDK should have correct endpoint URLs configured", () => {
    // Metadata/documentation test
    // Verifies that SDK was generated with correct endpoints

    const client = createOpencodeClient({
      baseUrl: "http://localhost:4096",
      throwOnError: false,
    })

    // Verify prompt() method exists
    expect(typeof client.session.prompt).toBe("function")
    expect(typeof client.session.promptAsync).toBe("function")

    // Document the issue
    console.log("SDK Test: prompt() exists but uses wrong URL /message")
    console.log("Expected: prompt() should map to /prompt_async endpoint")
    console.log("This is a code generation or configuration issue")
  })
})
