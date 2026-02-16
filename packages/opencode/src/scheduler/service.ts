import type { SchedulerStore } from './store';
import { InMemorySchedulerStore } from './store';
import type { CreateTaskInput, ScheduleConfig, Task, TaskExecutionResult } from './types';
import { Identifier } from '../id/id';
import { Session } from '../session';
import { SessionPrompt } from '../session/prompt';
import { Agent } from '../agent/agent';
import { Provider } from '../provider/provider';
import { CronExpressionParser } from 'cron-parser';

export class SchedulerService {
  constructor(private store: SchedulerStore) {}

  async createTask(input: CreateTaskInput): Promise<Task> {
    // Generate unique ID
    const id = Identifier.descending('schedule');

    // Parse schedule
    const scheduleConfig = this.parseSchedule(input.schedule);

    // Create task
    const task: Task = {
      id,
      projectId: input.projectId,
      schedule: scheduleConfig,
      prompt: input.prompt,
      metadata: input.metadata || {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Save to store
    await this.store.create(task);

    return task;
  }

  async deleteTask(taskId: string): Promise<void> {
    await this.store.remove(taskId);
  }

  async listTasks(projectId: string): Promise<Task[]> {
    return this.store.list(projectId);
  }

  async executeTask(task: Task): Promise<TaskExecutionResult> {
    const startTime = new Date();

    try {
      // Get current user ID for multi-user support
      const { getCurrentUserId } = await import("../server/middleware/user-context")
      const userId = getCurrentUserId()

      // Create a new session for this scheduled task execution
      const session = await Session.create({
        title: task.metadata?.title
          ? `Scheduled: ${task.metadata.title}`
          : `Scheduled Task: ${task.id}`,
        userId,  // ✅ 传递 userId 实现用户隔离
      });

      // Get the default agent and model
      const agent = await Agent.defaultAgent();
      const agentInfo = await Agent.get(agent);
      const model = agentInfo?.model || await Provider.defaultModel();

      // Send the prompt to the session
      const result = await SessionPrompt.prompt({
        sessionID: session.id,
        model,
        agent,
        parts: [
          {
            type: 'text',
            text: task.prompt,
          },
        ],
      });

      // Task completed successfully
      const endTime = new Date();

      // Update the task's next run time
      await this.updateNextRun(task);

      const executionResult: TaskExecutionResult = {
        taskId: task.id,
        executedAt: startTime,
        status: 'success',
        output: this.extractOutput(result),
      };

      // Save the execution result
      await this.store.saveExecutionResult(executionResult);

      return executionResult;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Still update next run even on failure
      await this.updateNextRun(task);

      const executionResult: TaskExecutionResult = {
        taskId: task.id,
        executedAt: startTime,
        status: 'failed',
        error: errorMessage,
      };

      // Save the execution result even on failure
      await this.store.saveExecutionResult(executionResult);

      return executionResult;
    }
  }

  private parseSchedule(schedule: string): ScheduleConfig {
    try {
      const interval = CronExpressionParser.parse(schedule);
      const nextRun = interval.next().toDate();

      return {
        cron: schedule,
        nextRun,
      };
    } catch (error) {
      throw new Error(`Invalid schedule: ${schedule}`);
    }
  }

  private async updateNextRun(task: Task): Promise<void> {
    try {
      const interval = CronExpressionParser.parse(task.schedule.cron);
      const nextRun = interval.next().toDate();

      // Update the task's next run time
      await this.store.remove(task.id);
      await this.store.create({
        ...task,
        schedule: {
          cron: task.schedule.cron,
          nextRun,
        },
        updatedAt: new Date(),
      });
    } catch (error) {
      console.error(`Failed to update next run for task ${task.id}:`, error);
    }
  }

  private extractOutput(result: { parts: Array<{ type: string; text?: string }> }): string {
    const textParts = result.parts
      .filter(part => part.type === 'text' && part.text)
      .map(part => part.text!);

    return textParts.join('\n\n').slice(0, 10000); // Limit output to 10k chars
  }
}

// Re-export InMemorySchedulerStore for convenience
export { InMemorySchedulerStore };
export type { SchedulerStore };
