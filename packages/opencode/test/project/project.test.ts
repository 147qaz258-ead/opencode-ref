import { describe, expect, test, beforeEach } from "bun:test"
import { Project } from "../../src/project/project"
import { Log } from "../../src/util/log"
import { Storage } from "../../src/storage/storage"
import path from "path"

Log.init({ print: false })

describe("Project.fromDirectory - Sandbox Mode", () => {
  beforeEach(async () => {
    // Clean up storage before each test
    await Storage.remove(["project", "user-default"]).catch(() => {})
    await Storage.remove(["project", "global"]).catch(() => {})
  })

  test("should return default user project when no userId provided", async () => {
    const { project, sandbox } = await Project.fromDirectory()

    expect(project).toBeDefined()
    expect(project.id).toBe("user-default")
    expect(project.worktree).toBe("/home/ubuntu")
    expect(sandbox).toBe("/home/ubuntu")
    expect(project.sandboxes).toEqual([])
    expect(project.time.created).toBeDefined()
    expect(project.time.updated).toBeDefined()
  })

  test("should persist default user project", async () => {
    const { project } = await Project.fromDirectory()

    const stored = await Storage.read<Project.Info>(["project", "user-default"])
    expect(stored).toBeDefined()
    expect(stored?.id).toBe("user-default")
    expect(stored?.worktree).toBe("/home/ubuntu")
  })

  test("should return same project on subsequent calls", async () => {
    const { project: project1 } = await Project.fromDirectory()
    const { project: project2 } = await Project.fromDirectory()

    expect(project1.id).toBe(project2.id)
    expect(project1.id).toBe("user-default")
  })
})

describe("Project.discover - Sandbox Mode", () => {
  beforeEach(async () => {
    // Clean up storage before each test
    await Storage.remove(["project", "user-default"]).catch(() => {})
    await Storage.remove(["project", "global"]).catch(() => {})
  })

  test("should not discover when project is not git", async () => {
    const { project } = await Project.fromDirectory()

    // discover should return early for non-git projects
    await Project.discover(project)

    const updated = await Storage.read<Project.Info>(["project", project.id])
    expect(updated.icon).toBeUndefined()
  })
})

describe("Project.update", () => {
  beforeEach(async () => {
    // Clean up storage before each test
    await Storage.remove(["project", "user-default"]).catch(() => {})
    await Storage.remove(["project", "global"]).catch(() => {})
  })

  test("should update project name", async () => {
    const { project } = await Project.fromDirectory()

    const updated = await Project.update({
      projectID: project.id,
      name: "My Project",
    })

    expect(updated.name).toBe("My Project")

    const stored = await Storage.read<Project.Info>(["project", project.id])
    expect(stored?.name).toBe("My Project")
  })

  test("should update project icon URL", async () => {
    const { project } = await Project.fromDirectory()

    const iconUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
    const updated = await Project.update({
      projectID: project.id,
      icon: { url: iconUrl },
    })

    expect(updated.icon?.url).toBe(iconUrl)

    const stored = await Storage.read<Project.Info>(["project", project.id])
    expect(stored?.icon?.url).toBe(iconUrl)
  })

  test("should update project icon color", async () => {
    const { project } = await Project.fromDirectory()

    const updated = await Project.update({
      projectID: project.id,
      icon: { color: "#ff0000" },
    })

    expect(updated.icon?.color).toBe("#ff0000")

    const stored = await Storage.read<Project.Info>(["project", project.id])
    expect(stored?.icon?.color).toBe("#ff0000")
  })

  test("should update time.updated on any update", async () => {
    const { project } = await Project.fromDirectory()
    const originalTime = project.time.updated

    // Wait a bit to ensure timestamp difference
    await new Promise((resolve) => setTimeout(resolve, 10))

    await Project.update({
      projectID: project.id,
      name: "Updated",
    })

    const stored = await Storage.read<Project.Info>(["project", project.id])
    expect(stored?.time.updated).toBeGreaterThan(originalTime)
  })
})

describe("Project.sandboxes", () => {
  beforeEach(async () => {
    // Clean up storage before each test
    await Storage.remove(["project", "user-default"]).catch(() => {})
    await Storage.remove(["project", "global"]).catch(() => {})
  })

  test("should return empty array when no sandboxes", async () => {
    const { project } = await Project.fromDirectory()

    const result = await Project.sandboxes(project.id)
    expect(result).toEqual([])
  })

  test("should return valid sandboxes", async () => {
    const { project } = await Project.fromDirectory()

    // Add a sandbox directory
    await Storage.update<Project.Info>(["project", project.id], (draft) => {
      draft.sandboxes.push("/home/ubuntu/sandbox1")
      draft.sandboxes.push("/home/ubuntu/sandbox2")
    })

    const result = await Project.sandboxes(project.id)
    // Note: These directories don't actually exist, so result will be empty
    // This tests the validation logic
    expect(result).toEqual([])
  })
})

describe("Project.setInitialized", () => {
  beforeEach(async () => {
    // Clean up storage before each test
    await Storage.remove(["project", "user-default"]).catch(() => {})
    await Storage.remove(["project", "global"]).catch(() => {})
  })

  test("should set initialized timestamp", async () => {
    const { project } = await Project.fromDirectory()

    expect(project.time.initialized).toBeUndefined()

    await Project.setInitialized(project.id)

    const updated = await Storage.read<Project.Info>(["project", project.id])
    expect(updated?.time.initialized).toBeDefined()
    expect(updated?.time.initialized).toBeGreaterThan(0)
  })
})

describe("Project.list", () => {
  beforeEach(async () => {
    // Clean up all user projects before each test
    const allProjects = await Project.list()
    await Promise.all(
      allProjects.map((p) => Storage.remove(["project", p.id]).catch(() => {}))
    )
  })

  test("should return empty array when no projects", async () => {
    const projects = await Project.list()
    expect(projects).toEqual([])
  })

  test("should return all projects", async () => {
    // Create multiple user projects
    await Project.fromDirectory(undefined, "list-test1")
    await Project.fromDirectory(undefined, "list-test2")

    const projects = await Project.list()
    const userProjects = projects.filter((p) => p.id.startsWith("user-"))
    expect(userProjects.length).toBeGreaterThanOrEqual(2)

    const projectIds = userProjects.map((p) => p.id)
    expect(projectIds).toContain("user-list-test1")
    expect(projectIds).toContain("user-list-test2")
  })
})
