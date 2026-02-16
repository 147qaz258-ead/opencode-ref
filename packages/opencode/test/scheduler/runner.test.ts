import { describe, expect, test, spyOn } from "bun:test"
import { SchedulerRunner } from "../../src/scheduler/runner"
import { SchedulerService } from "../../src/scheduler/service"
import { InMemorySchedulerStore } from "../../src/scheduler/store"
import { Instance } from "../../src/project/instance"
import { Identifier } from "../../src/id/id"
import path from "path"

const projectRoot = path.resolve(__dirname, "../../..")

describe("SchedulerRunner", () => {
  test("should start the interval", async () => {
    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        const store = new InMemorySchedulerStore()
        const service = new SchedulerService(store)
        const runner = new SchedulerRunner(service, store)

        const setIntervalSpy = spyOn(global, "setInterval")

        runner.start()

        expect(setIntervalSpy).toHaveBeenCalledWith(
          expect.any(Function),
          60000
        )

        // Clean up
        runner.stop()
        setIntervalSpy.mockRestore()
      },
    })
  })

  test("should stop the interval", async () => {
    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        const store = new InMemorySchedulerStore()
        const service = new SchedulerService(store)
        const runner = new SchedulerRunner(service, store)

        const setIntervalSpy = spyOn(global, "setInterval")
        const clearIntervalSpy = spyOn(global, "clearInterval")

        runner.start()
        runner.stop()

        expect(clearIntervalSpy).toHaveBeenCalled()

        setIntervalSpy.mockRestore()
        clearIntervalSpy.mockRestore()
      },
    })
  })

  test("should check and run due tasks", async () => {
    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        const store = new InMemorySchedulerStore()

        // Create a due task
        await store.create({
          id: Identifier.descending("schedule"),
          projectId: "test-project",
          schedule: {
            cron: "0 8 * * *",
            nextRun: new Date(Date.now() - 1000), // Past = due
          },
          prompt: "test prompt",
          metadata: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        })

        // Create a mock service that tracks calls
        let executeCalled = false
        class MockService extends SchedulerService {
          async executeTask(task: Task): Promise<void> {
            executeCalled = true
            // Don't actually execute, just track the call
          }
        }

        const mockService = new MockService(store)
        const runner = new SchedulerRunner(mockService, store)
        await runner.checkAndRun()

        expect(executeCalled).toBe(true)
      },
    })
  })

  test("should handle empty due tasks", async () => {
    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        const store = new InMemorySchedulerStore()
        const service = new SchedulerService(store)
        const runner = new SchedulerRunner(service, store)

        // No tasks created, so no due tasks
        await runner.checkAndRun()

        // Should not throw
        expect(true).toBe(true)
      },
    })
  })
})
