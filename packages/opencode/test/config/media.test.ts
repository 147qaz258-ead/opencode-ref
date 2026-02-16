// packages/opencode/test/config/media.test.ts
import { describe, test, expect, beforeAll } from "bun:test"
import { getImageConfig, getVideoConfig } from "../../src/config/media"

describe("config.media", () => {
  const originalEnv = process.env

  beforeAll(() => {
    // Set test API keys
    process.env.IMAGE_API_KEY = "test_image_key"
    process.env.VIDEO_API_KEY = "test_video_key"
  })

  test("getImageConfig returns default provider when not specified", () => {
    delete process.env.IMAGE_PROVIDER
    const config = getImageConfig()
    expect(config.provider).toBe("zhipu")
    expect(config.apiKey).toBe("test_image_key")
  })

  test("getImageConfig returns custom provider when specified", () => {
    process.env.IMAGE_PROVIDER = "custom"
    const config = getImageConfig()
    expect(config.provider).toBe("custom")
  })

  test("getImageConfig throws when API key is missing", () => {
    delete process.env.IMAGE_API_KEY
    expect(() => getImageConfig()).toThrow("IMAGE_API_KEY not configured")
    // Restore for other tests
    process.env.IMAGE_API_KEY = "test_image_key"
  })

  test("getVideoConfig returns default provider when not specified", () => {
    delete process.env.VIDEO_PROVIDER
    const config = getVideoConfig()
    expect(config.provider).toBe("zhipu")
    expect(config.apiKey).toBe("test_video_key")
  })

  test("getVideoConfig returns custom provider when specified", () => {
    process.env.VIDEO_PROVIDER = "custom"
    const config = getVideoConfig()
    expect(config.provider).toBe("custom")
  })

  test("getVideoConfig throws when API key is missing", () => {
    delete process.env.VIDEO_API_KEY
    expect(() => getVideoConfig()).toThrow("VIDEO_API_KEY not configured")
    // Restore for other tests
    process.env.VIDEO_API_KEY = "test_video_key"
  })
})
