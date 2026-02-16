// File: packages/opencode/src/tool/browser/schema.ts

import { z } from "zod"

/**
 * Zod schema for the unified browser tool
 * Validates action-based dispatch with appropriate parameters per action
 */

// Action type definition
export const BrowserActionType = z.enum([
  "navigate",
  "snapshot",
  "act",
  "screenshot",
  "status"
])

export type BrowserAction = z.infer<typeof BrowserActionType>

// Request schemas for different action types
const NavigateRequestSchema = z.object({
  url: z.string().describe("The URL to navigate to"),
  timeout: z.number().optional().describe("Navigation timeout in milliseconds (default: 15000)")
})

const ClickRequestSchema = z.object({
  click: z.object({
    ref: z.string().describe("Element reference from snapshot (e.g., 'e0', 'e5')")
  })
})

const TypeRequestSchema = z.object({
  type: z.object({
    ref: z.string().describe("Element reference from snapshot"),
    text: z.string().describe("Text to type into the element"),
    submit: z.boolean().optional().describe("Press Enter after typing (default: false)")
  })
})

const WaitRequestSchema = z.object({
  wait: z.object({
    condition: z.enum(["visible", "hidden", "ready"]),
    ref: z.string().optional(),
    timeout: z.number().optional()
  }).optional()
})

const ScriptRequestSchema = z.object({
  script: z.object({
    code: z.string().describe("JavaScript code to execute"),
    returnByValue: z.boolean().optional().describe("Return primitive value instead of object")
  })
})

const ActRequestSchema = z.object({
  click: ClickRequestSchema.shape.click.optional(),
  type: TypeRequestSchema.shape.type.optional(),
  wait: WaitRequestSchema.shape.wait.optional(),
  script: ScriptRequestSchema.shape.script.optional()
}).refine(
  (data) => {
    // Exactly one action type must be specified
    const actions = [
      data.click !== undefined,
      data.type !== undefined,
      data.wait !== undefined,
      data.script !== undefined
    ]
    return actions.filter(Boolean).length === 1
  },
  {
    message: "Exactly one of click, type, wait, or script must be specified in act request"
  }
)

const ScreenshotRequestSchema = z.object({
  fullPage: z.boolean().optional().describe("Capture full scrollable page (default: false)"),
  filename: z.string().optional().describe("Artifact filename (default: screenshot-<timestamp>.png)")
})

// Main tool schema with conditional validation
export const BrowserToolSchema = z.object({
  action: BrowserActionType,

  // Navigate parameters
  url: z.string().optional(),
  timeout: z.number().optional(),

  // Act parameters
  request: ActRequestSchema.optional(),

  // Screenshot parameters
  fullPage: z.boolean().optional(),
  filename: z.string().optional()
}).refine(
  (data) => {
    // navigate requires url
    if (data.action === "navigate") {
      return typeof data.url === "string" && data.url.length > 0
    }
    return true
  },
  {
    message: "url is required when action is 'navigate'",
    path: ["url"]
  }
).refine(
  (data) => {
    // act requires request with exactly one action
    if (data.action === "act") {
      return data.request !== undefined
    }
    return true
  },
  {
    message: "request is required when action is 'act'",
    path: ["request"]
  }
)

// Type inference
export type BrowserToolParams = z.infer<typeof BrowserToolSchema>
export type NavigateRequest = z.infer<typeof NavigateRequestSchema>
export type ScreenshotRequest = z.infer<typeof ScreenshotRequestSchema>

// ActRequest represents the request wrapper passed to the act handler
// It contains a 'request' property which holds the actual action data
export interface ActRequest {
  request?: {
    click?: { ref: string }
    type?: { ref: string; text: string; submit?: boolean }
    wait?: { condition: "visible" | "hidden" | "ready"; ref?: string; timeout?: number }
    script?: { code: string; returnByValue?: boolean }
  }
}

// Result types
export interface BrowserToolResult {
  success: boolean
  action: BrowserAction

  // For navigate/snapshot
  snapshot?: {
    url: string
    title: string
    elements: string[]
  }

  // For act
  result?: {
    status: string
    ref?: string
    value?: any
  }

  // For screenshot
  screenshot?: {
    path: string
    artifactId: string
  }

  // For status
  status?: {
    url: string
    title: string
    elementCount: number
    vncAvailable: boolean
    vncUrl?: string
  }

  // Error handling
  error?: {
    code: string
    message: string
    diagnostic?: string
  }

  // Error recovery
  recovery?: {
    suggestedNextAction: {
      action: BrowserAction
      params: Partial<BrowserToolParams>
      reason: string
    }
    alternatives?: Array<{
      action: BrowserAction
      description: string
    }>
  }
}

// Handler context
export interface HandlerContext {
  client: PlaywrightClientExtended
  sessionID: string
}

/**
 * Extended PlaywrightClient interface with methods used by handlers
 * This interface is implemented by both CDP-based PlaywrightClient and HTTP-based PlaywrightHttpClient
 */
export interface PlaywrightClientExtended {
  navigate(url: string, timeout?: number): Promise<{ url: string; title: string; elements: string[] }>
  snapshot(): Promise<{ url: string; title: string; elements: string[] }>
  act(params: { ref?: string; selector?: string; action: string; value?: string }): Promise<{ status: string; ref?: string; value?: any }>
  screenshot(fullPage?: boolean): Promise<Buffer>
  status(): Promise<{ url: string; title: string; elementCount: number; vncAvailable: boolean }>
  cleanup(): Promise<void>
  initialize(): Promise<boolean>
}

/**
 * Playwright page interface
 */
export interface PlaywrightPage {
  url(): string
  title(): Promise<string>
  evaluate(code: string): Promise<any>
  waitForLoadState(state: string, opts?: { timeout?: number }): Promise<void>
  waitForSelector(selector: string, opts?: { state?: string; timeout?: number }): Promise<void>
}
