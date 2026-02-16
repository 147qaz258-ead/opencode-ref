import { test, expect } from "@playwright/test"

const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:4096"

test.describe("Backend Fix Smoke Test", () => {
  let sessionID: string

  test("should create session and send message via compatibility route", async ({ request }) => {
    // 1. Create session
    console.log("[Smoke] Creating session...")
    const createRes = await request.post(`${BASE_URL}/session`, {
      headers: { "Authorization": "Bearer test-user", "Content-Type": "application/json" },
      data: { title: "Smoke Test" }
    })
    
    if (!createRes.ok()) {
      console.error("[Smoke] Session creation failed:", createRes.status(), await createRes.text())
    }
    expect(createRes.ok()).toBeTruthy()
    const session = await createRes.json()
    sessionID = session.id
    console.log(`[Smoke] Created session: ${sessionID}`)

    // 2. Send message via the NEW compatibility route /message
    console.log("[Smoke] Sending message via /message...")
    const msgRes = await request.post(`${BASE_URL}/message`, {
      headers: { "Authorization": "Bearer test-user", "Content-Type": "application/json" },
      data: {
        sessionID,
        agent: "build",
        model: { providerID: "anthropic", modelID: "claude-3-5-sonnet-20240620" },
        content: "Ping from Smoke Test"
      }
    })

    console.log("[Smoke] Message response status:", msgRes.status())
    if (!msgRes.ok()) {
      console.error("[Smoke] Message sending failed:", msgRes.status(), await msgRes.text())
    }
    expect(msgRes.ok()).toBeTruthy()
    const msg = await msgRes.json()
    expect(msg).toHaveProperty("id")
    console.log(`[Smoke] ✓ Success: Backend compatibility route is working! ID: ${msg.id}`)
  })
})
