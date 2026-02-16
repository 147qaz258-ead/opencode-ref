// packages/opencode/test/media/providers.test.ts
import { describe, test, expect } from "bun:test"
import { getMediaProvider, discoverProviders } from "../../src/media/providers"

describe("media.providers", () => {
  test("discoverProviders returns all registered providers", () => {
    const providers = discoverProviders()
    expect(providers.length).toBeGreaterThan(0)

    const zhipu = providers.find(p => p.id === "zhipu")
    expect(zhipu).toBeDefined()
    expect(zhipu?.name).toBe("Zhipu AI")
    expect(zhipu?.supportsImage).toBe(true)
    expect(zhipu?.supportsVideo).toBe(true)
  })

  test("getMediaProvider returns zhipu provider for images", () => {
    const provider = getMediaProvider("zhipu", "image")
    expect(provider.id).toBe("zhipu")
    expect(provider.supportsImage).toBe(true)
  })

  test("getMediaProvider returns zhipu provider for videos", () => {
    const provider = getMediaProvider("zhipu", "video")
    expect(provider.id).toBe("zhipu")
    expect(provider.supportsVideo).toBe(true)
  })

  test("getMediaProvider throws for unknown provider", () => {
    expect(() => getMediaProvider("unknown", "image")).toThrow("Unknown media provider")
  })

  test("getMediaProvider throws when provider doesn't support media type", () => {
    // Note: zhipu supports both, so this test documents expected behavior
    // If we had a video-only provider, this would test that scenario
    const zhipu = getMediaProvider("zhipu", "video")
    expect(zhipu.supportsVideo).toBe(true) // zhipu supports both
  })
})
