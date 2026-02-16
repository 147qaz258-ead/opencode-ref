import { describe, expect, test } from "bun:test"
import { InMemorySchedulerStore } from "../../src/scheduler/store"
import { Identifier } from "../../src/id/id"
import { Instance } from "../../src/project/instance"
import path from "path"

const projectRoot = path.resolve(__dirname, "../../..")

describe("Scheduler: Store", () => {
  test("should create scheduled task", async () => {
    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        const store = new InMemorySchedulerStore()
        const input = {
          id: Identifier.descending("schedule"),
          projectId: "test-project",
          schedule: {
            cron: "0 8 * * *",
            nextRun: new Date(Date.now() + 3600000),
          },
          prompt: "Get daily news",
          metadata: { title: "Daily News" },
          createdAt: new Date(),
          updatedAt: new Date(),
        }

        await store.create(input)

        const retrieved = await store.get(input.id)
        expect(retrieved).toBeDefined()
        expect(retrieved?.id).toBe(input.id)
        expect(retrieved?.projectId).toBe("test-project")
        expect(retrieved?.prompt).toBe("Get daily news")
      },
    })
  })

  test("should read scheduled task by id", async () => {
    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        const store = new InMemorySchedulerStore()
        const input = {
          id: Identifier.descending("schedule"),
          projectId: "test-project",
          schedule: {
            cron: "0 9 * * *",
            nextRun: new Date(Date.now() + 3600000),
          },
          prompt: "Test",
          metadata: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        }

        await store.create(input)
        const found = await store.get(input.id)

        expect(found).toBeDefined()
        expect(found?.id).toBe(input.id)
        expect(found?.prompt).toBe("Test")
      },
    })
  })

  test("should return null for non-existent task", async () => {
    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        const store = new InMemorySchedulerStore()
        const found = await store.get("non-existent-id")
        expect(found).toBeNull()
      },
    })
  })

  test("should list tasks by projectId", async () => {
    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        const store = new InMemorySchedulerStore()
        const baseTask = {
          schedule: {
            cron: "0 8 * * *",
            nextRun: new Date(Date.now() + 3600000),
          },
          prompt: "Test",
          metadata: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        }

        await store.create({ ...baseTask, id: Identifier.descending("schedule"), projectId: "projA" })
        await store.create({ ...baseTask, id: Identifier.descending("schedule"), projectId: "projB" })
        await store.create({ ...baseTask, id: Identifier.descending("schedule"), projectId: "projA" })

        const projATasks = await store.list("projA")
        const projBTasks = await store.list("projB")

        expect(projATasks.length).toBe(2)
        expect(projBTasks.length).toBe(1)
      },
    })
  })

  test("should delete task", async () => {
    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        const store = new InMemorySchedulerStore()
        const input = {
          id: Identifier.descending("schedule"),
          projectId: "test-project",
          schedule: {
            cron: "0 8 * * *",
            nextRun: new Date(Date.now() + 3600000),
          },
          prompt: "Test",
          metadata: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        }

        await store.create(input)
        await store.remove(input.id)

        const found = await store.get(input.id)
        expect(found).toBeNull()
      },
    })
  })

  test("should get due tasks (nextRun <= now)", async () => {
    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        const store = new InMemorySchedulerStore()
        const now = new Date()
        const baseTask = {
          projectId: "test-project",
          schedule: {
            cron: "0 8 * * *",
            nextRun: now,
          },
          prompt: "Test",
          metadata: {},
          createdAt: now,
          updatedAt: now,
        }

        // Create due task (past nextRun)
        await store.create({
          ...baseTask,
          id: Identifier.descending("schedule"),
          schedule: { cron: "0 8 * * *", nextRun: new Date(now.getTime() - 1000) },
          metadata: { title: "Due Task" },
        })

        // Create future task
        await store.create({
          ...baseTask,
          id: Identifier.descending("schedule"),
          schedule: { cron: "0 8 * * *", nextRun: new Date(now.getTime() + 100000) },
          metadata: { title: "Future Task" },
        })

        const dueTasks = await store.listDueTasks()

        // Filter by our project to avoid counting tasks from other tests
        const ourDueTasks = dueTasks.filter(t => t.projectId === "test-project")

        expect(ourDueTasks.length).toBe(1)
        expect(ourDueTasks[0].metadata?.title).toBe("Due Task")
      },
    })
  })
})
