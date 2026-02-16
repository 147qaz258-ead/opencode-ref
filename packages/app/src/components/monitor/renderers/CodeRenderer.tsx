import { Show, createResource } from "solid-js"
import { Icon } from "@opencode-ai/ui/icon"
import { Spinner } from "@opencode-ai/ui/spinner"

interface CodeRendererProps {
  sessionId: string
  filePath: string
  content?: string
  language: string
}

export function CodeRenderer(props: CodeRendererProps) {
  const [data] = createResource(
    () => ({ path: props.filePath, content: props.content, sessionId: props.sessionId }),
    async ({ path, content, sessionId }) => {
      if (content) return content
      const response = await fetch(
        `/api/sandbox/session/${sessionId}/file?path=${encodeURIComponent(path)}`
      )
      if (!response.ok) throw new Error("Failed to load file")
      const json = await response.json()
      return json.content
    }
  )

  return (
    <Show when={!data.loading} fallback={
      <div class="flex items-center justify-center h-full">
        <Spinner class="size-8" />
      </div>
    }>
      <Show when={data.error} fallback={
        <Show when={data()} fallback={
          <div class="flex items-center justify-center h-full text-text-weak">
            <div class="text-center">
              <Icon name="code" size="large" class="text-text-weaker" />
              <div class="mt-2 text-14-regular">Failed to load content</div>
            </div>
          </div>
        }>
          {/*
            Note: Using plain <pre> instead of Shiki for syntax highlighting because full syntax highlighting
            requires runtime tokenizer which is not available in this context. Basic code display is sufficient.
            GitHub-style light theme for code display.
          */}
          <div class="h-full flex flex-col bg-white">  {/* GitHub 白色背景 */}
            {/* 文件头部 - 浅灰背景 */}
            <div class="flex items-center justify-between px-4 py-2 border-b border-border-weak bg-[#f6f8fa]">
              <div class="flex items-center gap-2 text-12-regular text-[#24292f]">
                <Icon name="code" size="small" />
                <span class="font-mono">{props.filePath}</span>
              </div>
              <div class="px-2 py-0.5 rounded bg-[#f0f0f0] text-12-regular text-[#57606a]">
                {props.language}
              </div>
            </div>

            {/* 代码内容 - GitHub 风格 */}
            <div class="flex-1 overflow-auto">
              <pre
                class="!m-0 !p-4 font-mono text-14-regular"
                style={{
                  "background-color": "#ffffff",
                  "color": "#24292f",
                  "line-height": "1.5",
                  "border-radius": "6px",
                }}
              >
                <code class="block">{data()}</code>
              </pre>
            </div>
          </div>
        </Show>
      }>
        <div class="flex items-center justify-center h-full text-text-weak">
          <div class="text-center">
            <Icon name="warning" size="large" class="text-text-weaker" />
            <div class="mt-2 text-14-regular">Failed to load content</div>
          </div>
        </div>
      </Show>
    </Show>
  )
}