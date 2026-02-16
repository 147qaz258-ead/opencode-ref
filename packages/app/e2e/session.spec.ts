import { test, expect } from "./fixtures"
import { createSession, sendMessage } from "./actions"
import { messagePartSelector, messageContentSelector, messageInputSelector } from "./selectors"
import type { Page } from "@playwright/test"

test.describe("Session Management", () => {
  test.beforeEach(async ({ page }: { page: Page }) => {
    await page.goto("/home")
  })

  test("should create a new session and send a message", async ({ page }: { page: Page }) => {
    // 1. Create session
    await createSession(page)
    
    // 2. Send message
    const testMessage = "Test message for modular E2E"
    await sendMessage(page, testMessage)
    
    // 3. Verify message content is rendered
    const messagePart = page.locator(messagePartSelector).filter({ hasText: testMessage }).first()
    await expect(messagePart).toBeVisible({ timeout: 15000 })
    
    const content = messagePart.locator(messageContentSelector)
    await expect(content).toContainText(testMessage)
  })

  test("should receive agent response", async ({ page }: { page: Page }) => {
    await createSession(page)
    await sendMessage(page, "Hello")
    
    // Wait for agent response
    const responsePart = page.locator(messagePartSelector).nth(1)
    await expect(responsePart).toBeVisible({ timeout: 30000 })
  })
})
