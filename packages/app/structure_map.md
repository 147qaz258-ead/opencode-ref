# APP 包结构映射 (app Package Map)

主应用程序包，包含前端界面和交互逻辑。

### 核心目录功能映射 (Functional Mapping)

| 目录/文件 (Directory) | 中文说明 (Description) | 功能用途 (Purpose) |
| :--- | :--- | :--- |
| **src/components** | 组件库 | 构成界面的 UI 元素 |
| **src/pages** | 页面路由 | 定义应用的不同页面视图 |
| **src/context** | 全局状态 | 管理应用级状态 (Store) |
| **src/hooks** | 逻辑复用 | 封装通用逻辑 |

---

### 完整目录结构 (Directory Structure)

```text
📁 app
  📁 public
    📄 _headers
    📄 apple-touch-icon.png
    📄 favicon-96x96.png
    📄 favicon.ico
    📄 favicon.svg
    📄 site.webmanifest
    📄 social-share-zen.png
    📄 social-share.png
    📄 web-app-manifest-192x192.png
    📄 web-app-manifest-512x512.png
  📁 src # 源代码根目录
    📁 addons
      📄 serialize.test.ts
      📄 serialize.ts
    📁 components # UI 组件目录
      📁 session
        📄 index.ts
        📄 session-context-tab.tsx
        📄 session-header.tsx
        📄 session-new-view.tsx
        📄 session-sortable-tab.tsx
        📄 session-sortable-terminal-tab.tsx
      📁 tools
        📄 BrowserToolView.tsx
        📄 FileToolView.tsx
        📄 ShellToolView.tsx
      📄 ArtifactList.tsx
      📄 ArtifactsDrawer.tsx
      📄 ArtifactsPanel.tsx
      📄 dialog-connect-provider.tsx
      📄 dialog-edit-project.tsx
      📄 dialog-manage-models.tsx
      📄 dialog-select-file.tsx
      📄 dialog-select-mcp.tsx
      📄 dialog-select-model-unpaid.tsx
      📄 dialog-select-model.tsx
      📄 dialog-select-provider.tsx
      📄 dialog-select-server.tsx
      📄 DynamicToolPanel.tsx
      📄 EmptyToolPanel.tsx
      📄 file-tree.tsx
      📄 link.tsx
      📄 prompt-input.tsx
      📄 ReviewModal.tsx
      📄 SandboxView.tsx
      📄 session-context-usage.tsx
      📄 session-mcp-indicator.tsx
      📄 SkillCapsule.tsx
      📄 SkillCard.tsx
      📄 terminal.tsx
      📄 ThinkingFlow.tsx
      📄 ToolPanel.tsx
      📄 VNCViewer.tsx
    📁 context #状态管理上下文
      📄 command.tsx
      📄 file.tsx
      📄 global-sdk.tsx
      📄 global-sync.tsx
      📄 layout.tsx
      📄 local.tsx
      📄 notification.tsx
      📄 permission.tsx
      📄 platform.tsx
      📄 prompt.tsx
      📄 sdk.tsx
      📄 server.tsx
      📄 skill.tsx
      📄 sync.tsx
      📄 terminal.tsx
    📁 hooks # 自定义 React/Solid 钩子
      📄 use-providers.ts
      📄 useActiveTool.ts
      📄 useSandboxEvents.ts
      📄 useSkillLoader.ts
    📁 pages # 路由页面定义
      📄 directory-layout.tsx
      📄 error.tsx
      📄 hero.tsx
      📄 layout.tsx
      📄 session.tsx
      📄 skill-detail.tsx
      📄 skills.tsx
    📁 types
      📄 novnc.d.ts
    📁 utils # 通用工具函数
      📄 dom.ts
      📄 id.ts
      📄 index.ts
      📄 persist.ts
      📄 prompt.ts
      📄 same.ts
      📄 solid-dnd.tsx
      📄 speech.ts
    📄 app.tsx # 应用入口组件
    📄 custom-elements.d.ts
    📄 entry.tsx
    📄 env.d.ts
    📄 index.css
    📄 index.ts
    📄 sst-env.d.ts
  📄 .gitignore
  📄 AGENTS.md
  📄 bunfig.toml
  📄 happydom.ts
  📄 index.html
  📄 package.json
  📄 README.md
  📄 sst-env.d.ts
  📄 tsconfig.json
  📄 vite.config.ts # Vite 构建配置
  📄 vite.js
```
