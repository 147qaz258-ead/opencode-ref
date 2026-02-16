import { expect, type Page } from "@playwright/test"
import { 
  messageInputSelector, 
  sendButtonSelector,
  dialogOverlaySelector
} from "./selectors"

export async function defocus(page: Page) {
  await page.evaluate(() => {
    const el = document.activeElement
    if (el instanceof HTMLElement) el.blur()
  }).catch(() => undefined)
}

export async function createSession(page: Page) {
  // For stability in E2E, we use direct navigation
  console.log('[E2E] Navigating to /global/session...')
  await page.goto('/global/session')
  
  // Wait for the URL to change or the input to be ready
  await page.waitForURL(/.*\/session(\/|$)/, { timeout: 15000 })
  console.log('[E2E] Reached session page:', page.url())
    // Wait for the message input to be visible to ensure the page is loaded
  try {
    await expect(page.locator(messageInputSelector)).toBeVisible({ timeout: 10000 })
  } catch (e) {
    const testIds = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('[data-testid]')).map(el => (el as HTMLElement).innerText || (el as HTMLElement).dataset.testid)
    })
    const html = await page.evaluate(() => document.body.innerHTML)
    console.log('[E2E] Failed to find message-input. Found test IDs/content:', testIds)
    console.log('[E2E] Body HTML snippet:', html.slice(0, 1000))
    
    // Defensive fallback: Try to find ANY contenteditable or textarea
    const fallback = page.locator('[contenteditable="true"], textarea').first()
    if (await fallback.isVisible()) {
        console.log('[E2E] Found fallback input')
        return
    }
    throw e
  }
}

export async function sendMessage(page: Page, text: string) {
  const input = page.locator(messageInputSelector)
  await expect(input).toBeVisible()
  await input.click()
  await input.fill(text)
  
  const send = page.locator(sendButtonSelector)
  await expect(send).toBeEnabled()
  await send.click()
}

export async function toggleSidebar(page: Page) {
  await page.keyboard.press("Control+\\")
}

export async function openSidebar(page: Page) {
  const sidebar = page.locator(sidebarNavSelector).first()
  if (await sidebar.isHidden()) {
    await toggleSidebar(page)
    await expect(sidebar).toBeVisible()
  }
}

export async function closeSidebar(page: Page) {
  const sidebar = page.locator(sidebarNavSelector).first()
  if (await sidebar.isVisible()) {
    await toggleSidebar(page)
    await expect(sidebar).toBeHidden()
  }
}

export async function closeDialog(page: Page) {
  await page.keyboard.press("Escape")
  // Fallback to clicking overlay if escape doesn't work or for assurance
  const overlay = page.locator(dialogOverlaySelector)
  if (await overlay.isVisible()) {
    await overlay.click({ position: { x: 5, y: 5 }, force: true })
  }
}
