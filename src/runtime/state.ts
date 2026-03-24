import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  Artifact,
  BuildRequest,
  BuildRequestSchema,
  ResolvedRunConfig,
  ResolvedRunConfigSchema,
  RunState,
  RunStateSchema,
  StepDefinition,
  StepError,
  StepId,
  StepResult,
  StepState,
  StepStatus,
  UploadRecord,
} from "./types";

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }
  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = stableValue((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }
  return value;
}

export function writeJsonFile(filePath: string, value: unknown) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(stableValue(value), null, 2), "utf-8");
}

export function readJsonFile<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf-8")) as T;
}

export function nowIso() {
  return new Date().toISOString();
}

export function runFile(runDir: string, filename: string) {
  return resolve(runDir, filename);
}

export function stepFile(runDir: string, stepId: StepId) {
  return resolve(runDir, "steps", `${stepId}.json`);
}

export function initRunState(
  request: BuildRequest,
  resolvedConfig: ResolvedRunConfig
): RunState {
  const initial: RunState = {
    runId: request.runId,
    projectId: request.projectId,
    profileId: request.profileId,
    status: "pending",
    createdAt: nowIso(),
    updatedAt: nowIso(),
    artifacts: [],
    uploadRecords: [],
    steps: {},
  };

  writeJsonFile(runFile(resolvedConfig.defaults.runDir, "request.json"), request);
  writeJsonFile(
    runFile(resolvedConfig.defaults.runDir, "resolved-config.json"),
    resolvedConfig
  );
  writeJsonFile(runFile(resolvedConfig.defaults.runDir, "artifacts.json"), []);
  writeJsonFile(runFile(resolvedConfig.defaults.runDir, "state.json"), initial);
  return initial;
}

export function loadBuildRequest(runDir: string) {
  return BuildRequestSchema.parse(readJsonFile(runFile(runDir, "request.json")));
}

export function loadResolvedRunConfig(runDir: string) {
  return ResolvedRunConfigSchema.parse(
    readJsonFile(runFile(runDir, "resolved-config.json"))
  );
}

export function loadRunState(runDir: string): RunState {
  return RunStateSchema.parse(readJsonFile(runFile(runDir, "state.json")));
}

export function saveRunState(runDir: string, state: RunState) {
  const next = { ...state, updatedAt: nowIso() };
  writeJsonFile(runFile(runDir, "state.json"), next);
  writeJsonFile(runFile(runDir, "artifacts.json"), next.artifacts);
  return next;
}

export function recordStepStart(
  runDir: string,
  runState: RunState,
  definition: StepDefinition
) {
  const startedAt = nowIso();
  const stepState: StepState = {
    stepId: definition.stepId,
    displayName: definition.displayName,
    status: "running",
    retryable: definition.retryable,
    checkpointable: definition.checkpointable,
    dependsOn: definition.dependsOn,
    startedAt,
    outputs: {},
    artifacts: [],
    warnings: [],
  };
  runState.currentStepId = definition.stepId;
  runState.status = "running";
  runState.steps[definition.stepId] = stepState;
  writeJsonFile(stepFile(runDir, definition.stepId), stepState);
  return saveRunState(runDir, runState);
}

export function recordStepResult(
  runDir: string,
  runState: RunState,
  result: StepResult
) {
  const current = runState.steps[result.stepId];
  const nextStep: StepState = {
    stepId: result.stepId,
    displayName: current?.displayName ?? result.stepId,
    retryable: current?.retryable ?? true,
    checkpointable: current?.checkpointable ?? true,
    dependsOn: current?.dependsOn ?? [],
    status: result.status,
    startedAt: result.startedAt,
    endedAt: result.endedAt,
    outputs: result.outputs,
    artifacts: result.artifacts,
    warnings: result.warnings,
    error: result.error,
  };
  runState.steps[result.stepId] = nextStep;
  runState.currentStepId = result.status === "running" ? result.stepId : undefined;
  if (result.artifacts.length > 0) {
    const byPath = new Map(runState.artifacts.map((item) => [item.path, item]));
    for (const artifact of result.artifacts) {
      byPath.set(artifact.path, artifact);
    }
    runState.artifacts = Array.from(byPath.values());
  }
  runState.status = result.status === "failed" ? "failed" : "running";
  writeJsonFile(stepFile(runDir, result.stepId), nextStep);
  return saveRunState(runDir, runState);
}

export function finalizeRunState(
  runDir: string,
  runState: RunState,
  status: RunState["status"]
) {
  runState.status = status;
  runState.currentStepId = undefined;
  return saveRunState(runDir, runState);
}

export function getStepOutput(runState: RunState, stepId: StepId) {
  return runState.steps[stepId]?.outputs ?? {};
}

export function ensureStepDependencies(
  runState: RunState,
  definition: StepDefinition
) {
  for (const dependency of definition.dependsOn) {
    const status = runState.steps[dependency]?.status;
    if (status !== "success") {
      throw new Error(
        `step ${definition.stepId} requires ${dependency} to be successful`
      );
    }
  }
}

export function sha256File(filePath: string) {
  const hash = createHash("sha256");
  hash.update(readFileSync(filePath));
  return hash.digest("hex");
}

export function buildUploadRecord(record: UploadRecord) {
  return record;
}

export function findUploadRecord(
  runState: RunState,
  idempotencyKey: string
): UploadRecord | undefined {
  return runState.uploadRecords.find((item) => item.idempotencyKey === idempotencyKey);
}

export function appendUploadRecord(runDir: string, runState: RunState, record: UploadRecord) {
  if (!findUploadRecord(runState, record.idempotencyKey)) {
    runState.uploadRecords.push(record);
    saveRunState(runDir, runState);
  }
}

export function structuredError(
  stepId: StepId,
  message: string,
  category: string
): StepError {
  return { stepId, message, category };
}

export function createStepResult(params: {
  stepId: StepId;
  runId: string;
  status: StepStatus;
  startedAt: string;
  outputs?: Record<string, unknown>;
  artifacts?: Artifact[];
  warnings?: string[];
  error?: StepError;
  checkpoint?: boolean;
}) {
  return {
    ok: params.status === "success" || params.status === "skipped",
    status: params.status,
    stepId: params.stepId,
    runId: params.runId,
    startedAt: params.startedAt,
    endedAt: nowIso(),
    checkpoint: params.checkpoint ?? true,
    outputs: params.outputs ?? {},
    artifacts: params.artifacts ?? [],
    warnings: params.warnings ?? [],
    error: params.error,
  } as StepResult;
}

export function ensureRunInitialized(runDir: string) {
  if (!existsSync(runFile(runDir, "state.json"))) {
    throw new Error(`run state does not exist: ${runDir}`);
  }
}
