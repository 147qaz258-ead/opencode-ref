/**
 * E2B Sandbox Cleanup Script
 *
 * This script lists and optionally kills all E2B sandboxes for the current API key.
 * Useful for cleaning up orphaned sandboxes after testing.
 *
 * Run with: bun run test/e2e/cleanup-sandboxes.ts
 */

import { SandboxApi } from "e2b"

const API_KEY = process.env.E2B_API_KEY

if (!API_KEY) {
  console.error("❌ E2B_API_KEY environment variable not set")
  process.exit(1)
}

async function listSandboxes() {
  try {
    // List all sandboxes using SandboxAPI
    // Note: E2B doesn't have a direct "list all" API in the JS SDK
    // You can use the E2B dashboard or REST API to list sandboxes
    console.log("📋 To list all sandboxes, visit: https://e2b.dev/dashboard")
    console.log("📋 Or use the REST API:")
    console.log(`curl -H "X-API-Key: ${API_KEY}" https://api.e2b.dev/sandboxes`)
  } catch (error) {
    console.error("Failed to list sandboxes:", error)
  }
}

async function killSandbox(sandboxId: string) {
  try {
    const killed = await SandboxApi.kill(sandboxId, { apiKey: API_KEY })
    if (killed) {
      console.log(`✅ Killed sandbox: ${sandboxId}`)
    } else {
      console.log(`⚠️ Sandbox not found: ${sandboxId}`)
    }
  } catch (error) {
    console.error(`❌ Failed to kill ${sandboxId}:`, error)
  }
}

// Main function
async function main() {
  const args = process.argv.slice(2)
  const command = args[0]

  if (command === "kill" && args[1]) {
    // Kill specific sandbox
    await killSandbox(args[1])
  } else if (command === "list") {
    // List sandboxes
    await listSandboxes()
  } else {
    console.log(`
E2B Sandbox Cleanup

Usage:
  bun run test/e2e/cleanup-sandboxes.ts list    - List all sandboxes
  bun run test/e2e/cleanup-sandboxes.ts kill <id>  - Kill specific sandbox

To clean up ALL sandboxes, visit the E2B dashboard:
https://e2b.dev/dashboard?tab=sandboxes

Or use the REST API with curl:
curl -X DELETE -H "X-API-Key: YOUR_API_KEY" \\
  https://api.e2b.dev/sandboxes/{sandboxId}
    `)
  }
}

main()
