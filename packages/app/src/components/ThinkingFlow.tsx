/**
 * Thinking Flow Component
 *
 * Visualizes the thinking protocol with collapsible steps.
 * Shows step-start/step-finish events with timing information.
 */

import { For, Show, createMemo, createSignal } from "solid-js"
import { Icon } from "@opencode-ai/ui/icon"
import { Button } from "@opencode-ai/ui/button"

export type ThinkingStepStatus = "running" | "success" | "error" | "pending"

export interface ThinkingStep {
  /** Step ID */
  id: string
  /** Step name */
  name: string
  /** Step status */
  status: ThinkingStepStatus
  /** Start timestamp */
  startTime: number
  /** End timestamp (if completed) */
  endTime?: number
  /** Step details/output */
  details?: string
  /** Error message (if failed) */
  error?: string
  /** Child steps */
  children?: ThinkingStep[]
}

export interface ThinkingFlowProps {
  /** Thinking steps */
  steps: ThinkingStep[]
  /** Collapsed state */
  collapsed?: boolean
  /** Toggle callback */
  onToggle?: () => void
}

export function ThinkingFlow(props: ThinkingFlowProps) {
  const [collapsed, setCollapsed] = createSignal(props.collapsed ?? false)
  const [expandedSteps, setExpandedSteps] = createSignal(new Set<string>())

  const toggleCollapse = () => {
    setCollapsed(!collapsed())
    props.onToggle?.()
  }

  const toggleStep = (stepId: string) => {
    const newExpanded = new Set(expandedSteps())
    if (newExpanded.has(stepId)) {
      newExpanded.delete(stepId)
    } else {
      newExpanded.add(stepId)
    }
    setExpandedSteps(newExpanded)
  }

  const formatDuration = (start: number, end?: number) => {
    const duration = (end ?? Date.now()) - start
    if (duration < 1000) return `${duration}ms`
    return `${(duration / 1000).toFixed(1)}s`
  }

  const getStepIcon = (status: ThinkingStepStatus) => {
    switch (status) {
      case "running":
        return "spinner"
      case "success":
        return "check-circle"
      case "error":
        return "circle-x"
      case "pending":
        return "dot-grid"
    }
  }

  const getStepIconColor = (status: ThinkingStepStatus) => {
    switch (status) {
      case "running":
        return "text-icon-brand-base"
      case "success":
        return "text-icon-success-base"
      case "error":
        return "text-icon-critical-base"
      case "pending":
        return "text-icon-weak-base"
    }
  }

  const renderStep = (step: ThinkingStep, depth: number = 0) => {
    const isExpanded = expandedSteps().has(step.id)
    const hasChildren = step.children && step.children.length > 0

    return (
      <div class="flex flex-col" style={{ "margin-left": `${depth * 16}px` }}>
        {/* Step Header */}
        <div
          class="flex items-center gap-2 py-2 px-3 rounded hover:bg-surface-hover cursor-pointer transition-colors"
          onClick={() => hasChildren && toggleStep(step.id)}
        >
          {/* Icon */}
          <div class={getStepIconColor(step.status)}>
            <Icon
              name={getStepIcon(step.status)}
              size="normal"
              classList={{ "animate-spin": step.status === "running" }}
            />
          </div>

          {/* Step Name */}
          <div class="flex-1">
            <div class="text-14-medium text-text-strong">{step.name}</div>
            <Show when={step.status === "running"}>
              <div class="text-12-regular text-text-weak">执行中...</div>
            </Show>
            <Show when={step.error}>
              <div class="text-12-regular text-icon-critical-base">{step.error}</div>
            </Show>
          </div>

          {/* Duration */}
          <Show when={step.endTime || step.status === "running"}>
            <div class="text-12-mono text-text-weak">
              {formatDuration(step.startTime, step.endTime)}
            </div>
          </Show>

          {/* Expand/Collapse */}
          <Show when={hasChildren}>
            <Button
              size="small"
              variant="ghost"
              icon={isExpanded ? "chevron-down" : "chevron-right"}
              class="p-1"
            />
          </Show>
        </div>

        {/* Step Details (if expanded) */}
        <Show when={isExpanded && step.details}>
          <div class="ml-8 mb-2 p-3 bg-surface-weak rounded border border-border-weak">
            <pre class="text-12-regular text-text-weak whitespace-pre-wrap font-mono">
              {step.details}
            </pre>
          </div>
        </Show>

        {/* Child Steps */}
        <Show when={isExpanded && hasChildren}>
          <For each={step.children}>
            {(child) => <div>{renderStep(child, depth + 1)}</div>}
          </For>
        </Show>
      </div>
    )
  }

  return (
    <div class="flex flex-col gap-2">
      {/* Header */}
      <div class="flex items-center justify-between px-3">
        <div class="flex items-center gap-2">
          <Icon name="workflow" size="normal" class="text-text-weak" />
          <div class="text-14-medium text-text-strong">思考步骤</div>
          <div class="text-12-regular text-text-weak">
            {props.steps.length} 个步骤
          </div>
        </div>
        <Button
          size="small"
          variant="ghost"
          icon={collapsed() ? "chevron-down" : "chevron-up"}
          onClick={toggleCollapse}
        >
          {collapsed() ? "展开" : "收起"}
        </Button>
      </div>

      {/* Steps */}
      <Show when={!collapsed()}>
        <div class="flex flex-col gap-1">
          <For each={props.steps}>
            {(step) => <div>{renderStep(step)}</div>}
          </For>
        </div>
      </Show>
    </div>
  )
}

/**
 * Hook to manage thinking steps from SSE events
 */
export function useThinkingFlow() {
  const [steps, setSteps] = createSignal<ThinkingStep[]>([])

  const handleStepStart = (event: { step: string; timestamp: number }) => {
    setSteps((prev) => [
      ...prev,
      {
        id: `${event.step}-${event.timestamp}`,
        name: event.step,
        status: "running",
        startTime: event.timestamp,
      },
    ])
  }

  const handleStepFinish = (event: {
    step: string
    timestamp: number
    status: "success" | "error"
    duration: number
    error?: string
  }) => {
    setSteps((prev) =>
      prev.map((s) =>
        s.name === event.step && s.status === "running"
          ? {
              ...s,
              status: event.status,
              endTime: event.timestamp,
              error: event.error,
            }
          : s
      )
    )
  }

  return {
    steps,
    handleStepStart,
    handleStepFinish,
  }
}
