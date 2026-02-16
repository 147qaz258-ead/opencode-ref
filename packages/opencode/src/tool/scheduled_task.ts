import { Tool } from "./tool"
import DESCRIPTION from "./scheduled_task.txt"
import { z } from "zod"
import { SchedulerService, InMemorySchedulerStore } from "../scheduler/service"
import { Identifier } from "@/id"
import { Config } from "@/config/config"

export const ScheduledTaskTool = Tool.define("scheduled_task", async () => {
  const config = await Config.get()
  const projectId = config.projectId || "default"

  return {
    description: DESCRIPTION,
    parameters: z.object({
      title: z.string().describe("A short (3-5 words) description of the scheduled task"),
      description: z.string().describe("A detailed description of what the task should do"),
      prompt: z.string().describe("The task for the AI to perform when the schedule triggers"),
      schedule: z.string().describe("Cron expression defining when to run the task (e.g., \"0 0 * * *\" for daily at midnight)"),
    }),
    async execute(params, ctx) {
      await ctx.ask({
        permission: "scheduled_task",
        patterns: ["*"],
        always: ["*"],
        metadata: {
          title: params.title,
          description: params.description,
          schedule: params.schedule,
        },
      })

      const schedulerService = new SchedulerService(new InMemorySchedulerStore())

      const task = await schedulerService.createTask({
        projectId,
        schedule: params.schedule,
        prompt: params.prompt,
        metadata: {
          title: params.title,
          description: params.description,
        },
      })

      return {
        title: params.title,
        metadata: {
          taskId: task.id,
          projectId: task.projectId,
          schedule: task.schedule.cron,
          nextRun: task.schedule.nextRun,
        },
        output: `Scheduled task created successfully:\n- Task ID: ${task.id}\n- Title: ${params.title}\n- Schedule: ${params.schedule}\n- Next run: ${task.schedule.nextRun}\n\nThe task will automatically execute according to the specified schedule.`,
      }
    },
  }
})