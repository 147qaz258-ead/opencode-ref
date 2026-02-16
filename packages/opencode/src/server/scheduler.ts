import { Hono } from "hono"
import { describeRoute, validator } from "hono-openapi"
import { resolver } from "hono-openapi"
import z from "zod"
import { errors } from "./error"
import { SchedulerService, InMemorySchedulerStore } from "../scheduler/service"

// Lazy initialization to avoid circular dependency
let _store: InMemorySchedulerStore | undefined
let _service: SchedulerService | undefined

function getStore(): InMemorySchedulerStore {
  if (!_store) {
    _store = new InMemorySchedulerStore()
  }
  return _store
}

function getService(): SchedulerService {
  if (!_service) {
    _service = new SchedulerService(getStore())
  }
  return _service
}

// Get the current project ID
function getCurrentProjectId(): string {
  try {
    return "global"
  } catch {
    return "default"
  }
}

// API Schema definitions matching CreateTaskInput
const CreateTaskSchema = z.object({
  projectId: z.string().optional().describe("Project ID (defaults to current project)"),
  schedule: z.string().min(1, "Cron expression is required").describe("Cron expression (e.g., '0 8 * * *')"),
  prompt: z.string().min(1, "Task prompt is required").describe("Prompt to execute when task runs"),
  metadata: z.record(z.string(), z.any()).optional().describe("Additional metadata"),
})

const TaskResponseSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  schedule: z.object({
    cron: z.string(),
    nextRun: z.string().datetime(),
  }),
  prompt: z.string(),
  metadata: z.record(z.string(), z.any()),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

export const SchedulerRoute = new Hono()
  .get(
    "/",
    describeRoute({
      summary: "List all scheduled tasks",
      description: "Get a list of all scheduled tasks for the current project.",
      operationId: "scheduler.list",
      responses: {
        200: {
          description: "List of scheduled tasks",
          content: {
            "application/json": {
              schema: resolver(TaskResponseSchema.array()),
            },
          },
        },
      },
    }),
    async (c) => {
      const projectId = await getCurrentProjectId()
      const tasks = await getService().listTasks(projectId)

      // Convert Date objects to ISO strings for JSON serialization
      const serializedTasks = tasks.map(task => ({
        ...task,
        schedule: {
          ...task.schedule,
          nextRun: task.schedule.nextRun.toISOString(),
        },
        createdAt: task.createdAt.toISOString(),
        updatedAt: task.updatedAt.toISOString(),
      }))

      return c.json(serializedTasks)
    },
  )
  .post(
    "/",
    describeRoute({
      summary: "Create a new scheduled task",
      description: "Create a new scheduled task that will execute at the specified times.",
      operationId: "scheduler.create",
      responses: {
        201: {
          description: "Task created successfully",
          content: {
            "application/json": {
              schema: resolver(TaskResponseSchema),
            },
          },
        },
        ...errors(400),
      },
    }),
    validator("json", CreateTaskSchema),
    async (c) => {
      const input = c.req.valid("json")

      // Use current project if not specified
      const projectId = input.projectId || await getCurrentProjectId()

      const task = await getService().createTask({
        projectId,
        schedule: input.schedule,
        prompt: input.prompt,
        metadata: input.metadata,
      })

      // Convert Date objects to ISO strings
      const serializedTask = {
        ...task,
        schedule: {
          ...task.schedule,
          nextRun: task.schedule.nextRun.toISOString(),
        },
        createdAt: task.createdAt.toISOString(),
        updatedAt: task.updatedAt.toISOString(),
      }

      return c.json(serializedTask, 201)
    },
  )
  .delete(
    "/:id",
    describeRoute({
      summary: "Delete a scheduled task",
      description: "Delete a scheduled task by ID.",
      operationId: "scheduler.delete",
      responses: {
        204: {
          description: "Task deleted successfully",
        },
        ...errors(404),
      },
    }),
    validator("param", z.object({ id: z.string() })),
    async (c) => {
      const { id } = c.req.valid("param")

      // Check if task exists
      const projectId = await getCurrentProjectId()
      const tasks = await getService().listTasks(projectId)
      const task = tasks.find(t => t.id === id)

      if (!task) {
        return c.json({ error: "Task not found" }, 404)
      }

      await getService().deleteTask(id)
      return c.body(null, 204)
    },
  )
  .get(
    "/:id/result",
    describeRoute({
      summary: "Get task execution result",
      description: "Get the most recent execution result for a scheduled task.",
      operationId: "scheduler.getResult",
      responses: {
        200: {
          description: "Task execution result",
          content: {
            "application/json": {
              schema: z.object({
                taskId: z.string(),
                executedAt: z.string().datetime(),
                status: z.enum(["success", "failed"]),
                output: z.string().optional(),
                error: z.string().optional(),
              }),
            },
          },
        },
        ...errors(404),
      },
    }),
    validator("param", z.object({ id: z.string() })),
    async (c) => {
      const { id } = c.req.valid("param")

      const projectId = await getCurrentProjectId()
      const tasks = await getService().listTasks(projectId)
      const task = tasks.find(t => t.id === id)

      if (!task) {
        return c.json({ error: "Task not found" }, 404)
      }

      // Get the execution result from the store
      const result = await getStore().getExecutionResult(id)

      if (!result) {
        return c.json({
          taskId: id,
          executedAt: new Date().toISOString(),
          status: "pending",
          message: "Task has not been executed yet",
        })
      }

      // Convert Date to ISO string for JSON serialization
      return c.json({
        taskId: result.taskId,
        executedAt: result.executedAt.toISOString(),
        status: result.status,
        output: result.output,
        error: result.error,
      })
    },
  )
