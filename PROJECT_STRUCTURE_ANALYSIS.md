# OpenCode Ref 项目结构分析

> 基于 opencode 打造的 AI 智能体平台 - 架构分析报告

---

## 📊 目录结构概览

```
opencode-ref/
├── .claude/              # Claude Agent 配置和 Skills
├── .opencode/            # OpenCode 项目配置和运行时数据
├── .serena/              # Serena MCP 服务器缓存
├── docs/                 # 项目文档
├── packages/             # Monorepo 包结构
│   ├── app/             # SolidJS 前端 Web UI
│   ├── opencode/        # 核心后端引擎（主包）
│   ├── sdk-js/          # JavaScript/TypeScript SDK
│   ├── ui/              # 共享 UI 组件库（Kobalte）
│   ├── util/            # 共享工具函数
│   ├── plugin/          # 插件系统
│   └── function/        # 无服务器 RPC 函数
└── package.json         # 根配置（Turborepo Monorepo）
```

---

## 🏗️ 架构模式分析

### 1. **Monorepo + Turborepo 架构**
- 使用 `package.json` + `turbo.json` 管理多包
- 包之间通过 `workspace:*` 协议本地依赖
- 统一构建和测试流程

### 2. **分层架构**

```
┌─────────────────────────────────────────────────────┐
│                    Frontend                         │
│               (packages/app)                        │
│              SolidJS + Vite                         │
└──────────────────────┬──────────────────────────────┘
                       │ HTTP/WebSocket
┌──────────────────────▼──────────────────────────────┐
│                   Server Layer                      │
│           (packages/opencode/src/server)            │
│               Hono + SSE + WS                       │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│                 Session Manager                     │
│        (packages/opencode/src/session)              │
│              消息持久化 + 状态管理                   │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│                  Agent Engine                       │
│         (packages/opencode/src/agent)               │
│          LLM 推理 + 工具编排                        │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│                  Tool System                        │
│         (packages/opencode/src/tool)                │
│              Bash + Edit + Read + ...               │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│                Provider Layer                       │
│       (packages/opencode/src/provider)              │
│           Vercel AI SDK 抽象层                      │
└─────────────────────────────────────────────────────┘
```

### 3. **核心模块分布**

#### packages/opencode/src/ 目录结构分析：

| 目录 | 职责 | 健康度 |
|------|------|--------|
| `agent/` | AI 代理引擎，核心推理逻辑 | ✅ 清晰 |
| `session/` | 会话管理，消息持久化 | ✅ 清晰 |
| `server/` | HTTP/WebSocket 服务器 | ⚠️ 超大文件 |
| `tool/` | 工具注册表和执行 | ✅ 清晰 |
| `provider/` | LLM 提供商抽象 | ✅ 清晰 |
| `storage/` | KV 存储抽象层 | ✅ 清晰 |
| `docker/` | Docker 容器管理 | 🆕 新增 |
| `sandbox/` | 沙箱执行环境 | ⚠️ 待完善 |
| `mcp/` | MCP 协议支持 | ✅ 清晰 |

---

## 🔍 可疑/混乱区域分析

### 🔴 高度可疑

#### 1. `.opencode/tmp/` 中的大量会话临时文件
```
packages/opencode/.opencode/tmp/
├── session-ses_40127dbd0ffeSo7EX3ICfRW3gO/
├── session-ses_4016a4b0bffeNvWKcrA8FghJKF/
├── session-ses_401700334ffeiPs7vPzmL9R5Ur/
├── session-ses_403ef6475ffeOVgEOOJ7ykJ7tB/
└── session-ses_403ff0662ffemnMzXLbPLdEjcG/
```
**问题**：
- 5 个未清理的会话临时目录
- 包含 `.X11-unix` 和 Chromium 临时文件
- 可能是 Docker 沙箱执行后未正确清理
- **需要**：添加会话结束时的清理逻辑

#### 2. `packages/opencode/src/server/server.ts` 超大文件
**问题**：根据文档记录有 9 万+ 行代码
**风险**：
- 难以维护和理解
- 违反单一职责原则
- 建议拆分为多个模块

### 🟡 中度可疑

#### 3. `.opencode/skills/` 大量内置 Skills
```
algorithmic-art, brand-guidelines, canvas-design,
doc-coauthoring, docx, frontend-design, internal-comms,
mcp-builder, pdf, pptx, skill-creator, slack-gif-creator,
theme-factory, web-artifacts-builder, webapp-testing, xlsx
```
**问题**：
- 16+ 个内置 Skills，与核心代码混在一起
- 不属于 OpenCode 核心功能
- **建议**：移到独立仓库或 npm 包

#### 4. 测试覆盖不均匀
```
packages/opencode/test/
├── agent/          ✅
├── cli/            ✅
├── config/         ✅
├── docker/         ✅
├── e2e/            ✅
├── integration/    ✅
└── ...             ✅
```
**观察**：测试目录结构完整，但需要检查覆盖率

### 🟢 结构良好

#### 5. packages/opencode/src/tool/
工具系统结构清晰，按功能分类：
- `bash.ts` - Shell 命令执行
- `edit.ts` - 文件编辑
- `read.ts` - 文件读取
- `grep.ts` - 代码搜索
- `browser/` - 浏览器工具

---

## 🎯 架构优势

1. **清晰的职责分离** - 前端/服务器/引擎/存储分层明确
2. **可扩展的工具系统** - 基于注册表的插件化设计
3. **提供商抽象层** - 支持 20+ LLM 提供商
4. **Monorepo 管理** - 代码共享和依赖管理统一

---

## ⚠️ 需要改进的地方

1. **拆分超大文件** - `server.ts` 需要模块化
2. **清理临时文件** - Docker 沙箱会话清理机制
3. **剥离内置 Skills** - 移到独立包
4. **完善文档** - 部分模块缺少注释和文档

---

## 📋 下一步建议

1. 清理 `.opencode/tmp/` 中的临时会话文件
2. 添加会话结束时的清理 hook
3. 评估 `server.ts` 拆分方案
4. 整理内置 Skills，考虑外部化

---

*生成时间: 2025-01-27*
*基于 commit: 1a8f94ed*
