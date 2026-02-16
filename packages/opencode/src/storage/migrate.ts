/**
 * Data Migration Tools
 *
 * Migrates data from file-based JSON storage to database storage.
 * Provides tools to export, import, and verify data migration.
 */

import path from "path"
import { Log } from "@/util/log"
import fs from "fs/promises"
import { existsSync } from "fs"
import { Global } from "@/global"
import { DatabaseStorage, getDatabaseStorage, initializeSchema } from "./database"

const log = Log.create({ service: "storage.migrate" })

/**
 * Migration statistics
 */
export interface MigrationStats {
  /** Number of sessions migrated */
  sessions: number
  /** Number of messages migrated */
  messages: number
  /** Number of parts migrated */
  parts: number
  /** Number of projects migrated */
  projects: number
  /** Number of errors */
  errors: number
  /** Number of warnings */
  warnings: number
}

/**
 * Migration progress callback
 */
export type MigrationProgress = (stats: MigrationStats, message: string) => void

/**
 * Find all JSON storage files
 */
async function findJsonFiles(baseDir: string): Promise<string[]> {
  const files: string[] = []

  const storageDir = path.join(baseDir, "storage")
  if (!existsSync(storageDir)) {
    return files
  }

  async function scanDir(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)

      if (entry.isDirectory()) {
        await scanDir(fullPath)
      } else if (entry.isFile() && entry.name.endsWith(".json")) {
        files.push(fullPath)
      }
    }
  }

  await scanDir(storageDir)
  return files
}

/**
 * Read JSON file
 */
async function readJsonFile(filePath: string): Promise<any> {
  const content = await fs.readFile(filePath, "utf-8")
  return JSON.parse(content)
}

/**
 * Parse storage key from file path
 *
 * Example: ~/.opencode/storage/session/project-123/session-456.json
 * -> ["session", "project-123", "session-456"]
 */
function parseStorageKey(filePath: string, baseDir: string): string[] {
  const relativePath = path.relative(baseDir, filePath)
  const parts = relativePath.split(path.sep)

  // Remove "storage" prefix and ".json" extension
  const keyParts = parts.slice(1) // Remove "storage"
  keyParts[keyParts.length - 1] = keyParts[keyParts.length - 1].replace(/\.json$/, "")

  return keyParts
}

/**
 * Migrate data from JSON files to database
 */
export async function migrateFromJson(
  options: {
    /** Source directory (defaults to ~/.opencode/) */
    sourceDir?: string
    /** Progress callback */
    onProgress?: MigrationProgress
    /** Dry run - don't actually write to database */
    dryRun?: boolean
  } = {}
): Promise<MigrationStats> {
  const sourceDir = options.sourceDir ?? Global.Path.config
  const stats: MigrationStats = {
    sessions: 0,
    messages: 0,
    parts: 0,
    projects: 0,
    errors: 0,
    warnings: 0,
  }

  log.info("Starting JSON to database migration", { sourceDir })

  try {
    // Find all JSON files
    const jsonFiles = await findJsonFiles(sourceDir)
    log.info("Found JSON files", { count: jsonFiles.length })

    if (jsonFiles.length === 0) {
      options.onProgress?.(stats, "No JSON files found to migrate")
      return stats
    }

    // Get database storage
    const db = getDatabaseStorage()
    if (!options.dryRun) {
      await db.initialize()
    }

    // Migrate each file
    for (const filePath of jsonFiles) {
      try {
        // Read JSON file
        const data = await readJsonFile(filePath)
        const key = parseStorageKey(filePath, sourceDir)

        // Update stats based on data type
        const [table] = key
        if (table === "session") {
          stats.sessions++
          options.onProgress?.(stats, `Migrating session: ${key[key.length - 1]}`)
        } else if (table === "message") {
          stats.messages++
        } else if (table === "part") {
          stats.parts++
        } else if (table === "project") {
          stats.projects++
        }

        // Write to database (unless dry run)
        if (!options.dryRun) {
          await db.write(key, data)
        }

        log.debug("Migrated file", { key, filePath })
      } catch (error) {
        stats.errors++
        log.error("Failed to migrate file", { error, filePath })
      }
    }

    log.info("Migration complete", { stats })
    options.onProgress?.(stats, "Migration complete")

    return stats
  } catch (error) {
    log.error("Migration failed", { error, sourceDir })
    stats.errors++
    throw error
  }
}

/**
 * Export database to JSON files
 */
export async function exportToJson(
  targetDir: string,
  options: {
    /** Progress callback */
    onProgress?: MigrationProgress
    /** Export only specific table */
    table?: string
  } = {}
): Promise<MigrationStats> {
  const stats: MigrationStats = {
    sessions: 0,
    messages: 0,
    parts: 0,
    projects: 0,
    errors: 0,
    warnings: 0,
  }

  log.info("Starting database to JSON export", { targetDir })

  try {
    // Create target directory
    const storageDir = path.join(targetDir, "storage")
    await fs.mkdir(storageDir, { recursive: true })

    // Get database storage
    const db = getDatabaseStorage()
    await db.initialize()

    // Tables to export
    const tables = options.table ? [options.table] : ["session", "message", "part", "project"]

    for (const table of tables) {
      try {
        // List all records in table
        const records = await db.list([table + "s"])

        for (const record of records) {
          // Determine file path
          const id = record.id
          const filePath = path.join(storageDir, table, `${id}.json`)

          // Create directory if needed
          const fileDir = path.dirname(filePath)
          await fs.mkdir(fileDir, { recursive: true })

          // Write JSON file
          await fs.writeFile(filePath, JSON.stringify(record, null, 2), "utf-8")

          // Update stats
          if (table === "session") stats.sessions++
          else if (table === "message") stats.messages++
          else if (table === "part") stats.parts++
          else if (table === "project") stats.projects++
        }

        options.onProgress?.(stats, `Exported ${table}s`)
      } catch (error) {
        stats.errors++
        log.error("Failed to export table", { error, table })
      }
    }

    log.info("Export complete", { stats })
    options.onProgress?.(stats, "Export complete")

    return stats
  } catch (error) {
    log.error("Export failed", { error, targetDir })
    stats.errors++
    throw error
  }
}

/**
 * Verify migration integrity
 */
export async function verifyMigration(
  sourceDir: string,
  options: {
    /** Progress callback */
    onProgress?: (message: string) => void
  } = {}
): Promise<{
  valid: boolean
  issues: string[]
  stats: { jsonFiles: number; dbRecords: number; mismatches: number }
}> {
  const issues: string[] = []
  const stats = { jsonFiles: 0, dbRecords: 0, mismatches: 0 }

  log.info("Verifying migration integrity", { sourceDir })

  try {
    // Find all JSON files
    const jsonFiles = await findJsonFiles(sourceDir)
    stats.jsonFiles = jsonFiles.length

    // Get database storage
    const db = getDatabaseStorage()
    await db.initialize()

    // Compare each file with database
    for (const filePath of jsonFiles) {
      try {
        // Read JSON file
        const jsonData = await readJsonFile(filePath)
        const key = parseStorageKey(filePath, sourceDir)

        // Read from database
        const dbData = await db.read(key)

        if (!dbData) {
          issues.push(`Missing in database: ${key.join("/")}`)
          stats.mismatches++
          continue
        }

        // Compare data
        const jsonStr = JSON.stringify(jsonData)
        const dbStr = JSON.stringify(dbData)

        if (jsonStr !== dbStr) {
          issues.push(`Data mismatch: ${key.join("/")}`)
          stats.mismatches++
        }

        stats.dbRecords++
        options.onProgress?.(`Verified: ${key.join("/")}`)
      } catch (error) {
        issues.push(`Failed to verify ${filePath}: ${error}`)
        stats.mismatches++
      }
    }

    const valid = issues.length === 0
    log.info("Verification complete", { valid, stats, issues })

    return { valid, issues, stats }
  } catch (error) {
    log.error("Verification failed", { error, sourceDir })
    throw error
  }
}

/**
 * Backup JSON storage before migration
 */
export async function backupJsonStorage(sourceDir: string): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
  const backupDir = path.join(sourceDir, `backup-${timestamp}`)

  log.info("Backing up JSON storage", { sourceDir, backupDir })

  const storageDir = path.join(sourceDir, "storage")
  if (existsSync(storageDir)) {
    // Copy storage directory
    await fs.cp(storageDir, path.join(backupDir, "storage"), { recursive: true })
  }

  log.info("Backup complete", { backupDir })
  return backupDir
}

/**
 * Rollback migration by restoring from backup
 */
export async function rollbackMigration(backupDir: string): Promise<void> {
  log.info("Rolling back migration", { backupDir })

  const sourceDir = path.dirname(backupDir)
  const storageDir = path.join(sourceDir, "storage")
  const backupStorageDir = path.join(backupDir, "storage")

  if (!existsSync(backupStorageDir)) {
    throw new Error("Backup storage directory not found")
  }

  // Remove current storage
  if (existsSync(storageDir)) {
    await fs.rm(storageDir, { recursive: true, force: true })
  }

  // Restore from backup
  await fs.cp(backupStorageDir, storageDir, { recursive: true })

  log.info("Rollback complete")
}

/**
 * Get migration status
 */
export async function getMigrationStatus(sourceDir: string): Promise<{
  hasJsonStorage: boolean
  hasDatabase: boolean
  estimatedRecords: number
}> {
  const storageDir = path.join(sourceDir, "storage")
  const hasJsonStorage = existsSync(storageDir)

  let estimatedRecords = 0
  if (hasJsonStorage) {
    const files = await findJsonFiles(sourceDir)
    estimatedRecords = files.length
  }

  // Check for database file
  const dbFile = path.join(sourceDir, ".opencode", "db", "opencode.db")
  const hasDatabase = existsSync(dbFile)

  return {
    hasJsonStorage,
    hasDatabase,
    estimatedRecords,
  }
}

/**
 * Migrate old sessions to ensure parentID is properly set
 *
 * - Ensures null values are converted to undefined
 * - Adds parentID field to old sessions created before schema change
 */
export async function migrateSessionParentIDs(): Promise<void> {
  const { Session } = await import("../session")
  const sessionLog = Log.create({ service: "storage.migrate.sessions" })

  let migratedNullToUndefined = 0
  let addedParentIDField = 0

  for await (const session of Session.list()) {
    try {
      // Check if parentID field exists and is null
      if ("parentID" in session) {
        if (session.parentID === null) {
          await Session.update(session.id, (draft) => {
            draft.parentID = undefined
          })
          migratedNullToUndefined++
          sessionLog.info("Migrated session parentID from null to undefined", {
            sessionId: session.id,
          })
        }
      } else {
        // Old schema, add parentID field
        await Session.update(session.id, (draft) => {
          ;(draft as any).parentID = undefined
        })
        addedParentIDField++
        sessionLog.info("Added parentID field to old session", {
          sessionId: session.id,
        })
      }
    } catch (error) {
      sessionLog.error("Failed to migrate session parentID", {
        sessionId: session.id,
        error,
      })
    }
  }

  sessionLog.info("Session parentID migration complete", {
    migratedNullToUndefined,
    addedParentIDField,
  })
}

/**
 * Migrate existing sessions to ensure proper container binding
 *
 * - Attempts to bind containers to sessions that don't have sandboxId
 * - Only processes sessions in sandbox mode
 */
export async function migrateSessionSandboxIds(): Promise<void> {
  const { Session } = await import("../session")
  const { isDockerEnabled, getUserContainerForSession } = await import("../session/docker")
  const sessionLog = Log.create({ service: "storage.migrate.sandbox" })

  const enabled = await isDockerEnabled()
  if (!enabled) {
    sessionLog.info("Docker not enabled, skipping sandbox ID migration")
    return
  }

  let migrated = 0
  let failed = 0
  let skipped = 0

  for await (const session of Session.list()) {
    // Skip sessions that already have sandboxId
    if (session.sandboxId) {
      skipped++
      continue
    }

    // Only process sandbox mode sessions
    if (session.mode !== "sandbox") {
      skipped++
      continue
    }

    try {
      const container = await getUserContainerForSession(session)
      if (container) {
        await Session.update(session.id, (draft) => {
          draft.sandboxId = container.containerId
          draft.sandboxStatus = container.status
        })
        migrated++
        sessionLog.info("Migrated session sandbox ID", {
          sessionId: session.id,
          containerId: container.containerId,
        })
      } else {
        failed++
        sessionLog.warn("Failed to get container for session during migration", {
          sessionId: session.id,
        })
      }
    } catch (error) {
      failed++
      sessionLog.error("Error migrating session", {
        sessionId: session.id,
        error,
      })
    }
  }

  sessionLog.info("Session sandbox ID migration complete", {
    migrated,
    failed,
    skipped,
  })
}
