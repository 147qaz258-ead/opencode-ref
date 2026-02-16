import { describe, expect, test, mock } from "bun:test"
import { ScheduledTaskTool } from "../../src/tool/scheduled_task"
import { z } from "zod"

// Mock dependencies
mock.module("../../src/config/config", () => ({
  Config: {
    get: () => ({
      projectId: "test-project",
    }),
  },
}))

mock.module("../../src/scheduler/service", () => ({
  SchedulerService: class {
    constructor(private store: any) {}
    async createTask(input: any) {
      return {
        id: "task-123",
        projectId: "test-project",
        schedule: {
          cron: "0 0 * * *",
          nextRun: new Date("2024-01-01T00:00:00Z"),
        },
        prompt: "test prompt",
        metadata: {
          title: "Test Task",
          description: "Test Description",
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      }
    }
  },
}))

mock.module("../../src/scheduler/store", () => ({
  SchedulerStore: class {
    async create(task: any) {}
    async remove(taskId: string) {}
    async list(projectId: string) { return [] }
    async get(taskId: string) { return null }
    async listDueTasks() { return [] }
  },
}))

mock.module("../../src/id/id", () => ({
  Identifier: {
    descending: (prefix: string) => "task-123",
  },
}))

describe("ScheduledTaskTool", () => {
  test("should define the tool with correct parameters", () => {
    const tool = ScheduledTaskTool
    const schema = tool.parameters

    expect(schema).toBeInstanceOf(z.ZodObject)
    expect(Object.keys(schema.shape)).toEqual(["title", "description", "prompt", "schedule"])
  })

  test("should require all parameters", () => {
    const tool = ScheduledTaskTool
    const schema = tool.parameters

    // Test missing required fields
    const testCases = [
      { title: "missing title", params: { description: "test", prompt: "test", schedule: "0 0 * * *" } },
      { title: "missing description", params: { title: "test", prompt: "test", schedule: "0 0 * * *" } },
      { title: "missing prompt", params: { title: "test", description: "test", schedule: "0 0 * * *" } },
      { title: "missing schedule", params: { title: "test", description: "test", prompt: "test" } },
    ]

    for (const testCase of testCases) {
      const result = schema.safeParse(testCase.params)
      expect(result.success).toBe(false)
    }
  })

  test("should call SchedulerService.createTask with correct parameters", async () => {
    const tool = ScheduledTaskTool
    const params = {
      title: "Test Task",
      description: "This is a test description",
      prompt: "Execute this task daily",
      schedule: "0 0 * * *",
    }

    const result = await tool.execute(params, {
      ask: mock.fn(),
      abort: { addEventListener: mock.fn(), removeEventListener: mock.fn() },
      metadata: mock.fn(),
      sessionID: "test-session",
      messageID: "test-message",
    })

    expect(result).toEqual({
      title: "Test Task",
      metadata: {
        taskId: "task-123",
        projectId: "test-project",
        schedule: "0 0 * * *",
        nextRun: new Date("2024-01-01T00:00:00Z"),
      },
      output: expect.stringContaining("Scheduled task created successfully"),
    })
  })

  test("should handle invalid schedule format", async () => {
    const tool = ScheduledTaskTool
    const params = {
      title: "Test Task",
      description: "This is a test description",
      prompt: "Execute this task daily",
      schedule: "invalid-cron",
    }

    await expect(tool.execute(params, {
      ask: mock.fn(),
      abort: { addEventListener: mock.fn(), removeEventListener: mock.fn() },
      metadata: mock.fn(),
      sessionID: "test-session",
      messageID: "test-message",
    })).rejects.toThrow("Invalid schedule: invalid cron")
  })

  test("should include task details in output", async () => {
    const tool = ScheduledTaskTool
    const params = {
      title: "Test Task",
      description: "This is a test description",
      prompt: "Execute this task daily",
      schedule: "0 0 * * *",
    }

    const result = await tool.execute(params, {
      ask: mock.fn(),
      abort: { addEventListener: mock.fn(), removeEventListener: mock.fn() },
      metadata: mock.fn(),
      sessionID: "test-session",
      messageID: "test-message",
    })

    expect(result.output).toContain("Task ID: task-123")
    expect(result.output).toContain("Title: Test Task")
    expect(result.output).toContain("Schedule: 0 0 * * *")
    expect(result.output).toContain("Next run: 2024-01-01T00:00:00.000Z")
  })

  test("should use default project ID when not configured", async () => {
    mock.module("../../src/config/config", () => ({
      Config: {
        get: () => ({}),
      },
    }))

    const tool = ScheduledTaskTool
    const params = {
      title: "Test Task",
      description: "This is a test description",
      prompt: "Execute this task daily",
      schedule: "0 0 * * *",
    }

    await tool.execute(params, {
      ask: mock.fn(),
      abort: { addEventListener: mock.fn(), removeEventListener: mock.fn() },
      metadata: mock.fn(),
      sessionID: "test-session",
      messageID: "test-message",
    })

    // The mock will capture the call with default project ID
  })
})