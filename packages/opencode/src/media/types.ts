// packages/opencode/src/media/types.ts
export interface ImageParams {
  prompt: string
  model?: string
  [key: string]: any // Provider-specific parameters
}

export interface VideoParams {
  prompt: string
  model?: string
  [key: string]: any // Provider-specific parameters
}

export interface ProviderOptions {
  apiKey: string
  apiBase?: string
}

export interface ImageResult {
  base64: string
  format: "png" | "jpg" | "webp"
  width?: number
  height?: number
}

export interface VideoResult {
  base64: string
  format: "mp4" | "webm"
  duration?: number
  width?: number
  height?: number
}

export interface MediaProvider {
  readonly id: string
  readonly name: string

  // Default models (optional for video-only or image-only providers)
  readonly defaultImageModel?: string
  readonly defaultVideoModel?: string

  // Capabilities
  readonly supportsImage: boolean
  readonly supportsVideo: boolean

  // Methods
  generateImage?(params: ImageParams, options: ProviderOptions, signal?: AbortSignal): Promise<ImageResult>
  generateVideo?(params: VideoParams, options: ProviderOptions, signal?: AbortSignal): Promise<VideoResult>
}
