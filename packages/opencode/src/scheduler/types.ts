import { Identifier } from '../id/id';

export interface CreateTaskInput {
  projectId: string;
  schedule: string;
  prompt: string;
  metadata?: Record<string, any>;
}

export interface ScheduleConfig {
  cron: string;
  nextRun: Date;
}

export interface Task {
  id: string;
  projectId: string;
  schedule: ScheduleConfig;
  prompt: string;
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface TaskExecutionResult {
  taskId: string;
  executedAt: Date;
  status: 'success' | 'failed';
  error?: string;
  output?: string;
}