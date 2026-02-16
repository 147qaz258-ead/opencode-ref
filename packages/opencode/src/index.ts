/**
 * OpenCode - AI-driven development agent
 *
 * This is a web-based AI agent platform. The main entry point is the
 * web server at src/server/server.ts.
 *
 * For using OpenCode as a library, import specific modules:
 * - import { Config } from '@opencode-ai/opencode/src/config'
 * - import { Session } from '@opencode-ai/opencode/src/session'
 * - import { ToolRegistry } from '@opencode-ai/opencode/src/tool'
 */

// Re-export commonly used modules for convenience
export { Config } from "./config/config"
export { Instance } from "./project/instance"
export { Project } from "./project/project"
export { Session } from "./session"
export { Agent } from "./agent/agent"
export { ToolRegistry } from "./tool/registry"
export { Storage } from "./storage/storage"
export { Provider } from "./provider/provider"

