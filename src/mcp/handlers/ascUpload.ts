import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { cwd } from "node:process";
import { $ } from "zx";
import {
  configSchema,
  createReadonlyConnect,
  getBuildHistoryByBuildId,
  getBuildSummaryByBuildId,
  findBuildSummariesByBuildIdPrefix,
  importIfExistsAndValidate,
  type Config,
} from "../../utils";
import type { BuildSummary } from "../../utils/sqliteUtil";

export async function handleAscUpload(params: { buildId: string; dryRun?: boolean }) {
  const db = await createReadonlyConnect();
  try {
    const summary = await resolveSummary(db, params.buildId);
    if (!summary) {
      return { error: `未找到构建记录: ${params.buildId}` };
    }

    if (summary.platform !== "iOS") {
      return {
        buildId: summary.buildId,
        platform: summary.platform ?? null,
        error: "只支持 iOS 构建记录。",
      };
    }

    const history = await getBuildHistoryByBuildId(db, summary.buildId);
    const buildIosTask = history.find(
      (item: Record<string, any>) => item.task_name === "buildIOS",
    );
    const buildIosOutput = safeParseJson(buildIosTask?.task_output);
    const ipaPath =
      buildIosOutput &&
      typeof buildIosOutput === "object" &&
      "ipaFiles" in buildIosOutput &&
      buildIosOutput.ipaFiles &&
      typeof buildIosOutput.ipaFiles === "object" &&
      "appStore" in buildIosOutput.ipaFiles
        ? String(buildIosOutput.ipaFiles.appStore || "")
        : "";

    if (!buildIosTask || !ipaPath) {
      return {
        buildId: summary.buildId,
        error: "这次构建没有可上传的 App Store IPA。",
      };
    }

    if (!existsSync(ipaPath)) {
      return {
        buildId: summary.buildId,
        ipaPath,
        error: "找到了构建记录，但本机上没有这个 IPA 文件。",
      };
    }

    const config = await loadConfig();
    const appId =
      config.appStore?.appId ??
      process.env.APP_STORE_CONNECT_APP_ID ??
      process.env.ASC_APP_ID;
    const profile =
      config.appStore?.profile ??
      process.env.APP_STORE_CONNECT_PROFILE ??
      process.env.ASC_PROFILE;

    if (!appId) {
      return {
        buildId: summary.buildId,
        error: "缺少 appId，请在 config.appStore.appId 或环境变量里提供。",
      };
    }

    if (params.dryRun) {
      return {
        dryRun: true,
        status: "ok",
        buildId: summary.buildId,
        pipeId: summary.pipeId,
        platform: summary.platform,
        appId,
        ipaPath,
        profile: profile ?? "default",
        message: "IPA 文件存在，可以上传，未实际执行。",
      };
    }

    try {
      const profileArgs = profile ? ["--profile", profile] : [];
      await $`asc ${profileArgs} builds upload --app ${appId} --ipa ${ipaPath}`;
      return {
        buildId: summary.buildId,
        pipeId: summary.pipeId,
        appId,
        ipaPath,
        status: "uploaded",
        message: "已提交到 App Store Connect。",
      };
    } catch (error) {
      return {
        buildId: summary.buildId,
        status: "failed",
        message: "上传失败",
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  } finally {
    await db.close();
  }
}

async function resolveSummary(
  db: Awaited<ReturnType<typeof createReadonlyConnect>>,
  buildIdOrPrefix: string,
): Promise<BuildSummary | null> {
  const exact = await getBuildSummaryByBuildId(db, buildIdOrPrefix);
  if (exact) return exact;
  const matched = await findBuildSummariesByBuildIdPrefix(db, buildIdOrPrefix);
  if (matched.length === 1) return matched[0];
  return null;
}

function safeParseJson(value: unknown) {
  if (typeof value !== "string" || value === "") return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

async function loadConfig(): Promise<Config> {
  const configPath = resolve(cwd(), "./src/cli/hugo-aiv/config.ts");
  const result = await importIfExistsAndValidate(configPath, configSchema);
  if (result.isOk()) return result.value as Config;
  const fallbackModule = await import("../../config.example");
  return fallbackModule.default as Config;
}
