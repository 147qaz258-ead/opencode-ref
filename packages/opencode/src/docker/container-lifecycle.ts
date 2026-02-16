/**
 * Container Lifecycle Manager
 *
 * Manages the complete lifecycle of Docker containers for OpenCode sessions.
 * Handles creation, starting, stopping, and removal of containers.
 */

import { Log } from "@/util/log"
import type {
  ContainerConfig,
  ContainerState,
  ContainerStatus,
  ExecResult,
  HealthCheck,
} from "./types"
import { VolumeManager } from "./volume-manager"

export const log = Log.create({ service: "docker.container-lifecycle" })

/**
 * Default Docker image for sandbox containers
 */
export const DEFAULT_IMAGE = "opencode-sandbox-playwright:latest"

/**
 * Default resource limits for containers
 */
export const DEFAULT_LIMITS = {
  memory: 2 * 1024 * 1024 * 1024, // 2GB
  cpu: 0.5,
  timeout: 300000, // 5 minutes
}

/**
 * Container Lifecycle Manager
 */
export class ContainerLifecycleManager {
  private docker: any
  private volumeManager: VolumeManager

  constructor() {
    this.volumeManager = new VolumeManager()
  }

  /**
   * Initialize Docker connection
   * Supports multiple connection methods on Windows for better compatibility
   */
  private async initDocker(): Promise<void> {
    if (this.docker) return

    if (process.platform === "win32") {
      // Try TCP connection first (most reliable with Bun)
      const tcpOptions = { host: "127.0.0.1", port: 2375 }
      log.debug("Attempting Docker connection via TCP", tcpOptions)

      try {
        const { default: Docker } = await import("dockerode")
        this.docker = new Docker(tcpOptions)
        await this.docker.ping()
        log.info("Docker connection successful via TCP", tcpOptions)
        return
      } catch (tcpError) {
        log.warn("TCP connection failed, trying Named Pipe", {
          error: tcpError instanceof Error ? tcpError.message : String(tcpError),
        })
      }

      // Try Named Pipe (Docker Desktop default on Windows)
      const namedPipePath = "//./pipe/docker_engine_windows"
      log.debug("Attempting Docker connection via Named Pipe", { socketPath: namedPipePath })

      try {
        const { default: Docker } = await import("dockerode")
        this.docker = new Docker({ socketPath: namedPipePath })
        await this.docker.ping()
        log.info("Docker connection successful via Named Pipe", { socketPath: namedPipePath })
        return
      } catch (npError) {
        log.warn("Named Pipe connection failed, trying default", {
          error: npError instanceof Error ? npError.message : String(npError),
        })
      }
    }

    // Default: let dockerode figure it out (works on Unix platforms)
    log.debug("Attempting Docker connection with default options")
    const { default: Docker } = await import("dockerode")
    this.docker = new Docker()

    // Verify connection works
    try {
      await this.docker.ping()
      log.info("Docker connection successful with default options")
    } catch (error) {
      log.error("Docker connection failed with all methods", {
        error: error instanceof Error ? error.message : String(error),
        platform: process.platform,
      })
      throw new Error(`Failed to connect to Docker: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Ensure image exists locally, pull if needed
   *
   * @param image - Image name
   */
  private async ensureImage(image: string): Promise<void> {
    await this.initDocker()

    // First check if image exists locally
    try {
      await this.docker.getImage(image).inspect()
      log.debug("Image already exists", { image })
      return
    } catch {
      log.info("Image not found locally", { image })
    }

    // On Windows, use Docker CLI as fallback
    if (process.platform === "win32") {
      log.info("Using Docker CLI to pull image on Windows", { image })
      try {
        const { spawnSync } = await import("child_process")
        const result = spawnSync("docker", ["pull", image], {
          stdio: "pipe",
          timeout: 300000,
        })

        if (result.error || result.status !== 0) {
          throw new Error(result.stderr?.toString() || result.error?.message || "Unknown error")
        }

        log.info("Image pulled successfully via Docker CLI", { image })
        return
      } catch (cliError: unknown) {
        const errorMsg = cliError instanceof Error ? cliError.message : String(cliError)
        log.error("Docker CLI pull failed", { error: errorMsg })
        throw new Error(`Failed to pull image ${image}. Docker CLI error: ${errorMsg}`)
      }
    }

    // Unix platforms: use dockerode
    log.info("Pulling image using dockerode", { image })
    await new Promise<void>((resolve, reject) => {
      this.docker.pull(image, (err: Error, stream: any) => {
        if (err) {
          reject(err)
          return
        }
        this.docker.modem.followProgress(stream, (err: Error) => {
          if (err) reject(err)
          else resolve()
        })
      })
    })
    log.info("Image pulled successfully", { image })
  }

  /**
   * Build environment variables array
   *
   * @param env - Environment variables object
   * @returns Array of KEY=value strings
   */
  private buildEnvVars(env?: Record<string, string>): string[] {
    if (!env) return []

    return Object.entries(env).map(([key, value]) => `${key}=${value}`)
  }

  /**
   * Build port bindings for Docker container
   *
   * @param ports - Port mapping (containerPort -> hostPort, 0 for auto-assign)
   * @returns Docker PortBindings format
   */
  private buildPortBindings(ports?: Record<number, number>): Record<string, Array<{ HostPort: string }>> {
    if (!ports) return {}

    return Object.entries(ports).reduce((acc, [containerPort, hostPort]) => {
      // Docker API requires port spec with protocol suffix (e.g., "8080/tcp")
      const port = `${containerPort}/tcp`
      acc[port] = [{ HostPort: hostPort.toString() }]
      return acc
    }, {} as Record<string, Array<{ HostPort: string }>>)
  }

  /**
   * Build exposed ports for Docker container
   *
   * @param ports - Port mapping (containerPort -> hostPort, 0 for auto-assign)
   * @returns Docker ExposedPorts format
   */
  private buildExposedPorts(ports?: Record<number, number>): Record<string, {}> {
    if (!ports) return {}

    return Object.entries(ports).reduce((acc, [containerPort]) => {
      const port = `${containerPort}/tcp`
      acc[port] = {}
      return acc
    }, {} as Record<string, {}>)
  }

  /**
   * Create and start a container
   *
   * @param config - Container configuration
   * @returns Container ID string
   */
  async createContainer(config: ContainerConfig): Promise<string> {
    await this.ensureImage(config.image)

    const mounts = VolumeManager.createSandboxMounts(
      config.sessionId,
      config.projectDir,
      config.skillsDir
    )

    const containerConfig = {
      Image: config.image,
      Cmd: config.cmd,
      Env: this.buildEnvVars(config.env),
      ExposedPorts: this.buildExposedPorts(config.ports),
      HostConfig: {
        Binds: VolumeManager.buildBinds(mounts),
        PortBindings: this.buildPortBindings(config.ports),
        NetworkMode: config.network || "bridge",
      },
      name: config.name,
    }

    const container = await this.docker.createContainer(containerConfig)
    await container.start()
    return container.id
  }

  /**
   * Get container state
   *
   * @param container - Container instance
   * @returns Container state
   */
  async getContainerState(container: any): Promise<ContainerState> {
    const inspect = await container.inspect()
    const state = inspect.State

    return {
      id: container.id,
      name: inspect.Name,
      status: state.Status as ContainerStatus,
      createdAt: new Date(inspect.Created),
      startedAt: state.StartedAt ? new Date(state.StartedAt) : undefined,
      exitCode: state.ExitCode,
      health: state.Health?.Status as ("healthy" | "unhealthy" | "starting" | undefined),
    }
  }

  /**
   * Execute command in container
   *
   * @param container - Container instance
   * @param cmd - Command to execute
   * @param options - Execution options
   * @returns Execution result
   */
  /**
   * Execute command in container
   *
   * @param container - Container instance
   * @param cmd - Command to execute
   * @param options - Execution options
   * @returns Execution result
   */
  async exec(container: any, cmd: string[], options?: { cwd?: string; user?: string }): Promise<ExecResult> {
    await this.initDocker()

    // Create exec instance
    const execInstance = await container.exec({
      Cmd: cmd,
      AttachStdout: true,
      AttachStderr: true,
      AttachStdin: false,
      Tty: true,  // Use TTY mode to avoid multiplexed stream
      WorkingDir: options?.cwd,
      User: options?.user,
    })

    // Start and get stream
    const stream = await execInstance.start({ Detach: false })
    const chunks: Buffer[] = []

    // Collect output from stream
    return new Promise<ExecResult>((resolve, reject) => {
      stream.on("data", (chunk: Buffer) => {
        chunks.push(chunk)
      })

      stream.on("error", (err: Error) => {
        reject(err)
      })

      stream.on("end", async () => {
        try {
          const info = await execInstance.inspect()
          // Clean up output:
          // 1. Remove TTY artifacts (\r)
          // 2. Remove Docker multiplexed stream headers (\u0000-\u0008 followed by data)
          // 3. Trim whitespace
          let output = Buffer.concat(chunks).toString("utf-8")

          // Remove carriage returns from TTY mode
          output = output.replace(/\r\n/g, "\n").replace(/\r/g, "")

          // Remove control characters at the start of lines
          output = output.replace(/^[\u0000-\u001F]+/gm, "")

          output = output.trim()

          resolve({
            stdout: output,
            stderr: "",
            exitCode: info.ExitCode || 0,
            timedOut: false,
          })
        } catch (err) {
          let output = Buffer.concat(chunks).toString("utf-8")
          output = output.replace(/\r\n/g, "\n").replace(/\r/g, "")
          output = output.replace(/^[\u0000-\u001F]+/gm, "")
          output = output.trim()
          resolve({
            stdout: output,
            stderr: "",
            exitCode: 0,
            timedOut: false,
          })
        }
      })
    })
  }

  /**
   * Inspect container
   *
   * @param containerId - Container ID
   * @returns Container inspection data
   */
  async inspectContainer(containerId: string): Promise<any> {
    await this.initDocker()
    return this.docker.getContainer(containerId).inspect()
  }

  /**
   * List all containers
   *
   * @returns Array of container info
   */
  async listContainers(): Promise<any[]> {
    await this.initDocker()
    return this.docker.listContainers()
  }

  /**
   * Start a container
   *
   * @param containerId - Container ID
   */
  async start(containerId: string): Promise<void> {
    await this.initDocker()
    const container = this.docker.getContainer(containerId)
    await container.start()
  }

  /**
   * Stop a container
   *
   * @param containerId - Container ID
   */
  async stop(containerId: string): Promise<void> {
    await this.initDocker()
    const container = this.docker.getContainer(containerId)
    await container.stop()
  }

  /**
   * Remove a container
   *
   * @param containerId - Container ID
   * @param force - Force removal even if running
   */
  async remove(containerId: string, force: boolean = false): Promise<void> {
    await this.initDocker()
    const container = this.docker.getContainer(containerId)
    await container.remove({ force })
  }
}