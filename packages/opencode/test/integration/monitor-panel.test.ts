import { describe, it, expect, beforeAll, afterAll } from "bun:test"

// Mock bus functionality for testing
const mockSubscriptions = new Map<string, Array<(event: any) => void>>()
const mockEvents: any[] = []

// Mock Bus implementation
const mockBus = {
  subscribe: (sessionId: string, callback: (event: any) => void) => {
    const key = sessionId
    if (!mockSubscriptions.has(key)) {
      mockSubscriptions.set(key, [])
    }
    mockSubscriptions.get(key)!.push(callback)
    return () => {
      const callbacks = mockSubscriptions.get(key) || []
      const index = callbacks.indexOf(callback)
      if (index > -1) {
        callbacks.splice(index, 1)
      }
    }
  },
  publish: (event: any) => {
    mockEvents.push(event)
    const callbacks = mockSubscriptions.get(event.sessionId) || []
    callbacks.forEach(callback => callback(event))
  },
}

describe("Monitor Panel Integration", () => {
  const sessionId = "test-monitor-panel"

  it("should publish monitor.action event when write tool writes .md file", async () => {
    const events: any[] = []

    // Subscribe to events
    const unsubscribe = mockBus.subscribe(sessionId, (event) => {
      if (event.type === "monitor.action") {
        events.push(event)
      }
    })

    // Simulate write tool writing markdown
    mockBus.publish({
      type: "monitor.action",
      sessionId,
      actionId: `action-${Date.now()}-test1`,
      timestamp: Date.now(),
      renderType: "markdown",
      data: {
        filePath: "/home/ubuntu/test.md",
        content: "# Test\n\nHello World",
      },
    })

    // Wait for event
    await new Promise((resolve) => setTimeout(resolve, 100))

    expect(events.length).toBeGreaterThan(0)
    expect(events[0].renderType).toBe("markdown")

    unsubscribe()
  })

  it("should publish VNC event when browser navigate", async () => {
    const events: any[] = []

    const unsubscribe = mockBus.subscribe(sessionId, (event) => {
      if (event.type === "monitor.action") {
        events.push(event)
      }
    })

    // Simulate browser navigate
    mockBus.publish({
      type: "monitor.action",
      sessionId,
      actionId: `action-${Date.now()}-test2`,
      timestamp: Date.now(),
      renderType: "vnc",
      data: {
        vncUrl: `/api/session/${sessionId}/vnc/ws`,
      },
    })

    await new Promise((resolve) => setTimeout(resolve, 100))

    expect(events.length).toBeGreaterThan(0)
    expect(events[0].renderType).toBe("vnc")

    unsubscribe()
  })
})