import { networkInterfaces } from "node:os";
import { resolve } from "node:path";
import { cwd } from "node:process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const TOKEN_FILE = resolve(cwd(), "data/mcp-token");

export function detectLanIp(): string {
  const interfaces = networkInterfaces();
  for (const entries of Object.values(interfaces)) {
    if (!entries) continue;
    for (const entry of entries) {
      if (entry.family === "IPv4" && !entry.internal) {
        return entry.address;
      }
    }
  }
  return "127.0.0.1";
}

export function generateToken(): string {
  return crypto.randomUUID();
}

export function loadOrCreateToken(): string {
  if (existsSync(TOKEN_FILE)) {
    const saved = readFileSync(TOKEN_FILE, "utf8").trim();
    if (saved) return saved;
  }
  const token = generateToken();
  saveToken(token);
  return token;
}

export function refreshToken(): string {
  const token = generateToken();
  saveToken(token);
  return token;
}

function saveToken(token: string) {
  const dir = resolve(cwd(), "data");
  mkdirSync(dir, { recursive: true });
  writeFileSync(TOKEN_FILE, token, "utf8");
}

export function writeDiscoveryFiles(options: {
  host: string;
  port: number;
  token: string;
}) {
  const { host, port, token } = options;
  const url = `http://${host}:${port}/mcp`;
  const distDir = resolve(cwd(), "dist");
  mkdirSync(distDir, { recursive: true });

  const mcpConfig = {
    mcpServers: {
      "app-builder": {
        type: "streamable-http",
        url,
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    },
  };
  writeFileSync(
    resolve(distDir, "mcp-config.json"),
    JSON.stringify(mcpConfig, null, 2),
    "utf8",
  );

  const skill = `# App Builder MCP Server

## 连接信息

- **地址**: ${url}
- **鉴权**: Bearer Token（已包含在 mcp-config.json 中）

## 可用 Tools

### build
发起 APP 构建（异步，立即返回 buildId）。
- \`app\`: 应用名（当前支持 hookAi）
- \`env\`: 环境（alpha / production）
- \`branch\`: 分支（alpha / main）
- \`platform\`: 平台（android / ios，多个用逗号分隔）
- \`autoVersionCode\`: 可选，是否自动递增版本号
- \`legacyVersioning\`: 可选，旧版本号兼容
- \`androidBuildClear\`: 可选，Android 构建前是否清理
- \`iosPodInstall\`: 可选，iOS 是否强制 pod install
- \`iosProvisioningAuto\`: 可选，iOS 导出时是否自动签名

> build 是异步操作，返回 buildId 后需用 info 轮询状态。

### history
查询今日构建历史。
- \`limit\`: 可选，限制条数（默认 10）
- \`filter\`: 可选，过滤条件 JSON（如 {"platform":"ios","env":"alpha"}）

### info
查看构建详情。
- \`buildId\`: 构建 ID
- \`task\`: 可选，查看指定任务详情

### resume
恢复失败构建。
- \`buildId\`: 构建 ID

### retry
从指定任务重试。
- \`buildId\`: 构建 ID
- \`task\`: 任务名

### pipeline
查看所有 pipeline，无参数。

### asc_upload
上传 iOS 构建产物到 App Store Connect。
- \`buildId\`: 构建 ID

## 典型流程

1. 调用 \`build\` 发起构建，获得 \`buildId\`
2. 调用 \`info\` 轮询构建状态
3. 构建失败时用 \`resume\` 恢复或 \`retry\` 重试
4. iOS 正式包构建成功后用 \`asc_upload\` 上传 App Store
`;
  writeFileSync(resolve(distDir, "mcp-skill.md"), skill, "utf8");

  const mcpConfigJson = JSON.stringify(mcpConfig, null, 2);

  return {
    url,
    configPath: resolve(distDir, "mcp-config.json"),
    skillPath: resolve(distDir, "mcp-skill.md"),
    mcpConfigJson,
    skill,
  };
}
