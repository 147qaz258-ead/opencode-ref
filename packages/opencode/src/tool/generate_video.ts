/**
 * Generate Video Tool - AI Video Generation
 *
 * Generates videos from text descriptions using configured AI providers.
 */

import z from "zod"
import { Tool } from "./tool"
import DESCRIPTION from "./generate_video.txt"
import { getVideoConfig } from "../config/media"
import { getMediaProvider } from "../media/providers"
import { createExecutorForSession } from "../sandbox/executor-v2"
import { getUserContainerForSession } from "../session/docker"
import { Bus } from "../bus"

export const GenerateVideoTool = Tool.define("generate_video", {
  description: DESCRIPTION,

  parameters: z.object({
    prompt: z.string().describe("The text description of the video to generate"),
    model: z.string().optional().describe("The model to use (e.g., 'cogvideox')"),
    // Provider-specific parameters via passthrough
  }).passthrough(),

  async execute(params, ctx) {
    const { prompt, model, ...providerParams } = params

    const config = getVideoConfig()
    const provider = getMediaProvider(config.provider, "video")

    const startTime = Date.now()

    // Use configured model, or override from params, or provider default
    const selectedModel = model || config.model || provider.defaultVideoModel

    // Call provider to generate video
    const videoData = await provider.generateVideo!({
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
    const outputPath = `/workspace/outputs/video_${timestamp}.mp4`

    // Use base64 encoding via shell
    await executor.exec(`mkdir -p /workspace/outputs && echo "${videoData.base64}" | base64 -d > "${outputPath}"`)

    // Publish monitor event for auto-display
    await Bus.publish(Bus.MonitorAction, {
      sessionId: ctx.sessionID,
      actionId: `action-${timestamp}-${Math.random().toString(36).slice(2, 9)}`,
      timestamp: Date.now(),
      renderType: "video",
      data: {
        filePath: outputPath,
        src: `data:video/mp4;base64,${videoData.base64}`,
      },
    })

    return {
      title: `使用 ${config.provider} 生成视频`,
      output: outputPath,
      metadata: {
        provider: config.provider,
        model: selectedModel,
        duration: `${duration}ms`,
        size: videoData.base64.length,
      },
    }
  },
})
