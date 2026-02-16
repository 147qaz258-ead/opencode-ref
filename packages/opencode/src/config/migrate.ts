/**
 * Configuration Migration
 *
 * Migrates configuration from global ~/.opencode/ to project-local .env
 * This enables project-specific settings and better portability.
 */

import path from "path"
import os from "os"
import { Log } from "@/util/log"
import fs from "fs/promises"
import { existsSync } from "fs"
import { Global } from "@/global"
import { Config } from "./config"

type Info = Config.Info
type Provider = Config.Provider

export const log = Log.create({ service: "config.migrate" })

/**
 * Migration result
 */
export interface MigrationResult {
  /** Whether migration was performed */
  migrated: boolean
  /** Number of provider keys migrated */
  providerKeys: number
  /** Warnings during migration */
  warnings: string[]
  /** Errors during migration */
  errors: string[]
}

/**
 * Check if global config exists
 */
export async function hasGlobalConfig(): Promise<boolean> {
  const globalConfigPath = path.join(Global.Path.config, "config.json")
  const globalOpenCodePath = path.join(Global.Path.config, "opencode.json")
  const globalOpenCodeJsoncPath = path.join(Global.Path.config, "opencode.jsonc")

  return (
    existsSync(globalConfigPath) ||
    existsSync(globalOpenCodePath) ||
    existsSync(globalOpenCodeJsoncPath)
  )
}

/**
 * Check if project-local .env exists
 */
export async function hasProjectEnv(projectDir: string): Promise<boolean> {
  const envPath = path.join(projectDir, ".env")
  return existsSync(envPath)
}

/**
 * Load global configuration
 */
async function loadGlobalConfig(): Promise<Info> {
  const configPaths = [
    path.join(Global.Path.config, "config.json"),
    path.join(Global.Path.config, "opencode.json"),
    path.join(Global.Path.config, "opencode.jsonc"),
  ]

  for (const configPath of configPaths) {
    if (existsSync(configPath)) {
      try {
        const content = await fs.readFile(configPath, "utf-8")
        return JSON.parse(content)
      } catch (error) {
        log.warn("Failed to parse global config", { path: configPath, error })
      }
    }
  }

  return {}
}

/**
 * Extract provider keys from configuration
 */
function extractProviderKeys(config: Info): Map<string, string> {
  const keys = new Map<string, string>()

  // Extract from provider configuration
  if (config.provider) {
    for (const [providerId, providerConfig] of Object.entries(config.provider) as [string, Provider][]) {
      if (providerConfig.api) {
        keys.set(`${providerId.toUpperCase()}_API_KEY`, providerConfig.api)
      }
      // Note: baseURL field was removed from Provider type
      // Base URLs are now configured elsewhere or use defaults
    }
  }

  return keys
}

/**
 * Create .env file content from provider keys
 */
function createEnvContent(keys: Map<string, string>): string {
  const lines: string[] = [
    "# OpenCode Configuration",
    "# Migrated from global configuration",
    `# Migrated at: ${new Date().toISOString()}`,
    "",
  ]

  // Provider keys
  if (keys.size > 0) {
    lines.push("# Provider API Keys")
    for (const [key, value] of keys.entries()) {
      lines.push(`${key}=${value}`)
    }
    lines.push("")
  }

  return lines.join("\n")
}

/**
 * Backup existing .env file
 */
async function backupEnv(envPath: string): Promise<string | null> {
  if (!existsSync(envPath)) {
    return null
  }

  const backupPath = `${envPath}.backup.${Date.now()}`
  try {
    await fs.copyFile(envPath, backupPath)
    log.info("Backed up existing .env", { envPath, backupPath })
    return backupPath
  } catch (error) {
    log.error("Failed to backup .env", { error, envPath })
    return null
  }
}

/**
 * Migrate global configuration to project-local .env
 *
 * @param projectDir - Project directory
 * @param options - Migration options
 * @returns Migration result
 */
export async function migrateFromGlobal(
  projectDir: string,
  options: {
    /** Backup existing .env before migration */
    backup?: boolean
    /** Overwrite existing .env */
    overwrite?: boolean
    /** Dry run - don't actually write files */
    dryRun?: boolean
  } = {}
): Promise<MigrationResult> {
  const result: MigrationResult = {
    migrated: false,
    providerKeys: 0,
    warnings: [],
    errors: [],
  }

  log.info("Starting configuration migration", { projectDir, options })

  try {
    // Check if global config exists
    const hasGlobal = await hasGlobalConfig()
    if (!hasGlobal) {
      result.warnings.push("No global configuration found")
      log.info("No global configuration to migrate")
      return result
    }

    // Check if project .env already exists
    const hasEnv = await hasProjectEnv(projectDir)
    if (hasEnv && !options.overwrite) {
      result.warnings.push(
        "Project .env already exists. Use overwrite=true to replace it."
      )
      log.info("Project .env exists, skipping migration", { projectDir })
      return result
    }

    // Backup existing .env if requested
    if (hasEnv && options.backup !== false) {
      const envPath = path.join(projectDir, ".env")
      const backupPath = await backupEnv(envPath)
      if (backupPath) {
        result.warnings.push(`Backed up existing .env to ${path.basename(backupPath)}`)
      }
    }

    // Load global configuration
    const globalConfig = await loadGlobalConfig()
    log.info("Loaded global configuration", { configKeys: Object.keys(globalConfig) })

    // Extract provider keys
    const providerKeys = extractProviderKeys(globalConfig)
    result.providerKeys = providerKeys.size

    if (providerKeys.size === 0) {
      result.warnings.push("No provider keys found in global configuration")
      log.info("No provider keys to migrate")
      return result
    }

    // Create .env content
    const envContent = createEnvContent(providerKeys)
    log.debug("Generated .env content", { length: envContent.length })

    // Write .env file (unless dry run)
    if (!options.dryRun) {
      const envPath = path.join(projectDir, ".env")
      await fs.writeFile(envPath, envContent, "utf-8")
      log.info("Wrote .env file", { envPath, providerKeys: providerKeys.size })
      result.migrated = true
    } else {
      log.info("Dry run - would write .env", { providerKeys: providerKeys.size })
      result.migrated = false
    }

    // Migrate other config to .opencode/config.json
    await migrateOtherConfig(globalConfig, projectDir, { ...options, dryRun: options.dryRun })

    return result
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    result.errors.push(errorMsg)
    log.error("Migration failed", { error, projectDir })
    return result
  }
}

/**
 * Migrate non-provider configuration to project-local config
 */
async function migrateOtherConfig(
  globalConfig: Info,
  projectDir: string,
  options: { dryRun?: boolean }
): Promise<void> {
  const opencodeDir = path.join(projectDir, ".opencode")

  // Create .opencode directory if it doesn't exist
  if (!existsSync(opencodeDir) && !options.dryRun) {
    await fs.mkdir(opencodeDir, { recursive: true })
    log.info("Created .opencode directory", { opencodeDir })
  }

  // Extract non-provider config
  const { provider, ...otherConfig } = globalConfig

  // Skip if no other config
  if (Object.keys(otherConfig).length === 0) {
    return
  }

  // Write to .opencode/opencode.json
  const configPath = path.join(opencodeDir, "opencode.json")
  if (!options.dryRun) {
    await fs.writeFile(configPath, JSON.stringify(otherConfig, null, 2), "utf-8")
    log.info("Wrote project config", { configPath })
  } else {
    log.info("Dry run - would write config", { configPath })
  }
}

/**
 * Validate migrated configuration
 */
export async function validateMigration(projectDir: string): Promise<{
  valid: boolean
  issues: string[]
}> {
  const issues: string[] = []

  try {
    // Check .env exists
    const envPath = path.join(projectDir, ".env")
    if (!existsSync(envPath)) {
      issues.push(".env file not found")
    }

    // Check .opencode directory exists
    const opencodeDir = path.join(projectDir, ".opencode")
    if (!existsSync(opencodeDir)) {
      issues.push(".opencode directory not found")
    }

    // Try to load config
    await Config.get()

    return {
      valid: issues.length === 0,
      issues,
    }
  } catch (error) {
    issues.push(`Configuration validation failed: ${error}`)
    return {
      valid: false,
      issues,
    }
  }
}

/**
 * Rollback migration
 */
export async function rollbackMigration(projectDir: string): Promise<boolean> {
  try {
    const envPath = path.join(projectDir, ".env")
    const opencodeDir = path.join(projectDir, ".opencode")

    // Find backup files
    const backupPattern = /\.env\.backup\.\d+$/
    const backupMatches: string[] = []

    if (existsSync(path.dirname(envPath))) {
      const files = await fs.readdir(path.dirname(envPath))
      for (const file of files) {
        if (backupPattern.test(file)) {
          backupMatches.push(file)
        }
      }
    }

    // Restore from latest backup
    if (backupMatches.length > 0) {
      backupMatches.sort()
      const latestBackup = backupMatches[backupMatches.length - 1]
      const envDir = path.dirname(envPath)
      if (latestBackup && envDir) {
        const backupPath = path.join(envDir, latestBackup)
        await fs.copyFile(backupPath, envPath)
        await fs.unlink(backupPath)
        log.info("Restored .env from backup", { backupPath })
      }
    }

    // Remove .opencode directory if it was created by migration
    // (Check if it only contains opencode.json without custom modifications)
    if (existsSync(opencodeDir)) {
      const configPath = path.join(opencodeDir, "opencode.json")
      if (existsSync(configPath)) {
        const content = await fs.readFile(configPath, "utf-8")
        const config = JSON.parse(content)

        // Check if it was auto-generated (has migration timestamp)
        if (config.$migratedAt) {
          await fs.unlink(configPath)
          log.info("Removed migrated config file", { configPath })

          // Remove directory if empty
          const remainingFiles = await fs.readdir(opencodeDir)
          if (remainingFiles.length === 0) {
            await fs.rmdir(opencodeDir)
            log.info("Removed empty .opencode directory", { opencodeDir })
          }
        }
      }
    }

    return true
  } catch (error) {
    log.error("Rollback failed", { error, projectDir })
    return false
  }
}
