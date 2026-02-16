// packages/opencode/src/media/providers/index.ts
import type { MediaProvider } from "../types"
import { ZhipuProvider } from "./zhipu"
import { ModelScopeProvider } from "./modelscope"
import { HunyuanProvider } from "./hunyuan"
import { TongyiProvider } from "./tongyi"
import { SiliconCloudProvider } from "./siliconcloud"
import { HuggingFaceProvider } from "./huggingface"

// Provider registry - add new providers here
const providers: Record<string, MediaProvider> = {
  zhipu: ZhipuProvider,
  modelscope: ModelScopeProvider,
  hunyuan: HunyuanProvider,
  tongyi: TongyiProvider,
  siliconcloud: SiliconCloudProvider,
  huggingface: HuggingFaceProvider,
  // Add more providers here:
  // openai: OpenAIProvider,
  // stability: StabilityProvider,
  // replicate: ReplicateProvider,
}

export function getMediaProvider(
  providerId: string,
  mediaType: "image" | "video"
): MediaProvider {
  const provider = providers[providerId]

  if (!provider) {
    const available = Object.keys(providers).join(", ")
    throw new Error(
      `Unknown media provider: ${providerId}. ` +
      `Available providers: ${available}`
    )
  }

  if (mediaType === "image" && !provider.supportsImage) {
    throw new Error(`Provider ${providerId} does not support image generation`)
  }

  if (mediaType === "video" && !provider.supportsVideo) {
    throw new Error(`Provider ${providerId} does not support video generation`)
  }

  return provider
}

export function discoverProviders(): Array<{
  id: string
  name: string
  supportsImage: boolean
  supportsVideo: boolean
}> {
  return Object.values(providers).map(p => ({
    id: p.id,
    name: p.name,
    supportsImage: p.supportsImage,
    supportsVideo: p.supportsVideo,
  }))
}
