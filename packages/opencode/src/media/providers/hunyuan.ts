/**
 * Tencent Hunyuan (腾讯混元) Provider
 *
 * Free tier: Limited free credits for new users
 * Supports: Image and Video generation
 * China-friendly: Domestic network access
 *
 * API Documentation: https://cloud.tencent.com/document/api/1729/105876
 */

import type { ImageParams, VideoParams, ImageResult, VideoResult, ProviderOptions } from "../types"
import { Log } from "@/util/log"

const log = Log.create({ service: "media.provider.hunyuan" })

// ============================================================================
// TC3-HMAC-SHA256 Signature Helper
// ============================================================================

interface SignatureConfig {
  secretId: string
  secretKey: string
  endpoint: string
  service: string
  region: string
  action: string
  version: string
  payload: string
  timestamp: number
}

/**
 * Generate TC3-HMAC-SHA256 signature for Tencent Cloud API
 * Ref: https://cloud.tencent.com/document/product/1312/48195
 */
async function generateTC3Signature(config: SignatureConfig): Promise<{ headers: Record<string, string> }> {
  const { secretId, secretKey, endpoint, service, region, action, version, payload, timestamp } = config

  // Extract host from endpoint
  const url = new URL(endpoint)
  const host = url.host
  const canonicalUri = url.pathname || "/"

  // 1. Construct canonical request
  const httpRequestMethod = "POST"
  const canonicalQueryString = ""
  const canonicalHeaders = `content-type:application/json\nhost:${host}\n`
  const signedHeaders = "content-type;host"
  const hashedRequestPayload = await hash(payload)
  const canonicalRequest = `${httpRequestMethod}\n${canonicalUri}\n${canonicalQueryString}\n${canonicalHeaders}\n${signedHeaders}\n${hashedRequestPayload}`

  // 2. Construct string to sign
  const algorithm = "TC3-HMAC-SHA256"
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10).replace(/-/g, "")
  const credentialScope = `${date}/${service}/tc3_request`
  const hashedCanonicalRequest = await hash(canonicalRequest)
  const stringToSign = `${algorithm}\n${timestamp}\n${credentialScope}\n${hashedCanonicalRequest}`

  // 3. Calculate signature
  const secretDate = hmacSha256(date, `TC3${secretKey}`)
  const secretService = hmacSha256(service, secretDate)
  const secretSigning = hmacSha256("tc3_request", secretService)
  const signature = hmacSha256(stringToSign, secretSigning, "hex")

  // 4. Construct authorization header
  const authorization = `${algorithm} Credential=${secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`

  // 5. Construct headers
  return {
    headers: {
      "Authorization": authorization,
      "Content-Type": "application/json",
      "Host": host,
      "X-TC-Action": action,
      "X-TC-Timestamp": timestamp.toString(),
      "X-TC-Version": version,
      "X-TC-Region": region,
    },
  }
}

async function hash(data: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(data)
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("")
}

function hmacSha256(data: string, key: string | Uint8Array, encoding: "buffer" | "hex" = "buffer"): Uint8Array | string {
  const cryptoKey = typeof key === "string" ? new TextEncoder().encode(key) : key

  // HMAC-SHA256 implementation for Node.js/Bun
  const crypto = require("node:crypto")
  const hmac = crypto.createHmac("sha256", cryptoKey)
  hmac.update(data)
  const result = hmac.digest()

  return encoding === "hex" ? result.toString("hex") : new Uint8Array(result)
}

// ============================================================================
// Hunyuan Provider Implementation
// ============================================================================

export const HunyuanProvider = {
  id: "hunyuan",
  name: "Tencent Hunyuan (腾讯混元)",
  defaultImageModel: "hunyuan-image",
  defaultVideoModel: "hunyuan-video",
  supportsImage: true,
  supportsVideo: true,

  /**
   * Generate image via Hunyuan API
   * Action: TextToImage or TextToImageLite
   */
  async generateImage(params: ImageParams, options: ProviderOptions, signal?: AbortSignal): Promise<ImageResult> {
    const apiBase = options.apiBase || "https://hunyuan.tencentcloudapi.com"

    // Parse API key as "secretId:secretKey"
    const [secretId, secretKey] = options.apiKey.split(":")
    if (!secretId || !secretKey) {
      throw new Error(
        `Hunyuan API key must be in format "secretId:secretKey". ` +
        `Please check your IMAGE_API_KEY configuration.`
      )
    }

    log.info("Hunyuan image generation", { prompt: params.prompt.substring(0, 50) })

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 120000) // 120s for image generation

    if (signal?.aborted) throw new Error('Aborted')
    signal?.addEventListener("abort", () => {
      controller.abort()
      clearTimeout(timeout)
    })

    try {
      const timestamp = Math.floor(Date.now() / 1000)
      const payload = JSON.stringify({
        Prompt: params.prompt,
        RspImgType: "base64", // Return base64 directly
        Style: params.style || "101", // Default style
        Resolution: params.resolution || "1024:1024",
        LogoAdd: params.logoAdd || 0, // No watermark by default
      })

      // Generate TC3 signature
      const { headers } = await generateTC3Signature({
        secretId,
        secretKey,
        endpoint: `${apiBase}/`,
        service: "hunyuan",
        region: "ap-guangzhou",
        action: "TextToImage",
        version: "2023-09-01",
        payload,
        timestamp,
      })

      const response = await fetch(`${apiBase}/`, {
        method: "POST",
        headers,
        body: payload,
        signal: controller.signal,
      })

      clearTimeout(timeout)

      if (!response.ok) {
        const error = await response.text().catch(() => "Unknown error")
        throw new Error(`Hunyuan API error (${response.status}): ${error}`)
      }

      const data = await response.json()

      if (data.Error) {
        throw new Error(`Hunyuan API error: ${data.Error.Message} (${data.Error.Code})`)
      }

      const base64 = data.Response?.ResultImage

      if (!base64) {
        throw new Error("No image data in Hunyuan response")
      }

      log.info("Hunyuan image generation complete", { size: base64.length })
      return { base64, format: "png" }
    } catch (error) {
      clearTimeout(timeout)
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Hunyuan image generation timeout')
      }
      log.error("Hunyuan image generation failed", { error })
      throw error
    }
  },

  /**
   * Generate video via Hunyuan API
   * Action: TextToVideo
   */
  async generateVideo(params: VideoParams, options: ProviderOptions, signal?: AbortSignal): Promise<VideoResult> {
    const apiBase = options.apiBase || "https://hunyuan.tencentcloudapi.com"

    // Parse API key as "secretId:secretKey"
    const [secretId, secretKey] = options.apiKey.split(":")
    if (!secretId || !secretKey) {
      throw new Error(
        `Hunyuan API key must be in format "secretId:secretKey". ` +
        `Please check your VIDEO_API_KEY configuration.`
      )
    }

    log.info("Hunyuan video generation", { prompt: params.prompt.substring(0, 50) })

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 300000) // 5 min for video generation

    if (signal?.aborted) throw new Error('Aborted')
    signal?.addEventListener("abort", () => {
      controller.abort()
      clearTimeout(timeout)
    })

    try {
      const timestamp = Math.floor(Date.now() / 1000)
      const payload = JSON.stringify({
        Prompt: params.prompt,
        Resolution: params.resolution || "1080:1920", // Default portrait video
        VoiceId: params.voiceId || "71000544", // Default voice
      })

      // Generate TC3 signature
      const { headers } = await generateTC3Signature({
        secretId,
        secretKey,
        endpoint: `${apiBase}/`,
        service: "hunyuan",
        region: "ap-guangzhou",
        action: "TextToVideo",
        version: "2023-09-01",
        payload,
        timestamp,
      })

      const response = await fetch(`${apiBase}/`, {
        method: "POST",
        headers,
        body: payload,
        signal: controller.signal,
      })

      clearTimeout(timeout)

      if (!response.ok) {
        const error = await response.text().catch(() => "Unknown error")
        throw new Error(`Hunyuan API error (${response.status}): ${error}`)
      }

      const data = await response.json()

      if (data.Error) {
        throw new Error(`Hunyuan API error: ${data.Error.Message} (${data.Error.Code})`)
      }

      // Hunyuan returns video URL
      const videoUrl = data.Response?.VideoUrl

      if (!videoUrl) {
        throw new Error("No video URL in Hunyuan response")
      }

      log.info("Hunyuan returned video URL", { videoUrl })

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

        log.info("Hunyuan video generation complete", { size: base64.length })
        return { base64, format: "mp4" }
      } finally {
        clearTimeout(downloadTimeout)
      }
    } catch (error) {
      clearTimeout(timeout)
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Hunyuan video generation timeout')
      }
      log.error("Hunyuan video generation failed", { error })
      throw error
    }
  },
}
