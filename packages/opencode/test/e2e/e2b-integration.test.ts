/**
 * E2B End-to-End Integration Tests
 *
 * Comprehensive integration tests for E2B sandbox backend.
 * Tests the complete flow from session creation to VNC connection.
 *
 * IMPORTANT: This test reuses a SINGLE sandbox to avoid hitting E2B limits.
 * Only creates one sandbox for the entire test suite.
 *
 * Prerequisites:
 * - E2B_API_KEY environment variable set
 * - Optional: E2B_TEMPLATE_ID for custom template
 *
 * Run with: SANDBOX_BACKEND=e2b E2B_API_KEY=xxx bun test test/e2e/e2b-integration.test.ts
 *
 * Cleanup: Use cleanup script to close orphaned sandboxes
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest"

// Pre-import e2b package to ensure it's available in the dependency graph
import "e2b"

import { Sandbox } from "@e2b/code-interpreter"
import { E2BSandboxManager, getE2BManager } from "@/container/e2b-lifecycle"
import { E2BBackend } from "@/sandbox/backend/e2b"
import { getE2BVNCUrl } from "@/server/vnc-adapter"

// ========================================
// TEST CONFIGURATION
// ========================================

const API_KEY = process.env.E2B_API_KEY
const TEMPLATE_ID = process.env.E2B_TEMPLATE_ID || "vnc-sandbox"
const SANDBOX_TIMEOUT = 120000 // 2 minutes

// Skip all tests if no API key
const runTests = API_KEY ? describe : describe.skip

runTests("E2B End-to-End Integration", () => {
  let manager: E2BSandboxManager
  let testUserId: string
  let sharedSandboxId: string
  let sharedBackend: E2BBackend

  beforeAll(async () => {
    // Initialize manager
    manager = getE2BManager()
    testUserId = `e2e-test-${Date.now()}`

    // Create ONE shared sandbox for all tests
    console.log("🔧 Creating shared E2B sandbox...")
    const sandbox = await manager.getOrCreateSandbox({
      userId: testUserId,
      timeout: SANDBOX_TIMEOUT,
    })
    sharedSandboxId = sandbox.sandboxId
    console.log(`✅ Shared sandbox: ${sharedSandboxId}`)

    // Create shared backend
    sharedBackend = new E2BBackend(sharedSandboxId, API_KEY, {
      timeout: SANDBOX_TIMEOUT,
    })
  }, 60000)

  afterAll(async () => {
    // Cleanup the shared sandbox
    console.log("🧹 Cleaning up...")
    await manager.deleteSandbox(testUserId)
    console.log("✅ Cleanup complete")
  }, 30000)

  // ========================================
  // SANDBOX LIFECYCLE
  // ========================================
  describe("Sandbox Lifecycle", () => {
    it("should retrieve existing sandbox", async () => {
      const sandbox = await manager.getOrCreateSandbox({
        userId: testUserId,
        timeout: SANDBOX_TIMEOUT,
      })

      expect(sandbox.sandboxId).toBe(sharedSandboxId) // Same sandbox!
    })

    it("should get sandbox by user ID", async () => {
      const sandbox = manager.getSandbox(testUserId)
      expect(sandbox?.sandboxId).toBe(sharedSandboxId)
    })
  })

  // ========================================
  // FILE OPERATIONS
  // ========================================
  describe("File Operations", () => {
    it("should execute command", async () => {
      const result = await sharedBackend.exec("echo 'test'")
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain("test")
    })

    it("should write and read file", async () => {
      await sharedBackend.writeFile("/tmp/test.txt", "Hello E2B")
      const content = await sharedBackend.readFile("/tmp/test.txt")
      expect(content).toBe("Hello E2B")
    })

    it("should check file existence", async () => {
      expect(await sharedBackend.fileExists("/tmp/test.txt")).toBe(true)
      expect(await sharedBackend.fileExists("/tmp/nonexistent.txt")).toBe(false)
    })

    it("should get file stats", async () => {
      const stat = await sharedBackend.fileStat("/tmp/test.txt")
      expect(stat.exists).toBe(true)
      expect(stat.size).toBeGreaterThan(0)
    })

    it("should list directory", async () => {
      const entries = await sharedBackend.listDir("/tmp")
      expect(entries.length).toBeGreaterThan(0)
    })

    it("should find files", async () => {
      const files = await sharedBackend.findFiles("/tmp", "*.txt")
      expect(files.length).toBeGreaterThan(0)
    })
  })

  // ========================================
  // VNC CONNECTION
  // ========================================
  describe("VNC Connection", () => {
    it("should get VNC URL", async () => {
      const vncUrl = await getE2BVNCUrl(testUserId)
      expect(vncUrl).toBeDefined()
      expect(vncUrl).toMatch(/^wss?:\/\//)
    }, 30000)
  })

  // ========================================
  // DEVELOPMENT ENVIRONMENT
  // ========================================
  describe("Development Environment", () => {
    it("should have Python3", async () => {
      const result = await sharedBackend.exec("python3 --version")
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toMatch(/Python 3/)
    })

    it("should have Node.js", async () => {
      const result = await sharedBackend.exec("node --version")
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toMatch(/v\d+\.\d+\.\d+/)
    })

    it("should have git", async () => {
      const result = await sharedBackend.exec("git --version")
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toMatch(/git version/)
    })
  })
})
