import type { Task, TaskExecutionResult } from './types';

export interface SchedulerStore {
  create(task: Task): Promise<void>;
  remove(taskId: string): Promise<void>;
  list(projectId: string): Promise<Task[]>;
  get(taskId: string): Promise<Task | null>;
  listDueTasks(): Promise<Task[]>;
  saveExecutionResult(result: TaskExecutionResult): Promise<void>;
  getExecutionResult(taskId: string): Promise<TaskExecutionResult | null>;
}

// In-memory implementation for testing
export class InMemorySchedulerStore implements SchedulerStore {
  private tasks: Map<string, Task> = new Map();
  private executionResults: Map<string, TaskExecutionResult> = new Map();

  async create(task: Task): Promise<void> {
    this.tasks.set(task.id, task);
  }

  async remove(taskId: string): Promise<void> {
    this.tasks.delete(taskId);
  }

  async list(projectId: string): Promise<Task[]> {
    return Array.from(this.tasks.values()).filter(task => task.projectId === projectId);
  }

  async get(taskId: string): Promise<Task | null> {
    return this.tasks.get(taskId) || null;
  }

  async listDueTasks(): Promise<Task[]> {
    const now = new Date();
    return Array.from(this.tasks.values()).filter(task => task.schedule.nextRun <= now);
  }

  async saveExecutionResult(result: TaskExecutionResult): Promise<void> {
    this.executionResults.set(result.taskId, result);
  }

  async getExecutionResult(taskId: string): Promise<TaskExecutionResult | null> {
    return this.executionResults.get(taskId) || null;
  }
}