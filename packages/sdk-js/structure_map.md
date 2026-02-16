# SDK-JS 包结构映射 (sdk-js Package Map)

JavaScript SDK，用于客户端调用后端服务。

### 核心目录功能映射 (Functional Mapping)

| 目录/文件 (Directory) | 中文说明 (Description) | 功能用途 (Purpose) |
| :--- | :--- | :--- |
| **src/client** | 客户端 | 浏览器端使用的 SDK |
| **src/gen** | 类型生成 | 根据 OpenAPI 自动生成的 TypeScript 类型 |

---

### 完整目录结构 (Directory Structure)

```text
📁 sdk-js
  📁 example
    📄 example.ts
  📁 script
    📄 build.ts
    📄 publish.ts
  📁 src # SDK 源码
    📁 gen # 自动生成的类型定义
      📁 client # 客户端实现
        📄 client.gen.ts
        📄 index.ts
        📄 types.gen.ts
        📄 utils.gen.ts
      📁 core
        📄 auth.gen.ts
        📄 bodySerializer.gen.ts
        📄 params.gen.ts
        📄 pathSerializer.gen.ts
        📄 queryKeySerializer.gen.ts
        📄 serverSentEvents.gen.ts
        📄 types.gen.ts
        📄 utils.gen.ts
      📄 client.gen.ts
      📄 sdk.gen.ts
      📄 types.gen.ts
    📁 v2
      📁 gen # 自动生成的类型定义
        📁 client # 客户端实现
          📄 client.gen.ts
          📄 index.ts
          📄 types.gen.ts
          📄 utils.gen.ts
        📁 core
          📄 auth.gen.ts
          📄 bodySerializer.gen.ts
          📄 params.gen.ts
          📄 pathSerializer.gen.ts
          📄 queryKeySerializer.gen.ts
          📄 serverSentEvents.gen.ts
          📄 types.gen.ts
          📄 utils.gen.ts
        📄 client.gen.ts
        📄 sdk.gen.ts
        📄 types.gen.ts
      📄 client.ts
      📄 index.ts
      📄 server.ts
    📄 client.ts
    📄 index.ts
    📄 server.ts
  📄 .gitignore
  📄 openapi.json
  📄 package.json
  📄 sst-env.d.ts
  📄 tsconfig.json
```
