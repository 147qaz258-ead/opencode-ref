/**
 * 测试 Snapshot 机制是否能正确解析复杂网页
 *
 * 目标：验证 extractInteractiveElements() 能否正确提取网页内容
 * 测试网页：https://www.pcgameres.com/portal/article/index/id/3822.html
 *
 * 运行方式：
 *   DOCKER_AVAILABLE=true bun test test/browser/snapshot-test-pcgameres.ts
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test"
import path from "path"
import { Identifier } from "../../src/id"
import { Session } from "../../src/session"
import { getDockerManager } from "../../src/docker/docker-manager"
import { Instance } from "../../src/project/instance"
import { Log } from "../../src/util/log"
import { PlaywrightClient } from "../../src/browser/playwright-client"

const projectRoot = path.join(__dirname, "../..")
Log.init({ print: true })

const TEST_URL = "https://www.pcgameres.com/portal/article/index/id/3822.html"

describe("Browser Snapshot - PCGameres Test", () => {
  const hasDocker = process.env.DOCKER_AVAILABLE === "true"
  let sessionId: string
  let playwrightClient: PlaywrightClient | null = null

  beforeAll(async () => {
    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        if (!hasDocker) {
          console.log("❌ Docker 不可用，跳过测试")
          console.log("   请设置环境变量: DOCKER_AVAILABLE=true")
          return
        }

        console.log("🚀 开始测试 Snapshot 机制")
        console.log(`📋 测试网页: ${TEST_URL}`)

        // 创建会话
        sessionId = Identifier.descending("session")
        await Session.create({
          title: "Snapshot PCGameres Test",
        })

        // 创建并启动 Docker 容器
        const dockerManager = getDockerManager()
        const available = await dockerManager.isAvailable()
        if (!available) {
          console.log("❌ Docker 不可用")
          return
        }

        console.log("📦 创建 manus-sandbox 容器...")
        await dockerManager.createForSession(
          sessionId,
          "/workspace",
          undefined,
          {
            image: "opencode-sandbox-playwright:latest",
          }
        )

        console.log("▶️  启动容器...")
        await dockerManager.start(sessionId)

        // 获取容器网络信息
        const info = await dockerManager.getContainerIP(sessionId)
        if (!info) {
          console.log("❌ 无法获取容器网络信息")
          return
        }

        console.log(`🌐 容器 IP: ${info.ip}`)
        console.log(`🔌 CDP 端口: 9222 -> ${info.ports[9222]}`)

        const cdpUrl = `http://${info.ip}:9222`
        console.log(`🔗 CDP URL: ${cdpUrl}`)

        // 创建 PlaywrightClient
        console.log("🎭 创建 PlaywrightClient...")
        playwrightClient = new PlaywrightClient(cdpUrl)

        // 初始化连接
        console.log("⏳ 连接到 Chrome CDP...")
        const initialized = await playwrightClient.initialize()
        if (!initialized) {
          console.log("❌ 无法连接到 Chrome CDP")
          return
        }

        console.log("✅ Chrome CDP 连接成功")
      },
    })
  })

  afterAll(async () => {
    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        if (!hasDocker) return

        console.log("🧹 清理测试环境...")

        try {
          if (playwrightClient) {
            await playwrightClient.cleanup()
            console.log("✅ PlaywrightClient 已清理")
          }
        } catch (e) {
          console.log("⚠️  清理 PlaywrightClient 失败:", e)
        }

        const dockerManager = getDockerManager()
        try {
          await dockerManager.destroy(sessionId)
          console.log("✅ 容器已销毁")
        } catch {}

        try {
          await Session.remove(sessionId)
          console.log("✅ 会话已删除")
        } catch {}
      },
    })
  })

  it("should extract interactive elements from PCGameres article page", async () => {
    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        if (!hasDocker || !playwrightClient) {
          console.log("⚠️  跳过测试（Docker 不可用或连接失败）")
          return
        }

        console.log("\n" + "=".repeat(60))
        console.log("🧪 开始测试: 导航并提取网页元素")
        console.log("=".repeat(60))

        // 导航到目标网页
        console.log(`\n📍 步骤 1: 导航到 ${TEST_URL}`)
        const elements = await playwrightClient.navigate(TEST_URL, 30000)

        console.log(`\n✅ 导航成功！提取到 ${elements.length} 个可交互元素`)
        console.log("\n" + "-".repeat(60))
        console.log("📋 Snapshot 结果（前 50 个元素）:")
        console.log("-".repeat(60))

        // 显示前 50 个元素
        const displayCount = Math.min(elements.length, 50)
        for (let i = 0; i < displayCount; i++) {
          console.log(`  ${elements[i]}`)
        }

        if (elements.length > 50) {
          console.log(`  ... (还有 ${elements.length - 50} 个元素)`)
        }

        console.log("\n" + "=".repeat(60))
        console.log("📊 统计信息:")
        console.log("=".repeat(60))

        // 分析元素类型
        const stats = analyzeElements(elements)
        console.log(`  总元素数: ${elements.length}`)
        console.log(`  按钮: ${stats.buttons}`)
        console.log(`  链接: ${stats.links}`)
        console.log(`  输入框: ${stats.inputs}`)
        console.log(`  其他: ${stats.others}`)

        // 验证基本功能
        expect(elements.length).toBeGreaterThan(0)
        expect(elements.some(e => e.includes("<button>") || e.includes("<a>") || e.includes("<input")))
          .toBeTruthy()

        console.log("\n✅ 测试通过！Snapshot 机制工作正常")
      },
    })
  })

  it("should take a screenshot of the page", async () => {
    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        if (!hasDocker || !playwrightClient) {
          return
        }

        console.log("\n📸 步骤 2: 截图测试")
        const screenshot = await playwrightClient.screenshot(false)

        console.log(`✅ 截图成功！大小: ${screenshot.length} bytes`)
        console.log(`   截图数据可用于 AI 视觉理解`)

        expect(screenshot.length).toBeGreaterThan(0)
      },
    })
  })
})

/**
 * 分析元素统计
 */
function analyzeElements(elements: string[]): {
  buttons: number
  links: number
  inputs: number
  others: number
} {
  const stats = { buttons: 0, links: 0, inputs: 0, others: 0 }

  for (const element of elements) {
    if (element.includes("<button>")) stats.buttons++
    else if (element.includes("<a>")) stats.links++
    else if (element.includes("<input>") || element.includes("<textarea>")) stats.inputs++
    else stats.others++
  }

  return stats
}
