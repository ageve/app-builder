import { ensureDirSync, existsSync } from "fs-extra";
import prepareCode from "../v2/tasks/prepareCode";
import prepareDependencies from "../v2/tasks/prepareDependencies";
import prepareVar from "../v2/tasks/prepareVar";
import createPrepareEnv from "../v2/tasks/prepareEnv";
import createBuildAndroid from "../v2/tasks/buildAndroid";
import createBuildIOS from "../v2/tasks/buildIOS";
import renameLog from "../v2/tasks/renameLog";
import copyToFileBrowser from "../v2/custom/copyToFileBrowser";
import { codemodAndroid } from "../v2/custom/codemodAndroid";
import createCopyFile from "../v2/custom/copyFile";
import createPrepareEnvProperties from "../v2/custom/prepareEnvProperties";
import createPrepareEnvConfig from "../v2/custom/prepareEnvConfig";
import createSyncArchive from "../v2/tasks/syncXcodeArchive";
import createUploadFir from "../v2/tasks/uploadFir";
import createUploadPgyer from "../v2/tasks/uploadPgyer";
import { createUploadQiniu } from "../v2/custom/uploadQiniu";
import { createLogger } from "../v2/utils/common";
import { getOrderedStepsForPlatform, stepDefinitions } from "./definitions";
import { findUploadRecordByKey, getPipelineRunDetail, insertUploadRecord, replaceArtifactsForStep, savePipelineRunContext, updateStepState } from "./store";
import { Artifact, PipelineRunContext, PipelineRunDetail, ResolvedRunConfig, StepId, StepResult, StepState, StepStatus, UploadRecord } from "./types";
import { sha256File, structuredError } from "./state";

function nowIso() {
  return new Date().toISOString();
}

export type StepPersistence = {
  getRunDetail: (runId: string) => Promise<PipelineRunDetail | null>;
  syncStep: (
    runId: string,
    step: StepState,
    stepOrder: number,
    context: PipelineRunContext,
    artifacts: Artifact[]
  ) => Promise<void>;
  findUploadRecordByKey: (idempotencyKey: string) => Promise<UploadRecord | undefined>;
  insertUploadRecord: (runId: string, record: UploadRecord) => Promise<void>;
};

function makeArtifactsFromOutputs(
  stepId: StepId,
  outputs: Record<string, unknown>
): Artifact[] {
  if (stepId === "build_android") {
    const productFiles = (outputs.productFiles ?? []) as string[];
    return productFiles.map((path) => ({
      kind: "apk",
      path,
      label: "Android APK",
    }));
  }
  if (stepId === "build_ios") {
    const artifacts: Artifact[] = [];
    const archiveFile = outputs.archiveFile;
    if (typeof archiveFile === "string") {
      artifacts.push({
        kind: "xcarchive",
        path: archiveFile,
        label: "Xcode Archive",
      });
    }
    const ipaFiles = outputs.ipaFiles as Record<string, string> | undefined;
    if (ipaFiles) {
      for (const [distribution, path] of Object.entries(ipaFiles)) {
        if (path) {
          artifacts.push({
            kind: "ipa",
            path,
            label: `iOS IPA (${distribution})`,
          });
        }
      }
    }
    return artifacts;
  }
  return [];
}

function buildLegacyContext(runContext: PipelineRunContext) {
  const resolvedConfig = runContext.resolvedConfig;
  ensureDirSync(resolvedConfig.defaults.workspace);
  ensureDirSync(resolvedConfig.defaults.outputDir);
  ensureDirSync(resolvedConfig.defaults.runDir);

  const context: Record<string, unknown> = {
    config: {
      gitUri: resolvedConfig.gitUri,
      appInfo: resolvedConfig.appInfo,
      appStore: resolvedConfig.appStore,
      fir: resolvedConfig.uploads.fir?.apiKey
        ? { apiKey: resolvedConfig.uploads.fir.apiKey }
        : undefined,
      pgyer: resolvedConfig.uploads.pgyer?.apiKey
        ? {
            apiKey: resolvedConfig.uploads.pgyer.apiKey,
            buildType: resolvedConfig.uploads.pgyer.buildType,
          }
        : undefined,
      uploadApi: resolvedConfig.uploads.qiniu?.url
        ? {
            alpha:
              resolvedConfig.pipeline.env === "alpha"
                ? resolvedConfig.uploads.qiniu.url
                : "",
            prod:
              resolvedConfig.pipeline.env === "production"
                ? resolvedConfig.uploads.qiniu.url
                : "",
          }
        : undefined,
    },
    projectConfig: {
      uploadApi: resolvedConfig.uploads.qiniu?.url
        ? {
            alpha:
              resolvedConfig.pipeline.env === "alpha"
                ? resolvedConfig.uploads.qiniu.url
                : "",
            prod:
              resolvedConfig.pipeline.env === "production"
                ? resolvedConfig.uploads.qiniu.url
                : "",
          }
        : undefined,
    },
    resolvedConfig,
    pipelineRun: runContext,
    branch: resolvedConfig.pipeline.branch,
    gitUri: resolvedConfig.gitUri,
    clean: resolvedConfig.flags.cleanWorkspace,
    env: resolvedConfig.pipeline.env,
    workspace: resolvedConfig.defaults.workspace,
    output: resolvedConfig.defaults.outputDir,
    logFile: resolvedConfig.defaults.logFile,
    cwd: resolvedConfig.defaults.rootCwd,
    projectName: resolvedConfig.projectName,
    pipeId: resolvedConfig.runId,
    logger: createLogger({ filename: resolvedConfig.defaults.logFile }),
  };

  const variableOutputs = runContext.stepResults.prepare_variables?.outputs;
  if (variableOutputs) {
    context.variables = variableOutputs;
  }
  const prepareEnvOutputs = runContext.stepResults.prepare_env?.outputs;
  if (prepareEnvOutputs) {
    context.prepareEnv = prepareEnvOutputs;
  }
  const buildAndroidOutputs = runContext.stepResults.build_android?.outputs;
  if (buildAndroidOutputs) {
    context.buildAndroid = buildAndroidOutputs;
  }
  const buildIosOutputs = runContext.stepResults.build_ios?.outputs;
  if (buildIosOutputs) {
    context.buildIOS = buildIosOutputs;
  }

  return context;
}

async function runLegacyTask(
  stepId: StepId,
  resolvedConfig: ResolvedRunConfig,
  runContext: PipelineRunContext
) {
  const context = buildLegacyContext(runContext);
  switch (stepId) {
    case "prepare_code":
      return await prepareCode(context);
    case "prepare_dependencies":
      return await prepareDependencies(context);
    case "prepare_variables":
      return await prepareVar(context);
    case "prepare_env":
      return await createPrepareEnv(
        resolvedConfig.files.envFile,
        resolvedConfig.flags.autoVersionCode,
        resolvedConfig.flags.legacyVersioning,
        resolvedConfig.pipeline.platform
      )(context);
    case "prepare_platform_env":
      return resolvedConfig.pipeline.platform === "android"
        ? await createPrepareEnvProperties(
            resolvedConfig.files.envPropertiesFile!
          )(context)
        : await createPrepareEnvConfig(resolvedConfig.files.envConfigFile!)(context);
    case "build_android":
      if (resolvedConfig.features.codemodAndroid) {
        await codemodAndroid(context);
      }
      if (resolvedConfig.files.agconnectFile) {
        await createCopyFile([
          {
            file: resolvedConfig.files.agconnectFile,
            target: "./android/app/agconnect-services.json",
          },
        ])(context);
      }
      return await createBuildAndroid({ clean: true })(context);
    case "build_ios":
      return await createBuildIOS({
        projectName: resolvedConfig.build.iosProjectName,
        schema: resolvedConfig.build.iosScheme,
        buildType: resolvedConfig.build.iosBuildType,
        exportOptionsPath: {
          adHoc: resolvedConfig.files.exportOptionsAdHoc!,
          appStore:
            resolvedConfig.files.exportOptionsAppStore ??
            resolvedConfig.files.exportOptionsAdHoc!,
        },
        ipaName: resolvedConfig.build.ipaName,
        distributions: resolvedConfig.build.distributions,
      })(context);
    case "post_build_local": {
      const outputs: Record<string, unknown> = {};
      if (
        resolvedConfig.pipeline.platform === "android" &&
        resolvedConfig.features.copyToFileBrowser
      ) {
        outputs.copyToFileBrowser = await copyToFileBrowser(context);
      }
      if (
        resolvedConfig.pipeline.platform === "iOS" &&
        resolvedConfig.features.syncArchive
      ) {
        outputs.syncArchive = await createSyncArchive({
          schema: resolvedConfig.build.iosScheme,
        })(context);
      }
      return outputs;
    }
    case "upload_distribution": {
      const outputs: Record<string, unknown> = {};
      if (
        resolvedConfig.uploads.fir?.enabled &&
        resolvedConfig.uploads.fir.apiKey
      ) {
        outputs.fir = await createUploadFir(
          resolvedConfig.uploads.fir.apiKey,
          resolvedConfig.pipeline.platform
        )(context);
      }
      if (
        resolvedConfig.uploads.pgyer?.enabled &&
        resolvedConfig.uploads.pgyer.apiKey &&
        resolvedConfig.uploads.pgyer.buildType
      ) {
        outputs.pgyer = await createUploadPgyer(
          {
            apiKey: resolvedConfig.uploads.pgyer.apiKey,
            buildType: resolvedConfig.uploads.pgyer.buildType,
          },
          resolvedConfig.pipeline.platform
        )(context);
      }
      if (resolvedConfig.uploads.qiniu?.enabled) {
        outputs.qiniu = await createUploadQiniu({
          key: resolvedConfig.uploads.qiniu.key ?? "",
        })(context);
      }
      return outputs;
    }
    case "finalize_logs":
      return await renameLog({
        external: resolvedConfig.pipeline.platform.toLowerCase().trim(),
      })(context);
    case "resolve_config":
      return runContext.resolvedConfig as unknown as Record<string, unknown>;
    default:
      throw new Error(`unsupported step: ${stepId}`);
  }
}

function mergeArtifacts(
  currentArtifacts: Artifact[],
  nextArtifacts: Artifact[]
): Artifact[] {
  const byPath = new Map(currentArtifacts.map((artifact) => [artifact.path, artifact]));
  for (const artifact of nextArtifacts) {
    byPath.set(artifact.path, artifact);
  }
  return Array.from(byPath.values());
}

function ensureDependencies(
  runContext: PipelineRunContext,
  stepState: StepState
) {
  for (const dependsOn of stepState.dependsOn) {
    if (runContext.stepResults[dependsOn]?.status !== "success") {
      throw new Error(`step ${stepState.stepId} requires ${dependsOn} to be successful`);
    }
  }
}

function orderedArtifactsForUpload(runContext: PipelineRunContext) {
  const platform = runContext.resolvedConfig.pipeline.platform;
  const stepId = platform === "android" ? "build_android" : "build_ios";
  return runContext.stepResults[stepId]?.artifacts ?? [];
}

async function recordUploadIds(
  persistence: StepPersistence,
  runContext: PipelineRunContext
) {
  const versionName = String(
    runContext.stepResults.prepare_env?.outputs.versionName ?? ""
  );
  const versionCode = String(
    runContext.stepResults.prepare_env?.outputs.versionCode ?? ""
  );

  for (const artifact of orderedArtifactsForUpload(runContext)) {
    if (!existsSync(artifact.path)) {
      throw new Error(`artifact does not exist for upload: ${artifact.path}`);
    }
    const artifactSha256 = sha256File(artifact.path);
    artifact.sha256 = artifactSha256;

    const channels: UploadRecord["channel"][] = [];
    if (runContext.resolvedConfig.uploads.fir?.enabled) channels.push("fir");
    if (runContext.resolvedConfig.uploads.pgyer?.enabled) channels.push("pgyer");
    if (runContext.resolvedConfig.uploads.qiniu?.enabled) channels.push("qiniu");

    for (const channel of channels) {
      const idempotencyKey = [
        runContext.resolvedConfig.projectId,
        runContext.resolvedConfig.profileId,
        "upload_distribution",
        channel,
        versionName,
        versionCode,
        artifactSha256,
      ].join(":");

      const existing = await persistence.findUploadRecordByKey(idempotencyKey);
      if (existing) {
        continue;
      }

      const uploadRecord: UploadRecord = {
        idempotencyKey,
        channel,
        artifactPath: artifact.path,
        artifactSha256,
        stepId: "upload_distribution",
        createdAt: nowIso(),
      };
      await persistence.insertUploadRecord(runContext.runId, uploadRecord);
      runContext.uploads.push(uploadRecord);
    }
  }
}

function makeStepState(stepId: StepId, status: StepStatus, startedAt?: string): StepState {
  const base = { ...stepDefinitions[stepId] };
  if (stepId === "post_build_local" || stepId === "upload_distribution" || stepId === "finalize_logs") {
    base.dependsOn = [];
  }
  return {
    stepId,
    displayName: base.displayName,
    status,
    retryable: base.retryable,
    checkpointable: base.checkpointable,
    dependsOn: [...base.dependsOn],
    startedAt,
    outputs: {},
    artifacts: [],
    warnings: [],
  };
}

function applyDynamicDependencies(runContext: PipelineRunContext, step: StepState) {
  if (step.stepId === "post_build_local" || step.stepId === "upload_distribution") {
    step.dependsOn =
      runContext.resolvedConfig.pipeline.platform === "android"
        ? ["build_android"]
        : ["build_ios"];
  }
  if (step.stepId === "finalize_logs") {
    step.dependsOn = ["upload_distribution"];
  }
}

export async function runStep(params: {
  cwd: string;
  runId: string;
  stepId: StepId;
}): Promise<StepResult> {
  return runStepWithPersistence({
    persistence: createStorePersistence(params.cwd),
    runId: params.runId,
    stepId: params.stepId,
  });
}

function createStorePersistence(cwd: string): StepPersistence {
  return {
    getRunDetail(runId) {
      return getPipelineRunDetail(cwd, runId);
    },
    async syncStep(runId, step, stepOrder, context, artifacts) {
      await savePipelineRunContext(cwd, context);
      await updateStepState(cwd, runId, step, stepOrder);
      await replaceArtifactsForStep(cwd, runId, step.stepId, artifacts);
    },
    findUploadRecordByKey(idempotencyKey) {
      return findUploadRecordByKey(cwd, idempotencyKey);
    },
    insertUploadRecord(runId, record) {
      return insertUploadRecord(cwd, runId, record);
    },
  };
}

export async function runStepWithPersistence(params: {
  persistence: StepPersistence;
  runId: string;
  stepId: StepId;
}): Promise<StepResult> {
  const detail = await params.persistence.getRunDetail(params.runId);
  if (!detail) {
    throw new Error(`run not found: ${params.runId}`);
  }

  const runContext = detail.context;
  const stepOrder = detail.definition.steps.findIndex((item) => item === params.stepId);
  if (stepOrder === -1) {
    throw new Error(`step ${params.stepId} is not part of pipeline ${detail.definition.pipelineId}`);
  }

  const startedAt = nowIso();
  const stepState = makeStepState(params.stepId, "running", startedAt);
  applyDynamicDependencies(runContext, stepState);
  await params.persistence.syncStep(params.runId, stepState, stepOrder, runContext, stepState.artifacts);

  try {
    ensureDependencies(runContext, stepState);

    if (params.stepId === "upload_distribution") {
      await recordUploadIds(params.persistence, runContext);
    }

    const raw = await runLegacyTask(params.stepId, runContext.resolvedConfig, runContext);
    if (raw === false) {
      throw new Error(`step ${params.stepId} returned false`);
    }

    const outputs =
      raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const artifacts =
      params.stepId === "upload_distribution"
        ? orderedArtifactsForUpload(runContext)
        : makeArtifactsFromOutputs(params.stepId, outputs);

    const completedStep: StepState = {
      ...stepState,
      status: "success",
      outputs,
      artifacts,
      endedAt: nowIso(),
    };

    runContext.stepResults[params.stepId] = completedStep;
    runContext.artifacts = mergeArtifacts(runContext.artifacts, artifacts);
    runContext.checkpoint = {
      currentStepId: params.stepId,
      lastSuccessfulStepId: params.stepId,
    };
    await params.persistence.syncStep(
      params.runId,
      completedStep,
      stepOrder,
      runContext,
      artifacts
    );

    return {
      ok: true,
      status: "success",
      stepId: params.stepId,
      runId: params.runId,
      startedAt,
      endedAt: completedStep.endedAt!,
      checkpoint: completedStep.checkpointable,
      outputs,
      artifacts,
      warnings: [],
    };
  } catch (error) {
    const failedStep: StepState = {
      ...stepState,
      status: "failed",
      endedAt: nowIso(),
      error: structuredError(
        params.stepId,
        (error as Error).message,
        "step_execution_failed"
      ),
    };
    runContext.stepResults[params.stepId] = failedStep;
    runContext.checkpoint = {
      ...runContext.checkpoint,
      currentStepId: params.stepId,
    };
    await params.persistence.syncStep(
      params.runId,
      failedStep,
      stepOrder,
      runContext,
      failedStep.artifacts
    );
    return {
      ok: false,
      status: "failed",
      stepId: params.stepId,
      runId: params.runId,
      startedAt,
      endedAt: failedStep.endedAt!,
      checkpoint: false,
      outputs: {},
      artifacts: [],
      warnings: [],
      error: failedStep.error,
    };
  }
}

export async function executeRun(cwd: string, runId: string, fromStep?: StepId) {
  return executeRunWithPersistence({
    persistence: createStorePersistence(cwd),
    runId,
    fromStep,
  });
}

export async function executeRunWithPersistence(params: {
  persistence: StepPersistence;
  runId: string;
  fromStep?: StepId;
}) {
  const detail = await params.persistence.getRunDetail(params.runId);
  if (!detail) {
    throw new Error(`run not found: ${params.runId}`);
  }

  const orderedSteps = getOrderedStepsForPlatform(detail.definition.pipeline.platform);
  const firstStep = params.fromStep ?? detail.run.requestedStepId ?? orderedSteps[0];
  const startIndex = orderedSteps.findIndex((stepId) => stepId === firstStep);
  if (startIndex === -1) {
    throw new Error(`unknown start step: ${firstStep}`);
  }

  let lastResult: StepResult | undefined;
  for (const stepId of orderedSteps.slice(startIndex)) {
    lastResult = await runStepWithPersistence({
      persistence: params.persistence,
      runId: params.runId,
      stepId,
    });
    if (!lastResult.ok) {
      return lastResult;
    }
  }

  if (!lastResult) {
    throw new Error(`no steps executed for run ${params.runId}`);
  }
  return lastResult;
}
