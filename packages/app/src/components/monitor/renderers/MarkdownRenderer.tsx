import { Show, createResource } from "solid-js"
import { Markdown } from "@opencode-ai/ui/markdown"
import { Icon } from "@opencode-ai/ui/icon"
import { Spinner } from "@opencode-ai/ui/spinner"

interface MarkdownRendererProps {
  sessionId: string
  filePath: string
  content?: string
}

export function MarkdownRenderer(props: MarkdownRendererProps) {
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
              <Icon name="file" size="large" class="text-text-weaker" />
              <div class="mt-2 text-14-regular">Failed to load content</div>
            </div>
          </div>
        }>
          <div class="h-full overflow-y-auto p-4">
            <Markdown text={data() || ""} class="prose max-w-none" />
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