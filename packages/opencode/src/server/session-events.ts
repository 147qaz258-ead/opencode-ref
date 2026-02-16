/**
 * Session Event Stream
 *
 * SSE endpoint for session events including thinking protocol and artifacts.
 */

import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import { z } from "zod"
import { streamSSE } from "hono/streaming"
import { Log } from "@/util/log"
import { Bus } from "@/bus"
import { GlobalBus } from "@/bus/global"
import { BusEvent } from "@/bus/bus-event"
import { Session } from "@/session"
import { SessionStatus } from "@/session/status"
import { SSEvents, SSEmitter } from "./events"
import { Storage } from "../storage/storage"
import { errors } from "./error"

// Define thinking event types for type-safe bus publishing
const ThinkingStepStartEvent = BusEvent.define("thinking.step-start", SSEvents.StepStart)
const ThinkingStepFinishEvent = BusEvent.define("thinking.step-finish", SSEvents.StepFinish)
const ThinkingArtifactEvent = BusEvent.define("thinking.artifact", SSEvents.Artifact)
const ThinkingProgressEvent = BusEvent.define("thinking.progress", SSEvents.Progress)

export namespace SessionEventsRoute {
  const log = Log.create({ service: "server.session-events" })

  const app = new Hono()

  /**
   * GET /session/:id/events
   * SSE stream for session events
   */
  app.get(
    "/:sessionId/events",
    describeRoute({
      summary: "Session event stream",
      description: "Server-Sent Events stream for real-time session updates including thinking steps and artifacts",
      operationId: "session.events",
      responses: {
        200: {
          description: "SSE stream",
          content: {
            "text/event-stream": {},
          },
        },
        ...errors(404, 500),
      },
    }),
    validator("param", z.object({ sessionId: z.string() })),
    validator("query", z.object({ token: z.string().optional() })),
    async (c) => {
      const { sessionId } = c.req.valid("param")
      const { token } = c.req.valid("query")

      // Extract user context from header or query token
      const { extractUserFromToken } = await import("./middleware/auth")
      const { getCurrentUserId } = await import("./middleware/user-context")
      const authHeader = c.req.header("Authorization")
      const userCtx = await extractUserFromToken(authHeader, token)
      const userId = userCtx?.userId ?? "default"

      // Verify session exists and user has access
      const session = await Session.get(sessionId)
      if (!session) {
        throw new Storage.NotFoundError({
          message: "Session not found",
        })
      }

      // Check ownership if session is user-bound
      if (session.userId && session.userId !== userId) {
        throw new Storage.NotFoundError({
          message: "Session not found",
        })
      }

      log.info("Session event stream connected", { sessionId, userId })

      return streamSSE(c, async (stream) => {
        // Send initial connection event
        stream.writeSSE({
          data: JSON.stringify({
            type: "session.connected",
            sessionId,
            timestamp: Date.now(),
          }),
        })

        // Subscribe to message updates
        const unsub = Bus.subscribe(Session.Event.Updated, async (event) => {
          // Only send events for this session
          // BusEvent wraps payload in "properties"
          if (event.properties.info.id === sessionId) {
            stream.writeSSE({
              data: JSON.stringify({
                type: "session.updated",
                sessionId,
                info: event.properties.info,
                timestamp: Date.now(),
              }),
            })
          }
        })

        // Subscribe to thinking events (via wildcard)
        // Bus.subscribeAll receives all bus events: { type: string, properties: any }
        // Topic format is "thinking.{type}" (static), sessionId is in properties.metadata.sessionId
        const thinkingUnsub = Bus.subscribeAll(async (busEvent) => {
          // Check if this is a thinking event for this session
          if (
            typeof busEvent.type === "string" &&
            busEvent.type.startsWith("thinking.") &&
            busEvent.properties?.metadata?.sessionId === sessionId
          ) {
            stream.writeSSE({
              data: JSON.stringify(busEvent.properties),
            })
          }
        })

        // Subscribe to sandbox events (via wildcard)
        const sandboxUnsub = Bus.subscribeAll(async (busEvent) => {
          // Check if this is a sandbox event for this session
          // Topic defined in sandbox-events.ts as "sandbox.status" (static),
          // BUT previously it was "sandbox.status.{sessionId}".
          // Wait, in my previous fix for sandbox-events.ts, I changed it to STATIC topics:
          // BusEvent.define("sandbox.status", ...)
          // So the topic is just "sandbox.status".
          // Verification: The payload (properties) contains `sessionId`.

          if (typeof busEvent.type === "string" && busEvent.type.startsWith("sandbox.")) {
            // Check if the payload belongs to this session
            if (busEvent.properties?.sessionId === sessionId) {
              stream.writeSSE({
                data: JSON.stringify(busEvent.properties),
              })
            }
          }
        })

        // Subscribe to tool execution events
        const toolUnsub = Bus.subscribeAll(async (busEvent) => {
          // Check if this is a tool execution event for this session
          if (busEvent.type === "tool.execution") {
            if (busEvent.properties?.sessionId === sessionId) {
              stream.writeSSE({
                data: JSON.stringify(busEvent.properties),
              })
            }
          }
        })

        // Subscribe to monitor action events via Bus (local Instance)
        const monitorUnsub = Bus.subscribe(Bus.MonitorAction, async (event) => {
          // DIAGNOSTIC LOG: Received MonitorAction event
          console.log(`[DIAGNOSTIC session-events.ts] Received Bus.MonitorAction:`, {
            event_sessionId: event.properties.sessionId,
            url_sessionId: sessionId,
            match: event.properties.sessionId === sessionId,
            timestamp: Date.now(),
          })

          // Only send events for this session
          if (event.properties.sessionId === sessionId) {
            console.log(`[DIAGNOSTIC session-events.ts] Match! Sending SSE to frontend`)
            stream.writeSSE({
              data: JSON.stringify({
                type: "monitor.action",
                data: event.properties,
                timestamp: Date.now(),
              }),
            })
          } else {
            console.log(
              `[DIAGNOSTIC session-events.ts] No match. Event for ${event.properties.sessionId}, but this SSE is for ${sessionId}`,
            )
          }
        })

        // FIX: Also subscribe via GlobalBus to receive events from other Instances
        const globalMonitorHandler = (globalEvent: any) => {
          const { directory, payload } = globalEvent
          // Check if this is a monitor.action event for our session
          if (payload?.type === "monitor.action" && payload?.properties?.sessionId === sessionId) {
            console.log(`[DIAGNOSTIC session-events.ts] Received via GlobalBus:`, {
              fromDirectory: directory,
              sessionId: payload.properties.sessionId,
            })
            stream.writeSSE({
              data: JSON.stringify({
                type: "monitor.action",
                data: payload.properties,
                timestamp: Date.now(),
              }),
            })
          }
        }
        GlobalBus.on("event", globalMonitorHandler)

        // Subscribe to session status changes
        const statusUnsub = Bus.subscribe(SessionStatus.Event.Status, async (event) => {
          // Only send events for this session
          if (event.properties.sessionID === sessionId) {
            stream.writeSSE({
              data: JSON.stringify({
                type: "session.status",
                sessionId: event.properties.sessionID,
                status: event.properties.status,
                timestamp: Date.now(),
              }),
            })
          }
        })

        // Send heartbeat every 15s
        const heartbeat = setInterval(() => {
          stream.writeSSE({
            data: JSON.stringify({
              type: "session.heartbeat",
              sessionId,
              timestamp: Date.now(),
            }),
          })
        }, 15000)

        await new Promise<void>((resolve) => {
          stream.onAbort(() => {
            clearInterval(heartbeat)
            unsub()
            thinkingUnsub()
            sandboxUnsub()
            toolUnsub()
            monitorUnsub()
            statusUnsub()
            GlobalBus.off("event", globalMonitorHandler) // FIX: Cleanup GlobalBus listener
            log.info("Session event stream disconnected", { sessionId })
            resolve()
          })
        })
      })
    },
  )

  /**
   * POST /session/:id/events/emit
   * Emit a custom event to the session stream
   */
  app.post(
    "/:sessionId/events/emit",
    describeRoute({
      summary: "Emit session event",
      description: "Emits a custom event to the session's event stream (for testing)",
      operationId: "session.emitEvent",
      responses: {
        200: {
          description: "Event emitted",
          content: {
            "application/json": {
              schema: resolver(
                z.object({
                  success: z.boolean(),
                  eventId: z.string(),
                }),
              ),
            },
          },
        },
        ...errors(400, 404, 500),
      },
    }),
    validator("param", z.object({ sessionId: z.string() })),
    validator(
      "json",
      z.object({
        type: z.string(),
        data: z.any(),
      }),
    ),
    async (c) => {
      const { sessionId } = c.req.valid("param")
      const { type, data } = c.req.valid("json")

      // Verify session exists
      const session = await Session.get(sessionId)
      if (!session) {
        throw new Storage.NotFoundError({
          message: "Session not found",
        })
      }

      // Emit event through bus
      // Emit event through bus
      const eventId = `${sessionId}-${Date.now()}`
      // Create a temporary definition for the dynamic event
      const eventDef = { type: `session.${eventId}`, properties: z.any() } as any
      await Bus.publish(eventDef, {
        type,
        sessionId,
        data,
        timestamp: Date.now(),
      })

      log.info("Session event emitted", { sessionId, type, eventId })
      return c.json({
        success: true,
        eventId,
      })
    },
  )

  export const route = app
}

/**
 * Thinking Event Publisher
 *
 * Helper class for publishing thinking events during agent execution
 */
export class ThinkingPublisher {
  private sessionId: string
  private emitters = new Map<string, SSEmitter>()

  constructor(sessionId: string) {
    this.sessionId = sessionId
  }

  /**
   * Get or create an emitter for a specific run
   */
  private getEmitter(runId?: string): SSEmitter {
    const key = runId ?? "default"
    if (!this.emitters.has(key)) {
      this.emitters.set(key, new SSEmitter())
    }
    return this.emitters.get(key)!
  }

  /**
   * Publish a step-start event
   */
  stepStart(step: string, runId?: string, metadata?: Record<string, any>) {
    const emitter = this.getEmitter(runId)
    const event: SSEvents.StepStart = {
      type: "step-start",
      step,
      timestamp: Date.now(),
      metadata: {
        ...metadata,
        sessionId: this.sessionId,
        runId,
      },
    }

    Bus.publish(ThinkingStepStartEvent, event)
  }

  /**
   * Publish a step-finish event
   */
  stepFinish(
    step: string,
    status: "success" | "error",
    duration: number,
    runId?: string,
    error?: string,
    metadata?: Record<string, any>,
  ) {
    const emitter = this.getEmitter(runId)
    const event: SSEvents.StepFinish = {
      type: "step-finish",
      step,
      timestamp: Date.now(),
      status,
      duration,
      error,
      metadata: {
        ...metadata,
        sessionId: this.sessionId,
        runId,
      },
    }

    Bus.publish(ThinkingStepFinishEvent, event)
  }

  /**
   * Publish an artifact event
   */
  artifact(
    artifact: {
      type: "pdf" | "image" | "code" | "text" | "json" | "markdown"
      url: string
      title?: string
      size?: number
      metadata?: Record<string, any>
    },
    runId?: string,
  ) {
    const emitter = this.getEmitter(runId)
    const event: SSEvents.Artifact = {
      type: "artifact",
      artifact,
      timestamp: Date.now(),
    }

    Bus.publish(ThinkingArtifactEvent, event)
  }

  /**
   * Publish a progress event
   */
  progress(progress: number, message: string, runId?: string) {
    const emitter = this.getEmitter(runId)
    const event: SSEvents.Progress = {
      type: "progress",
      progress,
      message,
      timestamp: Date.now(),
    }

    Bus.publish(ThinkingProgressEvent, event)
  }

  /**
   * Clear all emitters for a session
   */
  clear() {
    this.emitters.clear()
  }
}
