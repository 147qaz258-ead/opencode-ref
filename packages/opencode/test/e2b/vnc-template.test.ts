/**
 * E2B VNC Template Tests
 *
 * Test suite to verify VNC template functionality.
 * These tests require a valid E2B API key.
 */

import { describe, it, expect, beforeAll } from "vitest"
import { Sandbox } from "@e2b/code-interpreter"

const API_KEY = process.env.E2B_API_KEY
const TEMPLATE_ID = process.env.E2B_TEMPLATE_ID || "vnc-sandbox"

describe("E2B VNC Template Integration", () => {
  let sandbox: Awaited<ReturnType<typeof Sandbox.create>>

  beforeAll(async () => {
    if (!API_KEY) {
      throw new Error("E2B_API_KEY environment variable is required")
    }

    // Create sandbox with VNC template
    sandbox = await Sandbox.create({
      apiKey: API_KEY,
      id: TEMPLATE_ID,
      timeoutMs: 300000, // 5 minutes
    })

    console.log(`Created sandbox: ${sandbox.sandboxId}`)
  })

  afterAll(async () => {
    if (sandbox) {
      await sandbox.kill()
      console.log(`Killed sandbox: ${sandbox.sandboxId}`)
    }
  })

  describe("VNC Server", () => {
    it("should have VNC server running", async () => {
      const result = await sandbox.process.output({
        cmd: "pgrep -f vnc",
        timeoutMs: 5000,
      })

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toBeTruthy()
      expect(result.stdout.trim()).not.toBe("")
    })

    it("should have VNC listening on port 5901", async () => {
      const result = await sandbox.process.output({
        cmd: "netstat -tlnp | grep 5901 || ss -tlnp | grep 5901",
        timeoutMs: 5000,
      })

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain("5901")
    })

    it("should have noVNC/websockify running", async () => {
      const result = await sandbox.process.output({
        cmd: "pgrep -f websockify",
        timeoutMs: 5000,
      })

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toBeTruthy()
    })

    it("should have noVNC listening on port 6080", async () => {
      const result = await sandbox.process.output({
        cmd: "netstat -tlnp | grep 6080 || ss -tlnp | grep 6080",
        timeoutMs: 5000,
      })

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain("6080")
    })
  })

  describe("Development Environment", () => {
    it("should have Python3 available", async () => {
      const result = await sandbox.process.output({
        cmd: "python3 --version",
        timeoutMs: 5000,
      })

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toMatch(/Python 3\.\d+\.\d+/)
    })

    it("should have Node.js available", async () => {
      const result = await sandbox.process.output({
        cmd: "node --version",
        timeoutMs: 5000,
      })

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toMatch(/v\d+\.\d+\.\d+/)
    })

    it("should have git available", async () => {
      const result = await sandbox.process.output({
        cmd: "git --version",
        timeoutMs: 5000,
      })

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toMatch(/git version/)
    })
  })

  describe("Workspace Directory", () => {
    it("should have /home/workspace directory", async () => {
      const result = await sandbox.process.output({
        cmd: "ls -la /home/workspace",
        timeoutMs: 5000,
      })

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain("workspace")
    })

    it("should be able to write files in workspace", async () => {
      await sandbox.writeFile("/home/workspace/test.txt", "Hello from E2B!")

      const content = await sandbox.readFile("/home/workspace/test.txt")
      expect(content).toBe("Hello from E2B!")
    })
  })

  describe("Port Forwarding", () => {
    it("should expose noVNC port via E2B port forwarding", async () => {
      // Get port forwarding for noVNC (port 6080)
      const ports = await sandbox.getPorts(6080)

      expect(ports).toBeDefined()
      expect(ports.url).toBeDefined()
      expect(ports.url).toMatch(/^wss?:\/\//)

      console.log(`noVNC available at: ${ports.url}`)
    }, 30000)

    it("should expose VNC port via E2B port forwarding", async () => {
      // Get port forwarding for VNC (port 5901)
      const ports = await sandbox.getPorts(5901)

      expect(ports).toBeDefined()
      expect(ports.url).toBeDefined()
      expect(ports.url).toMatch(/^wss?:\/\//)

      console.log(`VNC available at: ${ports.url}`)
    }, 30000)
  })
})

// Skip these tests if no API key is provided
const runTests = API_KEY ? describe : describe.skip

runTests("E2B VNC Template - Live Tests", () => {
  // Re-run all tests with live API
  // This allows running tests conditionally based on API key availability
})
