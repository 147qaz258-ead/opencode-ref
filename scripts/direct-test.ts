/**
 * Direct test of logging and Docker
 */
import { Log } from "../packages/opencode/src/util/log"
import { Global } from "../packages/opencode/src/global"
import { Config } from "../packages/opencode/src/config/config"
import { Instance } from "../packages/opencode/src/project/instance"
import { InstanceBootstrap } from "../packages/opencode/src/project/bootstrap"

async function test() {
  console.log("=== Starting Direct Test ===\n")

  // 1. Test Global.Path.log
  console.log("1. Global.Path.log:", Global.Path.log)

  // 2. Test log initialization
  console.log("\n2. Initializing log system...")
  await Log.init({
    print: true,  // Print to console to see it immediately
    dev: true,
    level: "DEBUG",
  })
  console.log("Log initialized, file path:", Log.file())

  const log = Log.create({ service: "test" })
  log.info("This is a test log message")
  log.debug("Debug message")
  log.warn("Warning message")

  // 3. Test Config loading
  console.log("\n3. Testing Config loading...")
  try {
    await Instance.provide({
      directory: process.cwd(),
      init: InstanceBootstrap,
      fn: async () => {
        const cfg = await Config.get()
        console.log("Config loaded:")
        console.log("  experimental.docker.enabled:", cfg.experimental?.docker?.enabled ?? false)
        console.log("  experimental.docker.image:", cfg.experimental?.docker?.image)
        console.log("  experimental.docker.autoStart:", cfg.experimental?.docker?.autoStart)

        // 4. Test Docker check
        console.log("\n4. Testing Docker check...")
        const { isDockerEnabled } = await import("../packages/opencode/src/session/docker.ts")
        const enabled = await isDockerEnabled()
        console.log("  Docker enabled:", enabled)

        // 5. Test log file
        console.log("\n5. Checking log file...")
        const fs = await import("fs/promises")
        const logFiles = await fs.readdir(Global.Path.log).catch(() => [])
        console.log("  Log files:", logFiles)

        const logPath = Log.file()
        if (logPath) {
          const content = await fs.readFile(logPath, "utf-8").catch(() => "")
          console.log("  Log file content preview:", content.substring(0, 200))
        }
      },
    })
  } catch (error) {
    console.error("Error during test:", error)
  }

  console.log("\n=== Test Complete ===")
}

test().catch((err) => {
  console.error("Test failed:", err)
  process.exit(1)
})
