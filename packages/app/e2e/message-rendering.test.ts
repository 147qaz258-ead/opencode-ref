import { test, expect } from '@playwright/test'
import { createSession, sendMessage } from './actions'

test.describe('Message Rendering Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Capture all console logs
    page.on('console', (msg) => {
      console.log(`[BROWSER ${msg.type()}] ${msg.text()}`)
    })
    
    page.on('pageerror', (err) => {
      console.log(`[BROWSER ERROR] ${err.message}`)
      console.log(err.stack)
    })

    page.on('requestfailed', (request) => {
      console.log(`[BROWSER REQUEST FAILED] ${request.url()} - ${request.failure()?.errorText}`)
    })

    // Navigate to the app directly to skip landing page
    await page.goto('/home')
  })

  test('should create session and send a message successfully', async ({ page }) => {
    // 1. Create a new session using the robust helper
    await createSession(page)
    
    // 2. Identify the session ID if possible
    let sessionId = 'new'
    const sessionIdElement = page.locator('[data-testid="session-id"]')
    if (await sessionIdElement.isVisible()) {
        sessionId = (await sessionIdElement.getAttribute('data-session-id')) || 'unknown'
    }
    console.log(`[E2E] Initial session ID: ${sessionId}`)
    
    // 3. Send a test message
    const testMessage = 'Hello, Playwright!'
    await sendMessage(page, testMessage)

    // 4. Verify the message is rendered in the UI
    const messageLocator = page.locator(`text=${testMessage}`).first()
    await expect(messageLocator).toBeVisible({ timeout: 30000 })
    console.log('[E2E] Message rendered successfully')
  })
})
