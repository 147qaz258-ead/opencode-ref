/**
 * Test script for session migrations
 * Run with: bun run scripts/test-migrations.ts
 */

import { Instance } from "../packages/opencode/src/project/instance"
import { InstanceBootstrap } from "../packages/opencode/src/project/bootstrap"
import { Session } from "../packages/opencode/src/session"
import { migrateSessionParentIDs, migrateSessionSandboxIds } from "../packages/opencode/src/storage/migrate"

async function main() {
  console.log("=== Session Migration Test ===\n")

  // Bootstrap the project instance
  await Instance.provide({
    directory: process.cwd(),
    init: InstanceBootstrap,
    fn: async () => {
      // 1. List current sessions
      console.log("1. Current Sessions:")
      let totalSessions = 0
      let withSandboxId = 0
      let withoutSandboxId = 0
      let withParentID = 0

      for await (const session of Session.list()) {
        totalSessions++
        if (session.sandboxId) {
          withSandboxId++
        } else {
          withoutSandboxId++
        }
        if (session.parentID) {
          withParentID++
        }
      }

      console.log(`   Total sessions: ${totalSessions}`)
      console.log(`   With sandboxId: ${withSandboxId}`)
      console.log(`   Without sandboxId: ${withoutSandboxId}`)
      console.log(`   With parentID (child sessions): ${withParentID}`)

      // 2. Run migrations
      console.log("\n2. Running migrations...")

      console.log("\n   a) Migrating parentID fields...")
      await migrateSessionParentIDs()

      console.log("\n   b) Migrating sandboxId bindings...")
      await migrateSessionSandboxIds()

      // 3. Verify results
      console.log("\n3. After migration:")
      let afterWithSandboxId = 0
      let afterWithoutSandboxId = 0
      let afterWithParentID = 0

      for await (const session of Session.list()) {
        if (session.sandboxId) {
          afterWithSandboxId++
        } else {
          afterWithoutSandboxId++
        }
        if (session.parentID) {
          afterWithParentID++
        }
      }

      console.log(`   With sandboxId: ${afterWithSandboxId}`)
      console.log(`   Without sandboxId: ${afterWithoutSandboxId}`)
      console.log(`   With parentID: ${afterWithParentID}`)

      console.log("\n=== Migration Test Complete ===")
    },
  })
}

main().catch((error) => {
  console.error("Error:", error)
  process.exit(1)
})
