import { Log } from "../packages/opencode/src/util/log"
import { Server } from "../packages/opencode/src/server/server"
import { Instance } from "../packages/opencode/src/project/instance"
import { InstanceBootstrap } from "../packages/opencode/src/project/bootstrap"

async function test() {
  console.log("=== Testing Server Log Initialization ===\n")

  // First, initialize Instance (required for Config)
  await Instance.provide({
    directory: process.cwd(),
    init: InstanceBootstrap,
    fn: async () => {
      // Simulate what Server.listen() does
      console.log("1. Calling Log.init() like Server.listen() does...")

      // This is exactly what Server.listen() does
      Log.init({
        print: false,
        dev: true,
        level: "DEBUG",
      }).catch((err) => {
        console.error("Failed to initialize logging:", err)
      })

      console.log("2. Log.init() called (not awaited)")
      console.log("   Log.file():", Log.file())

      // Immediately try to log (simulates what happens during server startup)
      const log = Log.create({ service: "server-test" })
      log.info("This is a test log from server startup")
      log.debug("Debug message")
      log.warn("Warning message")

      console.log("3. Logs written")

      // Wait a bit for flush
      await new Promise(r => setTimeout(r, 500))

      // Read log file
      const fs = await import("fs/promises")
      const logPath = Log.file()
      if (logPath) {
        const content = await fs.readFile(logPath, "utf-8")
        console.log("\n4. Log file content:")
        console.log("---")
        console.log(content)
        console.log("---")
      } else {
        console.error("\n4. ERROR: Log file path is empty!")
      }
    },
  })

  console.log("\n=== Test Complete ===")
}

test().catch((err) => {
  console.error("Test failed:", err)
  process.exit(1)
})
