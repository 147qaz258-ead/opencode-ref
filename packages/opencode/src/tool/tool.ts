import z from "zod"
import { SessionLogger } from "../util/session-logger"
import type { MessageV2 } from "../session/message-v2"
import type { Agent } from "../agent/agent"
import type { PermissionNext } from "../permission/next"

export namespace Tool {
  interface Metadata {
    [key: string]: any
  }

  export interface InitContext {
    agent?: Agent.Info
  }

  export type Context<M extends Metadata = Metadata> = {
    sessionID: string
    messageID: string
    agent: string
    abort: AbortSignal
    callID?: string
    extra?: { [key: string]: any }
    metadata(input: { title?: string; metadata?: M }): void
    ask(input: Omit<PermissionNext.Request, "id" | "sessionID" | "tool">): Promise<void>
  }
  export interface Info<Parameters extends z.ZodType = z.ZodType, M extends Metadata = Metadata> {
    id: string
    init: (ctx?: InitContext) => Promise<{
      description: string
      parameters: Parameters
      execute(
        args: z.infer<Parameters>,
        ctx: Context,
      ): Promise<{
        title: string
        metadata: M
        output: string
        attachments?: MessageV2.FilePart[]
      }>
      formatValidationError?(error: z.ZodError): string
    }>
  }

  export type InferParameters<T extends Info> = T extends Info<infer P> ? z.infer<P> : never
  export type InferMetadata<T extends Info> = T extends Info<any, infer M> ? M : never

  export function define<Parameters extends z.ZodType, Result extends Metadata>(
    id: string,
    init: Info<Parameters, Result>["init"] | Awaited<ReturnType<Info<Parameters, Result>["init"]>>,
  ): Info<Parameters, Result> {
    return {
      id,
      init: async (ctx) => {
        const toolInfo = init instanceof Function ? await init(ctx) : init
        const execute = toolInfo.execute
        toolInfo.execute = (args, ctx) => {
          try {
            toolInfo.parameters.parse(args)
          } catch (error) {
            if (error instanceof z.ZodError && toolInfo.formatValidationError) {
              throw new Error(toolInfo.formatValidationError(error), { cause: error })
            }
            throw new Error(
              `The ${id} tool was called with invalid arguments: ${error}.\nPlease rewrite the input so it satisfies the expected schema.`,
              { cause: error },
            )
          }


          const start = Date.now()
          const logger = SessionLogger.get(ctx.sessionID)
          
          logger.log({
            type: "tool.start",
            tool: id,
            input: args,
          })

          try {
            const result = execute(args, ctx)
            // Handle if result is a promise
            if (result instanceof Promise) {
              return result.then(res => {
                logger.log({
                  type: "tool.end",
                  tool: id,
                  output: res, // Warning: this might be large, but useful for debug
                  duration: Date.now() - start
                })
                return res
              }).catch(err => {
                logger.log({
                  type: "tool.end",
                  tool: id,
                  error: err instanceof Error ? err.stack || err.message : String(err),
                  duration: Date.now() - start
                })
                throw err
              })
            } else {
              // Synchronous result
              logger.log({
                type: "tool.end",
                tool: id,
                output: result,
                duration: Date.now() - start
              })
              return result
            }
          } catch (error) {
            logger.log({
              type: "tool.end",
              tool: id,
              error: error instanceof Error ? error.stack || error.message : String(error),
              duration: Date.now() - start
            })
            throw error
          }
        }
        return toolInfo
      },
    }
  }
}
