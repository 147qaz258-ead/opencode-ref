import { Show, createEffect } from "solid-js"
import { Icon } from "@opencode-ai/ui/icon"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { Tooltip } from "@opencode-ai/ui/tooltip"
import { ResizeHandle } from "@opencode-ai/ui/resize-handle"
import { useMonitor } from "@/hooks/useMonitor"
import { useMonitorEvents } from "@/hooks/useMonitorEvents"
import { MonitorContent } from "./MonitorContent"
import { useLayout } from "@/context/layout"

interface MonitorPanelProps {
  sessionId: string
}

export function MonitorPanel(props: MonitorPanelProps) {
  const layout = useLayout()
  const monitor = useMonitor(() => props.sessionId)

  useMonitorEvents(() => props.sessionId, {
    addAction: monitor.addAction,
  })

  // Sync local monitor open state to layout
  createEffect(() => {
    if (monitor.isOpen()) {
      layout.monitor.open()
    }
  })

  return (
    <Show when={layout.monitor.opened()}>
      <div class="relative flex flex-col h-full border-l border-border-weak bg-surface-base">
        {/* Resize Handle */}
        <ResizeHandle
          direction="horizontal"
          size={layout.monitor.width()}
          min={300}
          max={window.innerWidth * 0.7}
          onResize={layout.monitor.resize}
          onCollapse={layout.monitor.close}
          collapseThreshold={100}
          class="absolute left-0 top-0 bottom-0 w-1 -ml-0.5 z-10 hover:w-1.5 hover:bg-border-base cursor-col-resize transition-all"
        />

        {/* Header */}
        <div class="flex items-center justify-between px-4 py-3 border-b border-border-weak">
          <div class="flex items-center gap-3">
            <Icon name="archive" size="normal" class="text-icon-brand-base" />
            <div>
              <div class="text-14-medium text-text-strong">Monitor</div>
              <Show when={monitor.count() > 0}>
                <div class="text-12-regular text-text-weak">
                  {monitor.currentIndex() + 1} / {monitor.count()}
                </div>
              </Show>
            </div>
          </div>

          <div class="flex items-center gap-1">
            <Tooltip value="Previous action">
              <IconButton
                icon="arrow-left"
                variant="ghost"
                disabled={!monitor.canGoBack()}
                onClick={monitor.goBack}
              />
            </Tooltip>

            <Tooltip value="Next action">
              <IconButton
                icon="arrow-right"
                variant="ghost"
                disabled={!monitor.canGoForward()}
                onClick={monitor.goForward}
              />
            </Tooltip>

            <Tooltip value="Close panel">
              <IconButton
                icon="close"
                variant="ghost"
                onClick={() => layout.monitor.close()}
              />
            </Tooltip>
          </div>
        </div>

        {/* Content */}
        <div class="flex-1 min-h-0 relative">
          <MonitorContent
            sessionId={props.sessionId}
            history={monitor.history()}
            currentIndex={monitor.currentIndex()}
            action={monitor.currentAction}
          />
        </div>
      </div>
    </Show>
  )
}
