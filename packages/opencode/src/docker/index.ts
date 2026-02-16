/**
 * Docker Sandbox Module
 *
 * Provides Docker container isolation for OpenCode sessions.
 * Each session gets its own container with mounted project and skills directories.
 *
 * @module docker
 */

// Types
export type {
  ContainerConfig,
  ContainerState,
  ContainerStatus,
  ExecResult,
  HealthCheck,
  ResourceLimits,
  VolumeMount,
} from "./types"

// Managers
export { DockerManager, getDockerManager, type SessionContainer } from "./docker-manager"
export { ContainerLifecycleManager, DEFAULT_IMAGE, DEFAULT_LIMITS } from "./container-lifecycle"
export { VolumeManager } from "./volume-manager"

// Re-export for convenience
export { log as dockerLog } from "./docker-manager"
export { log as containerLifecycleLog } from "./container-lifecycle"
export { log as volumeManagerLog } from "./volume-manager"
