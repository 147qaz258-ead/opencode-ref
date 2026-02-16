import { getEnv } from "./env-loader"

export interface MediaConfig {
  provider: string
  apiKey: string
  apiBase?: string
  model?: string  // Optional model override
}

// Default API bases for each provider
const DEFAULT_API_BASES = {
  zhipu: "https://open.bigmodel.cn",
  modelscope: "https://api-inference.modelscope.cn",
  hunyuan: "https://hunyuan.tencentcloudapi.com",
  tongyi: "https://dashscope.aliyuncs.com",
  siliconcloud: "https://api.siliconflow.cn",
  huggingface: "https://router.huggingface.co/hf-inference",
} as const

// Default models for each provider (fallback when not configured)
const DEFAULT_IMAGE_MODELS = {
  zhipu: "cogview-3",
  modelscope: "qwen/Qwen-Image",
  hunyuan: "hunyuan-image",
  huggingface: "stabilityai/stable-diffusion-3-medium",
} as const

const DEFAULT_VIDEO_MODELS = {
  zhipu: "cogvideox",
  hunyuan: "hunyuan-video",
  tongyi: "wanx-v2",
  siliconcloud: "Lightricks/LTX-Video",
  huggingface: "Lightricks/LTX-Video",
} as const

export function getImageConfig(): MediaConfig {
  const provider = getEnv("IMAGE_PROVIDER") || "zhipu"
  const apiKey = getEnv("IMAGE_API_KEY")

  if (!apiKey) {
    throw new Error(
      `IMAGE_API_KEY not configured. ` +
      `Please set IMAGE_API_KEY in your .env file.`
    )
  }

  // Get model from env or use provider default
  const model = getEnv("IMAGE_MODEL") || DEFAULT_IMAGE_MODELS[provider as keyof typeof DEFAULT_IMAGE_MODELS]

  return {
    provider,
    apiKey,
    model,
    apiBase: getEnv("IMAGE_API_BASE") || DEFAULT_API_BASES[provider as keyof typeof DEFAULT_API_BASES],
  }
}

export function getVideoConfig(): MediaConfig {
  const provider = getEnv("VIDEO_PROVIDER") || "zhipu"
  const apiKey = getEnv("VIDEO_API_KEY")

  if (!apiKey) {
    throw new Error(
      `VIDEO_API_KEY not configured. ` +
      `Please set VIDEO_API_KEY in your .env file.`
    )
  }

  // Get model from env or use provider default
  const model = getEnv("VIDEO_MODEL") || DEFAULT_VIDEO_MODELS[provider as keyof typeof DEFAULT_VIDEO_MODELS]

  return {
    provider,
    apiKey,
    model,
    apiBase: getEnv("VIDEO_API_BASE") || DEFAULT_API_BASES[provider as keyof typeof DEFAULT_API_BASES],
  }
}
