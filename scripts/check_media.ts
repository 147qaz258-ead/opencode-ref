

// Clear proxy environment variables to force direct connection
delete process.env.HTTP_PROXY;
delete process.env.HTTPS_PROXY;
delete process.env.http_proxy;
delete process.env.https_proxy;

import { getImageConfig, getVideoConfig } from "../packages/opencode/src/config/media"
import { getMediaProvider } from "../packages/opencode/src/media/providers"
import { Log } from "../packages/opencode/src/util/log"
import fs from "fs-extra"
import path from "path"

async function test() {
  await Log.init({ print: true, dev: true, level: "INFO" })
  const log = Log.create({ service: "check-media" })

  const outputDir = path.join(process.cwd(), "scripts", "test_output")
  await fs.ensureDir(outputDir)

  log.info("Starting media provider check")

  // 1. Test Image Configuration
  try {
    const imageConfig = getImageConfig()
    log.info("Image Config:", { provider: imageConfig.provider, model: imageConfig.model })
    
    if (imageConfig.provider !== "modelscope") {
      log.warn(`Expected provider 'modelscope', but got '${imageConfig.provider}'. Please check .env loading.`)
    }

    const imageProvider = getMediaProvider(imageConfig.provider, "image")
    log.info("Image Provider loaded:", imageProvider.name)

    log.info("Generating test image...")
    const imageResult = await imageProvider.generateImage!({
      prompt: "A futuristic city with flying cars, cyberpunk style",
      model: imageConfig.model,
    }, {
      apiKey: imageConfig.apiKey,
      apiBase: imageConfig.apiBase,
    })

    log.info("Image generation successful", { format: imageResult.format })
    const imagePath = path.join(outputDir, `test_image.${imageResult.format}`)
    await fs.writeFile(imagePath, Buffer.from(imageResult.base64, "base64"))
    log.info(`Saved image to ${imagePath}`)

  } catch (error) {
    log.error("Image generation failed:", error)
  }

  // 2. Test Video Configuration
  try {
    const videoConfig = getVideoConfig()
    log.info("Video Config:", { provider: videoConfig.provider, model: videoConfig.model })

    if (videoConfig.provider !== "huggingface") {
      log.warn(`Expected provider 'huggingface', but got '${videoConfig.provider}'. Please check .env loading.`)
    }

    const videoProvider = getMediaProvider(videoConfig.provider, "video")
    log.info("Video Provider loaded:", videoProvider.name)

    log.info("Generating test video (this may take a while)...")
    const videoResult = await videoProvider.generateVideo!({
      prompt: "A cat flying in space, 4k resolution",
      model: videoConfig.model,
    }, {
      apiKey: videoConfig.apiKey,
      apiBase: videoConfig.apiBase,
    })

    log.info("Video generation successful", { format: videoResult.format })
    const videoPath = path.join(outputDir, `test_video.${videoResult.format}`)
    await fs.writeFile(videoPath, Buffer.from(videoResult.base64, "base64"))
    log.info(`Saved video to ${videoPath}`)

  } catch (error) {
    log.error("Video generation failed:", error)
  }
}

test().catch(console.error)
