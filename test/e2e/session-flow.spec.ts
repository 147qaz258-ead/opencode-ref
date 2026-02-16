/**
 * E2E Test: Complete Session Flow
 * Tests the entire flow from session creation to message sending
 */

import { test, expect } from "@playwright/test"

const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:4096"

test.describe("Session Flow E2E", () => {
  let authToken: string | null = null
  let sessionID: string | null = null

  test.beforeAll(async () => {
    // Setup: Get or create auth token
    // For local testing without auth, we'll use a simple token format
    authToken = "user-test-user"

    console.log(`[E2E] Testing with base URL: ${BASE_URL}`)
  })

  test.afterAll(async () => {
    // Cleanup: Delete test session if created
    if (sessionID && authToken) {
      try {
        await fetch(`${BASE_URL}/session/${sessionID}`, {
          method: "DELETE",
          headers: {
            "Authorization": `Bearer ${authToken}`,
          },
        })
        console.log(`[E2E] Cleaned up session: ${sessionID}`)
      } catch (error) {
        console.warn(`[E2E] Cleanup failed:`, error)
      }
    }
  })

  test("should create a new session", async ({ request }) => {
    // Step 1: Create a new session
    console.log("[E2E] Step 1: Creating session...")

    const createResponse = await request.post(`${BASE_URL}/session`, {
      headers: {
        "Authorization": `Bearer ${authToken}`,
        "Content-Type": "application/json",
      },
      data: {
        title: "E2E Test Session",
      },
    })

    console.log("[E2E] Create response status:", createResponse.status())
    console.log("[E2E] Create response body:", await createResponse.text())

    expect(createResponse.ok()).toBeTruthy()

    const session = await createResponse.json()
    console.log("[E2E] Created session:", session)

    expect(session).toHaveProperty("id")
    expect(session).toHaveProperty("title")
    expect(session).toHaveProperty("projectID")

    sessionID = session.id
    console.log(`[E2E] ✓ Session created: ${sessionID}`)
  })

  test("should retrieve session details", async ({ request }) => {
    if (!sessionID) {
      test.skip()
      return
    }

    // Step 2: Get session details (this is where the 500 error happens)
    console.log("[E2E] Step 2: Retrieving session details...")
    console.log(`[E2E] Fetching: ${BASE_URL}/session/${sessionID}`)

    const getResponse = await request.get(`${BASE_URL}/session/${sessionID}`, {
      headers: {
        "Authorization": `Bearer ${authToken}`,
      },
    })

    console.log("[E2E] Get response status:", getResponse.status())
    console.log("[E2E] Get response body:", await getResponse.text())

    // This should NOT be 500
    if (getResponse.status() === 500) {
      const errorText = await getResponse.text()
      console.error("[E2E] ✗ 500 Error detected!")
      console.error("[E2E] Error response:", errorText)

      // Try to get more server logs
      console.error("[E2E] This is likely a server-side error in Session.get()")
    }

    expect(getResponse.status()).not.toBe(500)

    const session = await getResponse.json()
    console.log("[E2E] Retrieved session:", session)

    expect(session).toHaveProperty("id", sessionID)
    console.log(`[E2E] ✓ Session retrieved successfully`)
  })

  test("should list sessions", async ({ request }) => {
    // Step 3: List all sessions
    console.log("[E2E] Step 3: Listing sessions...")

    const listResponse = await request.get(`${BASE_URL}/session`, {
      headers: {
        "Authorization": `Bearer ${authToken}`,
      },
    })

    console.log("[E2E] List response status:", listResponse.status())

    expect(listResponse.ok()).toBeTruthy()

    const sessions = await listResponse.json()
    console.log("[E2E] Session list:", sessions)

    expect(Array.isArray(sessions)).toBeTruthy()
    console.log(`[E2E] ✓ Retrieved ${sessions.length} session(s)`)
  })

  test("should send a message and receive response", async ({ request }) => {
    if (!sessionID) {
      test.skip()
      return
    }

    // Step 4: Send a message
    console.log("[E2E] Step 4: Sending message...")

    const messageResponse = await request.post(`${BASE_URL}/message`, {
      headers: {
        "Authorization": `Bearer ${authToken}`,
        "Content-Type": "application/json",
      },
      data: {
        sessionID,
        agent: "build",
        model: {
          providerID: "anthropic",
          modelID: "claude-sonnet-4-5-20250929",
        },
        content: "Hello from E2E test!",
      },
    })

    console.log("[E2E] Message response status:", messageResponse.status())
    console.log("[E2E] Message response body:", await messageResponse.text())

    expect(messageResponse.ok()).toBeTruthy()

    const message = await messageResponse.json()
    console.log("[E2E] Message sent:", message)

    expect(message).toHaveProperty("id")
    console.log(`[E2E] ✓ Message sent: ${message.id}`)
  })

  test("should subscribe to session events", async ({ page }) => {
    if (!sessionID) {
      test.skip()
      return
    }

    // Step 5: Subscribe to SSE events
    console.log("[E2E] Step 5: Subscribing to session events...")

    // Setup event listener
    const events: any[] = []
    page.on("console", (msg) => {
      if (msg.type() === "log") {
        const text = msg.text()
        if (text.includes("[SSE]")) {
          events.push(text)
          console.log("[E2E Browser] Event received:", text)
        }
      }
    })

    // Navigate to session page and setup SSE connection
    await page.goto(`${BASE_URL}/session/${sessionID}`)
    console.log("[E2E] Navigated to session page")

    // Wait for SSE connection
    await page.waitForTimeout(3000)
    console.log(`[E2E] Received ${events.length} events`)

    // We should receive at least some events (session info, messages, etc.)
    expect(events.length).toBeGreaterThan(0)
    console.log(`[E2E] ✓ SSE connection established`)
  })
})
