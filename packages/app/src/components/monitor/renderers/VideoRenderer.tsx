import { Show, createResource } from "solid-js"
import { Icon } from "@opencode-ai/ui/icon"
import { Spinner } from "@opencode-ai/ui/spinner"

interface VideoRendererProps {
  sessionId: string
  filePath: string
  src?: string
}

export function VideoRenderer(props: VideoRendererProps) {
  const [data] = createResource(
    () => ({ path: props.filePath, src: props.src, sessionId: props.sessionId }),
    async ({ path, src, sessionId }) => {
      if (src) return src
      const response = await fetch(
        `/api/sandbox/session/${sessionId}/file?path=${encodeURIComponent(path)}`
      )
      if (!response.ok) throw new Error("Failed to load video")
      const json = await response.json()
      return `data:video/mp4;base64,${btoa(json.content)}`
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
              <Icon name="play" size="large" class="text-text-weaker" />
              <div class="mt-2 text-14-regular">Failed to load video</div>
            </div>
          </div>
        }>
          <div class="h-full flex items-center justify-center p-4 bg-surface-base">
            <video
              src={data()}
              controls
              class="max-w-full max-h-full object-contain"
            />
          </div>
        </Show>
      }>
        <div class="flex items-center justify-center h-full text-text-weak">
          <div class="text-center">
            <Icon name="warning" size="large" class="text-text-weaker" />
            <div class="mt-2 text-14-regular">Failed to load video</div>
          </div>
        </div>
      </Show>
    </Show>
  )
}
