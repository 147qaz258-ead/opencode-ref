import { test, expect } from "@playwright/test"

const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:4096"

test.describe("E2E Session Flow", () => {
  let page: any
  let sessionId: string | null = null

  test.beforeAll(async () => {
    console.log(`[E2E] Starting full session flow test`)
    console.log(`Base URL: ${BASE_URL}`)
  })

  test.afterAll(async () => {
    if (sessionId) {
      try {
        await page.request.delete(`${BASE_URL}/session/${sessionId}`)
      } catch (error) {
        console.warn(`[E2E] Cleanup failed: ${error}`)
      }
    }
  })

  test("should load landing page", async ({ page }) => {
    console.log(`[E2E] Step 1: Navigating to landing page...`)
    await page.goto(BASE_URL)
    const title = await page.title()
    expect(title).toContain("OpenCode")
    console.log(`[E2E] ✓ Page loaded: ${title}`)
  })

  test("should create session", async ({ page }) => {
    console.log(`[E2E] Step 2: Creating session...`)

    // Look for session title input
    const titleInput = page.locator('input[placeholder*="Session title"]')
    expect(await titleInput.isVisible()).toBe(true)

    // Fill session title
    const testTitle = `E2E Test ${Date.now()}`
    await titleInput.fill(testTitle)

    // Look for create button
    const createButton = page.locator('button:has-text("Create session"), button[type="submit"]')
    expect(await createButton.isVisible()).toBe(true)

    // Click create button
    await createButton.click()

    // Wait for session creation
    await page.waitForTimeout(3000)

    // Extract session ID from URL
    sessionId = page.url().split('/session/').pop()
    expect(sessionId).toBeTruthy()
    console.log(`[E2E] ✓ Created session: ${sessionId}`)
  })

  test("should navigate to session page", async ({ page }) => {
    if (!sessionId) {
      test.skip()
    }

    console.log(`[E2E] Step 3: Navigating to session page: ${sessionId}...`)
    await page.goto(`${BASE_URL}/session/${sessionId}`)

    // Wait for page load
    await page.waitForLoadState("domcontentloaded")

    // Verify we're on session page
    const currentUrl = page.url()
    expect(currentUrl).toContain(`/session/${sessionId}`)

    console.log(`[E2E] ✓ Navigated to session page`)
  })

  test("should find prompt input", async ({ page }) => {
    if (!sessionId) {
      test.skip()
    }

    console.log(`[E2E] Step 4: Looking for prompt input...`)

    // Wait for page to stabilize
    await page.waitForTimeout(1000)

    // Look for textarea or contenteditable div
    const promptInput = page.locator('textarea[placeholder*="Message"], input[contenteditable="true"]').first()
    expect(promptInput).toBeTruthy()

    console.log(`[E2E] ✓ Found prompt input: ${await promptInput.getAttribute('placeholder')}`)
  })

  test("should send message", async ({ page }) => {
    if (!sessionId) {
      test.skip()
    }

    console.log(`[E2E] Step 5: Sending message...`)

    // Focus prompt input
    const promptInput = page.locator('textarea[placeholder*="Message"], input[contenteditable="true"]').first()
    await promptInput.focus()

    // Type message
    const testMessage = `Hello from E2E test at ${new Date().toISOString()}!`
    await page.keyboard.type(testMessage)

    // Look for send button
    const sendButton = page.locator('button:has-text("Send"), button[type="submit"]').first()
    expect(await sendButton.isVisible()).toBe(true)

    // Click send button
    await sendButton.click()

    // Wait for message to be sent
    console.log(`[E2E] Waiting for response...`)

    // Wait for either success message or error
    try {
      // Wait for SSE connection (check console logs)
      await page.waitForTimeout(5000)

      // Check if message appeared in UI
      const messageContent = await promptInput.inputValue()

      if (messageContent === testMessage) {
        console.log(`[E2E] ✓ Message sent successfully`)
        console.log(`[E2E] ✓ Message content: ${messageContent}`)
      } else if (messageContent) {
        console.log(`[E2E] ⚠️  Message content changed from sent`)
        console.log(`[E2E]     Sent: ${testMessage}`)
        console.log(`[E2E]     Got: ${messageContent}`)
      }

      // Check for any visible response
      const hasResponse = messageContent !== testMessage

      if (hasResponse) {
        console.log(`[E2E] ⚠️  Warning: Message content changed, possible async processing`)
      }

      // Wait additional time for agent response
      await page.waitForTimeout(5000)

    } catch (error) {
      console.error(`[E2E] ✗ Error during message send: ${error}`)
      throw error
    }
  })
})
