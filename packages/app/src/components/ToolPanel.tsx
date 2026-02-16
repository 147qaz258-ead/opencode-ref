import { For, Show, createSignal } from "solid-js"
import { Tabs } from "@opencode-ai/ui/tabs"
import { ShellToolView } from "./tools/ShellToolView"
import { FileToolView } from "./tools/FileToolView"
import { BrowserToolView } from "./tools/BrowserToolView"

interface ToolPanelProps {
  sessionId: string
  shellOutput: () => string[]
  containerLogs: () => string[]
  browserEvents: () => Array<{ action: string; timestamp: number; url?: string }>
  fileChanges: () => Array<{ path: string; action: string; timestamp: number }>
  onClearShell: () => void
  onClearLogs: () => void
}

export function ToolPanel(props: ToolPanelProps) {
  const [activeTab, setActiveTab] = createSignal("shell")

  return (
    <div class="h-full flex flex-col bg-background border-l">
      <Tabs value={activeTab()} onValueChange={setActiveTab} class="flex-1 flex flex-col">
        <Tabs.List class="grid grid-cols-3 w-full border-b rounded-none h-12">
          <Tabs.Trigger value="shell" class="rounded-none data-[state=active]:border-b-2">
            Shell
          </Tabs.Trigger>
          <Tabs.Trigger value="file" class="rounded-none data-[state=active]:border-b-2">
            File
          </Tabs.Trigger>
          <Tabs.Trigger value="browser" class="rounded-none data-[state=active]:border-b-2">
            Browser
          </Tabs.Trigger>
        </Tabs.List>

        <div class="flex-1 overflow-auto">
          <Tabs.Content value="shell" class="m-0 h-full">
            <ShellToolView
              output={() => props.shellOutput()}
              onClear={props.onClearShell}
            />
          </Tabs.Content>

          <Tabs.Content value="file" class="m-0 h-full">
            <FileToolView
              changes={() => props.fileChanges()}
            />
          </Tabs.Content>

          <Tabs.Content value="browser" class="m-0 h-full">
            <BrowserToolView
              events={() => props.browserEvents()}
            />
          </Tabs.Content>
        </div>
      </Tabs>
    </div>
  )
}
