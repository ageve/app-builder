import { resolve } from "node:path";
import { cwd } from "node:process";
import {
  createHugoAivPipelines,
  type HugoAivPipelineArgs,
  type HugoAivTaskOptions,
} from "../../cli/hugo-aiv/buildHugoAivApp";
import {
  createBuildPipelineIds,
  parseBuildPlatforms,
  type SupportedBuildApp,
  type SupportedBuildBranch,
  type SupportedBuildEnv,
  SUPPORTED_BUILD_APPS,
  SUPPORTED_BUILD_BRANCHES,
  SUPPORTED_BUILD_ENVS,
} from "../../cli/modHelpers";
import {
  configSchema,
  importIfExistsAndValidate,
  type Config,
} from "../../utils";
import { pipelineRun } from "../../v2/pipelineRun";

export async function handleBuild(params: {
  app: string;
  env: string;
  branch: string;
  platform: string;
  autoVersionCode?: boolean;
  legacyVersioning?: boolean;
  androidBuildClear?: boolean;
  iosPodInstall?: boolean;
  iosProvisioningAuto?: boolean;
  dryRun?: boolean;
}) {
  if (!SUPPORTED_BUILD_APPS.includes(params.app as SupportedBuildApp)) {
    return { error: `不支持的 app: ${params.app}。可选: ${SUPPORTED_BUILD_APPS.join(", ")}` };
  }
  if (!SUPPORTED_BUILD_ENVS.includes(params.env as SupportedBuildEnv)) {
    return { error: `不支持的 env: ${params.env}。可选: ${SUPPORTED_BUILD_ENVS.join(", ")}` };
  }
  if (!SUPPORTED_BUILD_BRANCHES.includes(params.branch as SupportedBuildBranch)) {
    return { error: `不支持的 branch: ${params.branch}。可选: ${SUPPORTED_BUILD_BRANCHES.join(", ")}` };
  }

  let platforms;
  try {
    platforms = parseBuildPlatforms(params.platform);
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }

  let pipelineIds;
  try {
    pipelineIds = createBuildPipelineIds({
      app: params.app as SupportedBuildApp,
      env: params.env as SupportedBuildEnv,
      branch: params.branch as SupportedBuildBranch,
      platforms,
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }

  if (params.dryRun) {
    return {
      dryRun: true,
      status: "ok",
      app: params.app,
      env: params.env,
      branch: params.branch,
      platforms: platforms.join(","),
      pipelines: pipelineIds,
      message: "参数验证通过，未实际执行构建。",
    };
  }

  const config = await loadConfig();

  const taskOptions: HugoAivTaskOptions = {};
  if (typeof params.androidBuildClear === "boolean") {
    taskOptions.android = { buildAndroid: { clear: params.androidBuildClear } };
  }
  if (
    typeof params.iosPodInstall === "boolean" ||
    typeof params.iosProvisioningAuto === "boolean"
  ) {
    taskOptions.ios = {
      buildIOS: {
        ...(typeof params.iosPodInstall === "boolean"
          ? { podInstall: params.iosPodInstall }
          : {}),
        ...(typeof params.iosProvisioningAuto === "boolean"
          ? { provisioningAuto: params.iosProvisioningAuto }
          : {}),
      },
    };
  }

  const pipelineArgs: HugoAivPipelineArgs = {
    autoVersionCode: params.autoVersionCode,
    legacyVersioning: params.legacyVersioning,
    dryRun: false,
    ...(taskOptions.android || taskOptions.ios ? { taskOptions } : {}),
  };

  const createdPipelines = createHugoAivPipelines({
    config,
    pipelines: pipelineIds,
    args: pipelineArgs,
  });

  // 异步执行，不阻塞返回
  pipelineRun(createdPipelines).catch((error) => {
    console.error(
      "[MCP build] pipeline error:",
      error instanceof Error ? error.message : String(error),
    );
  });

  return {
    status: "started",
    pipelines: pipelineIds,
    message: "构建已发起，请使用 info 工具轮询构建状态。",
  };
}

async function loadConfig(): Promise<Config> {
  const configPath = resolve(cwd(), "./src/cli/hugo-aiv/config.ts");
  const result = await importIfExistsAndValidate(configPath, configSchema);
  if (result.isOk()) {
    return result.value as Config;
  }
  const fallbackModule = await import("../../config.example");
  return fallbackModule.default as Config;
}
