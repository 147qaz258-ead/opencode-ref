import type { SchedulerStore } from './store';
import { SchedulerService } from './service';
import type { Task } from './types';

export class SchedulerRunner {
  private intervalId: NodeJS.Timeout | null = null;

  constructor(
    private service: SchedulerService,
    private store: SchedulerStore
  ) {}

  start(): void {
    this.intervalId = setInterval(() => {
      this.checkAndRun();
    }, 60000); // Check every 60 seconds
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  async checkAndRun(): Promise<void> {
    try {
      // Get all due tasks
      const dueTasks = await this.store.listDueTasks();

      // Execute each due task
      for (const task of dueTasks) {
        await this.executeTask(task);
      }
    } catch (error) {
      console.error('Error checking and running scheduled tasks:', error);
    }
  }

  async executeTask(task: Task): Promise<void> {
    try {
      await this.service.executeTask(task);
    } catch (error) {
      console.error(`Error executing task ${task.id}:`, error);
      // In a real implementation, you might want to update task status or retry logic
    }
  }
}