/**
 * Quick check for session parentID values
 */
import { Instance } from "../packages/opencode/src/project/instance"
import { InstanceBootstrap } from "../packages/opencode/src/project/bootstrap"
import { Session } from "../packages/opencode/src/session"

async function main() {
  await Instance.provide({
    directory: process.cwd(),
    init: InstanceBootstrap,
    fn: async () => {
      console.log("=== Checking Session parentID Values ===\n")

      for await (const session of Session.list()) {
        const hasParentID = "parentID" in session
        const parentIDValue = session.parentID
        const parentIDType = parentIDValue === undefined ? "undefined"
                          : parentIDValue === null ? "null"
                          : typeof parentIDValue

        // Check if title contains "subagent" to identify child sessions
        const isSubagent = session.title.includes("subagent") || session.title.includes("@")

        console.log(`Session: ${session.id.slice(-8)}...`)
        console.log(`  Title: ${session.title.substring(0, 50)}`)
        console.log(`  Is subagent: ${isSubagent}`)
        console.log(`  parentID: ${parentIDType} = ${parentIDValue ?? "undefined"}`)
        console.log(`  Has parentID field: ${hasParentID}`)
        console.log()
      }
    },
  })
}

main().catch(console.error)
