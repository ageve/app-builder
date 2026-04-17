# MCP Server 设计方案

## 概述

为 app-builder 构建系统添加 MCP (Model Context Protocol) Server，让 Codex、Amp 等支持 MCP 的 agent 能够通过局域网远程调用构建机的各种功能。

## 架构

```
构建机 (macOS)                          Agent 机器
┌─────────────────────┐               ┌──────────────────┐
│  MCP Server         │               │  Codex / Amp     │
│  (Streamable HTTP)  │◄─── LAN ────►│  (MCP Client)    │
│  :3800              │               │                  │
│                     │               │  读取动态配置:     │
│  启动时:             │               │  mcp-config.json │
│  1. 检测本机 LAN IP  │               │                  │
│  2. 生成 Bearer Token│              └──────────────────┘
│  3. 输出动态配置文件  │
│     (含 IP+Token)   │
└─────────────────────┘
```

## 传输方式

Streamable HTTP（MCP 最新推荐方式），使用 Bun 原生 `Bun.serve()` 对接 MCP SDK。

## 鉴权

Bearer Token。启动时生成 `crypto.randomUUID()`，写入动态配置文件，agent 请求时在 `Authorization` header 中携带。

## MCP Tools（7 个）

| Tool 名 | 参数 | 返回 | 说明 |
|---------|------|------|------|
| `build` | `app`, `env`, `branch`, `platform`, `autoVersionCode?`, `legacyVersioning?`, 平台专属参数 | `{ buildId, status: "started" }` | 异步发起，立即返回 buildId |
| `history` | `limit?`, `filter?` (JSON object) | BuildSummary[] JSON | 查询今日构建历史 |
| `info` | `buildId`, `task?` | 构建详情 + 任务列表 JSON | 查看构建状态/详情 |
| `resume` | `buildId` | 恢复结果 JSON | 恢复失败构建 |
| `retry` | `buildId`, `task` | 重试结果 JSON | 从指定任务重试 |
| `pipeline` | 无 | pipeline 列表 JSON | 查看所有 pipeline |
| `asc_upload` | `buildId` | 上传结果 JSON | 上传到 App Store Connect |

### Tool 设计要点

- CLI 输出格式化表格/彩色文本；MCP Tool 返回结构化 JSON
- `build` 是长时间操作（可能 30+ 分钟），handler 内 spawn pipeline.run() 不 await，立即返回 buildId，agent 用 `info` 轮询状态
- `filter` 参数从 CLI 的字符串 `key=value` 改为 JSON object `{"platform":"ios"}`

## 服务发现：动态配置生成

MCP Server 启动时自动执行：

### 1. 检测 LAN IP

遍历 `os.networkInterfaces()`，取第一个非 `127.0.0.1` 的 IPv4 地址。

### 2. 生成 Bearer Token

`crypto.randomUUID()`，每次启动刷新。

### 3. 输出两份文件

**a) `dist/mcp-config.json`** — MCP 客户端配置：

```json
{
  "mcpServers": {
    "app-builder": {
      "type": "streamable-http",
      "url": "http://192.168.1.100:3800/mcp",
      "headers": {
        "Authorization": "Bearer <token>"
      }
    }
  }
}
```

**b) `dist/mcp-skill.md`** — Agent Skill 提示，包含：

- 构建机当前地址
- 可用 Tool 清单及参数说明
- 使用示例
- `build` 异步操作注意事项

同时打印到 stdout，方便直接复制。

## 文件结构

```
src/mcp/
├── server.ts          # 入口：启动 HTTP server + MCP handler
├── auth.ts            # Bearer Token 验证中间件
├── tools.ts           # 7 个 tool 定义（name, description, inputSchema, handler）
├── handlers/          # 每个 tool 的 handler
│   ├── build.ts       # 异步发起构建，立即返回 buildId
│   ├── history.ts
│   ├── info.ts
│   ├── resume.ts
│   ├── retry.ts
│   ├── pipeline.ts
│   └── ascUpload.ts
└── discovery.ts       # LAN IP 检测 + 配置/skill 文件生成
```

## 依赖

- `@modelcontextprotocol/sdk`：官方 TS SDK，提供 Streamable HTTP 支持
- Bun 原生 HTTP server（`Bun.serve()`）

## 启动方式

```bash
# package.json scripts
"mcp": "bun run src/mcp/server.ts"

# 启动
bun mcp
```

## 典型 Agent 调用流程

```
Agent: build(app:"hookAi", env:"production", branch:"main", platform:"ios,android")
Server: { buildId: "abc123", status: "started" }

Agent: info(buildId:"abc123")    ← 轮询
Server: { status: "running", currentTask: "buildAndroid", ... }

Agent: info(buildId:"abc123")
Server: { status: "success", ... }
```

## 不暴露的功能

- `log`：调试开发用，MCP 不提供远程调试能力
- `clear`：危险操作，不暴露给 agent
- `init`：一次性初始化，不暴露
