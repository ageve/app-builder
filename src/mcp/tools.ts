import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { handleBuild } from "./handlers/build";
import { handleHistory } from "./handlers/history";
import { handleInfo } from "./handlers/info";
import { handleResume } from "./handlers/resume";
import { handleRetry } from "./handlers/retry";
import { handlePipeline } from "./handlers/pipeline";
import { handleAscUpload } from "./handlers/ascUpload";

export function registerTools(server: McpServer) {
  server.tool(
    "build",
    "发起 APP 构建（异步，立即返回后需用 info 轮询状态）",
    {
      app: z.enum(["hookAi"]).describe("应用名"),
      env: z.enum(["alpha", "production"]).describe("环境"),
      branch: z.enum(["alpha", "main"]).describe("代码分支"),
      platform: z
        .string()
        .describe("构建平台，支持 android / ios，多个用逗号分隔"),
      autoVersionCode: z
        .boolean()
        .optional()
        .describe("是否自动递增版本号"),
      legacyVersioning: z
        .boolean()
        .optional()
        .describe("旧版本号兼容模式"),
      androidBuildClear: z
        .boolean()
        .optional()
        .describe("Android 构建前是否清理（默认 true）"),
      iosPodInstall: z
        .boolean()
        .optional()
        .describe("iOS 是否强制 pod install"),
      iosProvisioningAuto: z
        .boolean()
        .optional()
        .describe("iOS 导出时是否自动签名更新"),
      dryRun: z
        .boolean()
        .optional()
        .describe("试运行模式，只验证参数不实际执行构建"),
    },
    async (params) => {
      const result = await handleBuild(params);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "history",
    "查询今日构建历史",
    {
      limit: z.number().optional().describe("限制条数，默认 10"),
      filter: z
        .record(z.string(), z.string())
        .optional()
        .describe(
          "过滤条件 JSON，支持字段: platform, env, branch, status, pipeId, projectName, buildId",
        ),
    },
    async (params) => {
      const result = await handleHistory(params);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "info",
    "查看构建详情和任务列表",
    {
      buildId: z.string().describe("构建 ID（支持前缀匹配）"),
      task: z.string().optional().describe("查看指定任务的详细信息"),
    },
    async (params) => {
      const result = await handleInfo(params);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "resume",
    "恢复失败的构建",
    {
      buildId: z.string().describe("要恢复的构建 ID"),
      dryRun: z
        .boolean()
        .optional()
        .describe("试运行模式，只查询构建状态不实际恢复"),
    },
    async (params) => {
      const result = await handleResume(params);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "retry",
    "从某次构建的指定任务开始重新执行后续步骤",
    {
      buildId: z.string().describe("构建 ID"),
      task: z.string().describe("要从哪个任务开始重试"),
      dryRun: z
        .boolean()
        .optional()
        .describe("试运行模式，只验证任务是否可重试不实际执行"),
    },
    async (params) => {
      const result = await handleRetry(params);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "pipeline",
    "查看所有 pipeline 列表",
    {},
    async () => {
      const result = await handlePipeline();
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "asc_upload",
    "上传 iOS 构建产物到 App Store Connect",
    {
      buildId: z.string().describe("iOS 构建的 buildId"),
      dryRun: z
        .boolean()
        .optional()
        .describe("试运行模式，只验证 IPA 是否存在不实际上传"),
    },
    async (params) => {
      const result = await handleAscUpload(params);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );
}
