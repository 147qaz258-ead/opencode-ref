import { Log } from "../packages/opencode/src/util/log"
import { Global } from "../packages/opencode/src/global"

async function test() {
  console.log("=== Simple Server Log Test ===\n")

  console.log("1. Calling Log.init() WITHOUT await (like Server.listen)...")

  // This is EXACTLY what Server.listen() does
  Log.init({
    print: false,
    dev: true,
    level: "DEBUG",
  }).catch((err) => {
    console.error("Failed to initialize logging:", err)
  })

  console.log("2. Log.init() returned immediately (not awaited)")
  console.log("   Log.file():", Log.file())

  // Immediately try to log (simulates what happens during server startup)
  const log = Log.create({ service: "server-test" })
  log.info("This is a test log from server startup")
  log.debug("Debug message")
  log.warn("Warning message")

  console.log("3. Logs written")

  // Wait for flush
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

  console.log("\n=== Test Complete ===")
}

test().catch((err) => {
  console.error("Test failed:", err)
  process.exit(1)
})
