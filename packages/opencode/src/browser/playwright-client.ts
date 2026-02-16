/**
 * Playwright Browser Client for OpenCode
 *
 * Connects to Chrome browser inside the sandbox via Chrome DevTools Protocol (CDP).
 * Provides high-level browser automation APIs.
 *
 * The browser runs inside the manus-sandbox container and exposes CDP on port 9222.
 */

import { chromium, type Browser, type Page, type BrowserContext } from "playwright"
import { Log } from "../util/log"

export const log = Log.create({ service: "browser.playwright-client" })

export interface InteractiveElement {
  index: number
  tag: string
  text: string
  selector: string
}

export interface NavigateResult {
  url: string
  title: string
  elements: string[]
}

export class PlaywrightClient {
  private browser: Browser | null = null
  private context: BrowserContext | null = null
  private page: Page | null = null
  private playwright: any = null
  private cdpUrl: string
  private maxRetries: number = 5
  private initialized: boolean = false

  constructor(cdpUrl: string) {
    this.cdpUrl = cdpUrl
  }

  async initialize(): Promise<boolean> {
    if (this.initialized && this.browser) {
      return true
    }

    let retryDelay = 1000

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        log.info("Initializing browser connection", {
          cdpUrl: this.cdpUrl,
          attempt: attempt + 1,
        })
        console.log(`[PlaywrightClient] Attempt ${attempt + 1}/${this.maxRetries}: Connecting to CDP at ${this.cdpUrl}`)

        // Directly connect to existing Chrome via CDP - don't launch new browser
        console.log(`[PlaywrightClient] Calling chromium.connectOverCDP...`)

        // Add timeout to the connection attempt
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error("CDP connection timeout after 10s")), 10000)
        })

        this.browser = await Promise.race([
          chromium.connectOverCDP(this.cdpUrl),
          timeoutPromise
        ])
        console.log(`[PlaywrightClient] CDP connection successful!`)

        if (!this.browser) {
          throw new Error("Failed to connect to browser")
        }

        const contexts = this.browser.contexts()
        if (contexts.length > 0) {
          this.context = contexts[0]
        } else {
          this.context = await this.browser.newContext()
        }

        const pages = this.context.pages()
        if (pages.length > 0) {
          this.page = pages[0]
        } else {
          this.page = await this.context.newPage()
        }

        this.initialized = true
        log.info("Browser initialized successfully")

        return true

      } catch (error) {
        log.warn("Browser initialization failed", {
          attempt: attempt + 1,
          error: error instanceof Error ? error.message : error,
        })

        await this.cleanup()

        if (attempt === this.maxRetries - 1) {
          log.error("Browser initialization failed after retries", { error })
          return false
        }

        retryDelay = Math.min(retryDelay * 2, 10000)
        await new Promise(resolve => setTimeout(resolve, retryDelay))
      }
    }

    return false
  }

  async ensurePage(): Promise<Page> {
    if (!this.initialized || !this.page) {
      const success = await this.initialize()
      if (!success) {
        throw new Error("Browser initialization failed")
      }
    }
    return this.page!
  }

  async navigate(url: string, timeout: number = 15000): Promise<string[]> {
    const page = await this.ensurePage()

    log.info("Navigating to", { url })

    try {
      await page.goto(url, { timeout, waitUntil: "domcontentloaded" })

      const elements = await this.extractInteractiveElements()

      log.info("Navigation complete", {
        url,
        elementCount: elements.length,
      })

      return elements

    } catch (error) {
      log.error("Navigation failed", { url, error })
      throw error
    }
  }

  async click(index: number, timeout: number = 5000): Promise<void> {
    const page = await this.ensurePage()
    const selector = `[data-opencode-id="opencode-element-${index}"]`

    log.info("Clicking element", { index, selector })

    try {
      const element = await page.$(selector)

      if (!element) {
        throw new Error(`Element ${index} not found`)
      }

      await element.click({ timeout })

      log.info("Click successful", { index })

    } catch (error) {
      log.error("Click failed", { index, error })
      throw error
    }
  }

  async input(text: string, index: number, pressEnter: boolean = false): Promise<void> {
    const page = await this.ensurePage()
    const selector = `[data-opencode-id="opencode-element-${index}"]`

    log.info("Inputting text", { index, text, pressEnter })

    try {
      const element = await page.$(selector)

      if (!element) {
        throw new Error(`Element ${index} not found`)
      }

      await element.fill("")
      await element.type(text)

      if (pressEnter) {
        await page.keyboard.press("Enter")
      }

      log.info("Input successful", { index })

    } catch (error) {
      log.error("Input failed", { index, error })
      throw error
    }
  }

  async screenshot(fullPage: boolean = false): Promise<Buffer> {
    const page = await this.ensurePage()

    log.info("Taking screenshot", { fullPage })

    try {
      const screenshot = await page.screenshot({
        fullPage,
        type: "png",
      })

      log.info("Screenshot taken", {
        size: screenshot.length,
        fullPage,
      })

      return Buffer.from(screenshot)

    } catch (error) {
      log.error("Screenshot failed", { error })
      throw error
    }
  }

  async scroll(direction: "up" | "down" | "left" | "right", amount: number = 500): Promise<void> {
    const page = await this.ensurePage()

    log.info("Scrolling", { direction, amount })

    try {
      const scrollAmount = direction === "up" || direction === "left" ? -amount : amount

      if (direction === "up" || direction === "down") {
        await page.evaluate((pixels) => {
          window.scrollBy({ top: pixels, behavior: "smooth" })
        }, scrollAmount)
      } else {
        await page.evaluate((pixels) => {
          window.scrollBy({ left: pixels, behavior: "smooth" })
        }, scrollAmount)
      }

      log.info("Scroll successful", { direction, amount })

    } catch (error) {
      log.error("Scroll failed", { direction, error })
      throw error
    }
  }

  async pressKey(key: string): Promise<void> {
    const page = await this.ensurePage()

    log.info("Pressing key", { key })

    try {
      await page.keyboard.press(key)
      log.info("Key press successful", { key })
    } catch (error) {
      log.error("Key press failed", { key, error })
      throw error
    }
  }

  private async extractInteractiveElements(): Promise<string[]> {
    const page = await this.ensurePage()

    const elements = await page.evaluate(() => {
      const allElements = document.querySelectorAll(
        'button, a, input, textarea, select, [role="button"], [tabindex]:not([tabindex="-1"])'
      )

      let validIndex = 0
      const results: any[] = []

      for (const element of Array.from(allElements)) {
        const rect = element.getBoundingClientRect()

        if (rect.width === 0 || rect.height === 0) continue

        const style = window.getComputedStyle(element)
        if (style.display === "none" ||
            style.visibility === "hidden" ||
            style.opacity === "0") continue

        const tag = element.tagName.toLowerCase()
        let text = ""

        if ((element as any).value && ["input", "textarea", "select"].includes(tag)) {
          text = (element as any).value
        } else if ((element as HTMLElement).innerText) {
          text = (element as HTMLElement).innerText.trim().replace(/\s+/g, " ")
        } else {
          text = "[No text]"
        }

        if (text.length > 100) {
          text = text.substring(0, 97) + "..."
        }

        ;(element as any).setAttribute("data-opencode-id", `opencode-element-${validIndex}`)

        results.push({
          index: validIndex++,
          tag,
          text,
          selector: `[data-opencode-id="opencode-element-${validIndex}"]`,
        })
      }

      return results
    })

    return elements.map(el =>
      `${el.index}:<${el.tag}>${el.text}</${el.tag}>`
    )
  }

  async cleanup(): Promise<void> {
    try {
      if (this.page && !this.page.isClosed()) {
        await this.page.close()
      }

      if (this.context) {
        await this.context.close()
      }

      if (this.browser) {
        await this.browser.close()
      }

      if (this.playwright) {
        await this.playwright.close()
      }

    } catch (error) {
      log.error("Cleanup error", { error })

    } finally {
      this.page = null
      this.context = null
      this.browser = null
      this.playwright = null
      this.initialized = false
    }
  }
}

export default PlaywrightClient
