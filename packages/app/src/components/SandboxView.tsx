import { Show, For, createSignal, createMemo } from "solid-js"
import { Card } from "@opencode-ai/ui/card"
import { Icon } from "@opencode-ai/ui/icon"
import { VNCViewer } from "./VNCViewer"
import { ToolPanel } from "./ToolPanel"
import { Terminal } from "./terminal"
import { ArtifactList } from "./ArtifactList"
import { useSandboxEvents } from "../hooks/useSandboxEvents"
import { Tabs } from "@opencode-ai/ui/tabs"
import { useSDK } from "@/context/sdk"
import { useTerminal } from "@/context/terminal"

interface SandboxViewProps {
  sessionId: string
}

export function SandboxView(props: SandboxViewProps) {
  const sdk = useSDK()
  const terminal = useTerminal()
  const { state, clearShellOutput, clearContainerLogs } = useSandboxEvents(() => props.sessionId)
  const [activeTab, setActiveTab] = createSignal<"vnc" | "terminal" | "artifacts">("vnc")

  // Get the first PTY for this session, or undefined if none exists
  const terminalPty = createMemo(() => {
    const allPtys = terminal.all()
    return allPtys.find(pty => pty.id.includes(props.sessionId)) || allPtys[0]
  })

  const vncUrl = () => {
    if (state.vncStatus === "connected" && state.vncUrl) {
      return state.vncUrl
    }
    return undefined
  }

  const isSandboxRunning = () => {
    return state.sandboxStatus === "running"
  }

  const getStatusColor = () => {
    if (state.sandboxStatus === "running") return "text-icon-success-base"
    if (state.sandboxStatus === "error") return "text-icon-critical-base"
    if (state.sandboxStatus === "starting") return "text-icon-warning-base"
    return "text-icon-weak-base"
  }

  const getStatusText = () => {
    if (state.sandboxStatus === "running") return "Sandbox Active"
    if (state.sandboxStatus === "starting") return "Starting..."
    if (state.sandboxStatus === "error") return "Error"
    return "Not Started"
  }

  const getVncStatusColor = () => {
    if (state.vncStatus === "connected") return "text-icon-success-base"
    if (state.vncStatus === "error") return "text-icon-critical-base"
    return "text-icon-weak-base"
  }

  return (
    <div class="h-screen flex flex-col">
      {/* Status Bar */}
      <Card class="px-4 py-3 border-b border-border-weak">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-4">
            {/* Sandbox Status */}
            <div class="flex items-center gap-2">
              <Show
                when={isSandboxRunning()}
                fallback={
                  <div class="w-2 h-2 rounded-full bg-warning-base animate-pulse" />
                }
              >
                <div class="w-2 h-2 rounded-full bg-success-base" />
              </Show>
              <span class="text-14-medium">{getStatusText()}</span>
            </div>

            {/* VNC Status */}
            <div class="flex items-center gap-2 text-13-regular text-text-weak">
              <span>VNC:</span>
              <span class={getVncStatusColor()}>
                {state.vncStatus === "connected" ? "Connected" :
                  state.vncStatus === "connecting" ? "Connecting..." :
                    state.vncStatus === "error" ? "Error" :
                      "Disconnected"}
              </span>
            </div>
          </div>

          {/* Container Info */}
          <Show when={isSandboxRunning()}>
            <div class="flex items-center gap-2 text-12-regular text-text-weak">
              <Icon name="container" size="small" />
              <span class="font-mono">
                {props.sessionId.slice(0, 8)}
              </span>
            </div>
          </Show>
        </div>
      </Card>

      {/* Main Content */}
      <div class="flex-1 flex overflow-hidden">
        {/* Left Panel - VNC/Terminal/Artifacts */}
        <div class="flex-1 flex flex-col min-w-0">
          <Tabs value={activeTab()} onValueChange={(v: string) => setActiveTab(v as any)} class="flex-1 flex flex-col">
            {/* Tabs Header */}
            <div class="flex border-b border-border-weak bg-surface-weak">
              <Tabs.List class="flex rounded-none h-12 bg-transparent">
                <Tabs.Trigger value="vnc" class="rounded-none data-[state=active]:border-b-2 data-[state=active]:border-border-hover">
                  <div class="flex items-center gap-2">
                    <Icon name="desktop" size="small" />
                    <span>VNC Desktop</span>
                  </div>
                </Tabs.Trigger>
                <Tabs.Trigger value="terminal" class="rounded-none data-[state=active]:border-b-2 data-[state=active]:border-border-hover">
                  <div class="flex items-center gap-2">
                    <Icon name="terminal" size="small" />
                    <span>Terminal</span>
                  </div>
                </Tabs.Trigger>
                <Tabs.Trigger value="artifacts" class="rounded-none data-[state=active]:border-b-2 data-[state=active]:border-border-hover">
                  <div class="flex items-center gap-2">
                    <Icon name="artifact" size="small" />
                    <span>Artifacts</span>
                  </div>
                </Tabs.Trigger>
              </Tabs.List>
            </div>

            {/* Tabs Content */}
            <div class="flex-1 min-h-0">
              <Tabs.Content value="vnc" class="m-0 h-full p-0">
                <div class="h-full bg-black flex items-center justify-center">
                  <Show when={vncUrl()} fallback={
                    <div class="text-white text-center">
                      <Icon name="desktop" size="large" class="text-text-weak" />
                      <div class="mt-4 text-text-weak">
                        {state.vncStatus === "connecting" && "Connecting to VNC..."}
                        {state.vncStatus === "disconnected" && "VNC disconnected"}
                        {state.vncStatus === "error" && "VNC connection failed"}
                        {!vncUrl() && state.vncStatus !== "connecting" && "Start the sandbox to connect"}
                      </div>
                    </div>
                  }>
                    <VNCViewer
                      sessionId={props.sessionId}
                      vncUrl={vncUrl}
                      width={1280}
                      height={1024}
                    />
                  </Show>
                </div>
              </Tabs.Content>

              <Tabs.Content value="terminal" class="m-0 h-full p-0">
                <Show when={terminalPty()} fallback={
                  <div class="h-full flex items-center justify-center text-text-weak">
                    <div class="text-center">
                      <Icon name="terminal" size="large" class="text-text-weaker" />
                      <div class="mt-2 text-14-regular">No terminal available</div>
                    </div>
                  </div>
                }>
                  {(pty) => <Terminal pty={pty()} />}
                </Show>
              </Tabs.Content>

              <Tabs.Content value="artifacts" class="m-0 h-full p-0">
                <ArtifactList sessionId={props.sessionId} />
              </Tabs.Content>
            </div>
          </Tabs>
        </div>

        {/* Right Panel - Tool Panel */}
        <div class="w-80 border-l border-border-weak">
          <ToolPanel
            sessionId={props.sessionId}
            shellOutput={() => state.shellOutput}
            containerLogs={() => state.containerLogs}
            browserEvents={() => state.browserEvents}
            fileChanges={() => state.fileChanges}
            onClearShell={clearShellOutput}
            onClearLogs={clearContainerLogs}
          />
        </div>
      </div>
    </div>
  )
}
