
import { getVideoConfig } from "../packages/opencode/src/config/media"
import { getMediaProvider } from "../packages/opencode/src/media/providers"
import { Log } from "../packages/opencode/src/util/log"
import fs from "fs-extra"
import path from "path"

async function test() {
  await Log.init({ print: true, dev: true, level: "INFO" })
  const log = Log.create({ service: "check-media-diag" })

  log.info("Starting diagnostic video provider check")

  // Fallback to known working model
  const KNOWN_MODEL = "Lightricks/LTX-Video"
  const TARGET_MODEL = "Wan-AI/Wan2.1-T2V-1.3B"

  try {
    const videoConfig = getVideoConfig()
    const videoProvider = getMediaProvider(videoConfig.provider, "video")
    
    // 1. Try User Model
    try {
        log.info(`Attempting generation with User Model: ${TARGET_MODEL}`)
        await videoProvider.generateVideo!({
            prompt: "A cat flying in space",
            model: TARGET_MODEL,
        }, {
            apiKey: videoConfig.apiKey,
            apiBase: videoConfig.apiBase,
        })
        log.info("User Model SUCCESS")
    } catch (e) {
        log.error("User Model FAILED", e)
    }

    // 2. Try Known Model
    try {
        log.info(`Attempting generation with Known Model: ${KNOWN_MODEL}`)
         await videoProvider.generateVideo!({
            prompt: "A cat flying in space",
            model: KNOWN_MODEL,
        }, {
            apiKey: videoConfig.apiKey,
            apiBase: videoConfig.apiBase,
        })
         log.info("Known Model SUCCESS")
    } catch (e) {
        log.error("Known Model FAILED", e)
    }

  } catch (error) {
    log.error("Setup failed:", error)
  }
}

test().catch(console.error)
