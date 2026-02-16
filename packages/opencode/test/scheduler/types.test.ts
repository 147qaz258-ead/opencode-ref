import { describe, expect, test } from "bun:test"
import { CreateTaskInput, Task, TaskExecutionResult } from "../../src/scheduler/types"
import { Identifier } from "../../src/id/id"

describe("Scheduler: Types", () => {
  describe("CreateTaskInput", () => {
    test("should accept valid task input", () => {
      const input: CreateTaskInput = {
        projectId: "project-123",
        schedule: "0 8 * * *",
        prompt: "Get daily news",
        metadata: { title: "Daily News" },
      }

      // Just verify the type is properly structured
      expect(input.projectId).toBe("project-123")
      expect(input.schedule).toBe("0 8 * * *")
      expect(input.prompt).toBe("Get daily news")
      expect(input.metadata?.title).toBe("Daily News")
    })

    test("should allow optional metadata", () => {
      const input: CreateTaskInput = {
        projectId: "project-123",
        schedule: "0 8 * * *",
        prompt: "Test",
      }

      expect(input.metadata).toBeUndefined()
    })
  })

  describe("Task", () => {
    test("should represent a complete task", () => {
      const task: Task = {
        id: Identifier.descending("schedule"),
        projectId: "project-123",
        schedule: {
          cron: "0 8 * * *",
          nextRun: new Date("2024-01-01T08:00:00Z"),
        },
        prompt: "Get daily news",
        metadata: { title: "Daily News" },
        createdAt: new Date("2024-01-01T00:00:00Z"),
        updatedAt: new Date("2024-01-01T00:00:00Z"),
      }

      expect(task.id).toBeTruthy()
      expect(task.projectId).toBe("project-123")
      expect(task.schedule.cron).toBe("0 8 * * *")
      expect(task.prompt).toBe("Get daily news")
      expect(task.metadata?.title).toBe("Daily News")
    })
  })

  describe("TaskExecutionResult", () => {
    test("should represent successful execution", () => {
      const result: TaskExecutionResult = {
        taskId: "schedule-123",
        executedAt: new Date("2024-01-01T08:00:00Z"),
        status: "success",
        output: "Task completed successfully",
      }

      expect(result.taskId).toBe("schedule-123")
      expect(result.status).toBe("success")
      expect(result.output).toBe("Task completed successfully")
      expect(result.error).toBeUndefined()
    })

    test("should represent failed execution", () => {
      const result: TaskExecutionResult = {
        taskId: "schedule-123",
        executedAt: new Date("2024-01-01T08:00:00Z"),
        status: "failed",
        error: "Something went wrong",
      }

      expect(result.taskId).toBe("schedule-123")
      expect(result.status).toBe("failed")
      expect(result.error).toBe("Something went wrong")
      expect(result.output).toBeUndefined()
    })
  })
})
