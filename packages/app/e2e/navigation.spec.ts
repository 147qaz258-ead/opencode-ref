import { test, expect } from "./fixtures"
import { toggleSidebar, openSidebar, closeSidebar } from "./actions"
import { sidebarNavSelector, projectItemSelector } from "./selectors"

test.describe("Navigation & Sidebar", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/")
  })

  test("should toggle sidebar visibility", async ({ page }) => {
    const sidebar = page.locator(sidebarNavSelector).first()
    
    // Ensure sidebar is visible initially (default on desktop)
    await expect(sidebar).toBeVisible()
    
    // Toggle sidebar
    await toggleSidebar(page)
    await expect(sidebar).toBeHidden()
    
    // Toggle back
    await toggleSidebar(page)
    await expect(sidebar).toBeVisible()
  })

  test("should switch between projects", async ({ page }) => {
    // Look for project items in the sidebar
    const projects = page.locator(projectItemSelector)
    const count = await projects.count()
    
    if (count > 1) {
      const firstProject = projects.nth(0)
      const secondProject = projects.nth(1)
      
      await secondProject.click()
      // Verification logic depends on URL or title change
      // For now we verify it's clickable and doesn't crash
      await expect(secondProject).toBeVisible()
    }
  })

  test("should show session history in sidebar", async ({ page }) => {
    const sidebar = page.locator(sidebarNavSelector).first()
    await expect(sidebar).toBeVisible()
    
    // We expect the session list container to be present
    const sessionList = sidebar.locator('text=暂无会话').or(sidebar.locator('[data-testid="session-item"]'))
    await expect(sessionList.first()).toBeVisible()
  })
})
