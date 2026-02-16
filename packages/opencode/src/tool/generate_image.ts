/**
 * Generate Image Tool - AI Image Generation
 *
 * Generates images from text descriptions using configured AI providers.
 */

import z from "zod"
import { Tool } from "./tool"
import DESCRIPTION from "./generate_image.txt"
import { getImageConfig } from "../config/media"
import { getMediaProvider } from "../media/providers"
import { createExecutorForSession } from "../sandbox/executor-v2"
import { getUserContainerForSession } from "../session/docker"
import { Bus } from "../bus"

export const GenerateImageTool = Tool.define("generate_image", {
  description: DESCRIPTION,

  parameters: z.object({
    prompt: z.string().describe("The text description of the image to generate"),
    model: z.string().optional().describe("The model to use (e.g., 'cogview-3')"),
    // Provider-specific parameters via passthrough
  }).passthrough(),

  async execute(params, ctx) {
    const { prompt, model, ...providerParams } = params

    const config = getImageConfig()
    const provider = getMediaProvider(config.provider, "image")

    const startTime = Date.now()

    // Use configured model, or override from params, or provider default
    const selectedModel = model || config.model || provider.defaultImageModel

    // Call provider to generate image
    const imageData = await provider.generateImage!({
      prompt,
      model: selectedModel,
      ...providerParams,
    }, {
      apiKey: config.apiKey,
      apiBase: config.apiBase,
    }, ctx.abort)

    const duration = Date.now() - startTime

    // Save to sandbox filesystem
    const executor = await createExecutorForSession(ctx.sessionID, getUserContainerForSession)
    const timestamp = Date.now()
    const outputPath = `/workspace/outputs/image_${timestamp}.png`

    // Use base64 encoding via shell
    await executor.exec(`mkdir -p /workspace/outputs && echo "${imageData.base64}" | base64 -d > "${outputPath}"`)

    // Publish monitor event for auto-display
    await Bus.publish(Bus.MonitorAction, {
      sessionId: ctx.sessionID,
      actionId: `action-${timestamp}-${Math.random().toString(36).slice(2, 9)}`,
      timestamp: Date.now(),
      renderType: "image",
      data: {
        filePath: outputPath,
        src: `data:image/png;base64,${imageData.base64}`,
      },
    })

    return {
      title: `使用 ${config.provider} 生成图片`,
      output: outputPath,
      metadata: {
        provider: config.provider,
        model: selectedModel,
        duration: `${duration}ms`,
        size: imageData.base64.length,
      },
    }
  },
})
