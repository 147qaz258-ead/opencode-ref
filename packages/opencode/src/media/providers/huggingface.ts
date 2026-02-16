/**
 * Hugging Face Inference Provider
 *
 * Access to thousands of open-source models
 * Free tier: Limited requests (check specific model limits)
 * Supports various Stable Diffusion, Video generation models
 *
 * API Documentation: https://huggingface.co/docs/api-inference
 */

import type { ImageParams, VideoParams, ImageResult, VideoResult, ProviderOptions } from "../types"
import { Client } from "@gradio/client";
import { Log } from "@/util/log"

const log = Log.create({ service: "media.provider.huggingface" })

// Default models for each media type
const DEFAULT_IMAGE_MODEL = "stabilityai/stable-diffusion-3-medium"
const DEFAULT_VIDEO_MODEL = "Lightricks/LTX-Video"

export const HuggingFaceProvider = {
  id: "huggingface",
  name: "Hugging Face Inference",
  defaultImageModel: DEFAULT_IMAGE_MODEL,
  defaultVideoModel: DEFAULT_VIDEO_MODEL,
  supportsImage: true,
  supportsVideo: true,

  /**
   * Generate image via Hugging Face Inference API
   */
  async generateImage(params: ImageParams, options: ProviderOptions, signal?: AbortSignal): Promise<ImageResult> {
    const apiBase = options.apiBase || "https://router.huggingface.co/hf-inference"
    const model = params.model || this.defaultImageModel

    log.info("HuggingFace image generation", { model, prompt: params.prompt.substring(0, 50) })

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 180000) // 180s timeout (models can take time to load)

    if (signal?.aborted) throw new Error('Aborted')
    signal?.addEventListener("abort", () => {
      controller.abort()
      clearTimeout(timeout)
    })

    try {
      const response = await fetch(`${apiBase}/models/${model}`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${options.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          inputs: params.prompt,
          parameters: {
            negative_prompt: params.negative_prompt,
            num_inference_steps: params.num_inference_steps || 25,
            guidance_scale: params.guidance_scale || 7.5,
            width: params.width || 1024,
            height: params.height || 1024,
            // Provider-specific parameters passthrough
            ...Object.fromEntries(
              Object.entries(params).filter(([k]) =>
                !['prompt', 'model', 'negative_prompt', 'num_inference_steps', 'guidance_scale', 'width', 'height'].includes(k)
              )
            ),
          },
        }),
        signal: controller.signal,
      })

      clearTimeout(timeout)

      if (!response.ok) {
        const error = await response.text().catch(() => "Unknown error")
        // Model is still loading
        if (response.status === 503 && error.includes("is currently loading")) {
          const data = JSON.parse(error)
          const waitTime = data.estimated_time || 20
          throw new Error(`Model ${model} is loading, please wait ${waitTime} seconds and retry`)
        }
        throw new Error(`HuggingFace API error (${response.status}): ${error}`)
      }

      const contentType = response.headers.get("content-type") || ""

      // Handle different response formats
      if (contentType.includes("application/json")) {
        const data = await response.json()
        // Some models return JSON with image data
        if (data.image) {
          return { base64: data.image, format: "png" }
        }
        if (data.images && data.images[0]) {
          return { base64: data.images[0], format: "png" }
        }
        throw new Error("No image data in HuggingFace JSON response")
      }

      // Handle binary image response (blob)
      const buffer = await response.arrayBuffer()
      const base64 = Buffer.from(buffer).toString("base64")

      // Detect format from content-type or default to png
      const format = contentType.includes("jpeg") || contentType.includes("jpg") ? "jpg" :
                     contentType.includes("webp") ? "webp" : "png"

      log.info("HuggingFace image generation complete", { size: base64.length, format })
      return { base64, format }
    } catch (error) {
      clearTimeout(timeout)
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('HuggingFace image generation timeout')
      }
      log.error("HuggingFace image generation failed", { error })
      throw error
    }
  },

  /**
   * Generate video via Hugging Face Inference API
   * Note: Video models require significant resources and may have longer wait times
   */
  async generateVideo(params: VideoParams, options: ProviderOptions, signal?: AbortSignal): Promise<VideoResult> {
    const model = params.model || this.defaultVideoModel
    log.info("HuggingFace video generation", { model, prompt: params.prompt.substring(0, 50) })

    // Check if it's the LTX Distilled Space
    if (model === "Lightricks/ltx-video-distilled") {
        return this.generateVideoGradio(params, options, signal);
    }

    // Fallback to Inference API/Router for other models
    const apiBase = options.apiBase || "https://router.huggingface.co/hf-inference"

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 300000) // 5 min timeout (video generation is slow)

    if (signal?.aborted) throw new Error('Aborted')
    signal?.addEventListener("abort", () => {
      controller.abort()
      clearTimeout(timeout)
    })

    try {
      const response = await fetch(`${apiBase}/models/${model}`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${options.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          inputs: params.prompt,
          parameters: {
            num_frames: params.num_frames || 113, // Default ~4 seconds at 24fps
            num_inference_steps: params.num_inference_steps || 25,
            guidance_scale: params.guidance_scale || 7,
            // Provider-specific parameters passthrough
            ...Object.fromEntries(
              Object.entries(params).filter(([k]) =>
                !['prompt', 'model', 'num_frames', 'num_inference_steps', 'guidance_scale'].includes(k)
              )
            ),
          },
        }),
        signal: controller.signal,
      })

      clearTimeout(timeout)

      if (!response.ok) {
        const error = await response.text().catch(() => "Unknown error")
        // Model is still loading
        if (response.status === 503 && error.includes("is currently loading")) {
          const data = JSON.parse(error)
          const waitTime = data.estimated_time || 60
          throw new Error(`Model ${model} is loading, please wait ${waitTime} seconds and retry`)
        }
        throw new Error(`HuggingFace API error (${response.status}): ${error}`)
      }

      const contentType = response.headers.get("content-type") || ""

      // Handle different response formats
      if (contentType.includes("application/json")) {
        const data = await response.json()
        // Some models return URL to video
        if (data.url) {
          // Download video from URL
          const downloadController = new AbortController()
          const downloadTimeout = setTimeout(() => downloadController.abort(), 120000)

          signal?.addEventListener("abort", () => downloadController.abort())

          try {
            const videoResponse = await fetch(data.url, { signal: downloadController.signal })
            if (!videoResponse.ok) {
              throw new Error(`Failed to download video: ${videoResponse.status}`)
            }
            const buffer = await videoResponse.arrayBuffer()
            const base64 = Buffer.from(buffer).toString("base64")

            log.info("HuggingFace video generation complete", { size: base64.length })
            return { base64, format: "mp4" }
          } finally {
            clearTimeout(downloadTimeout)
          }
        }
        // Direct base64 video data
        if (data.video) {
          return { base64: data.video, format: "mp4" }
        }
        throw new Error("No video data in HuggingFace JSON response")
      }

      // Handle binary video response (blob)
      const buffer = await response.arrayBuffer()
      const base64 = Buffer.from(buffer).toString("base64")

      // Detect format from content-type or default to mp4
      const format = contentType.includes("webm") ? "webm" : "mp4"

      log.info("HuggingFace video generation complete", { size: base64.length, format })
      return { base64, format }
    } catch (error) {
      clearTimeout(timeout)
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('HuggingFace video generation timeout')
      }
      log.error("HuggingFace video generation failed", { error })
      throw error
    }
    },

  async generateVideoGradio(params: VideoParams, options: ProviderOptions, signal?: AbortSignal): Promise<VideoResult> {
    log.info("Using Gradio Client for LTX Video", { model: params.model });
    try {
      // Connect to the generic space or use options.apiKey if needed for private spaces
      // Note: @gradio/client connect takes (space_id, options)
      const token = options.apiKey?.startsWith("hf_") ? options.apiKey : undefined;
      const client = await Client.connect("Lightricks/ltx-video-distilled", { hf_token: token as `hf_${string}` } as any);
      
      const result = await client.predict("/text_to_video", {
          prompt: params.prompt,
          negative_prompt: params.negative_prompt || "worst quality, inconsistent motion, blurry, jittery, distorted",
          height_ui: 512,
          width_ui: 704,
          mode: "text-to-video",
          // Use defaults for others or map from params if available
          duration_ui: 2, 
          ui_frames_to_use: 9,
          seed_ui: Math.floor(Math.random() * 100000),
          randomize_seed: true,
          ui_guidance_scale: 3,
          improve_texture_flag: true
      }) as any;

      log.info("Gradio Result received");
      
      // Result structure: { data: [{ video: { url: ... } }, ...] } or similar
      // Based on inspection, it returns [ { video: ..., subtitles: ... }, { seed: ... } ]
      const videoData = result.data ? result.data[0] : result[0];
      const videoUrl = videoData?.video?.url || videoData?.url || videoData?.video;
      
      if (!videoUrl) {
          log.error("Gradio response data:", result);
          throw new Error("No video URL in Gradio response");
      }
      
      const videoResponse = await fetch(videoUrl);
      if (!videoResponse.ok) throw new Error("Failed to download generated video");
      
      const arrayBuffer = await videoResponse.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString("base64");
      
      return {
          base64,
          format: "mp4",
      };

    } catch (error) {
        log.error("Gradio generation failed", { error });
        throw error;
    }
  },
}
