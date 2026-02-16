import { Config } from "../packages/opencode/src/config/config"
import { Instance } from "../packages/opencode/src/project/instance"
import { InstanceBootstrap } from "../packages/opencode/src/project/bootstrap"
import { Log } from "../packages/opencode/src/util/log"
import { isDockerEnabled } from "../packages/opencode/src/session/docker"
import { getUserContainerManager } from "../packages/opencode/src/container/user-lifecycle"

async function test() {
  // Initialize logging first
  await Log.init({
    print: false,
    dev: true,
    level: "DEBUG",
  })

  console.log("Log file:", Log.file())

  const log = Log.create({ service: "test" })
  log.info("Starting Docker configuration test")

  await Instance.provide({
    directory: process.cwd(),
    init: InstanceBootstrap,
    fn: async () => {
      // Check config
      const cfg = await Config.get()
      console.log("\n=== Configuration ===")
      console.log("docker.enabled:", cfg.experimental?.docker?.enabled ?? false)
      console.log("docker.image:", cfg.experimental?.docker?.image)
      console.log("docker.autoStart:", cfg.experimental?.docker?.autoStart)

      log.info("Docker configuration loaded", {
        enabled: cfg.experimental?.docker?.enabled,
        image: cfg.experimental?.docker?.image,
      })

      // Check Docker availability
      console.log("\n=== Docker Status ===")
      const enabled = await isDockerEnabled()
      console.log("Docker enabled:", enabled)

      // Check user containers
      console.log("\n=== User Containers ===")
      const manager = getUserContainerManager()
      const containers = manager.getAllContainers()
      console.log("Container count:", containers.length)

      log.info("Docker test complete", { containerCount: containers.length })
    },
  })

  // Give logs time to flush
  await new Promise(r => setTimeout(r, 500))

  console.log("\n=== Test Complete ===")
  console.log("Check log file for details:", Log.file())
}

test().catch((err) => {
  console.error("Test failed:", err)
  process.exit(1)
})
