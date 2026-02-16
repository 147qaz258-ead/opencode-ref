/**
 * Instance Integration Tests
 * Tests that Instance.provide properly isolates by userId
 */

import { describe, expect, test, beforeEach } from "bun:test"
import { Instance } from "../../src/project/instance"
import { Storage } from "../../src/storage/storage"
import { Project } from "../../src/project/project"
import { Log } from "../../src/util/log"

Log.init({ print: false })

describe("Instance.provide - User Isolation Integration", () => {
  beforeEach(async () => {
    // Clean up storage before each test
    await Storage.remove(["project", "user-instance-a"]).catch(() => {})
    await Storage.remove(["project", "user-instance-b"]).catch(() => {})
    await Storage.remove(["project", "user-default"]).catch(() => {})
    await Storage.remove(["project", "global"]).catch(() => {})
  })

  test("should pass userId to Project.fromDirectory and get isolated project", async () => {
    const result = await Instance.provide({
      userId: "instance-a",
      fn: () => {
        return {
          projectId: Instance.project.id,
          worktree: Instance.project.worktree,
        }
      },
    })

    expect(result.projectId).toBe("user-instance-a")
    expect(result.worktree).toBe("/home/ubuntu")
  })

  test("should isolate different users in different instances", async () => {
    const resultA = await Instance.provide({
      userId: "instance-a",
      fn: () => Instance.project.id,
    })

    const resultB = await Instance.provide({
      userId: "instance-b",
      fn: () => Instance.project.id,
    })

    expect(resultA).toBe("user-instance-a")
    expect(resultB).toBe("user-instance-b")
  })

  test("should cache instance by userId", async () => {
    // First call creates the instance
    const result1 = await Instance.provide({
      userId: "cached-user",
      fn: () => Instance.project.id,
    })

    // Second call should use cached instance
    const result2 = await Instance.provide({
      userId: "cached-user",
      fn: () => Instance.project.id,
    })

    expect(result1).toBe(result2)
    expect(result1).toBe("user-cached-user")
  })

  test("should maintain separate state for different users", async () => {
    // User A updates their project
    await Instance.provide({
      userId: "state-user-a",
      init: async () => {
        await Project.update({
          projectID: Instance.project.id,
          name: "User A's Project",
        })
      },
      fn: () => Instance.project.id,
    })

    // User B updates their project differently
    await Instance.provide({
      userId: "state-user-b",
      init: async () => {
        await Project.update({
          projectID: Instance.project.id,
          name: "User B's Project",
        })
      },
      fn: () => Instance.project.id,
    })

    // Verify each user has their own state
    const projectA = await Storage.read<Project.Info>(["project", "user-state-user-a"])
    const projectB = await Storage.read<Project.Info>(["project", "user-state-user-b"])

    expect(projectA?.name).toBe("User A's Project")
    expect(projectB?.name).toBe("User B's Project")
  })
})
