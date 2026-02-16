import { Show, Switch, Match } from "solid-js"
import { Icon } from "@opencode-ai/ui/icon"
import type { MonitorAction } from "@/hooks/useMonitor"
import { VNCRenderer } from "./renderers/VNCRenderer"
import { MarkdownRenderer } from "./renderers/MarkdownRenderer"
import { CodeRenderer } from "./renderers/CodeRenderer"
import { InfiniteCanvas } from "./InfiniteCanvas"

interface MonitorContentProps {
  sessionId: string
  history: MonitorAction[]
  currentIndex: number
  action: () => MonitorAction | undefined
}

export function MonitorContent(props: MonitorContentProps) {
  const action = () => props.action()

  return (
    <Show when={action()} fallback={
      <div class="h-full flex items-center justify-center text-text-weak">
        <div class="text-center">
          <Icon name="monitor" size="large" class="text-text-weaker" />
          <div class="mt-4 text-14-medium">No content to display</div>
          <div class="mt-1 text-12-regular text-text-weaker">
            Agent actions will appear here
          </div>
        </div>
      </div>
    }>
      <Switch fallback={
        <div class="h-full flex items-center justify-center text-text-weak">
          <div class="text-center">
            <Icon name="warning" size="large" class="text-text-weaker" />
            <div class="mt-4 text-14-medium">Unsupported content type</div>
          </div>
        </div>
      }>
        <Match when={action()?.renderType === "vnc"}>
          <VNCRenderer sessionId={props.sessionId} vncUrl={action()?.data.vncUrl ?? ""} />
        </Match>
        <Match when={action()?.renderType === "markdown"}>
          <MarkdownRenderer sessionId={props.sessionId} filePath={action()?.data.filePath ?? ""} content={action()?.data.content ?? ""} />
        </Match>
        <Match when={action()?.renderType === "code"}>
          <CodeRenderer sessionId={props.sessionId} filePath={action()?.data.filePath ?? ""} content={action()?.data.content ?? ""} language={action()?.data.language ?? ""} />
        </Match>
        <Match when={["image", "video"].includes(action()?.renderType ?? "")}>
          <InfiniteCanvas 
            sessionId={props.sessionId} 
            history={props.history}
          />
        </Match>
      </Switch>
    </Show>
  )
}