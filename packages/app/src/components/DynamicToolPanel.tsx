/**
 * Dynamic Tool Panel Component
 *
 * 根据当前活跃的工具类型动态切换显示对应的工具视图。
 * 支持 Browser、Shell、File 工具的可视化。
 */

import { Show, Switch, Match } from "solid-js"
import { Icon, type IconProps } from "@opencode-ai/ui/icon"
import { Button } from "@opencode-ai/ui/button"
import { type ActiveTool } from "@/hooks/useActiveTool"
import { ShellToolView } from "@/components/tools/ShellToolView"
import { BrowserToolView } from "@/components/tools/BrowserToolView"
import { FileToolView } from "@/components/tools/FileToolView"

export interface DynamicToolPanelProps {
  /** 当前活跃的工具状态 */
  activeTool: () => ActiveTool
  /** 清除活跃工具状态 */
  onClear: () => void
  /** Shell 输出数据 */
  shellOutput?: () => string[]
  /** 浏览器事件数据 */
  browserEvents?: () => Array<{ action: string; timestamp: number; url?: string }>
  /** 文件变更数据 */
  fileChanges?: () => Array<{ path: string; action: string; timestamp: number }>
  /** 清除 Shell 输出 */
  onClearShell?: () => void
  /** 清除浏览器事件 */
  onClearBrowser?: () => void
  /** 清除文件变更 */
  onClearFiles?: () => void
}

/**
 * 获取工具类型的图标名称
 */
function getToolIcon(type: ActiveTool["type"]): IconProps["name"] {
  switch (type) {
    case "browser":
      return "browser"
    case "bash":
      return "terminal"
    case "read":
    case "write":
      return "file"
    default:
      return "tool"
  }
}

/**
 * 获取工具类型的显示名称
 */
function getToolName(type: ActiveTool["type"], customName?: string): string {
  if (customName) return customName

  switch (type) {
    case "browser":
      return "Browser"
    case "bash":
      return "Shell"
    case "read":
      return "File Read"
    case "write":
      return "File Write"
    default:
      return "Tool"
  }
}

/**
 * 获取工具状态的显示文本
 */
function getStatusText(status: ActiveTool["status"]): string {
  switch (status) {
    case "pending":
      return "准备中..."
    case "running":
      return "执行中..."
    case "completed":
      return "已完成"
    case "error":
      return "执行失败"
  }
}

/**
 * 获取工具状态的颜色类
 */
function getStatusColor(status: ActiveTool["status"]): string {
  switch (status) {
    case "pending":
      return "text-text-weak"
    case "running":
      return "text-icon-brand-base"
    case "completed":
      return "text-icon-success-base"
    case "error":
      return "text-icon-critical-base"
  }
}

export function DynamicToolPanel(props: DynamicToolPanelProps) {
  const tool = () => props.activeTool()
  const hasActiveTool = () => tool().type !== null

  return (
    <div class="h-full flex flex-col">
      {/* Tool Panel Header */}
      <Show when={hasActiveTool()}>
        <div class="flex items-center justify-between px-4 py-3 border-b border-border-weak bg-surface-base">
          <div class="flex items-center gap-2">
            <Icon
              name={getToolIcon(tool().type)}
              size="normal"
              class={getStatusColor(tool().status)}
            />
            <div class="text-14-medium text-text-strong">
              {getToolName(tool().type, tool().name)}
            </div>
            <div class={`text-12-regular ${getStatusColor(tool().status)}`}>
              {getStatusText(tool().status)}
            </div>
          </div>

          {/* Clear Button */}
          <Button
            variant="ghost"
            size="small"
            onClick={props.onClear}
            class="text-text-weak hover:text-text-strong"
          >
            关闭
          </Button>
        </div>
      </Show>

      {/* Error Message */}
      <Show when={tool().status === "error" && tool().error}>
        <div class="mx-4 mt-3 p-3 bg-critical-base/10 border border-critical-base/30 rounded">
          <div class="text-12-regular text-icon-critical-base">
            {tool().error}
          </div>
        </div>
      </Show>

      {/* Tool Content */}
      <div class="flex-1 min-h-0 overflow-hidden">
        <Switch>
          {/* Browser tool */}
          <Match when={tool().type === "browser"}>
            <Show when={props.browserEvents} fallback={<BrowserToolPlaceholder />}>
              {(events) => (
                <BrowserToolView events={events()} />
              )}
            </Show>
          </Match>

          {/* Shell tool */}
          <Match when={tool().type === "bash"}>
            <Show when={props.shellOutput} fallback={<ShellToolPlaceholder />}>
              {(output) => (
                <ShellToolView
                  output={output()}
                  onClear={props.onClearShell || (() => {})}
                />
              )}
            </Show>
          </Match>

          {/* File tools */}
          <Match when={tool().type === "read" || tool().type === "write"}>
            <Show when={props.fileChanges} fallback={<FileToolPlaceholder />}>
              {(changes) => (
                <FileToolView changes={changes()} />
              )}
            </Show>
          </Match>
        </Switch>
      </div>
    </div>
  )
}

/**
 * Placeholder for Browser tool when no events available
 */
function BrowserToolPlaceholder() {
  return (
    <div class="h-full flex flex-col items-center justify-center text-text-weak px-6">
      <Icon name="browser" size="large" class="text-text-weaker mb-4" />
      <div class="text-center">
        <div class="text-14-regular mb-2">Browser Tool</div>
        <div class="text-12-regular text-text-weaker">
          浏览器事件将在执行工具时显示
        </div>
      </div>
    </div>
  )
}

/**
 * Placeholder for Shell tool when no output available
 */
function ShellToolPlaceholder() {
  return (
    <div class="h-full flex flex-col items-center justify-center text-text-weak px-6">
      <Icon name="terminal" size="large" class="text-text-weaker mb-4" />
      <div class="text-center">
        <div class="text-14-regular mb-2">Shell Tool</div>
        <div class="text-12-regular text-text-weaker">
          Shell 输出将在执行命令时显示
        </div>
      </div>
    </div>
  )
}

/**
 * Placeholder for File tool when no changes available
 */
function FileToolPlaceholder() {
  return (
    <div class="h-full flex flex-col items-center justify-center text-text-weak px-6">
      <Icon name="file" size="large" class="text-text-weaker mb-4" />
      <div class="text-center">
        <div class="text-14-regular mb-2">File Tool</div>
        <div class="text-12-regular text-text-weaker">
          文件变更将在执行操作时显示
        </div>
      </div>
    </div>
  )
}
