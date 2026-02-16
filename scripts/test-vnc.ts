/**
 * VNC Connectivity Test Script
 *
 * This script helps diagnose VNC connection issues by testing each layer:
 * 1. Environment configuration
 * 2. Backend connectivity
 * 3. Container/sandbox status
 * 4. Port availability
 * 5. WebSocket connection
 *
 * Usage:
 *   bun run scripts/test-vnc.ts <sessionId>
 */

import { getEnv } from "../packages/opencode/src/config/env-loader"

const COLORS = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
}

function log(level: "info" | "success" | "warn" | "error", message: string, data?: any) {
  const colors = {
    info: COLORS.blue,
    success: COLORS.green,
    warn: COLORS.yellow,
    error: COLORS.red,
  }
  const icon = {
    info: "ℹ️",
    success: "✅",
    warn: "⚠️",
    error: "❌",
  }

  console.log(`${colors[level]}${icon[level]} ${message}${COLORS.reset}`)
  if (data) {
    console.log(`  ${JSON.stringify(data, null, 2)}`)
  }
}

function section(title: string) {
  console.log(`\n${COLORS.cyan}${COLORS.bright}═══ ${title} ═══${COLORS.reset}\n`)
}

async function testEnvironment() {
  section("1. 环境配置检查")

  const backend = getEnv("SANDBOX_BACKEND") || "docker"
  log("info", `SANDBOX_BACKEND: ${backend}`)

  if (backend === "e2b") {
    const e2bApiKey = getEnv("E2B_API_KEY")
    const e2bTemplate = getEnv("E2B_TEMPLATE_ID")

    if (e2bApiKey) {
      log("success", "E2B_API_KEY: 已配置", {
        length: e2bApiKey.length,
        prefix: e2bApiKey.substring(0, 10) + "...",
      })
    } else {
      log("error", "E2B_API_KEY: 未配置")
    }

    if (e2bTemplate) {
      log("success", "E2B_TEMPLATE_ID: " + e2bTemplate)
    } else {
      log("warn", "E2B_TEMPLATE_ID: 未配置，将使用默认模板")
    }
  } else {
    log("info", "使用 Docker Backend (本地容器)")
  }

  return { backend }
}

async function testDockerBackend(sessionId: string) {
  section("2. Docker Backend 检查")

  try {
    // Import docker manager
    const { getDockerManager } = await import("../packages/opencode/src/docker/docker-manager")
    const docker = getDockerManager()

    log("info", "正在获取容器信息...")
    const containerInfo = await docker.getContainerIP(sessionId)

    if (!containerInfo) {
      log("error", "容器不存在或未运行", { sessionId })
      return null
    }

    log("success", "容器信息", {
      ip: containerInfo.ip,
      state: containerInfo.state,
      ports: containerInfo.ports,
    })

    // Test websockify connectivity on port 6080 (standard noVNC/websockify port)
    const vncUrl = `ws://${containerInfo.ip}:6080`
    log("info", `测试 WebSocket 连接: ${vncUrl}`)
    log("info", "连接到 websockify (6080)，而不是 VNC 服务器 (5901)")

    try {
      const ws = new WebSocket(vncUrl, "binary")
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          ws.close()
          reject(new Error("Connection timeout"))
        }, 5000)

        ws.onopen = () => {
          clearTimeout(timeout)
          log("success", "✅ WebSocket 连接成功")
          ws.close()
          resolve()
        }

        ws.onerror = (error) => {
          clearTimeout(timeout)
          reject(error)
        }
      })
    } catch (error) {
      log("error", "端口 6080 WebSocket 连接失败", { error: String(error) })
      log("warn", "可能的原因:")
      log("warn", "  1. 容器内 websockify 未运行")
      log("warn", "  2. 端口 6080 未正确暴露")
      log("warn", "  3. 防火墙阻止连接")
      log("info", "")
      log("info", "💡 诊断命令:")
      log("info", "   docker exec <container> netstat -tlnp | grep -E '5901|6080'")
      log("info", "   docker exec <container> ps aux | grep -E 'vnc|websockify'")

      // Try port 5901 as fallback (in case image uses non-standard config)
      log("info", "")
      log("info", "💡 尝试检查端口 5901（非标准配置，仅作备用）...")

      // Try port 5901 as fallback (non-standard config, only if image uses it directly)
      try {
        const ws5901 = new WebSocket(`ws://${containerInfo.ip}:5901`, "binary")
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            ws5901.close()
            reject(new Error("Connection timeout"))
          }, 5000)

          ws5901.onopen = () => {
            clearTimeout(timeout)
            log("success", "✅ 端口 5901 WebSocket 连接成功！")
            log("info", "这意味着镜像使用非标准配置（websockify 在 5901）")
            log("warn", "⚠️  这不是标准配置，但代码已经适配")
            log("info", "")
            log("info", "📝 当前代码已支持此配置")
            ws5901.close()
            resolve()
          }

          ws5901.onerror = (err) => {
            clearTimeout(timeout)
            reject(err)
          }
        })
      } catch (e5901) {
        log("error", "端口 5901 连接也失败")
        log("info", "")
        log("info", "🔧 两个端口都无法连接，请检查容器内 VNC 服务状态")
        log("info", "🔧 诊断命令:")
        log("info", "   docker ps | grep agent-session")
        log("info", "   docker exec <container> netstat -tlnp | grep -E '5901|6080'")
        log("info", "   docker exec <container> ps aux | grep -E 'vnc|websockify'")
      }
    }

    return containerInfo
  } catch (error) {
    log("error", "Docker Backend 测试失败", { error: String(error) })
    return null
  }
}

async function testE2BBackend(sessionId: string) {
  section("2. E2B Backend 检查")

  try {
    // Import E2B manager
    const { getE2BManager } = await import("../packages/opencode/src/container/e2b-lifecycle")
    const e2bManager = getE2BManager()

    log("info", "正在获取沙箱信息...")
    const sandbox = e2bManager.getSandbox(sessionId)

    if (!sandbox) {
      log("error", "E2B 沙箱不存在", { sessionId })
      log("info", "提示: 需要先调用沙箱创建 API")

      // List all sandboxes for debugging
      const allSandboxes = e2bManager.getAllSandboxes()
      if (allSandboxes.length > 0) {
        log("info", `当前有 ${allSandboxes.length} 个沙箱:`)
        allSandboxes.forEach(s => {
          console.log(`  - ${s.userId}: ${s.sandboxId} (${s.status})`)
        })
      }
      return null
    }

    log("success", "沙箱信息", {
      sandboxId: sandbox.sandboxId,
      status: sandbox.status,
      createdAt: new Date(sandbox.createdAt).toISOString(),
    })

    // Test VNC URL retrieval
    log("info", "正在获取 VNC URL...")
    const { getE2BVNCUrl } = await import("../packages/opencode/src/server/vnc-adapter")
    const vncUrl = await getE2BVNCUrl(sessionId)

    log("success", "VNC URL 获取成功", { vncUrl })

    // Test WebSocket connection
    log("info", `测试 WebSocket 连接: ${vncUrl}`)

    try {
      const ws = new WebSocket(vncUrl, "binary")
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          ws.close()
          reject(new Error("Connection timeout"))
        }, 10000)

        ws.onopen = () => {
          clearTimeout(timeout)
          log("success", "WebSocket 连接成功")
          ws.close()
          resolve()
        }

        ws.onerror = (error) => {
          clearTimeout(timeout)
          reject(error)
        }
      })
    } catch (error) {
      log("error", "WebSocket 连接失败", { error: String(error) })
      log("warn", "可能的原因:")
      log("warn", "  1. E2B 端口转发未正确配置")
      log("warn", "  2. 模板未暴露 6080 端口")
      log("warn", "  3. 沙箱内 VNC 服务未运行")
    }

    return { sandbox, vncUrl }
  } catch (error) {
    log("error", "E2B Backend 测试失败", { error: String(error) })
    return null
  }
}

async function main() {
  console.log(`${COLORS.bright}${COLORS.cyan}
╔═══════════════════════════════════════════════════════╗
║         VNC Connectivity Test Script                  ║
║         VNC 连接测试工具                               ║
╚═══════════════════════════════════════════════════════╝
${COLORS.reset}`)

  const sessionId = process.argv[2]

  if (!sessionId) {
    log("error", "用法: bun run scripts/test-vnc.ts <sessionId>")
    log("info", "示例: bun run scripts/test-vnc.ts user_123")
    process.exit(1)
  }

  log("info", `测试 Session: ${sessionId}`)

  // Test environment
  const { backend } = await testEnvironment()

  // Test backend
  if (backend === "e2b") {
    await testE2BBackend(sessionId)
  } else {
    await testDockerBackend(sessionId)
  }

  section("测试完成")

  log("info", "如需进一步诊断，请查看:")
  log("info", "  - 前端日志: 浏览器开发者工具 Console")
  log("info", "  - 后端日志: 服务器控制台输出")
  log("info", "  - 故障排查指南: docs/VNC_TROUBLESHOOTING.md")
}

main().catch((error) => {
  log("error", "脚本执行失败", { error })
  process.exit(1)
})
