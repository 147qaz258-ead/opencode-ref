import { Log } from "../util/log"
import { ModelsDev } from "./models"
import { Provider } from "./provider"
import { ProviderTransform } from "./transform"
import { mapValues } from "remeda"

const log = Log.create({ service: "oneapi" })

export interface OneAPIModelsResponse {
  object: string
  data: Array<{
    id: string
    object: string
    created?: number
    owned_by?: string
  }>
}

export interface FetchOneAPIModelsOptions {
  baseURL: string
  apiKey: string
  timeout?: number
}

export interface FetchOneAPIModelsResult {
  models: Record<string, Provider.Model>
  errors: string[]
}

export async function fetchOneAPIModels(
  options: FetchOneAPIModelsOptions
): Promise<FetchOneAPIModelsResult> {
  const { baseURL, apiKey, timeout = 10000 } = options
  const errors: string[] = []
  const models: Record<string, Provider.Model> = {}

  const url = `${baseURL}/v1/models`

  try {
    log.info("Fetching models from one-api", { url })

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    const response = await fetch(url, {
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error("Authentication failed. Please check your ONEAPI_API_KEY.")
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const data: OneAPIModelsResponse = await response.json()
    log.info(`Found ${data.data.length} models from one-api`)

    // Get the existing models database for metadata lookup
    const modelsDev = await ModelsDev.get()

    for (const modelData of data.data) {
      try {
        const model = createOneAPIModel(modelData.id, modelsDev)
        models[modelData.id] = model
        log.debug(`Registered model: ${modelData.id}`)
      } catch (e) {
        const msg = `Failed to create model ${modelData.id}: ${e instanceof Error ? e.message : String(e)}`
        log.warn(msg)
        errors.push(msg)
      }
    }

    log.info(`Successfully registered ${Object.keys(models).length} models`)
    if (errors.length > 0) {
      log.warn(`Encountered ${errors.length} errors while fetching models`)
    }

  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error(`Request timeout: one-api did not respond within ${timeout}ms`)
    }
    throw e
  }

  return { models, errors }
}

// Helper function to convert ModelsDev.Model to Provider.Model
function fromModelsDevModel(provider: ModelsDev.Provider, model: ModelsDev.Model): Provider.Model {
  const m: Provider.Model = {
    id: model.id,
    providerID: provider.id,
    name: model.name,
    family: model.family,
    api: {
      id: model.id,
      url: provider.api!,
      npm: model.provider?.npm ?? provider.npm ?? "@ai-sdk/openai-compatible",
    },
    status: model.status ?? "active",
    headers: model.headers ?? {},
    options: model.options ?? {},
    cost: {
      input: model.cost?.input ?? 0,
      output: model.cost?.output ?? 0,
      cache: {
        read: model.cost?.cache_read ?? 0,
        write: model.cost?.cache_write ?? 0,
      },
      experimentalOver200K: model.cost?.context_over_200k
        ? {
            cache: {
              read: model.cost.context_over_200k.cache_read ?? 0,
              write: model.cost.context_over_200k.cache_write ?? 0,
            },
            input: model.cost.context_over_200k.input,
            output: model.cost.context_over_200k.output,
          }
        : undefined,
    },
    limit: {
      context: model.limit.context,
      output: model.limit.output,
    },
    capabilities: {
      temperature: model.temperature,
      reasoning: model.reasoning,
      attachment: model.attachment,
      toolcall: model.tool_call,
      input: {
        text: model.modalities?.input?.includes("text") ?? false,
        audio: model.modalities?.input?.includes("audio") ?? false,
        image: model.modalities?.input?.includes("image") ?? false,
        video: model.modalities?.input?.includes("video") ?? false,
        pdf: model.modalities?.input?.includes("pdf") ?? false,
      },
      output: {
        text: model.modalities?.output?.includes("text") ?? false,
        audio: model.modalities?.output?.includes("audio") ?? false,
        image: model.modalities?.output?.includes("image") ?? false,
        video: model.modalities?.output?.includes("video") ?? false,
        pdf: model.modalities?.output?.includes("pdf") ?? false,
      },
      interleaved: model.interleaved ?? false,
    },
    release_date: model.release_date,
    variants: {},
  }

  m.variants = mapValues(ProviderTransform.variants(m), (v) => v)

  return m
}

function createOneAPIModel(modelId: string, modelsDev: Record<string, ModelsDev.Provider>): Provider.Model {
  // Try to find matching metadata in existing providers
  for (const [providerID, provider] of Object.entries(modelsDev)) {
    // Direct match
    if (provider.models[modelId]) {
      const sourceModel = provider.models[modelId]
      const converted = fromModelsDevModel(provider, sourceModel)
      return {
        ...converted,
        id: modelId,
        providerID: "oneapi",
        api: {
          ...converted.api,
          url: "", // Will be set by provider options
          id: modelId,
          npm: "@ai-sdk/openai-compatible",
        },
      }
    }
  }

  // Try fuzzy match - extract base model ID
  const baseId = extractBaseModelId(modelId)
  for (const [providerID, provider] of Object.entries(modelsDev)) {
    if (provider.models[baseId]) {
      const sourceModel = provider.models[baseId]
      const converted = fromModelsDevModel(provider, sourceModel)
      return {
        ...converted,
        id: modelId,
        name: modelId,
        providerID: "oneapi",
        api: {
          ...converted.api,
          url: "",
          id: modelId,
          npm: "@ai-sdk/openai-compatible",
        },
      }
    }
  }

  // Use conservative defaults for unknown models
  return createDefaultModel(modelId)
}

function extractBaseModelId(modelId: string): string {
  // Remove version suffixes like -001, -20240101, etc.
  return modelId
    .replace(/-\d{6,}$/, "")    // Remove dates like -20240101
    .replace(/-\d{3}$/, "")      // Remove version like -001
    .replace(/-latest$/, "")     // Remove -latest suffix
}

function createDefaultModel(modelId: string): Provider.Model {
  return {
    id: modelId,
    providerID: "oneapi",
    name: modelId,
    status: "active",
    family: "",
    release_date: new Date().toISOString().split("T")[0],
    api: {
      id: modelId,
      url: "",
      npm: "@ai-sdk/openai-compatible",
    },
    capabilities: {
      temperature: true,
      reasoning: false,
      attachment: false,
      toolcall: true,
      input: {
        text: true,
        audio: false,
        image: false,
        video: false,
        pdf: false,
      },
      output: {
        text: true,
        audio: false,
        image: false,
        video: false,
        pdf: false,
      },
      interleaved: false,
    },
    cost: {
      input: 0,
      output: 0,
      cache: {
        read: 0,
        write: 0,
      },
    },
    limit: {
      context: 128000,
      output: 4096,
    },
    options: {},
    headers: {},
    variants: {},
  }
}
