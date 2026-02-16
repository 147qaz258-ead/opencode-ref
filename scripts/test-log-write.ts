import { Log } from "../packages/opencode/src/util/log"
import { Global } from "../packages/opencode/src/global"

async function test() {
  await Log.init({
    print: false,
    dev: true,
    level: "DEBUG",
  })

  console.log("Log file:", Log.file())

  const log = Log.create({ service: "test" })
  log.info("Test message 1")
  log.debug("Test message 2")
  log.warn("Test message 3")

  // Give it time to flush
  await new Promise(r => setTimeout(r, 500))

  const fs = await import("fs/promises")
  if (Log.file()) {
    const content = await fs.readFile(Log.file(), "utf-8")
    console.log("\n--- Log file content ---")
    console.log(content)
    console.log("--- End of log file ---")
  } else {
    console.error("Log file path is empty!")
  }
}

test().catch(console.error)
