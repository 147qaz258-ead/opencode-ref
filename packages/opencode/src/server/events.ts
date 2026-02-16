/**
 * SSE Event Extensions
 *
 * Extended Server-Sent Events for thinking protocol and artifacts.
 */

import { z } from "zod"

export namespace SSEvents {
  /**
   * Step Start Event
   * Emitted when a thinking step begins
   */
  export const StepStart = z.object({
    type: z.literal("step-start"),
    step: z.string(),
    timestamp: z.number(),
    metadata: z.record(z.string(), z.any()).optional(),
  })

  export type StepStart = z.output<typeof StepStart>

  /**
   * Step Finish Event
   * Emitted when a thinking step completes
   */
  export const StepFinish = z.object({
    type: z.literal("step-finish"),
    step: z.string(),
    timestamp: z.number(),
    status: z.enum(["success", "error"]),
    duration: z.number(),
    error: z.string().optional(),
    metadata: z.record(z.string(), z.any()).optional(),
  })

  export type StepFinish = z.output<typeof StepFinish>

  /**
   * Artifact Event
   * Emitted when an artifact is generated
   */
  export const Artifact = z.object({
    type: z.literal("artifact"),
    artifact: z.object({
      type: z.enum(["pdf", "image", "code", "text", "json", "markdown"]),
      url: z.string(),
      title: z.string().optional(),
      size: z.number().optional(),
      metadata: z.record(z.string(), z.any()).optional(),
    }),
    timestamp: z.number(),
  })

  export type Artifact = z.output<typeof Artifact>

  /**
   * Skill Loaded Event
   * Emitted when a skill is loaded
   */
  export const SkillLoaded = z.object({
    type: z.literal("skill-loaded"),
    skill: z.object({
      id: z.string(),
      name: z.string(),
      version: z.string().optional(),
    }),
    timestamp: z.number(),
  })

  export type SkillLoaded = z.output<typeof SkillLoaded>

  /**
   * Progress Event
   * Emitted for progress updates
   */
  export const Progress = z.object({
    type: z.literal("progress"),
    progress: z.number(), // 0-100
    message: z.string(),
    timestamp: z.number(),
  })

  export type Progress = z.output<typeof Progress>

  /**
   * Sandbox Status Event
   */
  export const SandboxStatus = z.object({
    type: z.literal("sandbox.status"),
    sessionId: z.string(),
    sandboxId: z.string().optional(),
    status: z.enum(["pending", "starting", "running", "stopping", "stopped", "error"]),
    message: z.string().optional(),
    timestamp: z.number(),
  })

  export type SandboxStatus = z.output<typeof SandboxStatus>

  /**
   * VNC Status Event
   */
  export const VNCStatus = z.object({
    type: z.literal("vnc.status"),
    sessionId: z.string(),
    status: z.enum(["connecting", "connected", "disconnected", "error"]),
    vncUrl: z.string().optional(),
    error: z.string().optional(),
    timestamp: z.number(),
  })

  export type VNCStatus = z.output<typeof VNCStatus>

  /**
   * Tool Execution Event
   */
  export const ToolExecution = z.object({
    type: z.literal("tool.execution"),
    sessionId: z.string(),
    toolId: z.string(),
    toolType: z.enum(["bash", "file", "browser", "read", "edit", "other"]),
    phase: z.enum(["starting", "running", "completed", "error"]),
    progress: z.number().optional(),
    output: z.string().optional(),
    error: z.string().optional(),
    timestamp: z.number(),
  })

  export type ToolExecution = z.output<typeof ToolExecution>

  /**
   * Shell Output Event
   */
  export const ShellOutput = z.object({
    type: z.literal("shell.output"),
    sessionId: z.string(),
    command: z.string().optional(),
    stdout: z.string(),
    stderr: z.string().optional(),
    exitCode: z.number().optional(),
    complete: z.boolean(),
    timestamp: z.number(),
  })

  export type ShellOutput = z.output<typeof ShellOutput>

  /**
   * Browser Event
   */
  export const BrowserEvent = z.object({
    type: z.literal("browser.event"),
    sessionId: z.string(),
    action: z.enum(["navigated", "clicked", "input", "screenshot", "scrolled", "error"]),
    url: z.string().optional(),
    elementIndex: z.number().optional(),
    screenshotUrl: z.string().optional(),
    error: z.string().optional(),
    timestamp: z.number(),
  })

  export type BrowserEvent = z.output<typeof BrowserEvent>

  /**
   * All SSE event types
   */
  export const SSEventSchema = z.discriminatedUnion("type", [
    StepStart,
    StepFinish,
    Artifact,
    SkillLoaded,
    Progress,
    SandboxStatus,
    VNCStatus,
    ToolExecution,
    ShellOutput,
    BrowserEvent,
  ])

  export type SSEvent = z.output<typeof SSEventSchema>

  /**
   * Serialize event to SSE format
   */
  export function serialize(event: SSEvent): string {
    const data = JSON.stringify(event)
    return `data: ${data}\n\n`
  }

  /**
   * Parse SSE line to event
   */
  export function parse(line: string): SSEvent | null {
    if (!line.startsWith("data: ")) {
      return null
    }

    try {
      const data = line.slice(6) // Remove "data: " prefix
      const json = JSON.parse(data)
      const result = SSEventSchema.safeParse(json)
      return result.success ? result.data : null
    } catch (error) {
      console.error("Failed to parse SSE event", { error, line })
      return null
    }
  }
}

/**
 * SSE Event Emitter
 *
 * Helper class for emitting SSE events
 */
export class SSEmitter {
  private events: SSEvents.SSEvent[] = []


  /**
   * Emit a step-start event
   */
  stepStart(step: string, metadata?: Record<string, any>) {
    const event: SSEvents.StepStart = {
      type: "step-start",
      step,
      timestamp: Date.now(),
      metadata,
    }
    this.events.push(event)
  }

  /**
   * Emit a step-finish event
   */
  stepFinish(
    step: string,
    status: "success" | "error",
    duration: number,
    error?: string,
    metadata?: Record<string, any>
  ) {
    const event: SSEvents.StepFinish = {
      type: "step-finish",
      step,
      timestamp: Date.now(),
      status,
      duration,
      error,
      metadata,
    }
    this.events.push(event)
  }

  /**
   * Emit an artifact event
   */
  artifact(
    artifact: {
      type: "pdf" | "image" | "code" | "text" | "json" | "markdown"
      url: string
      title?: string
      size?: number
      metadata?: Record<string, any>
    }
  ) {
    const event: SSEvents.Artifact = {
      type: "artifact",
      artifact: {
        ...artifact,
        metadata: artifact.metadata ?? {},
      },
      timestamp: Date.now(),
    }
    this.events.push(event)
  }

  /**
   * Emit a skill-loaded event
   */
  skillLoaded(skill: { id: string; name: string; version?: string }) {
    const event: SSEvents.SkillLoaded = {
      type: "skill-loaded",
      skill,
      timestamp: Date.now(),
    }
    this.events.push(event)
  }

  /**
   * Emit a progress event
   */
  progress(progress: number, message: string) {
    const event: SSEvents.Progress = {
      type: "progress",
      progress,
      message,
      timestamp: Date.now(),
    }
    this.events.push(event)
  }

  /**
   * Get all pending events
   */
  getEvents(): SSEvents.SSEvent[] {
    return [...this.events]
  }

  /**
   * Clear emitted events
   */
  clear() {
    this.events = []
  }
}
