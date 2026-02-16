/**
 * Docker Sandbox Types
 *
 * Defines the core types for Docker container management in OpenCode.
 * Each session gets an isolated container with mounted volumes.
 */

/**
 * Container configuration for a sandbox session
 */
export interface ContainerConfig {
  /** Unique container ID (ULID) */
  id: string
  /** Session ID this container belongs to */
  sessionId: string
  /** Project directory to mount (optional for temp sessions) */
  projectDir?: string
  /** Skills directory to mount (read-only) */
  skillsDir: string
  /** Container name */
  name: string
  /** Docker image to use */
  image: string
  /** Resource limits */
  limits?: ResourceLimits
  /** Network mode */
  network?: NetworkMode
  /** Port bindings to expose from container */
  ports?: Record<number, number> // containerPort -> hostPort
  /** Custom environment variables */
  env?: Record<string, string>
  /** Command to run in container (optional) */
  cmd?: string[]
}

/**
 * Resource limits for containers
 */
export interface ResourceLimits {
  /** Memory limit in bytes (default: 2GB) */
  memory?: number
  /** CPU limit (0-1, relative to host) */
  cpu?: number
  /** Timeout in milliseconds before auto-destroy */
  timeout?: number
}

/**
 * Network isolation modes
 */
export type NetworkMode = "none" | "bridge" | "host"

/**
 * Container status
 */
export type ContainerStatus =
  | "created"   // Container created but not started
  | "running"   // Container is running
  | "paused"    // Container is paused
  | "stopped"   // Container is stopped
  | "removing"  // Container is being removed
  | "removed"   // Container has been removed

/**
 * Container state information
 */
export interface ContainerState {
  /** Container ID */
  id: string
  /** Container name */
  name: string
  /** Current status */
  status: ContainerStatus
  /** Container creation timestamp */
  createdAt: Date
  /** Container start timestamp (if started) */
  startedAt?: Date
  /** Exit code (if exited) */
  exitCode?: number
  /** Health check status */
  health?: "healthy" | "unhealthy" | "starting"
}

/**
 * Volume mount configuration
 */
export interface VolumeMount {
  /** Host path */
  hostPath: string
  /** Container path */
  containerPath: string
  /** Mount mode */
  mode: "rw" | "ro"
}

/**
 * Execution result from container
 */
export interface ExecResult {
  /** Exit code */
  exitCode: number
  /** Standard output */
  stdout: string
  /** Standard error */
  stderr: string
  /** Whether execution timed out */
  timedOut?: boolean
}

/**
 * Container health check configuration
 */
export interface HealthCheck {
  /** Command to run for health check */
  command: string[]
  /** Interval between checks (ms) */
  interval?: number
  /** Timeout for check (ms) */
  timeout?: number
  /** Number of retries before unhealthy */
  retries?: number
  /** Start period (ms) */
  startPeriod?: number
}
