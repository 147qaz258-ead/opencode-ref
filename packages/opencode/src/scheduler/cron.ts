import { Log } from "@/util/log"
import { CronExpressionParser } from 'cron-parser'

const log = Log.create({ service: "scheduler.cron" })

export interface CronScheduleConfig {
  type: 'daily' | 'interval' | 'cron'
  value?: string
  minutes?: number
}

export interface ParsedSchedule {
  cron: string
  nextRun: Date
}

// Parse schedule string into CronScheduleConfig
// Supports: cron expressions (standard 5-field format)
export function parseSchedule(input: string): CronScheduleConfig {
  // Try cron expression
  if (isValidCron(input)) {
    return {
      type: "cron",
      value: input,
    }
  }

  throw new Error(`Invalid schedule format: ${input}`)
}

// Validate cron expression (basic validation)
// Supports standard 5-field cron format: minute hour day month weekday
export function isValidCron(expression: string): boolean {
  try {
    CronExpressionParser.parse(expression)
    return true
  } catch {
    return false
  }
}

// Calculate next run time for a cron expression
export function getNextRunTime(cron: string, from: Date = new Date()): Date {
  try {
    const interval = CronExpressionParser.parse(cron, { currentDate: from })
    return interval.next().toDate()
  } catch (error) {
    log.warn(`Could not calculate next run time for cron: ${cron}`)
    // Fallback: return 1 hour ahead
    return new Date(from.getTime() + 60 * 60 * 1000)
  }
}
