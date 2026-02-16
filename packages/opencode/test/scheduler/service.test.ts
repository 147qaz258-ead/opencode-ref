import { describe, expect, test, mock } from "bun:test"
import { SchedulerService } from "../../src/scheduler/service"
import { InMemorySchedulerStore } from "../../src/scheduler/store"
import { CreateTaskInput, Task } from "../../src/scheduler/types"
import { Instance } from "../../src/project/instance"
import path from "path"

const projectRoot = path.resolve(__dirname, "../../..")

describe("SchedulerService", () => {
  test("should create a task with parsed schedule", async () => {
    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        const store = new InMemorySchedulerStore()
        const service = new SchedulerService(store)

        const input: CreateTaskInput = {
          projectId: "proj1",
          schedule: "0 0 * * *",
          prompt: "test prompt",
          metadata: { key: "value" },
        }

        const task = await service.createTask(input)

        expect(task.projectId).toBe("proj1")
        expect(task.prompt).toBe("test prompt")
        expect(task.schedule.cron).toBe("0 0 * * *")
        expect(task.schedule.nextRun).toBeInstanceOf(Date)
        expect(task.metadata?.key).toBe("value")

        // Verify task was saved to store
        const retrieved = await store.get(task.id)
        expect(retrieved?.id).toBe(task.id)
      },
    })
  })

  test("should delete a task", async () => {
    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        const store = new InMemorySchedulerStore()
        const service = new SchedulerService(store)

        // First create a task
        const input: CreateTaskInput = {
          projectId: "proj1",
          schedule: "0 0 * * *",
          prompt: "test prompt",
        }
        const task = await service.createTask(input)

        // Then delete it
        await service.deleteTask(task.id)

        // Verify it's gone
        const retrieved = await store.get(task.id)
        expect(retrieved).toBeNull()
      },
    })
  })

  test("should list tasks for a project", async () => {
    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        const store = new InMemorySchedulerStore()
        const service = new SchedulerService(store)

        // Create tasks for different projects
        await service.createTask({
          projectId: "proj1",
          schedule: "0 0 * * *",
          prompt: "task 1",
        })
        await service.createTask({
          projectId: "proj2",
          schedule: "0 0 * * *",
          prompt: "task 2",
        })
        await service.createTask({
          projectId: "proj1",
          schedule: "0 1 * * *",
          prompt: "task 3",
        })

        const proj1Tasks = await service.listTasks("proj1")
        const proj2Tasks = await service.listTasks("proj2")

        expect(proj1Tasks.length).toBe(2)
        expect(proj2Tasks.length).toBe(1)
      },
    })
  })

  test("should throw error for invalid cron expression", async () => {
    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        const store = new InMemorySchedulerStore()
        const service = new SchedulerService(store)

        await expect(service.createTask({
          projectId: "proj1",
          schedule: "invalid-cron",
          prompt: "test",
        })).rejects.toThrow("Invalid schedule")
      },
    })
  })
})
