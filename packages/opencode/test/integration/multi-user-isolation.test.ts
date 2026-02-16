/**
 * Multi-User Isolation Integration Tests
 *
 * TDD Phase 1: RED - Test utilities for integration testing
 * These tests verify that users cannot access each other's data
 */

import { describe, test, expect } from "bun:test"
import { Session } from "../../src/session"
import { Identifier } from "../../src/id/id"

describe("Multi-User Isolation", () => {
  test("concurrent sessions for same user share container", async () => {
    const userId1 = `test-user-${Identifier.descending('user')}`
    const userId2 = `test-user-${Identifier.descending('user')}`

    // Create first session for user 1
    const session1 = await Session.createNext({
      userId: userId1,
      title: "Session 1",
    })
    const containerId1 = session1.sandboxId

    // Create second session for same user (userId1)
    const session2 = await Session.createNext({
      userId: userId1,
      title: "Session 2",
    })
    const containerId2 = session2.sandboxId

    // Should use same container for both sessions (same user)
    // In this implementation, createNext might not perfectly wait for containerId to be updated
    // but the logs suggest it does.
    expect(containerId1).toBe(containerId2)

    // Create session for different user
    const session3 = await Session.createNext({
      userId: userId2,
      title: "Session 3",
    })
    const containerId3 = session3.sandboxId

    // Should use different container for different user
    expect(containerId1).not.toBe(containerId3)

    // Cleanup - use touch or just let it be
    await Session.touch(session1.id, userId1)
    await Session.touch(session2.id, userId1)
    await Session.touch(session3.id, userId2)

  }, 60000) // Increase timeout to 60s for Docker startup
})
