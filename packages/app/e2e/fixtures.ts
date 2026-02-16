import { test as base, expect } from "@playwright/test"
import { createSdk, sessionPath } from "./utils"
import { promptSelector } from "./selectors"

type TestFixtures = {
  sdk: ReturnType<typeof createSdk>
  gotoSession: (sessionID?: string) => Promise<void>
}

export const test = base.extend<TestFixtures>({
  sdk: async ({}, use) => {
    // In many tests we don't need a specific directory initially
    await use(createSdk())
  },
  gotoSession: async ({ page }, use) => {
    const gotoSession = async (sessionID?: string) => {
      // For opencode-ref, we might just default to a "local" project or similar
      const directory = "local" 
      await page.goto(sessionPath(directory, sessionID))
      // Wait for the UI to be ready
      await expect(page.locator(promptSelector)).toBeVisible()
    }
    await use(gotoSession)
  },
})

export { expect }
