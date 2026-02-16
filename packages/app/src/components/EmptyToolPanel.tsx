/**
 * Empty Tool Panel Component
 *
 * Displayed when no tool is currently active.
 * Shows a placeholder message indicating the panel will activate when tools are executed.
 */

import { Icon } from "@opencode-ai/ui/icon"
import { Show } from "solid-js"

export function EmptyToolPanel() {
  return (
    <div class="h-full flex flex-col items-center justify-center text-text-weak px-6">
      {/* Icon */}
      <div class="mb-4">
        <Icon name="tool" size="large" class="text-text-weaker" />
      </div>

      {/* Message */}
      <div class="text-center">
        <div class="text-14-regular mb-2">工具面板</div>
        <div class="text-12-regular text-text-weaker">
          执行工具时将自动显示对应视图
        </div>
      </div>

      {/* Hint */}
      <Show when={true}>
        <div class="mt-6 px-4 py-2 bg-surface-weak rounded border border-border-weak">
          <div class="text-12-regular text-text-weaker text-center">
            支持的工具：Shell、Browser、File
          </div>
        </div>
      </Show>
    </div>
  )
}
