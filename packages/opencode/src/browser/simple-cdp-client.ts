/**
 * Simple CDP Client that works with Bun
 *
 * This bypasses Playwright's connectOverCDP() which has compatibility issues with Bun.
 * Instead, it directly uses WebSocket to communicate with Chrome's CDP.
 */

const CDP_VERSION = "1.3"

export interface CDPTarget {
  description: string
  devtoolsFrontendUrl: string
  id: string
  title: string
  type: string
  url: string
  webSocketDebuggerUrl: string
}

export class SimpleCDPClient {
  private wsUrl: string
  private ws: WebSocket | null = null
  private messageId = 1
  private pendingMessages = new Map<number, {
    resolve: (value: any) => void
    reject: (error: Error) => void
  }>()

  constructor(wsUrl: string) {
    this.wsUrl = wsUrl
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log(`[CDP] Connecting to ${this.wsUrl}`)

      this.ws = new WebSocket(this.wsUrl)

      this.ws.onopen = () => {
        console.log("[CDP] Connected!")
        resolve()
      }

      this.ws.onerror = (err: Event) => {
        console.error("[CDP] Connection error:", err)
        reject(new Error("WebSocket connection failed"))
      }

      this.ws.onmessage = (event: MessageEvent) => {
        try {
          const message = JSON.parse(event.data)
          // console.log("[CDP] Received:", message)

          if (message.id !== undefined && this.pendingMessages.has(message.id)) {
            const pending = this.pendingMessages.get(message.id)!
            if (message.error) {
              pending.reject(new Error(message.error.message))
            } else {
              pending.resolve(message.result)
            }
            this.pendingMessages.delete(message.id)
          }
        } catch (e) {
          console.error("[CDP] Failed to parse message:", e)
        }
      }
    })
  }

  async send(method: string, params?: any): Promise<any> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket not connected")
    }

    const id = this.messageId++
    const message = { id, method, params }

    return new Promise((resolve, reject) => {
      this.pendingMessages.set(id, { resolve, reject })

      try {
        this.ws!.send(JSON.stringify(message))
      } catch (e) {
        this.pendingMessages.delete(id)
        reject(e)
      }

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.pendingMessages.has(id)) {
          this.pendingMessages.delete(id)
          reject(new Error(`CDP command timeout: ${method}`))
        }
      }, 30000)
    })
  }

  async navigate(url: string): Promise<void> {
    await this.send("Page.navigate", { url })
  }

  async executeScript(script: string): Promise<any> {
    const result = await this.send("Runtime.evaluate", {
      expression: script,
      awaitPromise: true,
      returnByValue: true
    })

    // Handle different result types
    if (result.result?.type === "undefined") {
      return undefined
    } else if (result.result?.type === "string") {
      return result.result.value
    } else if (result.result?.value !== undefined) {
      return result.result.value
    } else if (result.result?.objectId) {
      // Object reference - need to get value
      const props = await this.send("Runtime.getProperties", {
        objectId: result.result.objectId,
        ownProperties: true
      })
      return props.result?.map((p: any) => p.value?.value)
    }

    return result
  }

  /**
   * Extract interactive elements from the current page
   * This replicates the PlaywrightClient's extractInteractiveElements() functionality
   */
  async extractInteractiveElements(): Promise<string[]> {
    const script = `
      (() => {
        const allElements = document.querySelectorAll(
          'button, a, input, textarea, select, [role="button"], [tabindex]:not([tabindex="-1"])'
        );

        let validIndex = 0;
        const results = [];

        for (const element of Array.from(allElements)) {
          // Filter hidden elements
          const rect = element.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) continue;

          const style = window.getComputedStyle(element);
          if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") continue;

          // Extract text content
          const tag = element.tagName.toLowerCase();
          let text = "";

          if (tag === "input" || tag === "textarea") {
            text = element.value || element.placeholder || "";
          } else {
            text = element.textContent ? element.textContent.trim() : "";
          }

          // Truncate long text
          if (text.length > 50) text = text.substring(0, 47) + "...";

          results.push({
            index: validIndex++,
            tag: tag,
            text: text,
          });

          // Set data attribute for later operations
          element.setAttribute("data-opencode-id", "opencode-element-" + (validIndex - 1));
        }

        return JSON.stringify(results);
      })()
    `

    console.log("[CDP] Executing element extraction script...")
    const result = await this.send("Runtime.evaluate", {
      expression: script,
      awaitPromise: true,
      returnByValue: true
    })

    console.log("[CDP] Script result:", JSON.stringify(result).substring(0, 500))

    if (result.result?.type === "string") {
      // Parse the JSON string returned by Runtime.evaluate
      const elements = JSON.parse(result.result.value)
      console.log("[CDP] Parsed elements:", elements.length)
      return elements.map((e: { index: number; tag: string; text: string }) => `${e.index}:<${e.tag}>${e.text}</${e.tag}>`)
    }

    console.log("[CDP] Unexpected result type:", result.result?.type)
    return []
  }

  async close(): Promise<void> {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }
}

/**
 * Get the first page target from CDP
 */
export async function getFirstPageTarget(cdpHttpUrl: string): Promise<CDPTarget> {
  const response = await fetch(`${cdpHttpUrl}/json`)
  const targets = await response.json() as CDPTarget[]

  const page = targets.find(t => t.type === "page")
  if (!page) {
    throw new Error("No page target found")
  }

  return page
}

// Test the client
async function main() {
  try {
    console.log("Testing Simple CDP Client with Snapshot...")

    const target = await getFirstPageTarget("http://localhost:32807")
    console.log("Found page:", target.title)

    const client = new SimpleCDPClient(target.webSocketDebuggerUrl)
    await client.connect()

    const TEST_URL = "https://www.pcgameres.com/portal/article/index/id/3822.html"

    console.log(`Navigating to: ${TEST_URL}`)
    const startTime = Date.now()
    await client.navigate(TEST_URL)
    console.log(`Navigation took ${Date.now() - startTime}ms`)

    // Smart wait - wait for DOMContentLoaded instead of fixed timeout
    console.log("Waiting for page ready...")
    await client.send("Page.enable")

    // Wait a maximum of 10 seconds for page load, checking every 500ms
    const maxWait = 10000
    const checkInterval = 500
    for (let elapsed = 0; elapsed < maxWait; elapsed += checkInterval) {
      await new Promise(resolve => setTimeout(resolve, checkInterval))
      const readyState = await client.executeScript("document.readyState")
      if (readyState === "complete" || readyState === "interactive") {
        console.log(`Page ready after ${elapsed + checkInterval}ms (state: ${readyState})`)
        break
      }
    }

    // Enable runtime to ensure script execution works
    await client.send("Runtime.enable")

    console.log("Extracting interactive elements...")
    const elements = await client.extractInteractiveElements()

    console.log()
    console.log("=".repeat(60))
    console.log(`✅ Extracted ${elements.length} interactive elements`)
    console.log("=".repeat(60))

    const displayCount = Math.min(elements.length, 50)
    for (let i = 0; i < displayCount; i++) {
      console.log(`  ${elements[i]}`)
    }

    if (elements.length > 50) {
      console.log(`  ... (and ${elements.length - 50} more elements)`)
    }

    // Statistics
    const stats = { buttons: 0, links: 0, inputs: 0, others: 0 }
    for (const e of elements) {
      if (e.includes("<button>")) stats.buttons++
      else if (e.includes("<a>")) stats.links++
      else if (e.includes("<input>") || e.includes("<textarea>")) stats.inputs++
      else stats.others++
    }

    console.log()
    console.log("📊 Statistics:")
    console.log(`  Total: ${elements.length}`)
    console.log(`  Buttons: ${stats.buttons}`)
    console.log(`  Links: ${stats.links}`)
    console.log(`  Inputs: ${stats.inputs}`)
    console.log(`  Others: ${stats.others}`)

    console.log()
    console.log("✅ Test passed! Simple CDP Client works with Bun!")

    await client.close()
  } catch (error) {
    console.error("❌ Test failed:", error)
    process.exit(1)
  }
}

main()
