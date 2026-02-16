/**
 * Environment Variable Loader
 *
 * Loads and manages environment variables from .env files.
 * Provides type-safe access to configuration values.
 */

import path from "path"
import { Log } from "@/util/log"
import fs from "fs/promises"
import { existsSync } from "fs"

export const log = Log.create({ service: "config.env-loader" })

/**
 * Environment variable names used by OpenCode
 */
export const EnvVars = {
  // Provider keys
  ANTHROPIC_API_KEY: "ANTHROPIC_API_KEY",
  OPENAI_API_KEY: "OPENAI_API_KEY",
  GOOGLE_API_KEY: "GOOGLE_API_KEY",
  AZURE_API_KEY: "AZURE_API_KEY",
  COHERE_API_KEY: "COHERE_API_KEY",
  MISTRAL_API_KEY: "MISTRAL_API_KEY",
  GROQ_API_KEY: "GROQ_API_KEY",
  PERPLEXITY_API_KEY: "PERPLEXITY_API_KEY",
  TOGETHERAI_API_KEY: "TOGETHERAI_API_KEY",
  XAI_API_KEY: "XAI_API_KEY",
  CEREBRAS_API_KEY: "CEREBRAS_API_KEY",
  DEEPINFRA_API_KEY: "DEEPINFRA_API_KEY",
  VERCEL_API_KEY: "VERCEL_API_KEY",
  OPENROUTER_API_KEY: "OPENROUTER_API_KEY",

  // Provider URLs
  ANTHROPIC_BASE_URL: "ANTHROPIC_BASE_URL",
  OPENAI_BASE_URL: "OPENAI_BASE_URL",
  GOOGLE_BASE_URL: "GOOGLE_BASE_URL",
  AZURE_BASE_URL: "AZURE_BASE_URL",

  // Docker configuration
  OPENCODE_DOCKER_ENABLED: "OPENCODE_DOCKER_ENABLED",
  OPENCODE_DOCKER_IMAGE: "OPENCODE_DOCKER_IMAGE",
  OPENCODE_DOCKER_AUTO_START: "OPENCODE_DOCKER_AUTO_START",

  // Server configuration
  OPENCODE_SERVER_PORT: "OPENCODE_SERVER_PORT",
  OPENCODE_SERVER_HOST: "OPENCODE_SERVER_HOST",

  // Feature flags
  OPENCODE_AUTO_SHARE: "OPENCODE_AUTO_SHARE",
  OPENCODE_TUI_ENABLED: "OPENCODE_TUI_ENABLED",

  // Media generation configuration
  IMAGE_PROVIDER: "IMAGE_PROVIDER",
  IMAGE_API_KEY: "IMAGE_API_KEY",
  IMAGE_MODEL: "IMAGE_MODEL",
  IMAGE_API_BASE: "IMAGE_API_BASE",
  VIDEO_PROVIDER: "VIDEO_PROVIDER",
  VIDEO_API_KEY: "VIDEO_API_KEY",
  VIDEO_MODEL: "VIDEO_MODEL",
  VIDEO_API_BASE: "VIDEO_API_BASE",

  // E2B Sandbox configuration
  SANDBOX_BACKEND: "SANDBOX_BACKEND",
  E2B_API_KEY: "E2B_API_KEY",
  E2B_TEMPLATE_ID: "E2B_TEMPLATE_ID",
  E2B_TIMEOUT: "E2B_TIMEOUT",
} as const

export type EnvVar = keyof typeof EnvVars

/**
 * Parsed .env file
 */
export interface EnvFile {
  /** File path */
  path: string
  /** Environment variables */
  variables: Map<string, string>
  /** Comments and empty lines */
  metadata: Array<{ line: number; type: "comment" | "empty"; content: string }>
}

/**
 * Parse .env file content
 */
function parseEnvFile(content: string): EnvFile {
  const variables = new Map<string, string>()
  const metadata: Array<{ line: number; type: "comment" | "empty"; content: string }> = []

  const lines = content.split("\n")
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()

    // Skip empty lines
    if (line === "") {
      metadata.push({ line: i, type: "empty", content: "" })
      continue
    }

    // Skip comments
    if (line.startsWith("#")) {
      metadata.push({ line: i, type: "comment", content: line })
      continue
    }

    // Parse KEY=VALUE
    const match = line.match(/^([^=]+)=(.*)$/)
    if (match) {
      const [, key, value] = match
      variables.set(key.trim(), value.trim())
    }
  }

  return {
    path: "",
    variables,
    metadata,
  }
}

/**
 * Format .env file content
 */
function formatEnvFile(env: EnvFile): string {
  const lines: string[] = []

  // Sort keys for consistent output
  const sortedKeys = Array.from(env.variables.keys()).sort()

  for (const key of sortedKeys) {
    const value = env.variables.get(key)!
    lines.push(`${key}=${value}`)
  }

  return lines.join("\n")
}

/**
 * Find .env file in project directory
 *
 * Searches in:
 * 1. Project root (.env)
 * 2. Parent directories (up to workspace root)
 *
 * @param startDir - Starting directory
 * @param stopDir - Stop searching at this directory
 * @returns .env file path or null
 */
export async function findEnvFile(
  startDir: string,
  stopDir?: string
): Promise<string | null> {
  const { Filesystem } = await import("@/util/filesystem")

  const envPath = path.join(startDir, ".env")
  if (existsSync(envPath)) {
    return envPath
  }

  // Search parent directories
  try {
    const results: string[] = []
    for await (const result of Filesystem.up({
      targets: [".env"],
      start: startDir,
      stop: stopDir,
    })) {
      results.push(result)
    }

    if (results.length > 0) {
      return path.join(results[0], ".env")
    }
  } catch (error) {
    log.warn("Failed to search for .env file", { error, startDir })
  }

  return null
}

/**
 * Load .env file
 *
 * @param envPath - Path to .env file
 * @returns Parsed .env file or null
 */
export async function loadEnvFile(envPath: string): Promise<EnvFile | null> {
  try {
    if (!existsSync(envPath)) {
      log.debug(".env file not found", { envPath })
      return null
    }

    const content = await fs.readFile(envPath, "utf-8")
    const env = parseEnvFile(content)
    env.path = envPath

    log.info("Loaded .env file", { envPath, variableCount: env.variables.size })
    return env
  } catch (error) {
    log.error("Failed to load .env file", { error, envPath })
    return null
  }
}

/**
 * Load .env file and merge with process.env
 *
 * @param projectDir - Project directory
 * @returns Merged environment variables
 */
export async function loadEnvWithDefaults(projectDir: string): Promise<Record<string, string>> {
  const env: Record<string, string> = {}

  // Copy process.env, filtering out undefined values
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      env[key] = value
    }
  }

  // Load .env file
  const envPath = await findEnvFile(projectDir)
  if (envPath) {
    const envFile = await loadEnvFile(envPath)
    if (envFile) {
      for (const [key, value] of envFile.variables.entries()) {
        env[key] = value
      }
    }
  }

  return env
}

/**
 * Get environment variable value
 *
 * @param key - Environment variable name
 * @param defaultValue - Default value if not found
 * @returns Environment variable value or default
 */
export function getEnv(key: string, defaultValue?: string): string | undefined {
  return process.env[key] ?? defaultValue
}

/**
 * Get boolean environment variable
 *
 * @param key - Environment variable name
 * @param defaultValue - Default value if not found
 * @returns Boolean value
 */
export function getEnvBool(key: string, defaultValue: boolean = false): boolean {
  const value = process.env[key]?.toLowerCase()
  if (value === undefined) {
    return defaultValue
  }
  return value === "true" || value === "1" || value === "yes"
}

/**
 * Get number environment variable
 *
 * @param key - Environment variable name
 * @param defaultValue - Default value if not found
 * @returns Number value
 */
export function getEnvNumber(key: string, defaultValue: number): number {
  const value = process.env[key]
  if (value === undefined) {
    return defaultValue
  }
  const parsed = parseInt(value, 10)
  return isNaN(parsed) ? defaultValue : parsed
}

/**
 * Set environment variable in .env file
 *
 * @param key - Environment variable name
 * @param value - Value to set
 * @param projectDir - Project directory
 */
export async function setEnvVar(key: string, value: string, projectDir: string): Promise<void> {
  const envPath = path.join(projectDir, ".env")
  let env: EnvFile

  // Load existing or create new
  if (existsSync(envPath)) {
    const loaded = await loadEnvFile(envPath)
    env = loaded ?? { path: envPath, variables: new Map(), metadata: [] }
  } else {
    env = { path: envPath, variables: new Map(), metadata: [] }
  }

  // Set value
  env.variables.set(key, value)

  // Write back
  const content = formatEnvFile(env)
  await fs.writeFile(envPath, content, "utf-8")

  log.info("Set environment variable", { key, projectDir })
}

/**
 * Remove environment variable from .env file
 *
 * @param key - Environment variable name
 * @param projectDir - Project directory
 */
export async function removeEnvVar(key: string, projectDir: string): Promise<void> {
  const envPath = path.join(projectDir, ".env")

  if (!existsSync(envPath)) {
    return
  }

  const env = await loadEnvFile(envPath)
  if (!env) {
    return
  }

  // Remove value
  env.variables.delete(key)

  // Write back
  const content = formatEnvFile(env)
  await fs.writeFile(envPath, content, "utf-8")

  log.info("Removed environment variable", { key, projectDir })
}

/**
 * Validate .env file
 *
 * @param projectDir - Project directory
 * @returns Validation result
 */
export async function validateEnvFile(projectDir: string): Promise<{
  valid: boolean
  errors: string[]
  warnings: string[]
}> {
  const errors: string[] = []
  const warnings: string[] = []

  const envPath = path.join(projectDir, ".env")

  if (!existsSync(envPath)) {
    errors.push(".env file not found")
    return { valid: false, errors, warnings }
  }

  const env = await loadEnvFile(envPath)
  if (!env) {
    errors.push("Failed to parse .env file")
    return { valid: false, errors, warnings }
  }

  // Check for required variables
  const hasAnyApiKey = Array.from(env.variables.keys()).some((key) =>
    key.endsWith("_API_KEY")
  )

  if (!hasAnyApiKey) {
    warnings.push("No API keys found in .env file")
  }

  // Check for deprecated variables
  const deprecatedVars = ["OPENCODE_API_KEY", "OPENCODE_MODEL"]
  for (const deprecated of deprecatedVars) {
    if (env.variables.has(deprecated)) {
      warnings.push(`Deprecated variable: ${deprecated}`)
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}

/**
 * Create .env file from provider configuration
 *
 * @param providers - Provider configuration
 * @param projectDir - Project directory
 */
export async function createEnvFromProviders(
  providers: Record<string, { apiKey?: string; baseURL?: string }>,
  projectDir: string
): Promise<void> {
  const env: EnvFile = {
    path: path.join(projectDir, ".env"),
    variables: new Map(),
    metadata: [],
  }

  for (const [providerId, config] of Object.entries(providers)) {
    const key = providerId.toUpperCase()
    if (config.apiKey) {
      env.variables.set(`${key}_API_KEY`, config.apiKey)
    }
    if (config.baseURL) {
      env.variables.set(`${key}_BASE_URL`, config.baseURL)
    }
  }

  const content = formatEnvFile(env)
  await fs.writeFile(env.path, content, "utf-8")

  log.info("Created .env from provider configuration", { projectDir, providerCount: Object.keys(providers).length })
}
