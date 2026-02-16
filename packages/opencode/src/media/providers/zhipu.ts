// packages/opencode/src/media/providers/zhipu.ts
import type { MediaProvider, ImageParams, VideoParams, ProviderOptions, ImageResult, VideoResult } from "../types"

// Helper function to poll for video task completion
async function pollVideoTask(taskId: string, apiKey: string, apiBase: string, signal?: AbortSignal): Promise<VideoResult> {
  const maxAttempts = 60
  const pollInterval = 2000

  for (let i = 0; i < maxAttempts; i++) {
    // Check if aborted
    if (signal?.aborted) {
      throw new Error("Video generation aborted")
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 30000) // 30s timeout per request

    // If outer signal is aborted, abort the request
    signal?.addEventListener("abort", () => controller.abort())

    try {
      const response = await fetch(`${apiBase}/api/paas/v4/videos/${taskId}`, {
        headers: {
          "Authorization": `Bearer ${apiKey}`,
        },
        signal: controller.signal,
      })

      if (!response.ok) {
        const error = await response.text().catch(() => "Unknown error")
        throw new Error(`Zhipu API error (${response.status}): ${error}`)
      }

      const data = await response.json()

      if (data.task_status === "SUCCESS") {
        const videoUrl = data.video_result?.video_url || data.results?.[0]?.url

        if (!videoUrl) {
          throw new Error("No video URL in completed task")
        }

        // Download video and convert to base64
        const downloadController = new AbortController()
        const downloadTimeout = setTimeout(() => downloadController.abort(), 60000) // 60s for video download

        signal?.addEventListener("abort", () => downloadController.abort())

        try {
          const videoResponse = await fetch(videoUrl, { signal: downloadController.signal })

          if (!videoResponse.ok) {
            throw new Error(`Failed to download video: ${videoResponse.status} ${videoResponse.statusText}`)
          }

          const buffer = await videoResponse.arrayBuffer()
          const base64 = Buffer.from(buffer).toString("base64")

          return {
            base64,
            format: "mp4",
          }
        } finally {
          clearTimeout(downloadTimeout)
        }
      }

      if (data.task_status === "FAILED") {
        throw new Error(`Video generation failed: ${data.error?.message || "Unknown error"}`)
      }
    } finally {
      clearTimeout(timeout)
    }

    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, pollInterval))
  }

  throw new Error("Video generation timed out")
}

export const ZhipuProvider: MediaProvider = {
  id: "zhipu",
  name: "Zhipu AI",
  defaultImageModel: "cogview-3",
  defaultVideoModel: "cogvideox",
  supportsImage: true,
  supportsVideo: true,

  async generateImage(params: ImageParams, options: ProviderOptions, signal?: AbortSignal): Promise<ImageResult> {
    const apiBase = options.apiBase || "https://open.bigmodel.cn"

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 60000) // 60s timeout for image generation

    signal?.addEventListener("abort", () => controller.abort())

    try {
      const response = await fetch(`${apiBase}/api/paas/v4/images/generations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${options.apiKey}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: params.model || this.defaultImageModel,
          prompt: params.prompt,
          // Provider-specific parameters passthrough
          ...Object.fromEntries(
            Object.entries(params).filter(([k]) => !['prompt', 'model'].includes(k))
          ),
        }),
      })

      if (!response.ok) {
        const error = await response.text().catch(() => "Unknown error")
        throw new Error(`Zhipu API error (${response.status}): ${error}`)
      }

      const data = await response.json()

      // Extract base64 image data from response
      const base64 = data.data?.[0]?.b64_json || data.images?.[0]?.url

      if (!base64) {
        throw new Error("No image data in response")
      }

      return {
        base64,
        format: "png",
      }
    } finally {
      clearTimeout(timeout)
    }
  },

  async generateVideo(params: VideoParams, options: ProviderOptions, signal?: AbortSignal): Promise<VideoResult> {
    const apiBase = options.apiBase || "https://open.bigmodel.cn"

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 60000) // 60s timeout for video submission

    signal?.addEventListener("abort", () => controller.abort())

    try {
      const response = await fetch(`${apiBase}/api/paas/v4/videos/generations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${options.apiKey}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: params.model || this.defaultVideoModel,
          prompt: params.prompt,
          // Provider-specific parameters passthrough
          ...Object.fromEntries(
            Object.entries(params).filter(([k]) => !['prompt', 'model'].includes(k))
          ),
        }),
      })

      if (!response.ok) {
        const error = await response.text().catch(() => "Unknown error")
        throw new Error(`Zhipu API error (${response.status}): ${error}`)
      }

      const data = await response.json()

      // Video generation is async, may need to poll for result
      const taskId = data.id || data.task_id

      if (!taskId) {
        throw new Error("No task ID in response")
      }

      // Poll for completion
      return await pollVideoTask(taskId, options.apiKey, apiBase, signal)
    } finally {
      clearTimeout(timeout)
    }
  },
}
