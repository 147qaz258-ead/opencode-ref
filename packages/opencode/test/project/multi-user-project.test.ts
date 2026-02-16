/**
 * Multi-User Project Isolation Tests
 *
 * Tests that Project.fromDirectory() properly isolates projects by userId.
 * User A and User B should get different project instances and IDs.
 */

import { describe, expect, test, beforeEach } from "bun:test"
import { Project } from "../../src/project/project"
import { Storage } from "../../src/storage/storage"
import { Log } from "../../src/util/log"
import { getProjectIdForUser } from "../../src/server/middleware/user-context"

Log.init({ print: false })

describe("Project.fromDirectory - Multi-User Isolation", () => {
  beforeEach(async () => {
    // Clean up storage before each test
    await Storage.remove(["project", "user-user-a"]).catch(() => {})
    await Storage.remove(["project", "user-user-b"]).catch(() => {})
    await Storage.remove(["project", "global"]).catch(() => {})
  })

  test("should return different project IDs for different users", async () => {
    // User A gets their isolated project
    const { project: projectA } = await Project.fromDirectory(undefined, "user-a")
    // User B gets their isolated project
    const { project: projectB } = await Project.fromDirectory(undefined, "user-b")

    // Project IDs should be different
    expect(projectA.id).not.toBe(projectB.id)
    expect(projectA.id).toBe("user-user-a")
    expect(projectB.id).toBe("user-user-b")
  })

  test("should return same project ID for same user on subsequent calls", async () => {
    // First call for user-a
    const { project: project1 } = await Project.fromDirectory(undefined, "user-a")
    // Second call for user-a
    const { project: project2 } = await Project.fromDirectory(undefined, "user-a")

    // Should return the same project ID
    expect(project1.id).toBe(project2.id)
    expect(project1.id).toBe("user-user-a")
  })

  test("should use user-specific project ID format matching getProjectIdForUser", async () => {
    const userId = "test-user-123"
    const { project } = await Project.fromDirectory(undefined, userId)

    expect(project.id).toBe(getProjectIdForUser(userId))
  })

  test("should persist user-specific projects separately", async () => {
    // Create projects for two users
    const { project: projectA } = await Project.fromDirectory(undefined, "user-a")
    const { project: projectB } = await Project.fromDirectory(undefined, "user-b")

    // Verify both projects are persisted separately
    const storedA = await Storage.read<Project.Info>(["project", "user-user-a"])
    const storedB = await Storage.read<Project.Info>(["project", "user-user-b"])

    expect(storedA).toBeDefined()
    expect(storedB).toBeDefined()
    expect(storedA?.id).toBe("user-user-a")
    expect(storedB?.id).toBe("user-user-b")
  })

  test("should maintain independent sandboxes for different users", async () => {
    const { project: projectA } = await Project.fromDirectory(undefined, "user-a")
    const { project: projectB } = await Project.fromDirectory(undefined, "user-b")

    // Each user should have their own sandbox list
    expect(projectA.sandboxes).toEqual([])
    expect(projectB.sandboxes).toEqual([])

    // Modifying one should not affect the other
    await Storage.update<Project.Info>(["project", "user-user-a"], (draft) => {
      draft.sandboxes.push("/sandbox/a")
    })

    const updatedA = await Storage.read<Project.Info>(["project", "user-user-a"])
    const updatedB = await Storage.read<Project.Info>(["project", "user-user-b"])

    expect(updatedA?.sandboxes).toContain("/sandbox/a")
    expect(updatedB?.sandboxes).not.toContain("/sandbox/a")
  })

  test("should use same worktree for all users in sandbox mode", async () => {
    const { project: projectA, sandbox: sandboxA } = await Project.fromDirectory(undefined, "user-a")
    const { project: projectB, sandbox: sandboxB } = await Project.fromDirectory(undefined, "user-b")

    // In sandbox mode, all users share the same worktree
    expect(projectA.worktree).toBe("/home/ubuntu")
    expect(projectB.worktree).toBe("/home/ubuntu")
    expect(sandboxA).toBe("/home/ubuntu")
    expect(sandboxB).toBe("/home/ubuntu")
  })

  test("should handle default user (backward compatibility)", async () => {
    // Test with undefined userId (backward compatibility)
    const { project } = await Project.fromDirectory(undefined, undefined)

    expect(project.id).toBe("user-default")
  })

  test("should maintain independent timestamps for different users", async () => {
    const { project: projectA } = await Project.fromDirectory(undefined, "user-a")

    // Wait a bit to ensure different timestamps
    await new Promise((resolve) => setTimeout(resolve, 10))

    const { project: projectB } = await Project.fromDirectory(undefined, "user-b")

    // Each user's project should have its own timestamps
    expect(projectA.time.created).toBeDefined()
    expect(projectB.time.created).toBeDefined()
    expect(projectA.time.updated).toBeDefined()
    expect(projectB.time.updated).toBeDefined()

    // User B's project should be created after user A's
    expect(projectB.time.created).toBeGreaterThanOrEqual(projectA.time.created)
  })
})

describe("Instance.provide - Multi-User Isolation", () => {
  beforeEach(async () => {
    // Clean up storage before each test
    await Storage.remove(["project", "user-instance-a"]).catch(() => {})
    await Storage.remove(["project", "user-instance-b"]).catch(() => {})
    await Storage.remove(["project", "global"]).catch(() => {})
  })

  test("should pass userId to Project.fromDirectory", async () => {
    const { Instance } = await import("../../src/project/instance")

    let capturedProjectId: string | undefined

    await Instance.provide({
      userId: "instance-a",
      fn: () => {
        capturedProjectId = Instance.project.id
        return capturedProjectId
      },
    })

    expect(capturedProjectId).toBe("user-instance-a")
  })

  test("should isolate instance context by userId", async () => {
    const { Instance } = await import("../../src/project/instance")

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
    expect(resultA).not.toBe(resultB)
  })
})
