/**
 * Check session data structure
 * Run with: bun run scripts/check-sessions.ts
 */

import { Instance } from "../packages/opencode/src/project/instance"
import { InstanceBootstrap } from "../packages/opencode/src/project/bootstrap"
import { Session } from "../packages/opencode/src/session"

async function main() {
  console.log("=== Checking Session Data Structure ===\n")

  await Instance.provide({
    directory: process.cwd(),
    init: InstanceBootstrap,
    fn: async () => {
      let rootCount = 0
      let childCount = 0
      let sessionsWithUndefinedParentID = 0
      let sessionsWithNullParentID = 0
      let sessionsWithNoParentIDField = 0

      const sessionsList: Array<{
        id: string
        title: string
        hasParentID: boolean
        parentIDValue: any
        parentIDType: string
      }> = []

      for await (const session of Session.list()) {
        const hasParentID = "parentID" in session
        let parentIDType = "undefined"
        let parentIDValue = undefined

        if (hasParentID) {
          parentIDValue = session.parentID
          if (session.parentID === null) {
            parentIDType = "null"
          } else if (session.parentID === undefined) {
            parentIDType = "undefined"
          } else {
            parentIDType = "string"
          }
        }

        sessionsList.push({
          id: session.id,
          title: session.title,
          hasParentID,
          parentIDValue,
          parentIDType,
        })

        // Count statistics
        if (session.parentID) {
          childCount++
        } else {
          rootCount++
        }

        if (!hasParentID) {
          sessionsWithNoParentIDField++
        } else if (session.parentID === null) {
          sessionsWithNullParentID++
        } else if (session.parentID === undefined) {
          sessionsWithUndefinedParentID++
        }
      }

      // Print statistics
      console.log("### Statistics ###")
      console.log(`Total sessions: ${rootCount + childCount}`)
      console.log(`Root sessions (no parentID): ${rootCount}`)
      console.log(`Child sessions (has parentID): ${childCount}`)
      console.log()
      console.log(`Sessions without parentID field: ${sessionsWithNoParentIDField}`)
      console.log(`Sessions with parentID=null: ${sessionsWithNullParentID}`)
      console.log(`Sessions with parentID=undefined: ${sessionsWithUndefinedParentID}`)
      console.log()

      // Print all sessions
      console.log("### All Sessions ###")
      for (const session of sessionsList) {
        const isChild = session.parentIDType === "string"
        const icon = isChild ? "├──" : "│"
        console.log(`${icon} ${session.id.slice(-8)}... | ${session.title.substring(0, 30)}`)
        console.log(`   parentID: ${session.parentIDType} ${session.parentIDValue ?? ""}`)
      }

      // Test filter logic
      console.log("\n### Testing Filter Logic ###")

      // Old filter: !s.parentID
      const oldFilterResult = sessionsList.filter((s) => {
        // Simulating the old filter on actual session data
        const session = sessionsList.find((x) => x.id === s.id)
        // For sessions without parentID field, accessing s.parentID returns undefined
        // !undefined = true (included)
        // !null = true (included)
        // !"string" = false (excluded)
        return s.parentIDType !== "string"
      })

      console.log(`Old filter (!s.parentID): ${oldFilterResult.length} sessions`)
      for (const s of oldFilterResult) {
        console.log(`  - ${s.id.slice(-8)}... (${s.parentIDType})`)
      }

      // New filter: s.parentID === undefined
      const newFilterResult = sessionsList.filter((s) => s.parentIDType === "undefined")

      console.log(`\nNew filter (s.parentID === undefined): ${newFilterResult.length} sessions`)
      for (const s of newFilterResult) {
        console.log(`  - ${s.id.slice(-8)}... (${s.parentIDType})`)
      }

      // Difference
      console.log("\n### Difference ###")
      const difference = oldFilterResult.length - newFilterResult.length
      if (difference > 0) {
        console.log(`⚠️  ${difference} session(s) will be hidden by new filter!`)
        for (const s of oldFilterResult) {
          if (s.parentIDType !== "undefined") {
            console.log(`  - ${s.id.slice(-8)}... | ${s.title.substring(0, 30)} (${s.parentIDType})`)
          }
        }
      } else {
        console.log("✅ No difference - filters behave the same")
      }
    },
  })
}

main().catch((error) => {
  console.error("Error:", error)
  process.exit(1)
})
