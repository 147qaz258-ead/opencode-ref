/**
 * Sandbox Event Publisher
 *
 * Publishes sandbox-related events to the event bus for SSE streaming.
 * Follows the same pattern as ThinkingPublisher in session-events.ts.
 */

import { Bus } from "@/bus"
import { BusEvent } from "@/bus/bus-event"
import { SSEvents } from "./events"

const SandboxStatusEvent = BusEvent.define("sandbox.status", SSEvents.SandboxStatus)
const VNCStatusEvent = BusEvent.define("vnc.status", SSEvents.VNCStatus)
const ToolExecutionEvent = BusEvent.define("tool.execution", SSEvents.ToolExecution)
const ShellOutputEvent = BusEvent.define("shell.output", SSEvents.ShellOutput)
const BrowserEventEvent = BusEvent.define("browser.event", SSEvents.BrowserEvent)

export class SandboxEventPublisher {
  constructor(private sessionId: string) {}

  /**
   * Publish sandbox status event
   */
  sandboxStatus(
    status: SSEvents.SandboxStatus["status"],
    sandboxId?: string,
    message?: string
  ) {
    const event: SSEvents.SandboxStatus = {
      type: "sandbox.status",
      sessionId: this.sessionId,
      sandboxId,
      status,
      message,
      timestamp: Date.now(),
    }
    Bus.publish(SandboxStatusEvent, event)
  }

  /**
   * Publish VNC status event
   */
  vncStatus(
    status: SSEvents.VNCStatus["status"],
    vncUrl?: string,
    error?: string
  ) {
    const event: SSEvents.VNCStatus = {
      type: "vnc.status",
      sessionId: this.sessionId,
      status,
      vncUrl,
      error,
      timestamp: Date.now(),
    }
    Bus.publish(VNCStatusEvent, event)
  }

  /**
   * Publish tool execution event
   */
  toolExecution(
    toolId: string,
    toolType: SSEvents.ToolExecution["toolType"],
    phase: SSEvents.ToolExecution["phase"],
    options?: {
      progress?: number
      output?: string
      error?: string
    }
  ) {
    const event: SSEvents.ToolExecution = {
      type: "tool.execution",
      sessionId: this.sessionId,
      toolId,
      toolType,
      phase,
      progress: options?.progress,
      output: options?.output,
      error: options?.error,
      timestamp: Date.now(),
    }
    Bus.publish(ToolExecutionEvent, event)
  }

  /**
   * Publish shell output event
   */
  shellOutput(
    stdout: string,
    stderr?: string,
    exitCode?: number,
    complete?: boolean,
    command?: string
  ) {
    const event: SSEvents.ShellOutput = {
      type: "shell.output",
      sessionId: this.sessionId,
      command,
      stdout,
      stderr,
      exitCode,
      complete: complete ?? false,
      timestamp: Date.now(),
    }
    Bus.publish(ShellOutputEvent, event)
  }

  /**
   * Publish browser event
   */
  browserEvent(
    action: SSEvents.BrowserEvent["action"],
    options?: {
      url?: string
      elementIndex?: number
      screenshotUrl?: string
      error?: string
    }
  ) {
    const event: SSEvents.BrowserEvent = {
      type: "browser.event",
      sessionId: this.sessionId,
      action,
      url: options?.url,
      elementIndex: options?.elementIndex,
      screenshotUrl: options?.screenshotUrl,
      error: options?.error,
      timestamp: Date.now(),
    }
    Bus.publish(BrowserEventEvent, event)
  }
}
