import { ensureDirSync } from "fs-extra";
import { rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  BuildRequestSchema,
  BuildRetryRequest,
  BuildRetryRequestSchema,
  BuildResumeRequest,
  BuildResumeRequestSchema,
  BuildStartRequest,
  BuildStartRequestSchema,
  PipelineRunContext,
  PipelineRunDetail,
  PipelineRunRecord,
  StepDefinition,
  StepId,
  StepState,
  UploadRecord,
} from "./types";
import { createPipelineDefinition, createRunId, inspectConfig, listPipelines } from "./pipelineDefinitions";
import {
  createPipelineConfig,
  createWorkspaceConfig,
  deletePipelineConfig,
  deleteWorkspaceConfig,
  listWorkspaceConfigs,
  loadProjectConfig,
  readPipelineConfigText,
  readWorkspaceConfigText,
  saveWorkspaceConfigText,
} from "./config";
import { getOrderedStepsForPlatform, stepDefinitions } from "./definitions";
import {
  claimNextRunnableRun,
  createPipelineRun,
  deletePipelineRuntimeData,
  deleteWorkspaceRuntimeData,
  ensureLogFile,
  getDashboardStats,
  getPipelineRunDetail,
  listPipelineRuns,
  requestRunResume,
  resetStepsFrom,
  savePipelineRunContext,
  upsertPipelineDefinition,
  updateRunStatus,
  updateStepState,
} from "./store";

function removeRunArtifacts(
  resources: Array<{
    logFile: string;
    workspace: string;
    outputDir: string;
  }>
) {
  const paths = new Set<string>();
  for (const resource of resources) {
    paths.add(dirname(resource.logFile));
    paths.add(resource.workspace);
    paths.add(resource.outputDir);
  }
  for (const path of paths) {
    rmSync(path, { recursive: true, force: true });
  }
}

function generatePipelineId(params: {
  cwd: string;
  workspaceId: string;
  packageAlias: string;
  platform: "android" | "iOS";
  env: "alpha" | "production";
}) {
  const platformId = params.platform === "iOS" ? "ios" : "android";
  const baseId = `${params.packageAlias}-${platformId}-${params.env}`;
  const existingIds = new Set(
    listPipelines(params.cwd, params.workspaceId).map((pipeline) => pipeline.profileId)
  );

  if (!existingIds.has(baseId)) {
    return baseId;
  }

  let suffix = 2;
  while (existingIds.has(`${baseId}-${suffix}`)) {
    suffix += 1;
  }
  return `${baseId}-${suffix}`;
}

function stepDefinitionsForPipeline(stepIds: StepId[]): StepDefinition[] {
  return stepIds.map((stepId) => ({ ...stepDefinitions[stepId] }));
}

const ACTIVE_RUN_TIMEOUT_MS = 30 * 1000;

function isPendingRunStatus(status: PipelineRunRecord["status"]) {
  return (
    status === "queued" ||
    status === "resume_requested" ||
    status === "retry_requested"
  );
}

function isActiveRunStatus(status: PipelineRunRecord["status"]) {
  return status === "running" || isPendingRunStatus(status);
}

function createRunContext(
  request: ReturnType<typeof BuildRequestSchema.parse>,
  pipelineId: string,
  resolvedConfig: ReturnType<typeof inspectConfig>
): PipelineRunContext {
  ensureDirSync(resolvedConfig.defaults.runDir);
  ensureDirSync(resolvedConfig.defaults.outputDir);
  ensureDirSync(resolvedConfig.defaults.workspace);

  return {
    runId: request.runId,
    pipelineId,
    request,
    resolvedConfig,
    stepResults: {},
    artifacts: [],
    uploads: [],
    checkpoint: {},
    logFile: resolvedConfig.defaults.logFile,
    workspace: resolvedConfig.defaults.workspace,
    outputDir: resolvedConfig.defaults.outputDir,
  };
}

async function failRunIfStillPending(params: {
  cwd: string;
  runId: string;
  message: string;
  category: string;
}) {
  const run = await getPipelineRunRecord(params.cwd, params.runId);
  if (!run || !isPendingRunStatus(run.status)) {
    return false;
  }

  const detail = await getPipelineRunDetail(params.cwd, params.runId);
  const stepId =
    run.requestedStepId ??
    detail?.context.checkpoint.currentStepId ??
    detail?.definition.steps[0];

  if (!stepId) {
    return false;
  }

  await markRunFailed(
    params.cwd,
    params.runId,
    stepId,
    params.message,
    params.category
  );
  return true;
}

function schedulePendingRunTimeout(cwd: string, runId: string, timeoutMs = ACTIVE_RUN_TIMEOUT_MS) {
  const timer = setTimeout(() => {
    void failRunIfStillPending({
      cwd,
      runId,
      message: `run was not claimed by executor within ${Math.floor(timeoutMs / 1000)} seconds`,
      category: "executor_claim_timeout",
    });
  }, timeoutMs);
  timer.unref?.();
}

async function failRunIfQueueingIsBlocked(params: {
  cwd: string;
  runId: string;
  projectId: string;
  profileId: string;
}) {
  const activeRuns = (await listPipelineRuns(params.cwd, 200)).filter(
    (run) =>
      run.runId !== params.runId &&
      run.projectId === params.projectId &&
      run.profileId === params.profileId &&
      isActiveRunStatus(run.status)
  );

  if (activeRuns.length === 0) {
    return false;
  }

  const currentRun = await getPipelineRunDetail(params.cwd, params.runId);
  const stepId = currentRun?.definition.steps[0];
  if (!stepId) {
    return false;
  }

  await markRunFailed(
    params.cwd,
    params.runId,
    stepId,
    `another run is already active for this pipeline (${activeRuns[0]!.runId}); queueing is disabled`,
    "queueing_disabled"
  );
  return true;
}

function createRetryRequestPayload(
  detail: PipelineRunDetail,
  runId: string
) {
  return BuildRequestSchema.parse({
    runId,
    projectId: detail.context.request.projectId,
    profileId: detail.context.request.profileId,
    args: detail.context.request.args ?? {},
  });
}

function cloneStepState(step: StepState): StepState {
  return {
    ...step,
    dependsOn: [...step.dependsOn],
    outputs: { ...step.outputs },
    artifacts: step.artifacts.map((artifact) => ({
      ...artifact,
      metadata: artifact.metadata ? { ...artifact.metadata } : undefined,
    })),
    warnings: [...step.warnings],
    error: step.error ? { ...step.error } : undefined,
  };
}

function seedRetryContextFromDetail(params: {
  detail: PipelineRunDetail;
  startStep: StepId;
  nextContext: PipelineRunContext;
}) {
  const { detail, startStep, nextContext } = params;
  const orderedSteps = detail.definition.steps;
  const startIndex = orderedSteps.findIndex((stepId) => stepId === startStep);
  if (startIndex <= 0) {
    return {
      seededStepStates: {} as Partial<Record<StepId, StepState>>,
      seededUploads: [] as UploadRecord[],
    };
  }

  const seededStepStates: Partial<Record<StepId, StepState>> = {};
  const successfulStepsBeforeStart = orderedSteps.slice(0, startIndex);

  for (const stepId of successfulStepsBeforeStart) {
    const originalStep = detail.steps.find((step) => step.stepId === stepId);
    if (!originalStep || originalStep.status !== "success") {
      throw new Error(`cannot retry from ${startStep}: ${stepId} is not successful`);
    }
    const clonedStep = cloneStepState(originalStep);
    seededStepStates[stepId] = clonedStep;
    nextContext.stepResults[stepId] = clonedStep;
  }

  nextContext.artifacts = successfulStepsBeforeStart.flatMap(
    (stepId) => seededStepStates[stepId]?.artifacts ?? []
  );
  nextContext.uploads = detail.uploads
    .filter(
      (upload) => orderedSteps.findIndex((stepId) => stepId === upload.stepId) < startIndex
    )
    .map((upload) => ({
      ...upload,
      result: upload.result ? { ...upload.result } : undefined,
    }));

  const lastSuccessfulStepId = successfulStepsBeforeStart.at(-1);
  nextContext.checkpoint = lastSuccessfulStepId
    ? {
        currentStepId: lastSuccessfulStepId,
        lastSuccessfulStepId,
      }
    : {};

  return {
    seededStepStates,
    seededUploads: nextContext.uploads,
  };
}

async function queueRetryRun(params: {
  cwd: string;
  detail: PipelineRunDetail;
  startStep: StepId;
  triggerSource: PipelineRunRecord["triggerSource"];
}) {
  const runId = createRunId();
  const request = createRetryRequestPayload(params.detail, runId);
  const definition = createPipelineDefinition(params.cwd, request);
  const resolvedConfig = inspectConfig(params.cwd, {
    projectId: request.projectId,
    profileId: request.profileId,
    runId,
    args: request.args,
  });
  const context = createRunContext(request, definition.pipelineId, resolvedConfig);
  const { seededStepStates, seededUploads } =
    params.startStep === definition.steps[0]
      ? {
          seededStepStates: {} as Partial<Record<StepId, StepState>>,
          seededUploads: [] as UploadRecord[],
        }
      : seedRetryContextFromDetail({
          detail: params.detail,
          startStep: params.startStep,
          nextContext: context,
        });

  await ensureLogFile(context.logFile);
  await upsertPipelineDefinition(params.cwd, definition);
  await createPipelineRun({
    cwd: params.cwd,
    request,
    definition,
    context,
    triggerSource: params.triggerSource,
    steps: stepDefinitionsForPipeline(definition.steps),
    requestedAction: "retry",
    requestedStepId: params.startStep,
    seededStepStates,
    seededUploads,
  });
  if (
    !(await failRunIfQueueingIsBlocked({
      cwd: params.cwd,
      runId,
      projectId: request.projectId,
      profileId: request.profileId,
    }))
  ) {
    schedulePendingRunTimeout(params.cwd, runId);
  }
  return (await getPipelineRunDetail(params.cwd, runId))!;
}

function pruneRunContextFromStep(
  detail: PipelineRunDetail,
  fromStep: StepId
) {
  const orderedSteps = detail.definition.steps;
  const startIndex = orderedSteps.findIndex((stepId) => stepId === fromStep);
  const preservedSteps = orderedSteps.slice(0, startIndex);

  for (const stepId of orderedSteps.slice(startIndex)) {
    delete detail.context.stepResults[stepId];
  }

  detail.context.artifacts = preservedSteps.flatMap(
    (stepId) => detail.context.stepResults[stepId]?.artifacts ?? []
  );
  detail.context.uploads = detail.context.uploads.filter(
    (upload) => orderedSteps.findIndex((stepId) => stepId === upload.stepId) < startIndex
  );

  const lastSuccessfulStepId = preservedSteps.at(-1);
  detail.context.checkpoint = lastSuccessfulStepId
    ? {
        currentStepId: lastSuccessfulStepId,
        lastSuccessfulStepId,
      }
    : {};
}

export async function startBuild(cwd: string, input: BuildStartRequest) {
  const payload = BuildStartRequestSchema.parse(input);
  const runId = payload.runId ?? createRunId();
  const request = BuildRequestSchema.parse({
    runId,
    projectId: payload.projectId,
    profileId: payload.profileId,
    args: payload.args ?? {},
  });
  const definition = createPipelineDefinition(cwd, request);
  const resolvedConfig = inspectConfig(cwd, {
    ...payload,
    runId,
  });
  const context = createRunContext(request, definition.pipelineId, resolvedConfig);
  await ensureLogFile(context.logFile);
  await upsertPipelineDefinition(cwd, definition);
  await createPipelineRun({
    cwd,
    request,
    definition,
    context,
    triggerSource: payload.triggerSource,
    steps: stepDefinitionsForPipeline(definition.steps),
  });
  if (
    !(await failRunIfQueueingIsBlocked({
      cwd,
      runId,
      projectId: request.projectId,
      profileId: request.profileId,
    }))
  ) {
    schedulePendingRunTimeout(cwd, runId);
  }
  return (await getPipelineRunDetail(cwd, runId))!;
}

export async function resumeBuild(cwd: string, input: BuildResumeRequest) {
  const payload = BuildResumeRequestSchema.parse(input);
  const detail = await getPipelineRunDetail(cwd, payload.runId);
  if (!detail) {
    throw new Error(`run not found: ${payload.runId}`);
  }
  if (detail.run.status !== "failed") {
    throw new Error("resume is only available for failed runs");
  }
  if (!detail.run.errorStepId || payload.fromStep !== detail.run.errorStepId) {
    throw new Error("failed runs can only resume from the failed step");
  }
  const stepState = detail.steps.find((step) => step.stepId === payload.fromStep);
  if (!stepState) {
    throw new Error(`step not found in run: ${payload.fromStep}`);
  }
  if (!stepState.checkpointable) {
    throw new Error(`step is not checkpointable: ${payload.fromStep}`);
  }
  const orderedSteps = detail.definition.steps;
  const startIndex = orderedSteps.findIndex((stepId) => stepId === payload.fromStep);
  await resetStepsFrom(cwd, payload.runId, orderedSteps.slice(startIndex));
  pruneRunContextFromStep(detail, payload.fromStep);
  await savePipelineRunContext(cwd, detail.context);
  await requestRunResume(cwd, payload.runId, payload.fromStep);
  if (
    !(await failRunIfQueueingIsBlocked({
      cwd,
      runId: payload.runId,
      projectId: detail.run.projectId,
      profileId: detail.run.profileId,
    }))
  ) {
    schedulePendingRunTimeout(cwd, payload.runId);
  }
  return (await getPipelineRunDetail(cwd, payload.runId))!;
}

export async function retryBuild(cwd: string, input: BuildRetryRequest) {
  const payload = BuildRetryRequestSchema.parse(input);
  const detail = await getPipelineRunDetail(cwd, payload.runId);
  if (!detail) {
    throw new Error(`run not found: ${payload.runId}`);
  }
  const stepState = detail.steps.find((step) => step.stepId === payload.stepId);
  if (!stepState) {
    throw new Error(`step not found in run: ${payload.stepId}`);
  }
  if (!stepState.retryable) {
    throw new Error(`step is not retryable: ${payload.stepId}`);
  }
  const orderedSteps = detail.definition.steps;
  const firstStep = orderedSteps[0];

  if (detail.run.status === "failed") {
    if (!detail.run.errorStepId) {
      throw new Error("failed run is missing failed step metadata");
    }
    const allowedSteps = new Set<StepId>([detail.run.errorStepId, firstStep]);
    if (!allowedSteps.has(payload.stepId)) {
      throw new Error("failed runs can only retry from the failed step or from the start");
    }
  } else if (detail.run.status === "success") {
    if (payload.stepId !== firstStep) {
      throw new Error("successful runs can only retry from the start");
    }
  } else {
    throw new Error("retry is only available for completed runs");
  }

  return queueRetryRun({
    cwd,
    detail,
    startStep: payload.stepId,
    triggerSource: payload.triggerSource,
  });
}

export async function listBuildRuns(cwd: string, limit?: number) {
  return listPipelineRuns(cwd, limit);
}

export async function recoverStaleRunningRuns(
  cwd: string,
  olderThanMs = 6 * 60 * 60 * 1000
) {
  const runs = await listPipelineRuns(cwd, 200);
  const now = Date.now();
  const recovered: string[] = [];

  for (const run of runs) {
    if (run.status !== "running") {
      continue;
    }

    const updatedAtMs = Date.parse(run.updatedAt ?? run.startedAt ?? run.createdAt);
    if (Number.isNaN(updatedAtMs) || now - updatedAtMs < olderThanMs) {
      continue;
    }

    const detail = await getPipelineRunDetail(cwd, run.runId);
    const stepId =
      run.currentStepId ??
      detail?.steps.find((step) => step.status === "running")?.stepId ??
      detail?.context.checkpoint.currentStepId ??
      detail?.definition.steps[0];

    if (!stepId) {
      continue;
    }

    await markRunFailed(
      cwd,
      run.runId,
      stepId,
      `run recovered from stale running state after ${Math.floor(
        olderThanMs / 60000
      )} minutes without updates`,
      "stale_run_recovered"
    );
    recovered.push(run.runId);
  }

  return recovered;
}

export async function recoverStaleQueuedRuns(
  cwd: string,
  olderThanMs = 30 * 60 * 1000
) {
  const runs = await listPipelineRuns(cwd, 200);
  const now = Date.now();
  const recovered: string[] = [];

  for (const run of runs) {
    if (
      run.status !== "queued" &&
      run.status !== "resume_requested" &&
      run.status !== "retry_requested"
    ) {
      continue;
    }

    const updatedAtMs = Date.parse(run.updatedAt ?? run.createdAt);
    if (Number.isNaN(updatedAtMs) || now - updatedAtMs < olderThanMs) {
      continue;
    }

    const detail = await getPipelineRunDetail(cwd, run.runId);
    const stepId =
      run.requestedStepId ??
      detail?.context.checkpoint.currentStepId ??
      detail?.definition.steps[0];

    if (!stepId) {
      continue;
    }

    await markRunFailed(
      cwd,
      run.runId,
      stepId,
      `run expired in queue after ${Math.floor(olderThanMs / 60000)} minutes without executor claim`,
      "stale_queue_recovered"
    );
    recovered.push(run.runId);
  }

  return recovered;
}

export async function syncPipelineDefinitions(cwd: string, projectId?: string) {
  const pipelines = listPipelines(cwd, projectId);
  for (const pipeline of pipelines) {
    await upsertPipelineDefinition(cwd, {
      pipelineId: pipeline.pipelineId,
      projectId: pipeline.projectId,
      profileId: pipeline.profileId,
      displayName: pipeline.displayName,
      pipeline: {
        packageAlias: pipeline.packageAlias,
        platform: pipeline.platform,
        env: pipeline.env,
        branch: pipeline.branch,
      },
      steps: pipeline.steps,
    });
  }
  return pipelines;
}

export function listWorkspaces(cwd: string) {
  const workspaces = listWorkspaceConfigs(cwd);
  const pipelines = listPipelines(cwd);
  return workspaces.map((workspace) => ({
    ...workspace,
    pipelineCount: pipelines.filter((pipeline) => pipeline.projectId === workspace.workspaceId)
      .length,
  }));
}

export async function getWorkspaceDetail(cwd: string, workspaceId: string) {
  const workspace = loadProjectConfig(cwd, workspaceId);
  const pipelines = listPipelines(cwd, workspaceId);
  const runs = (await listBuildRuns(cwd, 100)).filter((run) => run.projectId === workspaceId);
  const stats = runs.reduce(
    (acc, run) => {
      if (
        run.status === "queued" ||
        run.status === "resume_requested" ||
        run.status === "retry_requested"
      ) {
        acc.queued += 1;
      } else if (run.status === "running") {
        acc.running += 1;
      } else if (run.status === "failed") {
        acc.failed += 1;
      } else if (run.status === "success") {
        acc.success += 1;
      }
      return acc;
    },
    { queued: 0, running: 0, failed: 0, success: 0 }
  );

  return {
    workspace: {
      workspaceId: workspace.id,
      name: workspace.name,
      gitUri: workspace.gitUri,
      defaults: workspace.defaults,
    },
    pipelines,
    runs: runs.slice(0, 20),
    stats,
  };
}

export async function getPipelineDetail(
  cwd: string,
  workspaceId: string,
  pipelineId: string
) {
  const pipelines = listPipelines(cwd, workspaceId);
  const pipeline =
    pipelines.find(
      (item) => item.pipelineId === pipelineId || item.profileId === pipelineId
    ) ?? null;
  if (!pipeline) {
    return null;
  }
  const runs = (await listBuildRuns(cwd, 100)).filter(
    (run) => run.projectId === workspaceId && run.profileId === pipeline.profileId
  );
  return {
    pipeline,
    runs,
  };
}

export function getWorkspaceConfigDocument(cwd: string, workspaceId: string) {
  const workspace = loadProjectConfig(cwd, workspaceId);
  return {
    workspaceId,
    name: workspace.name,
    content: readWorkspaceConfigText(cwd, workspaceId),
  };
}

export function saveWorkspaceConfigDocument(
  cwd: string,
  workspaceId: string,
  content: string
) {
  const workspace = saveWorkspaceConfigText(cwd, workspaceId, content);
  return {
    workspaceId: workspace.id,
    name: workspace.name,
    content: readWorkspaceConfigText(cwd, workspaceId),
  };
}

export async function createWorkspaceDocument(
  cwd: string,
  input: {
    workspaceId: string;
    name: string;
    gitUri: string;
  }
) {
  const workspace = createWorkspaceConfig(cwd, {
    id: input.workspaceId,
    name: input.name,
    gitUri: input.gitUri,
    pipelineOptions: {
      gitUri: input.gitUri,
      workspaceRoot: "../app-builder-cache/projects",
      outputRoot: "build",
      runRoot: ".runs",
      cleanWorkspace: true,
    },
    defaults: {
      workspaceRoot: "../app-builder-cache/projects",
      outputRoot: "build",
      runRoot: ".runs",
      cleanWorkspace: true,
    },
  });
  await syncPipelineDefinitions(cwd);
  return {
    workspaceId: workspace.id,
    name: workspace.name,
    content: readWorkspaceConfigText(cwd, workspace.id),
  };
}

export async function deleteWorkspaceDocument(cwd: string, workspaceId: string) {
  const runtimeData = await deleteWorkspaceRuntimeData(cwd, workspaceId);
  const result = deleteWorkspaceConfig(cwd, workspaceId);
  removeRunArtifacts(runtimeData.deletedRuns);
  await syncPipelineDefinitions(cwd);
  return {
    ...result,
    deletedRunIds: runtimeData.deletedRuns.map((run) => run.runId),
  };
}

export function getPipelineConfigDocument(cwd: string, profileId: string) {
  return {
    pipelineId: profileId,
    content: readPipelineConfigText(cwd, profileId),
  };
}

export async function createPipelineDocument(
  cwd: string,
  input: {
    workspaceId: string;
    pipelineId?: string;
    packageAlias: string;
    platform: "android" | "iOS";
    env: "alpha" | "production";
    branch: string;
  }
) {
  const pipelineId =
    input.pipelineId?.trim() ||
    generatePipelineId({
      cwd,
      workspaceId: input.workspaceId,
      packageAlias: input.packageAlias,
      platform: input.platform,
      env: input.env,
    });
  const pipeline = createPipelineConfig(cwd, {
    id: pipelineId,
    projectId: input.workspaceId,
    packageAlias: input.packageAlias,
    platform: input.platform,
    env: input.env,
    branch: input.branch,
  });
  await syncPipelineDefinitions(cwd, input.workspaceId);
  return {
    pipelineId: pipeline.id,
    content: readPipelineConfigText(cwd, pipeline.id),
  };
}

export async function deletePipelineDocument(cwd: string, profileId: string) {
  const runtimeData = await deletePipelineRuntimeData(cwd, profileId);
  const result = deletePipelineConfig(cwd, profileId);
  removeRunArtifacts(runtimeData.deletedRuns);
  await syncPipelineDefinitions(cwd);
  return {
    ...result,
    deletedRunIds: runtimeData.deletedRuns.map((run) => run.runId),
  };
}

export async function getBuildRunDetail(cwd: string, runId: string) {
  return getPipelineRunDetail(cwd, runId);
}

export async function getBuildDashboard(cwd: string) {
  const [runs, stats] = await Promise.all([
    listBuildRuns(cwd, 40),
    getDashboardStats(cwd),
  ]);
  return { runs, stats };
}

export async function claimNextBuildRun(cwd: string) {
  return claimNextRunnableRun(cwd);
}

export async function markRunSuccess(cwd: string, runId: string) {
  await updateRunStatus(cwd, runId, {
    status: "success",
    currentStepId: undefined,
    errorStepId: undefined,
    errorCategory: undefined,
    errorMessage: undefined,
    endedAt: new Date().toISOString(),
  });
}

export async function markRunFailed(
  cwd: string,
  runId: string,
  stepId: StepId,
  message: string,
  category: string
) {
  const endedAt = new Date().toISOString();
  const detail = await getPipelineRunDetail(cwd, runId);

  if (detail) {
    const failedStep = detail.steps.find((step) => step.stepId === stepId);
    if (failedStep) {
      const nextStepState: StepState = {
        ...failedStep,
        status: "failed",
        endedAt,
        error: {
          stepId,
          message,
          category,
        },
      };
      detail.context.stepResults[stepId] = nextStepState;
      detail.context.checkpoint = {
        ...detail.context.checkpoint,
        currentStepId: stepId,
      };
      await savePipelineRunContext(cwd, detail.context);
      await updateStepState(
        cwd,
        runId,
        nextStepState,
        detail.definition.steps.findIndex((item) => item === stepId)
      );
    }
  }

  await updateRunStatus(cwd, runId, {
    status: "failed",
    currentStepId: stepId,
    errorStepId: stepId,
    errorCategory: category,
    errorMessage: message,
    endedAt,
  });
}

export async function markRunStep(cwd: string, runId: string, stepId?: StepId) {
  await updateRunStatus(cwd, runId, {
    currentStepId: stepId,
  });
}

export { inspectConfig, listPipelines };
