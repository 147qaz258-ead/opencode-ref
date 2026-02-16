import { z } from "zod"
import { Log } from "./log"

const log = Log.create({ service: "fn-util" })

/**
 * Create a validated function wrapper with enhanced error logging
 *
 * @param schema - Zod schema for validation
 * @param cb - Callback function that receives validated input
 * @returns A function that validates input before calling callback
 */
export function fn<T extends z.ZodType, Result>(schema: T, cb: (input: z.infer<T>) => Result) {
  const result = (input: z.infer<T>) => {
    try {
      const parsed = schema.parse(input)
      return cb(parsed)
    } catch (error) {
      if (error instanceof z.ZodError) {
        // Enhanced error logging for Zod validation failures
        log.error("Zod validation failed:", {
          schema: schema.constructor.name,
          issues: error.issues,
          input: JSON.stringify(input, null, 2),
        })

        // Log specific field issues
        for (const issue of error.issues) {
          log.error(`Field ${issue.path.join(".")}:`, {
            code: issue.code,
            message: issue.message,
            expected: issue.expected,
            received: issue.received,
          })
        }
      }
      throw error
    }
  }
  result.force = (input: z.infer<T>) => cb(input)
  result.schema = schema
  return result
}
