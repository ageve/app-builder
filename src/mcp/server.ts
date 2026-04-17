import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { verifyToken } from "./auth";
import {
  detectLanIp,
  loadOrCreateToken,
  refreshToken,
  writeDiscoveryFiles,
} from "./discovery";
import { registerTools } from "./tools";

const args = process.argv.slice(2);

if (args.includes("--refreshToken")) {
  const newToken = refreshToken();
  const lanIp = detectLanIp();
  const host = lanIp === "127.0.0.1" ? "localhost" : lanIp;
  const PORT = Number(process.env.MCP_PORT) || 3800;
  const { configPath, skillPath, mcpConfigJson } = writeDiscoveryFiles({
    host,
    port: PORT,
    token: newToken,
  });

  console.log("");
  console.log("✔ Token 已刷新");
  console.log(`  Token:  ${newToken}`);
  console.log(`  Config: ${configPath}`);
  console.log(`  Skill:  ${skillPath}`);
  console.log("");
  console.log("─── mcp-config.json ───");
  console.log(mcpConfigJson);
  process.exit(0);
}

const PORT = Number(process.env.MCP_PORT) || 3800;
const token = process.env.MCP_TOKEN || loadOrCreateToken();

function createServer() {
  const server = new McpServer({
    name: "app-builder",
    version: "1.0.0",
  });
  registerTools(server);
  return server;
}

function timestamp() {
  return new Date().toLocaleTimeString("en-GB", { hour12: false });
}

function logRequest(
  req: Request,
  method: string,
  status: number,
  startMs: number,
  body: unknown,
  responseBody: string | null,
) {
  const elapsed = (performance.now() - startMs).toFixed(0);
  const ip = req.headers.get("x-forwarded-for") ?? "-";
  console.log(
    `${timestamp()}  ${req.method} ${method.padEnd(16)} ${status}  ${elapsed}ms  ${ip}`,
  );

  const params = extractParams(body);
  if (params !== null) {
    console.log(`  ← ${JSON.stringify(params)}`);
  }

  if (responseBody) {
    console.log(`  → ${responseBody}`);
  }
}

function extractMethod(body: unknown): string {
  if (body && typeof body === "object" && "method" in body) {
    return String((body as Record<string, unknown>).method);
  }
  return "-";
}

function extractParams(body: unknown): unknown {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (b.method === "tools/call" && b.params && typeof b.params === "object") {
    const p = b.params as Record<string, unknown>;
    return { tool: p.name, arguments: p.arguments };
  }
  if (b.params !== undefined) return b.params;
  return null;
}

function extractResponseContent(text: string): string | null {
  try {
    const parsed = JSON.parse(text);
    if (parsed.result?.content?.[0]?.text) {
      return parsed.result.content[0].text;
    }
    if (parsed.error) {
      return JSON.stringify(parsed.error);
    }
  } catch {}
  return null;
}

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const startMs = performance.now();
    const url = new URL(req.url);

    if (url.pathname !== "/mcp") {
      logRequest(req, url.pathname, 404, startMs, null, null);
      return new Response("Not Found", { status: 404 });
    }

    if (!verifyToken(req, token)) {
      logRequest(req, "/mcp", 401, startMs, null, null);
      return Response.json(
        {
          jsonrpc: "2.0",
          error: { code: -32000, message: "Unauthorized" },
          id: null,
        },
        { status: 401 },
      );
    }

    let body: unknown;
    try {
      body = await req.clone().json();
    } catch {}
    const method = extractMethod(body);

    const mcpServer = createServer();
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    await mcpServer.connect(transport);

    try {
      const response = await transport.handleRequest(req);
      let responseContent: string | null = null;
      try {
        const cloned = response.clone();
        const text = await cloned.text();
        responseContent = extractResponseContent(text);
      } catch {}
      logRequest(req, method, response.status, startMs, body, responseContent);
      return response;
    } catch (error) {
      logRequest(req, method, 500, startMs, body, null);
      throw error;
    } finally {
      await mcpServer.close();
    }
  },
});

const lanIp = detectLanIp();
const host = lanIp === "127.0.0.1" ? "localhost" : lanIp;
const { url, configPath, skillPath, mcpConfigJson } = writeDiscoveryFiles({
  host,
  port: PORT,
  token,
});

console.log("");
console.log("✔ MCP Server started");
console.log(`  URL:    ${url}`);
console.log(`  Token:  ${token}`);
console.log(`  Config: ${configPath}`);
console.log(`  Skill:  ${skillPath}`);
console.log("");
console.log("─── mcp-config.json ───");
console.log(mcpConfigJson);
console.log("");
console.log("Waiting for connections...");
console.log("");
