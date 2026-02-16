import { Log } from "../packages/opencode/src/util/log"
import { Global } from "../packages/opencode/src/global"

async function test() {
  // Initialize logging
  await Log.init({
    print: false,
    dev: true,
    level: "DEBUG",
  })

  console.log("=== Simple Docker Test ===")
  console.log("Log file:", Log.file())

  const log = Log.create({ service: "test" })
  log.info("Test started")

  // Test Docker manager directly
  const { getDockerManager } = await import("../packages/opencode/src/docker/docker-manager.ts")
  const docker = getDockerManager()

  log.info("Checking Docker availability...")
  const available = await docker.isAvailable()
  console.log("Docker available:", available)

  log.info("Docker availability check", { available })

  if (available) {
    log.info("Docker is available, attempting to list sessions...")
    const sessions = await docker.listSessions()
    console.log("Docker sessions:", sessions.length)

    for (const s of sessions) {
      console.log(` - ${s.sessionId}: ${s.containerId} (${s.status})`)
    }
  }

  // Flush logs
  await new Promise(r => setTimeout(r, 500))

  console.log("\n=== Test Complete ===")
  console.log("Check log file:", Log.file())
}

test().catch((err) => {
  console.error("Test failed:", err)
  process.exit(1)
})
