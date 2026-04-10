import {
  getHugoAivPipelineOptions,
  type HugoAivPipelineArgs,
  type HugoAivTaskOptions,
} from "./hugo-aiv/buildHugoAivApp";

export const SUPPORTED_BUILD_APPS = ["hookAi"] as const;
export const SUPPORTED_BUILD_ENVS = ["alpha", "production"] as const;
export const SUPPORTED_BUILD_BRANCHES = ["alpha", "main"] as const;
export const SUPPORTED_BUILD_PLATFORMS = ["android", "ios"] as const;

export type SupportedBuildApp = (typeof SUPPORTED_BUILD_APPS)[number];
export type SupportedBuildEnv = (typeof SUPPORTED_BUILD_ENVS)[number];
export type SupportedBuildBranch = (typeof SUPPORTED_BUILD_BRANCHES)[number];
export type SupportedBuildPlatform = (typeof SUPPORTED_BUILD_PLATFORMS)[number];

export function parseBuildPlatforms(value: unknown): SupportedBuildPlatform[] {
  if (typeof value !== "string") {
    throw new Error("请通过 --platform 传入平台，多个值用逗号分隔，例如 ios,android");
  }

  const items = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (items.length === 0) {
    throw new Error("请通过 --platform 传入至少一个平台，可选值为 android, ios");
  }

  const uniqueItems = [...new Set(items)];
  const invalid = uniqueItems.filter(
    (item): item is string =>
      !SUPPORTED_BUILD_PLATFORMS.includes(item as SupportedBuildPlatform),
  );

  if (invalid.length > 0) {
    throw new Error(
      `不支持的平台: ${invalid.join(", ")}。可选值为 ${SUPPORTED_BUILD_PLATFORMS.join(", ")}`,
    );
  }

  return uniqueItems as SupportedBuildPlatform[];
}

export function createBuildPipelineIds(params: {
  app: SupportedBuildApp;
  env: SupportedBuildEnv;
  branch: SupportedBuildBranch;
  platforms: SupportedBuildPlatform[];
}) {
  const supportedPipelines = new Set(getHugoAivPipelineOptions());
  const pipelines = params.platforms.map(
    (platform) =>
      `${params.app}-${platform === "ios" ? "iOS" : "android"}-${params.env}-${params.branch}`,
  );
  const unsupported = pipelines.filter((item) => !supportedPipelines.has(item));

  if (unsupported.length > 0) {
    throw new Error(`当前还不支持这些 pipeline: ${unsupported.join(", ")}`);
  }

  return pipelines;
}

export function extractTaskOptionsFromArgv(argv: Record<string, unknown>) {
  const taskOptions: HugoAivTaskOptions = {};
  const androidBuildClear = argv["android:buildAndroid.clear"];

  if (typeof androidBuildClear === "boolean") {
    taskOptions.android = {
      buildAndroid: {
        clear: androidBuildClear,
      },
    };
  }

  return hasTaskOptions(taskOptions) ? taskOptions : undefined;
}

export function createPipelineArgsFromBuildOptions(
  buildOptions: Record<string, unknown>,
): HugoAivPipelineArgs {
  const args: HugoAivPipelineArgs = {
    dryRun: false,
  };

  if (typeof buildOptions.autoVersionCode === "boolean") {
    args.autoVersionCode = buildOptions.autoVersionCode;
  }

  if (typeof buildOptions.legacyVersioning === "boolean") {
    args.legacyVersioning = buildOptions.legacyVersioning;
  }

  const taskOptions = coerceTaskOptions(buildOptions.taskOptions);
  if (taskOptions) {
    args.taskOptions = taskOptions;
  }

  return args;
}

function coerceTaskOptions(value: unknown) {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const taskOptions = value as Record<string, unknown>;
  const androidOptions =
    taskOptions.android && typeof taskOptions.android === "object"
      ? (taskOptions.android as Record<string, unknown>)
      : null;
  const buildAndroidOptions =
    androidOptions?.buildAndroid && typeof androidOptions.buildAndroid === "object"
      ? (androidOptions.buildAndroid as Record<string, unknown>)
      : null;

  if (typeof buildAndroidOptions?.clear === "boolean") {
    return {
      android: {
        buildAndroid: {
          clear: buildAndroidOptions.clear,
        },
      },
    } satisfies HugoAivTaskOptions;
  }

  return undefined;
}

function hasTaskOptions(taskOptions: HugoAivTaskOptions) {
  return Boolean(taskOptions.android?.buildAndroid);
}
