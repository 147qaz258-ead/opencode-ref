
// Clear proxy environment variables to force direct connection
delete process.env.HTTP_PROXY;
delete process.env.HTTPS_PROXY;
delete process.env.http_proxy;
delete process.env.https_proxy;

import { getVideoConfig } from "../packages/opencode/src/config/media"
import { getMediaProvider } from "../packages/opencode/src/media/providers"
import { Log } from "../packages/opencode/src/util/log"
import fs from "fs"
import path from "path"

const log = Log.create({ service: "check-video" })

async function main() {
  log.info("Starting video check...")
  try {
    const videoConfig = getVideoConfig()
    log.info("Video Config:", { provider: videoConfig.provider, model: videoConfig.model })

    const videoProvider = getMediaProvider(videoConfig.provider, "video")
    log.info("Video Provider loaded:", videoProvider.name)

    log.info("Generating test video...")
    const videoResult = await videoProvider.generateVideo!({
      prompt: "A cat flying in space, 4k resolution",
      model: videoConfig.model,
    }, {
      apiKey: videoConfig.apiKey,
      apiBase: videoConfig.apiBase,
    })

    log.info("Video generation successful", { format: videoResult.format })
    
    // Save video
    const outputDir = path.join(process.cwd(), "scripts", "test_output")
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true })
    }
    
    const outputPath = path.join(outputDir, `test_video_${Date.now()}.${videoResult.format}`)
    fs.writeFileSync(outputPath, Buffer.from(videoResult.base64, "base64"))
    log.info(`Video saved to: ${outputPath}`)

  } catch (error) {
    log.error("Video generation failed:", error)
  }
}

main()
