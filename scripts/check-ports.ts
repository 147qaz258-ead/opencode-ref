/**
 * Container Port and Service Checker
 *
 * This script helps diagnose container port and service issues
 * by checking what's actually listening inside the container.
 */

import { getDockerManager } from "../packages/opencode/src/docker/docker-manager"
import { randomUUID } from "crypto"

interface PortCheckResult {
  containerPort: number
  isListening: boolean
  process?: string
  bindingAddress?: string
  hostPort?: number
}

async function checkContainerServices(sessionId: string) {
  console.log(`🔍 Checking container services for session: ${sessionId}\n`)

  const manager = getDockerManager()
  const container = manager.getContainer(sessionId)

  if (!container) {
    console.error("❌ Container not found for session:", sessionId)
    return
  }

  console.log("📦 Container Info:")
  console.log(`   ID: ${container.containerId}`)
  console.log(`   Name: ${container.name}`)
  console.log(`   Running: ${container.isRunning}\n`)

  if (!container.isRunning) {
    console.error("❌ Container is not running!")
    return
  }

  // Get network info
  const networkInfo = await manager.getContainerIP(sessionId)
  if (!networkInfo) {
    console.error("❌ Could not get network info")
    return
  }

  console.log("🌐 Network Info:")
  console.log(`   Container IP: ${networkInfo.ip}`)
  console.log(`   Port Mappings:`)
  for (const [containerPort, hostPort] of Object.entries(networkInfo.ports)) {
    console.log(`     ${containerPort} → ${hostPort}`)
  }
  console.log("")

  // Import docker lifecycle manager for exec
  const { ContainerLifecycleManager } = await import("../packages/opencode/src/docker/container-lifecycle")
  const lifecycle = new ContainerLifecycleManager()

  // Get container instance
  await (lifecycle as any).initDocker()
  const docker = (lifecycle as any).docker
  const dockerContainer = docker.getContainer(container.containerId)

  console.log("🔍 Checking listening ports inside container...\n")

  // Check common VNC/websockify ports
  const portsToCheck = [6080, 5901, 5900]
  const results: PortCheckResult[] = []

  for (const port of portsToCheck) {
    try {
      // Check if port is listening
      const checkResult = await lifecycle.exec(dockerContainer, [
        "sh", "-c",
        `ss -tlnp | grep ':${port}' || echo 'NOT_LISTENING'`
      ])

      const isListening = !checkResult.stdout.includes("NOT_LISTENING")
      let process = ""
      let bindingAddress = ""

      if (isListening) {
        const lines = checkResult.stdout.trim().split('\n')
        const mainLine = lines.find(l => l.includes('LISTEN')) || lines[0]
        process = mainLine?.split(/\s+/).slice(-1)[0] || "unknown"

        // Try to get binding address
        const bindingCheck = await lifecycle.exec(dockerContainer, [
          "sh", "-c",
          `ss -tlnp | grep ':${port}' | awk '{print $4}'`
        ])
        bindingAddress = bindingCheck.stdout.trim().split('\n')[0] || "0.0.0.0"
      }

      results.push({
        containerPort: port,
        isListening,
        process: isListening ? process : undefined,
        bindingAddress,
        hostPort: networkInfo.ports[port]
      })

      const icon = isListening ? "✅" : "❌"
      const status = isListening ? "LISTENING" : "NOT LISTENING"

      console.log(`${icon} Port ${port}:`)
      console.log(`   Status: ${status}`)
      if (isListening) {
        console.log(`   Process: ${process}`)
        console.log(`   Binding: ${bindingAddress}`)
        if (networkInfo.ports[port]) {
          console.log(`   Host Port: ${networkInfo.ports[port]}`)
        }
      } else if (networkInfo.ports[port]) {
        console.log(`   ⚠️  Port is mapped but nothing is listening!`)
      }
      console.log("")
    } catch (error) {
      console.log(`❌ Port ${port}: Check failed - ${error}`)
      console.log("")
    }
  }

  // Summary
  console.log("📊 Summary:")
  const listeningPorts = results.filter(r => r.isListening)
  const notListeningPorts = results.filter(r => !r.isListening && networkInfo.ports[r.containerPort])

  if (listeningPorts.length > 0) {
    console.log(`   ✅ Active ports: ${listeningPorts.map(r => r.containerPort).join(", ")}`)
    console.log(`   → Can connect via: ws://localhost:${listeningPorts[0].hostPort}`)
    console.log(`   → Or via container IP: ws://${networkInfo.ip}:${listeningPorts[0].containerPort}`)
  }

  if (notListeningPorts.length > 0) {
    console.log(`   ⚠️  Mapped but not listening: ${notListeningPorts.map(r => r.containerPort).join(", ")}`)
    console.log(`   → This means the port is exposed but no service is running on it`)
  }

  // Check websockify process specifically
  console.log("\n🔍 Checking websockify process...")
  try {
    const websockifyCheck = await lifecycle.exec(dockerContainer, [
      "sh", "-c",
      "pgrep -f websockify || echo 'NOT_RUNNING'"
    ])

    if (websockifyCheck.stdout.includes("NOT_RUNNING")) {
      console.log("❌ websockify process NOT running")
      console.log("   → VNC will not work without websockify!")
      console.log("   → Check container startup script")
    } else {
      console.log("✅ websockify process IS running")
      console.log(`   PID: ${websockifyCheck.stdout.trim()}`)
    }
  } catch (error) {
    console.log(`❌ Could not check websockify: ${error}`)
  }

  // Check VNC server
  console.log("\n🔍 Checking VNC server...")
  try {
    const vncCheck = await lifecycle.exec(dockerContainer, [
      "sh", "-c",
      "pgrep -f 'vnc|Xvfb' || echo 'NOT_RUNNING'"
    ])

    if (vncCheck.stdout.includes("NOT_RUNNING")) {
      console.log("❌ VNC/Xvfb NOT running")
      console.log("   → websockify needs VNC server to connect to!")
    } else {
      console.log("✅ VNC/Xvfb IS running")
    }
  } catch (error) {
    console.log(`❌ Could not check VNC: ${error}`)
  }

  // Recommendations
  console.log("\n💡 Recommendations:")
  if (results.find(r => r.containerPort === 6080 && !r.isListening)) {
    console.log("   ⚠️  Port 6080 is mapped but websockify is NOT running")
    console.log("   → Check if websockify is started in container")
    console.log("   → Try: docker exec <container> websockify --web=/usr/share/novnc 6080 localhost:5901")
  }

  if (results.find(r => r.containerPort === 5901 && !r.isListening)) {
    console.log("   ⚠️  Port 5901 is mapped but VNC server is NOT running")
    console.log("   → Check if VNC server is started")
  }

  if (listeningPorts.length === 0) {
    console.log("   ❌ NO VNC services are running!")
    console.log("   → Check container startup script")
    console.log("   → Check if opencode-sandbox-playwright image includes VNC services")
  }
}

async function main() {
  const sessionId = process.argv[2]

  if (!sessionId) {
    console.log("Usage: bun run scripts/check-ports.ts <sessionId>")
    console.log("\nTip: You can get a session ID from:")
    console.log("  1. List all sessions: docker ps | grep agent-session")
    console.log("  2. The session ID is in the container name: agent-session-<sessionId>")
    console.log("\nOr create a test session:")
    console.log("  bun run scripts/check-ports.ts $(uuidgen)")
    process.exit(1)
  }

  // If sessionId looks like it should be created first
  if (sessionId === "create" || sessionId === "$(uuidgen)") {
    const newSessionId = randomUUID()
    console.log(`Creating new session: ${newSessionId}`)
    await getDockerManager().createForSession(newSessionId)
    sessionId = newSessionId
    console.log("Waiting 5 seconds for container to start...")
    await new Promise(resolve => setTimeout(resolve, 5000))
  }

  await checkContainerServices(sessionId)
}

main().catch(console.error)
