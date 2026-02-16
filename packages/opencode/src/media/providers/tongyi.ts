/**
 * Alibaba Tongyi Wanxiang (通义万象) Provider
 *
 * Free tier: Limited free credits for new users
 * Video generation with Wan2.5-t2v-preview model
 * China-friendly: Domestic network access
 *
 * API Documentation: https://help.aliyun.com/zh/dashscope/developer-reference/tongyi-wanxiang-apis
 */

import type { VideoParams, VideoResult, ProviderOptions } from "../types"
import { Log } from "@/util/log"

const log = Log.create({ service: "media.provider.tongyi" })

export const TongyiProvider = {
  id: "tongyi",
  name: "Alibaba Tongyi Wanxiang (通义万象)",
  supportsImage: false, // Focus on video generation
  supportsVideo: true,
  defaultVideoModel: "wanx-v2",

  /**
   * Generate video via Tongyi API
   * Uses async task creation and polling
   */
  async generateVideo(params: VideoParams, options: ProviderOptions, signal?: AbortSignal): Promise<VideoResult> {
    const apiBase = options.apiBase || "https://dashscope.aliyuncs.com"

    log.info("Tongyi video generation", { prompt: params.prompt.substring(0, 50) })

    // Step 1: Submit video generation task
    const submitController = new AbortController()
    const submitTimeout = setTimeout(() => submitController.abort(), 60000) // 60s for task submission

    if (signal?.aborted) throw new Error('Aborted')
    signal?.addEventListener("abort", () => {
      submitController.abort()
      clearTimeout(submitTimeout)
    })

    let taskId: string

    try {
      const response = await fetch(`${apiBase}/api/v1/videos/generations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${options.apiKey}`,
          "X-DashScope-Async": "enable", // Enable async mode
        },
        body: JSON.stringify({
          model: params.model || this.defaultVideoModel,
          input: {
            prompt: params.prompt,
          },
          parameters: {
            size: params.size || "1280*720", // Default resolution
            fps: params.fps || 30,
            prompt_optimizer: params.promptOptimizer !== false, // Default enable prompt optimization
          },
        }),
        signal: submitController.signal,
      })

      clearTimeout(submitTimeout)

      if (!response.ok) {
        const error = await response.text().catch(() => "Unknown error")
        throw new Error(`Tongyi API error (${response.status}): ${error}`)
      }

      const data = await response.json()

      if (data.code && data.code !== "Success") {
        throw new Error(`Tongyi API error: ${data.message || data.code}`)
      }

      taskId = data.output?.task_id

      if (!taskId) {
        throw new Error("No task ID in Tongyi response")
      }

      log.info("Tongyi video task submitted", { taskId })
    } catch (error) {
      clearTimeout(submitTimeout)
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Tongyi video submission timeout')
      }
      throw error
    }

    // Step 2: Poll for task completion
    const maxAttempts = 120 // Max 2 minutes
    const pollInterval = 2000 // 2 seconds

    for (let i = 0; i < maxAttempts; i++) {
      if (signal?.aborted) {
        throw new Error("Video generation aborted")
      }

      const pollController = new AbortController()
      const pollTimeout = setTimeout(() => pollController.abort(), 30000) // 30s per poll request

      signal?.addEventListener("abort", () => {
        pollController.abort()
        clearTimeout(pollTimeout)
      })

      try {
        const response = await fetch(`${apiBase}/api/v1/videos/${taskId}`, {
          headers: {
            "Authorization": `Bearer ${options.apiKey}`,
          },
          signal: pollController.signal,
        })

        clearTimeout(pollTimeout)

        if (!response.ok) {
          const error = await response.text().catch(() => "Unknown error")
          throw new Error(`Tongyi poll API error (${response.status}): ${error}`)
        }

        const data = await response.json()

        const taskStatus = data.output?.task_status

        if (taskStatus === "SUCCEEDED" || taskStatus === "COMPLETED") {
          const videoUrl = data.output?.results?.[0]?.url

          if (!videoUrl) {
            throw new Error("No video URL in completed task")
          }

          log.info("Tongyi video completed", { videoUrl })

          // Download video and convert to base64
          const downloadController = new AbortController()
          const downloadTimeout = setTimeout(() => downloadController.abort(), 120000) // 120s for download

          signal?.addEventListener("abort", () => downloadController.abort())

          try {
            const videoResponse = await fetch(videoUrl, { signal: downloadController.signal })

            if (!videoResponse.ok) {
              throw new Error(`Failed to download video: ${videoResponse.status}`)
            }

            const buffer = await videoResponse.arrayBuffer()
            const base64 = Buffer.from(buffer).toString("base64")

            log.info("Tongyi video generation complete", { size: base64.length })
            return { base64, format: "mp4" }
          } finally {
            clearTimeout(downloadTimeout)
          }
        }

        if (taskStatus === "FAILED" || taskStatus === "ERROR") {
          const errorMsg = data.output?.error_message || data.output?.error_code || "Unknown error"
          throw new Error(`Tongyi video generation failed: ${errorMsg}`)
        }

        // Continue polling (PENDING, PROCESSING, etc.)
        log.debug("Tongyi video status", { status: taskStatus, attempt: i + 1 })
      } finally {
        clearTimeout(pollTimeout)
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, pollInterval))
    }

    throw new Error("Tongyi video generation timed out")
  },
}
