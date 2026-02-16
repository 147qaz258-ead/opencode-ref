/**
 * Browser Tool Design - Single Tool Approach
 *
 * Based on OpenClaw's browser tool and our Simple CDP Client
 */

import { z } from "zod"

// ============================================================================
// Tool Schema Definition
// ============================================================================

export const BrowserToolSchema = z.object({
  // Required: action to perform
  action: z.enum(["navigate", "snapshot", "act", "screenshot", "status"]),

  // For navigate: target URL
  url: z.string().optional(),

  // For snapshot/screenshot: target element reference
  ref: z.string().optional(),

  // For act: complex action request
  request: z.object({
    // Click action
    click: z.object({
      ref: z.string(), // element reference (e.g., "e12" from snapshot)
    }).optional(),

    // Type action
    type: z.object({
      ref: z.string(),
      text: z.string(),
      submit: z.boolean().optional(),
    }).optional(),

    // Wait action
    wait: z.object({
      condition: z.enum(["visible", "hidden", "ready"]),
      ref: z.string().optional(),
      timeout: z.number().optional(),
    }).optional(),

    // Script execution - MODEL CODE EXECUTION
    script: z.object({
      code: z.string(), // JavaScript code to execute
      returnByValue: z.boolean().optional(),
    }).optional(),
  }).optional(),

  // Options
  timeout: z.number().optional(),
  waitFor: z.enum(["ready", "load"]).optional(),
})

export type BrowserToolParams = z.infer<typeof BrowserToolSchema>

// ============================================================================
// Result Types
// ============================================================================

export interface BrowserToolResult {
  success: boolean
  action: string

  // For navigate/snapshot
  snapshot?: {
    url: string
    title: string
    elements: string[] // ["0:<button>Login</button>", "1:<input>Username</input>"]
    targetId: string // For keeping context across calls
  }

  // For act
  result?: {
    status: string // "clicked", "typed", "executed"
    ref?: string
    value?: any // For script execution
  }

  // For screenshot
  screenshot?: {
    path: string
    format: "png" | "jpeg"
  }

  // Error handling
  error?: {
    message: string
    type: string
  }
}

// ============================================================================
// Implementation Plan
// ============================================================================

/**
 * Step 1: Implement BrowserTool class
 * - Uses SimpleCDPClient (not Playwright)
 * - Maintains connection across calls
 * - Maps actions to CDP commands
 */

/**
 * Step 2: Action Handlers
 *
 * navigate(url):
 *   1. CDP: Page.navigate
 *   2. Wait for DOM ready
 *   3. Auto-run snapshot
 *   4. Return elements
 *
 * snapshot():
 *   1. CDP: Runtime.evaluate (element extraction script)
 *   2. Return indexed elements
 *
 * act(request):
 *   click: CDP: DOM.describeNode + DOM.resolveNode + Runtime.callFunction
 *   type: CDP: DOM.resolveNode + Runtime.callFunction (focus + value + dispatchEvent)
 *   wait: Poll until condition met
 *   script: CDP: Runtime.evaluate (MODEL CODE EXECUTION)
 */

/**
 * Step 3: Test Strategy
 *
 * Test 1: Navigate + Snapshot
 * - Verify elements are returned
 * - Check Chrome container has navigated
 *
 * Test 2: Model Code Execution
 * - Send script through act.request.script
 * - Execute: document.title
 * - Verify return value
 * - Check Chrome logs for execution
 *
 * Test 3: Click + Verify
 * - Click element by ref
 * - Verify element state changed
 */

// ============================================================================
// Code Example - How Model Would Use It
// ============================================================================

/**
 * Example 1: Simple navigation
 *
 * User: "Go to google.com"
 * Model output:
 * {
 *   action: "navigate",
 *   url: "https://google.com"
 * }
 *
 * Tool returns:
 * {
 *   success: true,
 *   action: "navigate",
 *   snapshot: {
 *     url: "https://google.com",
 *     title: "Google",
 *     elements: [
 *       "0:<input>Search</input>",
 *       "1:<button>Google Search</button>",
 *       "2:<button>I'm Feeling Lucky</button>"
 *     ],
 *     targetId: "page-123"
 *   }
 * }
 */

/**
 * Example 2: Click element
 *
 * User: "Click the search button"
 * Model output (from previous snapshot):
 * {
 *   action: "act",
 *   request: {
 *     click: {
 *       ref: "1" // From snapshot element "1:<button>Google Search</button>"
 *     }
 *   }
 * }
 *
 * Tool returns:
 * {
 *   success: true,
 *   action: "act",
 *   result: {
 *     status: "clicked",
 *     ref: "1"
 *   }
 * }
 */

/**
 * Example 3: MODEL CODE EXECUTION
 *
 * User: "Run JavaScript to get all links"
 * Model output:
 * {
 *   action: "act",
 *   request: {
 *     script: {
 *       code: "Array.from(document.querySelectorAll('a')).map(a => a.href).slice(0, 10)"
 *     }
 *   }
 * }
 *
 * Tool execution:
 * 1. Send CDP: Runtime.evaluate with the code
 * 2. Wait for result
 * 3. Return value:
 *
 * {
 *   success: true,
 *   action: "act",
 *   result: {
 *     status: "executed",
 *     value: ["https://link1.com", "https://link2.com", ...]
 *   }
 * }
 *
 * Chrome container verification:
 * - Check console.log output
 * - Check CDP response
 * - Verify script actually executed
 */

// ============================================================================
// Verification Strategy
// ============================================================================

/**
 * How to verify Chrome has reaction:
 *
 * 1. Check CDP response - successful execution returns result
 * 2. Check Console messages - script console.log appears
 * 3. Re-run snapshot - page state changed
 * 4. Check targetId consistency - same page
 *
 * Error handling:
 *
 * {
 *   success: false,
 *   action: "act",
 *   error: {
 *     message: "Element e12 not found (stale snapshot)",
 *     type: "ref_error"
 *   }
 * }
 *
 * {
 *   success: false,
 *   action: "act",
 *   error: {
 *     message: "Script execution failed: ReferenceError: foo is not defined",
 *     type: "script_error"
 *   }
 * }
 *
 * {
 *   success: false,
 *   action: "navigate",
 *   error: {
 *     message: "Navigation timeout after 30000ms",
 *     type: "timeout_error"
 *   }
 * }
 */

// ============================================================================
// Next Steps
// ============================================================================

/**
 * Questions for implementation:
 *
 * 1. Should we maintain connection across tool calls? (YES - via sessionId)
 * 2. How to handle multiple tabs? (targetId from snapshot)
 * 3. How to handle stale refs? (auto-detect and suggest re-snapshot)
 * 4. Should script execution have security limits? (sandbox eval)
 * 5. File upload/download handling? (via container file system)
 */

export const DESIGN_SUMMARY = {
  toolName: "browser",
  coreActions: ["navigate", "snapshot", "act", "screenshot"],
  uniqueFeature: "Model code execution via script field",
  basedOn: "OpenClaw browser tool + Simple CDP Client",
  advantages: [
    "Single tool - simpler for model to understand",
    "Direct CDP - works with Bun runtime",
    "Indexed refs - stable across calls",
    "Script execution - flexible model control"
  ]
}
