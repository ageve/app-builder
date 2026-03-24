import { ensureDirSync, writeFileSync } from "fs-extra";
import { dirname } from "node:path";
import { nowIso } from "./state";
import { execSql, parseJson, queryRows, stringifyJson } from "./duckdb";
import {
  Artifact,
  BuildRequest,
  PipelineDefinition,
  PipelineRunContext,
  PipelineRunDetail,
  PipelineRunRecord,
  PipelineRunRecordSchema,
  PipelineRunContextSchema,
  PipelineDefinitionSchema,
  PipelineDashboardStats,
  PipelineDashboardStatsSchema,
  StepDefinition,
  StepId,
  StepState,
  StepStatus,
  UploadRecord,
} from "./types";

function normalizeRunRecord(row: Record<string, unknown>): PipelineRunRecord {
  return PipelineRunRecordSchema.parse({
    runId: row.run_id,
    pipelineId: row.pipeline_id,
    projectId: row.project_id,
    profileId: row.profile_id,
    status: row.status,
    triggerSource: row.trigger_source,
    requestedAction: row.requested_action,
    requestedStepId: row.requested_step_id ?? undefined,
    currentStepId: row.current_step_id ?? undefined,
    errorStepId: row.error_step_id ?? undefined,
    errorCategory: row.error_category ?? undefined,
    errorMessage: row.error_message ?? undefined,
    createdAt: row.created_at,
    startedAt: row.started_at ?? undefined,
    endedAt: row.ended_at ?? undefined,
    updatedAt: row.updated_at,
  });
}

function normalizeDefinition(row: Record<string, unknown>): PipelineDefinition {
  return PipelineDefinitionSchema.parse(
    parseJson(row.definition_json, {
      pipelineId: row.pipeline_id,
      projectId: row.project_id,
      profileId: row.profile_id,
      displayName: row.display_name,
      pipeline: {
        packageAlias: "",
        platform: "android",
        env: "alpha",
        branch: "",
      },
      steps: [],
    })
  );
}

function normalizeContext(row: Record<string, unknown>): PipelineRunContext {
  return PipelineRunContextSchema.parse(parseJson(row.context_json, {}));
}

function normalizeStep(row: Record<string, unknown>): StepState {
  return {
    stepId: row.step_id as StepId,
    displayName: String(row.display_name),
    status: row.status as StepStatus,
    retryable: Boolean(row.retryable),
    checkpointable: Boolean(row.checkpointable),
    dependsOn: parseJson(row.depends_on_json, []),
    outputs: parseJson(row.outputs_json, {}),
    artifacts: parseJson(row.artifacts_json, []),
    warnings: parseJson(row.warnings_json, []),
    error:
      row.error_category || row.error_message
        ? {
            stepId: row.step_id as StepId,
            category: String(row.error_category ?? "step_execution_failed"),
            message: String(row.error_message ?? ""),
          }
        : undefined,
    startedAt: row.started_at ? String(row.started_at) : undefined,
    endedAt: row.ended_at ? String(row.ended_at) : undefined,
  };
}

export async function upsertPipelineDefinition(
  cwd: string,
  definition: PipelineDefinition
) {
  await execSql(cwd, `DELETE FROM pipeline_definitions WHERE pipeline_id = $pipelineId`, {
    pipelineId: definition.pipelineId,
  });
  await execSql(
    cwd,
    `
      INSERT INTO pipeline_definitions (
        pipeline_id, project_id, profile_id, display_name, platform, env, branch,
        step_order_json, definition_json, updated_at
      ) VALUES (
        $pipelineId, $projectId, $profileId, $displayName, $platform, $env, $branch,
        $stepOrderJson, $definitionJson, $updatedAt
      )
    `,
    {
      pipelineId: definition.pipelineId,
      projectId: definition.projectId,
      profileId: definition.profileId,
      displayName: definition.displayName,
      platform: definition.pipeline.platform,
      env: definition.pipeline.env,
      branch: definition.pipeline.branch,
      stepOrderJson: stringifyJson(definition.steps),
      definitionJson: stringifyJson(definition),
      updatedAt: nowIso(),
    }
  );
}

export async function createPipelineRun(params: {
  cwd: string;
  request: BuildRequest;
  definition: PipelineDefinition;
  context: PipelineRunContext;
  triggerSource: PipelineRunRecord["triggerSource"];
  steps: StepDefinition[];
  requestedAction?: PipelineRunRecord["requestedAction"];
  requestedStepId?: StepId;
  seededStepStates?: Partial<Record<StepId, StepState>>;
  seededUploads?: UploadRecord[];
}) {
  const createdAt = nowIso();
  const {
    cwd,
    request,
    definition,
    context,
    triggerSource,
    steps,
    requestedAction = "start",
    requestedStepId,
    seededStepStates = {},
    seededUploads = [],
  } = params;

  await execSql(
    cwd,
    `
      INSERT INTO pipeline_runs (
        run_id, pipeline_id, project_id, profile_id, status, trigger_source,
        requested_action, requested_step_id, created_at, updated_at
      ) VALUES (
        $runId, $pipelineId, $projectId, $profileId, 'queued', $triggerSource,
        $requestedAction, $requestedStepId, $createdAt, $createdAt
      )
    `,
    {
      runId: request.runId,
      pipelineId: definition.pipelineId,
      projectId: request.projectId,
      profileId: request.profileId,
      triggerSource,
      requestedAction,
      requestedStepId: requestedStepId ?? null,
      createdAt,
    }
  );

  await execSql(
    cwd,
    `
      INSERT INTO pipeline_run_context (
        run_id, pipeline_id, request_json, resolved_config_json, context_json,
        log_file, workspace, output_dir, updated_at
      ) VALUES (
        $runId, $pipelineId, $requestJson, $resolvedConfigJson, $contextJson,
        $logFile, $workspace, $outputDir, $updatedAt
      )
    `,
    {
      runId: request.runId,
      pipelineId: definition.pipelineId,
      requestJson: stringifyJson(request),
      resolvedConfigJson: stringifyJson(context.resolvedConfig),
      contextJson: stringifyJson(context),
      logFile: context.logFile,
      workspace: context.workspace,
      outputDir: context.outputDir,
      updatedAt: createdAt,
    }
  );

  for (const [index, step] of steps.entries()) {
    const seededStep = seededStepStates[step.stepId];
    await execSql(
      cwd,
      `
        INSERT INTO pipeline_step_runs (
          run_id, step_id, display_name, step_order, status, retryable, checkpointable,
          depends_on_json, outputs_json, artifacts_json, warnings_json, error_category,
          error_message, started_at, ended_at
        ) VALUES (
          $runId, $stepId, $displayName, $stepOrder, $status, $retryable, $checkpointable,
          $dependsOnJson, $outputsJson, $artifactsJson, $warningsJson, $errorCategory,
          $errorMessage, $startedAt, $endedAt
        )
      `,
      {
        runId: request.runId,
        stepId: step.stepId,
        displayName: seededStep?.displayName ?? step.displayName,
        stepOrder: index,
        status: seededStep?.status ?? "pending",
        retryable: seededStep?.retryable ?? step.retryable,
        checkpointable: seededStep?.checkpointable ?? step.checkpointable,
        dependsOnJson: stringifyJson(seededStep?.dependsOn ?? step.dependsOn),
        outputsJson: stringifyJson(seededStep?.outputs ?? {}),
        artifactsJson: stringifyJson(seededStep?.artifacts ?? []),
        warningsJson: stringifyJson(seededStep?.warnings ?? []),
        errorCategory: seededStep?.error?.category ?? null,
        errorMessage: seededStep?.error?.message ?? null,
        startedAt: seededStep?.startedAt ?? null,
        endedAt: seededStep?.endedAt ?? null,
      }
    );

    if (seededStep?.artifacts?.length) {
      await replaceArtifactsForStep(cwd, request.runId, step.stepId, seededStep.artifacts);
    }
  }

  for (const uploadRecord of seededUploads) {
    await insertUploadRecord(cwd, request.runId, uploadRecord);
  }
}

export async function getPipelineRunRecord(cwd: string, runId: string) {
  const rows = await queryRows<Record<string, unknown>>(
    cwd,
    `SELECT * FROM pipeline_runs WHERE run_id = $runId LIMIT 1`,
    { runId }
  );
  return rows[0] ? normalizeRunRecord(rows[0]) : null;
}

export async function getPipelineDefinition(cwd: string, pipelineId: string) {
  const rows = await queryRows<Record<string, unknown>>(
    cwd,
    `SELECT * FROM pipeline_definitions WHERE pipeline_id = $pipelineId LIMIT 1`,
    { pipelineId }
  );
  return rows[0] ? normalizeDefinition(rows[0]) : null;
}

export async function getPipelineRunContext(cwd: string, runId: string) {
  const rows = await queryRows<Record<string, unknown>>(
    cwd,
    `SELECT * FROM pipeline_run_context WHERE run_id = $runId LIMIT 1`,
    { runId }
  );
  return rows[0] ? normalizeContext(rows[0]) : null;
}

export async function savePipelineRunContext(cwd: string, context: PipelineRunContext) {
  await execSql(
    cwd,
    `
      UPDATE pipeline_run_context
      SET resolved_config_json = $resolvedConfigJson,
          context_json = $contextJson,
          log_file = $logFile,
          workspace = $workspace,
          output_dir = $outputDir,
          updated_at = $updatedAt
      WHERE run_id = $runId
    `,
    {
      runId: context.runId,
      resolvedConfigJson: stringifyJson(context.resolvedConfig),
      contextJson: stringifyJson(context),
      logFile: context.logFile,
      workspace: context.workspace,
      outputDir: context.outputDir,
      updatedAt: nowIso(),
    }
  );
}

export async function getStepStates(cwd: string, runId: string) {
  const rows = await queryRows<Record<string, unknown>>(
    cwd,
    `SELECT * FROM pipeline_step_runs WHERE run_id = $runId ORDER BY step_order ASC`,
    { runId }
  );
  return rows.map(normalizeStep);
}

export async function updateRunStatus(
  cwd: string,
  runId: string,
  payload: Partial<PipelineRunRecord>
) {
  const current = await getPipelineRunRecord(cwd, runId);
  if (!current) {
    throw new Error(`run not found: ${runId}`);
  }

  const next: PipelineRunRecord = {
    ...current,
    ...payload,
    updatedAt: nowIso(),
  };

  await execSql(
    cwd,
    `
      UPDATE pipeline_runs
      SET status = $status,
          trigger_source = $triggerSource,
          requested_action = $requestedAction,
          requested_step_id = $requestedStepId,
          current_step_id = $currentStepId,
          error_step_id = $errorStepId,
          error_category = $errorCategory,
          error_message = $errorMessage,
          started_at = $startedAt,
          ended_at = $endedAt,
          updated_at = $updatedAt
      WHERE run_id = $runId
    `,
    {
      runId,
      status: next.status,
      triggerSource: next.triggerSource,
      requestedAction: next.requestedAction,
      requestedStepId: next.requestedStepId ?? null,
      currentStepId: next.currentStepId ?? null,
      errorStepId: next.errorStepId ?? null,
      errorCategory: next.errorCategory ?? null,
      errorMessage: next.errorMessage ?? null,
      startedAt: next.startedAt ?? null,
      endedAt: next.endedAt ?? null,
      updatedAt: next.updatedAt,
    }
  );
}

export async function requestRunResume(cwd: string, runId: string, fromStep: StepId) {
  await updateRunStatus(cwd, runId, {
    status: "resume_requested",
    requestedAction: "resume",
    requestedStepId: fromStep,
    currentStepId: undefined,
    errorStepId: undefined,
    errorCategory: undefined,
    errorMessage: undefined,
    endedAt: undefined,
  });
}

export async function requestRunRetry(cwd: string, runId: string, stepId: StepId) {
  await updateRunStatus(cwd, runId, {
    status: "retry_requested",
    requestedAction: "retry",
    requestedStepId: stepId,
    currentStepId: undefined,
    errorStepId: undefined,
    errorCategory: undefined,
    errorMessage: undefined,
    endedAt: undefined,
  });
}

export async function markRunRunning(cwd: string, runId: string) {
  const current = await getPipelineRunRecord(cwd, runId);
  if (!current) {
    throw new Error(`run not found: ${runId}`);
  }
  await updateRunStatus(cwd, runId, {
    status: "running",
    startedAt: current.startedAt ?? nowIso(),
  });
}

export async function resetStepsFrom(cwd: string, runId: string, stepIds: StepId[]) {
  for (const stepId of stepIds) {
    await execSql(
      cwd,
      `
        UPDATE pipeline_step_runs
        SET status = 'pending',
            outputs_json = '{}',
            artifacts_json = '[]',
            warnings_json = '[]',
            error_category = NULL,
            error_message = NULL,
            started_at = NULL,
            ended_at = NULL
        WHERE run_id = $runId AND step_id = $stepId
      `,
      { runId, stepId }
    );
    await execSql(
      cwd,
      `DELETE FROM pipeline_artifacts WHERE run_id = $runId AND step_id = $stepId`,
      { runId, stepId }
    );
  }
}

export async function updateStepState(
  cwd: string,
  runId: string,
  step: StepState,
  stepOrder: number
) {
  await execSql(
    cwd,
    `
      UPDATE pipeline_step_runs
      SET display_name = $displayName,
          step_order = $stepOrder,
          status = $status,
          retryable = $retryable,
          checkpointable = $checkpointable,
          depends_on_json = $dependsOnJson,
          outputs_json = $outputsJson,
          artifacts_json = $artifactsJson,
          warnings_json = $warningsJson,
          error_category = $errorCategory,
          error_message = $errorMessage,
          started_at = $startedAt,
          ended_at = $endedAt
      WHERE run_id = $runId AND step_id = $stepId
    `,
    {
      runId,
      stepId: step.stepId,
      displayName: step.displayName,
      stepOrder,
      status: step.status,
      retryable: step.retryable,
      checkpointable: step.checkpointable,
      dependsOnJson: stringifyJson(step.dependsOn),
      outputsJson: stringifyJson(step.outputs),
      artifactsJson: stringifyJson(step.artifacts),
      warningsJson: stringifyJson(step.warnings),
      errorCategory: step.error?.category ?? null,
      errorMessage: step.error?.message ?? null,
      startedAt: step.startedAt ?? null,
      endedAt: step.endedAt ?? null,
    }
  );
}

export async function replaceArtifactsForStep(
  cwd: string,
  runId: string,
  stepId: StepId,
  artifacts: Artifact[]
) {
  await execSql(
    cwd,
    `DELETE FROM pipeline_artifacts WHERE run_id = $runId AND step_id = $stepId`,
    { runId, stepId }
  );
  for (const artifact of artifacts) {
    await execSql(
      cwd,
      `
        INSERT INTO pipeline_artifacts (
          run_id, step_id, path, kind, label, sha256, metadata_json, created_at
        ) VALUES (
          $runId, $stepId, $path, $kind, $label, $sha256, $metadataJson, $createdAt
        )
      `,
      {
        runId,
        stepId,
        path: artifact.path,
        kind: artifact.kind,
        label: artifact.label,
        sha256: artifact.sha256 ?? null,
        metadataJson: stringifyJson(artifact.metadata ?? {}),
        createdAt: nowIso(),
      }
    );
  }
}

export async function listArtifacts(cwd: string, runId: string) {
  const rows = await queryRows<Record<string, unknown>>(
    cwd,
    `SELECT * FROM pipeline_artifacts WHERE run_id = $runId ORDER BY created_at ASC`,
    { runId }
  );
  return rows.map((row) => ({
    kind: String(row.kind),
    path: String(row.path),
    label: String(row.label),
    sha256: row.sha256 ? String(row.sha256) : undefined,
    metadata: parseJson(row.metadata_json, {}),
  })) as Artifact[];
}

export async function listUploadRecords(cwd: string, runId: string) {
  const rows = await queryRows<Record<string, unknown>>(
    cwd,
    `SELECT * FROM pipeline_upload_records WHERE run_id = $runId ORDER BY created_at ASC`,
    { runId }
  );
  return rows.map((row) => ({
    idempotencyKey: String(row.idempotency_key),
    channel: row.channel as UploadRecord["channel"],
    artifactPath: String(row.artifact_path),
    artifactSha256: String(row.artifact_sha256),
    stepId: row.step_id as UploadRecord["stepId"],
    createdAt: String(row.created_at),
    result: parseJson(row.result_json, undefined),
  })) as UploadRecord[];
}

export async function insertUploadRecord(cwd: string, runId: string, record: UploadRecord) {
  await execSql(
    cwd,
    `
      INSERT INTO pipeline_upload_records (
        run_id, step_id, channel, idempotency_key, artifact_path, artifact_sha256,
        result_json, created_at
      ) VALUES (
        $runId, $stepId, $channel, $idempotencyKey, $artifactPath, $artifactSha256,
        $resultJson, $createdAt
      )
    `,
    {
      runId,
      stepId: record.stepId,
      channel: record.channel,
      idempotencyKey: record.idempotencyKey,
      artifactPath: record.artifactPath,
      artifactSha256: record.artifactSha256,
      resultJson: stringifyJson(record.result ?? {}),
      createdAt: record.createdAt,
    }
  );
}

export async function findUploadRecordByKey(
  cwd: string,
  idempotencyKey: string
) {
  const rows = await queryRows<Record<string, unknown>>(
    cwd,
    `
      SELECT * FROM pipeline_upload_records
      WHERE idempotency_key = $idempotencyKey
      LIMIT 1
    `,
    { idempotencyKey }
  );
  return rows[0]
    ? ({
        idempotencyKey: String(rows[0].idempotency_key),
        channel: rows[0].channel as UploadRecord["channel"],
        artifactPath: String(rows[0].artifact_path),
        artifactSha256: String(rows[0].artifact_sha256),
        stepId: rows[0].step_id as UploadRecord["stepId"],
        createdAt: String(rows[0].created_at),
        result: parseJson(rows[0].result_json, undefined),
      } as UploadRecord)
    : undefined;
}

export async function claimNextRunnableRun(cwd: string) {
  const rows = await queryRows<Record<string, unknown>>(
    cwd,
    `
      SELECT * FROM pipeline_runs
      WHERE status IN ('queued', 'resume_requested', 'retry_requested')
      ORDER BY created_at ASC
      LIMIT 1
    `
  );
  if (!rows[0]) {
    return null;
  }
  const run = normalizeRunRecord(rows[0]);
  await markRunRunning(cwd, run.runId);
  return await getPipelineRunRecord(cwd, run.runId);
}

export async function listPipelineRuns(cwd: string, limit = 40) {
  const rows = await queryRows<Record<string, unknown>>(
    cwd,
    `
      SELECT * FROM pipeline_runs
      ORDER BY created_at DESC
      LIMIT ${limit}
    `
  );
  return rows.map(normalizeRunRecord);
}

export async function getDashboardStats(cwd: string) {
  const rows = await queryRows<Record<string, unknown>>(
    cwd,
    `
      SELECT status, COUNT(*) AS count
      FROM pipeline_runs
      GROUP BY status
    `
  );

  const stats = {
    queued: 0,
    running: 0,
    failed: 0,
    success: 0,
  };
  for (const row of rows) {
    const status = String(row.status);
    const count = Number(row.count ?? 0);
    if (status === "queued" || status === "resume_requested" || status === "retry_requested") {
      stats.queued += count;
    }
    if (status === "running") {
      stats.running += count;
    }
    if (status === "failed") {
      stats.failed += count;
    }
    if (status === "success") {
      stats.success += count;
    }
  }
  return PipelineDashboardStatsSchema.parse(stats) as PipelineDashboardStats;
}

export async function getPipelineRunDetail(cwd: string, runId: string) {
  const run = await getPipelineRunRecord(cwd, runId);
  if (!run) {
    return null;
  }
  const definition = await getPipelineDefinition(cwd, run.pipelineId);
  const context = await getPipelineRunContext(cwd, runId);
  if (!definition || !context) {
    return null;
  }
  const steps = await getStepStates(cwd, runId);
  const artifacts = await listArtifacts(cwd, runId);
  const uploads = await listUploadRecords(cwd, runId);
  return {
    run,
    definition,
    context,
    steps,
    artifacts,
    uploads,
  } satisfies PipelineRunDetail;
}

export async function ensureLogFile(filePath: string) {
  ensureDirSync(dirname(filePath));
  writeFileSync(filePath, "", { flag: "a" });
}
