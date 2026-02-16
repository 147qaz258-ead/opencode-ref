import { describe, expect, test } from "bun:test"
import { isValidCron, getNextRunTime } from "../../src/scheduler/cron"

describe("Scheduler: Cron Parser", () => {
  describe("isValidCron", () => {
    test("should validate correct cron expressions", () => {
      expect(isValidCron("0 9 * * *")).toBe(true)
      expect(isValidCron("*/5 * * * *")).toBe(true)
      expect(isValidCron("0 0,12 * * *")).toBe(true)
      expect(isValidCron("0 9 * * 1-5")).toBe(true)
      expect(isValidCron("0 0 * * 1,2,3")).toBe(true)
    })

    test("should reject invalid cron expressions", () => {
      expect(isValidCron("invalid")).toBe(false)
      expect(isValidCron("60 * * * *")).toBe(false) // Minute > 59
      expect(isValidCron("* 25 * * *")).toBe(false) // Hour > 23
      expect(isValidCron("* * 32 * *")).toBe(false) // Day > 31
    })
  })

  describe("getNextRunTime", () => {
    test("should calculate next run for cron '0 9 * * *' (daily at 9am)", () => {
      // Assume it's 8:00 AM
      const now = new Date("2024-01-01T08:00:00Z")
      const nextRun = getNextRunTime("0 9 * * *", now)

      expect(nextRun.getTime()).toBe(new Date("2024-01-01T09:00:00Z").getTime())
    })

    test("should handle cron when time has passed today", () => {
      // Assume it's 10:00 AM
      const now = new Date("2024-01-01T10:00:00Z")
      const nextRun = getNextRunTime("0 9 * * *", now)

      // Should be tomorrow at 9:00 AM
      expect(nextRun.getTime()).toBe(new Date("2024-01-02T09:00:00Z").getTime())
    })

    test("should handle weekday cron '0 9 * * 1-5' from Sunday", () => {
      // Sunday 10:00 AM
      const now = new Date("2024-01-07T10:00:00Z") // Jan 7, 2024 is Sunday
      const nextRun = getNextRunTime("0 9 * * 1-5", now)

      // Next Monday at 9:00 AM
      expect(nextRun.getTime()).toBe(new Date("2024-01-08T09:00:00Z").getTime())
    })

    test("should handle interval '*/30 * * * *' (every 30 minutes)", () => {
      const now = new Date("2024-01-01T10:15:00Z")
      const nextRun = getNextRunTime("*/30 * * * *", now)

      // Should be 10:30 AM
      expect(nextRun.getTime()).toBe(new Date("2024-01-01T10:30:00Z").getTime())
    })

    test("should handle midnight '0 0 * * *'", () => {
      const now = new Date("2024-01-01T10:00:00Z")
      const nextRun = getNextRunTime("0 0 * * *", now)

      // Should be tomorrow at midnight
      expect(nextRun.getTime()).toBe(new Date("2024-01-02T00:00:00Z").getTime())
    })
  })
})
