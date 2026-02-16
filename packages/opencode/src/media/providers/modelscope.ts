/**
 * ModelScope (魔搭社区) Provider
 *
 * Free tier: 2000 calls/day
 * OpenAI-compatible API
 * Supports: Qwen-Image, Stable Diffusion, and other open source models
 *
 * API Documentation: https://modelscope.cn/docs/model-service/API-Inference/intro
 */

import type { ImageParams, VideoParams, ImageResult, VideoResult, ProviderOptions } from "../types"
import { Log } from "@/util/log"

const log = Log.create({ service: "media.provider.modelscope" })

export const ModelScopeProvider = {
  id: "modelscope",
  name: "ModelScope (魔搭社区)",
  defaultImageModel: "qwen/Qwen-Image",
  supportsImage: true,
  supportsVideo: false, // ModelScope focuses on image generation

  /**
   * Generate image via ModelScope API
   * OpenAI-compatible endpoint
   */
  async generateImage(params: ImageParams, options: ProviderOptions, signal?: AbortSignal): Promise<ImageResult> {
    const apiBase = options.apiBase || "https://api-inference.modelscope.cn"
    const model = params.model || this.defaultImageModel

    log.info("ModelScope image generation (async)", { model, prompt: params.prompt.substring(0, 50) })

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 300000) // 5 min timeout for async process (free tier queue)

    if (signal?.aborted) throw new Error('Aborted')
    signal?.addEventListener("abort", () => {
      controller.abort()
      clearTimeout(timeout)
    })

    try {
      // 1. Submit async task
      log.debug("Submitting async task to ModelScope...")
      const submitResponse = await fetch(`${apiBase}/v1/images/generations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${options.apiKey}`,
          "X-ModelScope-Async-Mode": "true", // Enable async mode
        },
        body: JSON.stringify({
          model,
          prompt: params.prompt,
          n: params.n || 1,
          size: params.size || "1024x1024",
          ...Object.fromEntries(
            Object.entries(params).filter(([k]) => !['prompt', 'model', 'n', 'size'].includes(k))
          ),
        }),
        signal: controller.signal,
      })

      if (!submitResponse.ok) {
        const error = await submitResponse.text().catch(() => "Unknown error")
        throw new Error(`ModelScope submission failed (${submitResponse.status}): ${error}`)
      }

      const submitData = await submitResponse.json()
      const taskId = submitData.task_id || submitData.request_id

      if (!taskId) {
        throw new Error("No task_id returned from ModelScope async submission")
      }

      log.info("ModelScope task submitted", { taskId })

      // 2. Poll for completion
      await new Promise(r => setTimeout(r, 5000)) // Wait 5s for task propagation
      const maxAttempts = 150 // 5 minutes at 2s interval
      const pollInterval = 2000

      for (let i = 0; i < maxAttempts; i++) {
        if (controller.signal.aborted) throw new Error("Aborted during polling")

        const taskResponse = await fetch(`${apiBase}/v1/tasks/${taskId}`, {
          headers: {
            "Authorization": `Bearer ${options.apiKey}`,
            "X-ModelScope-Task-Type": "image_generation",
          },
          signal: controller.signal,
        })

        if (!taskResponse.ok) {
           // Some APIs use different endpoints for task status, if 404 try fallback or wait
           log.warn(`Task poll failed: ${taskResponse.status} ${taskResponse.statusText}`)
        } else {
            const taskData = await taskResponse.json()
            const status = taskData.task_status || taskData.status

            if (status === "SUCCEEDED" || status === "SUCCESS" || status === "SUCCEED") {
                // Task done
                const results = taskData.results || taskData.output?.results
                const imageUrl = taskData.output_images?.[0] || results?.[0]?.url || taskData.output?.url

                if (!imageUrl) {
                    log.error("ModelScope task succeeded but no URL:", { taskData: JSON.stringify(taskData) })
                    throw new Error("Task succeeded but found no image URL (check logs for details)")
                }

                log.info("ModelScope task succeeded", { imageUrl })

                // 3. Download image
                 const imageResponse = await fetch(imageUrl)
                if (!imageResponse.ok) {
                    throw new Error(`Failed to fetch image from URL: ${imageResponse.status}`)
                }
                
                // Clear timeout on success
                clearTimeout(timeout)

                const buffer = await imageResponse.arrayBuffer()
                const base64 = Buffer.from(buffer).toString('base64')

                // Detect format
                const format = imageUrl.includes('.png') ? 'png' :
                            imageUrl.includes('.jpeg') || imageUrl.includes('.jpg') ? 'jpg' : 'png'

                return { base64, format }
            }

            if (status === "FAILED") {
                log.error("ModelScope task data:", taskData)
                throw new Error(`ModelScope task failed: ${taskData.message || JSON.stringify(taskData)}`)
            }
             
             // Still running/pending
             if (i % 5 === 0) log.debug(`Task status: ${status}, waiting...`)
        }

        await new Promise(r => setTimeout(r, pollInterval))
      }

      throw new Error("ModelScope task timed out (5 minutes)")

    } catch (error) {
      clearTimeout(timeout)
      log.error("ModelScope generation failed", { error })
      throw error
    } finally {
      clearTimeout(timeout)
    }
  },
}
