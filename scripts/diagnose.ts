/**
 * Quick diagnostic script
 */
import { Config } from "../packages/opencode/src/config/config"
import { Instance } from "../packages/opencode/src/project/instance"
import { InstanceBootstrap } from "../packages/opencode/src/project/bootstrap"
import { Session } from "../packages/opencode/src/session"
import { isDockerEnabled } from "../packages/opencode/src/session/docker"
import { getUserContainerManager } from "../packages/opencode/src/container/user-lifecycle"

async function main() {
  await Instance.provide({
    directory: process.cwd(),
    init: InstanceBootstrap,
    fn: async () => {
      console.log("=== OpenCode Diagnostic ===\n")

      // 1. Check Docker config
      console.log("1. Docker Configuration:")
      const cfg = await Config.get()
      const dockerEnabled = cfg.experimental?.docker?.enabled ?? false
      const dockerImage = cfg.experimental?.docker?.image
      const dockerAutoStart = cfg.experimental?.docker?.autoStart
      console.log(`   enabled: ${dockerEnabled}`)
      console.log(`   image: ${dockerImage}`)
      console.log(`   autoStart: ${dockerAutoStart}`)

      // 2. Check Docker availability
      console.log("\n2. Docker Status:")
      const isAvailable = await isDockerEnabled()
      console.log(`   isAvailable: ${isAvailable}`)

      // 3. Check containers
      console.log("\n3. User Containers:")
      const manager = getUserContainerManager()
      const containers = manager.getAllContainers()
      console.log(`   count: ${containers.length}`)
      for (const c of containers) {
        console.log(`   - userId: ${c.userId}, containerId: ${c.containerId}, status: ${c.status}`)
      }

      // 4. Check sessions
      console.log("\n4. Sessions (last 5):")
      let count = 0
      for await (const session of Session.list()) {
        if (count++ >= 5) break
        const hasParentID = "parentID" in session
        const parentID = session.parentID
        const hasSandboxId = "sandboxId" in session
        const sandboxId = session.sandboxId
        const isSubagent = session.title.includes("subagent") || session.title.includes("@")

        console.log(`   ${session.id.slice(-8)}... | ${session.title.substring(0, 40)}`)
        console.log(`      isSubagent: ${isSubagent}`)
        console.log(`      parentID: ${hasParentID ? (parentID ?? "null") : "NO FIELD"}`)
        console.log(`      sandboxId: ${hasSandboxId ? sandboxId : "NO FIELD"}`)
        console.log()
      }

      // 5. Test filter
      console.log("5. Filter Test:")
      const allSessions = []
      for await (const s of Session.list()) {
        allSessions.push(s)
        if (allSessions.length >= 10) break
      }

      const oldFilter = allSessions.filter(s => !s.parentID)
      const newFilter = allSessions.filter(s => s.parentID === undefined)

      console.log(`   Old filter (!s.parentID): ${oldFilter.length} sessions`)
      console.log(`   New filter (=== undefined): ${newFilter.length} sessions`)

      const difference = oldFilter.length - newFilter.length
      if (difference > 0) {
        console.log(`   ⚠️  ${difference} session(s) would be hidden by new filter:`)
        for (const s of oldFilter) {
          if (s.parentID !== undefined) {
            const isSubagent = s.title.includes("subagent")
            console.log(`      - ${s.id.slice(-8)}... | ${s.title.substring(0, 40)} ${isSubagent ? "[SUBAGENT]" : ""}`)
          }
        }
      }

      console.log("\n=== Diagnostic Complete ===")
    },
  })
}

main().catch(console.error)
