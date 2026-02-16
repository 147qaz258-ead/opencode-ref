/**
 * SiliconCloud Provider
 *
 * Ultra-fast video generation with LTX-Video model
 * Generates 4-second videos in approximately 4 seconds
 * OpenAI-compatible API
 *
 * API Documentation: https://docs.siliconflow.cn/
 */

import type { VideoParams, VideoResult, ProviderOptions } from "../types"
import { Log } from "@/util/log"

const log = Log.create({ service: "media.provider.siliconcloud" })

export const SiliconCloudProvider = {
  id: "siliconcloud",
  name: "SiliconCloud LTX-Video",
  supportsImage: false, // Focus on ultra-fast video generation
  supportsVideo: true,
  defaultVideoModel: "Lightricks/LTX-Video",

  /**
   * Generate ultra-fast video via SiliconCloud API
   * LTX-Video generates 4s videos in ~4s
   */
  async generateVideo(params: VideoParams, options: ProviderOptions, signal?: AbortSignal): Promise<VideoResult> {
    const apiBase = options.apiBase || "https://api.siliconflow.cn"

    log.info("SiliconCloud video generation", { prompt: params.prompt.substring(0, 50) })

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 120000) // 120s timeout (should complete in ~4s)

    if (signal?.aborted) throw new Error('Aborted')
    signal?.addEventListener("abort", () => {
      controller.abort()
      clearTimeout(timeout)
    })

    try {
      const response = await fetch(`${apiBase}/v1/videos/generations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${options.apiKey}`,
        },
        body: JSON.stringify({
          model: params.model || this.defaultVideoModel,
          prompt: params.prompt,
          image: params.image, // Optional: base64 image for img2video
          // Provider-specific parameters via passthrough
          ...Object.fromEntries(
            Object.entries(params).filter(([k]) => !['prompt', 'model', 'image'].includes(k))
          ),
        }),
        signal: controller.signal,
      })

      clearTimeout(timeout)

      if (!response.ok) {
        const error = await response.text().catch(() => "Unknown error")
        throw new Error(`SiliconCloud API error (${response.status}): ${error}`)
      }

      const data = await response.json()

      // SiliconCloud returns: { images: [{ url: "..." }] } for video
      // Or direct base64 data
      let videoUrl: string | undefined

      if (data.images && data.images[0] && data.images[0].url) {
        videoUrl = data.images[0].url
      } else if (data.data && data.data[0] && data.data[0].url) {
        videoUrl = data.data[0].url
      }

      if (!videoUrl) {
        throw new Error("No video URL in SiliconCloud response")
      }

      log.info("SiliconCloud returned video URL", { videoUrl })

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

        log.info("SiliconCloud video generation complete", { size: base64.length })
        return { base64, format: "mp4" }
      } finally {
        clearTimeout(downloadTimeout)
      }
    } catch (error) {
      clearTimeout(timeout)
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('SiliconCloud video generation timeout')
      }
      log.error("SiliconCloud video generation failed", { error })
      throw error
    }
  },
}
