import { z } from "zod";

export const platforms = ["android", "iOS"] as const;
export const envs = ["alpha", "production"] as const;
export const stepIds = [
  "resolve_config",
  "prepare_code",
  "prepare_dependencies",
  "prepare_variables",
  "prepare_env",
  "prepare_platform_env",
  "build_android",
  "build_ios",
  "post_build_local",
  "upload_distribution",
  "finalize_logs",
] as const;

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as UnknownRecord;
}

function normalizeArgsFromSources(sources: Array<UnknownRecord | undefined>) {
  const args: UnknownRecord = {};
  for (const source of sources) {
    if (!source) {
      continue;
    }
    for (const key of ["autoVersionCode", "legacyVersioning"] as const) {
      if (typeof source[key] === "boolean") {
        args[key] = source[key];
      }
    }
  }
  return args;
}

function normalizeBuildProfileInput(input: unknown) {
  const record = asRecord(input);
  if (!record) {
    return input;
  }

  const pipeline = asRecord(record.pipeline);
  if (!pipeline) {
    return input;
  }

  return {
    ...record,
    packageAlias: record.packageAlias ?? pipeline.packageAlias,
    platform: record.platform ?? pipeline.platform,
    env: record.env ?? pipeline.env,
    branch: record.branch ?? pipeline.branch,
  };
}

function normalizeRequestLikeInput(input: unknown) {
  const record = asRecord(input);
  if (!record) {
    return input;
  }

  const overrides = asRecord(record.overrides);
  const explicitArgs = asRecord(record.args);

  return {
    ...record,
    args: normalizeArgsFromSources([
      overrides,
      record,
      explicitArgs,
    ]),
  };
}

function normalizeResolvedRunConfigInput(input: unknown) {
  const record = asRecord(input);
  if (!record) {
    return input;
  }

  const flags = asRecord(record.flags);
  const source = asRecord(record.source);
  const args = asRecord(record.args);

  return {
    ...record,
    args:
      args ??
      normalizeArgsFromSources([
        flags
          ? {
              autoVersionCode: flags.autoVersionCode,
              legacyVersioning: flags.legacyVersioning,
            }
          : undefined,
      ]),
    source: {
      workspaceId:
        typeof source?.workspaceId === "string"
          ? source.workspaceId
          : String(record.projectId ?? ""),
      profileId:
        typeof source?.profileId === "string"
          ? source.profileId
          : String(record.profileId ?? ""),
    },
  };
}

export type Platform = (typeof platforms)[number];
export type RuntimeEnv = (typeof envs)[number];
export type StepId = (typeof stepIds)[number];

export const ProjectPipelineOptionsSchema = z
  .object({
    gitUri: z.string().optional(),
    workspaceRoot: z.string().optional(),
    outputRoot: z.string().optional(),
    runRoot: z.string().optional(),
    cleanWorkspace: z.boolean().optional(),
  })
  .default({});

export const PipelineSelectionSchema = z.object({
  packageAlias: z.string(),
  platform: z.enum(platforms),
  env: z.enum(envs),
  branch: z.string(),
});

export const ProjectConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  gitUri: z.string(),
  defaults: z
    .object({
      workspaceRoot: z.string().optional(),
      outputRoot: z.string().optional(),
      runRoot: z.string().optional(),
      cleanWorkspace: z.boolean().optional(),
    })
    .default({}),
  pipelineOptions: ProjectPipelineOptionsSchema,
  appInfo: z
    .object({
      name: z.string(),
      slogan: z.string(),
    })
    .optional(),
  fir: z
    .object({
      apiKey: z.string(),
    })
    .optional(),
  pgyer: z
    .object({
      apiKey: z.string(),
      buildType: z.literal("apk"),
    })
    .optional(),
  uploadApi: z
    .object({
      alpha: z.string(),
      prod: z.string(),
    })
    .optional(),
  updateUrl: z
    .object({
      alpha: z.string(),
      prod: z.string(),
    })
    .optional(),
  appStore: z
    .object({
      keychain: z.string(),
    })
    .optional(),
});

export const BuildArgsSchema = z
  .object({
    autoVersionCode: z.boolean().optional(),
    legacyVersioning: z.boolean().optional(),
  })
  .catchall(z.unknown());

export const BuildProfileSchema = z.preprocess(
  normalizeBuildProfileInput,
  z.object({
    id: z.string(),
    projectId: z.string(),
    packageAlias: PipelineSelectionSchema.shape.packageAlias,
    platform: PipelineSelectionSchema.shape.platform,
    env: PipelineSelectionSchema.shape.env,
    branch: PipelineSelectionSchema.shape.branch,
  })
);

export const BuildRequestSchema = z.preprocess(
  normalizeRequestLikeInput,
  z.object({
    runId: z.string().min(1),
    projectId: z.string(),
    profileId: z.string(),
    args: BuildArgsSchema.default({}),
  })
);

export const ResolvedRunConfigSchema = z.preprocess(
  normalizeResolvedRunConfigInput,
  z.object({
    runId: z.string(),
    projectId: z.string(),
    projectName: z.string(),
    profileId: z.string(),
    pipeline: PipelineSelectionSchema,
    args: BuildArgsSchema.default({}),
    gitUri: z.string(),
    defaults: z.object({
      rootCwd: z.string(),
      workspace: z.string(),
      outputDir: z.string(),
      runDir: z.string(),
      logFile: z.string(),
    }),
    files: z.object({
      envFile: z.string(),
      envPropertiesFile: z.string().optional(),
      envConfigFile: z.string().optional(),
      exportOptionsAdHoc: z.string().optional(),
      exportOptionsAppStore: z.string().optional(),
      agconnectFile: z.string().optional(),
    }),
    flags: z.object({
      autoVersionCode: z.boolean(),
      legacyVersioning: z.boolean(),
      cleanWorkspace: z.boolean(),
    }),
    features: z.object({
      codemodAndroid: z.boolean(),
      copyToFileBrowser: z.boolean(),
      syncArchive: z.boolean(),
    }),
    build: z.object({
      iosProjectName: z.string(),
      iosScheme: z.string(),
      iosBuildType: z.string(),
      ipaName: z.string(),
      distributions: z.array(z.enum(["adHoc", "appStore"])),
    }),
    uploads: z.object({
      fir: z
        .object({
          enabled: z.boolean(),
          apiKey: z.string().optional(),
        })
        .optional(),
      pgyer: z
        .object({
          enabled: z.boolean(),
          apiKey: z.string().optional(),
          buildType: z.literal("apk").optional(),
        })
        .optional(),
      qiniu: z
        .object({
          enabled: z.boolean(),
          url: z.string().optional(),
          key: z.string().optional(),
        })
        .optional(),
    }),
    appInfo: ProjectConfigSchema.shape.appInfo.optional(),
    appStore: ProjectConfigSchema.shape.appStore.optional(),
    source: z.object({
      workspaceId: z.string(),
      profileId: z.string(),
    }),
  })
);

export const StepStatusSchema = z.enum([
  "pending",
  "running",
  "success",
  "failed",
  "skipped",
]);

export const StepErrorSchema = z.object({
  stepId: z.enum(stepIds),
  message: z.string(),
  category: z.string(),
});

export const ArtifactSchema = z.object({
  kind: z.string(),
  path: z.string(),
  label: z.string(),
  sha256: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const UploadRecordSchema = z.object({
  idempotencyKey: z.string(),
  channel: z.enum(["fir", "pgyer", "qiniu"]),
  artifactPath: z.string(),
  artifactSha256: z.string(),
  stepId: z.literal("upload_distribution"),
  createdAt: z.string(),
  result: z.record(z.string(), z.unknown()).optional(),
});

export const StepResultSchema = z.object({
  ok: z.boolean(),
  status: StepStatusSchema,
  stepId: z.enum(stepIds),
  runId: z.string(),
  startedAt: z.string(),
  endedAt: z.string(),
  checkpoint: z.boolean(),
  outputs: z.record(z.string(), z.unknown()).default({}),
  artifacts: z.array(ArtifactSchema).default([]),
  warnings: z.array(z.string()).default([]),
  error: StepErrorSchema.optional(),
});

export const StepStateSchema = z.object({
  stepId: z.enum(stepIds),
  displayName: z.string(),
  status: StepStatusSchema,
  retryable: z.boolean(),
  checkpointable: z.boolean(),
  dependsOn: z.array(z.enum(stepIds)),
  startedAt: z.string().optional(),
  endedAt: z.string().optional(),
  outputs: z.record(z.string(), z.unknown()).default({}),
  artifacts: z.array(ArtifactSchema).default([]),
  warnings: z.array(z.string()).default([]),
  error: StepErrorSchema.optional(),
});

export const RunStateSchema = z.object({
  runId: z.string(),
  projectId: z.string(),
  profileId: z.string(),
  status: z.enum(["pending", "running", "success", "failed"]),
  currentStepId: z.enum(stepIds).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  artifacts: z.array(ArtifactSchema).default([]),
  uploadRecords: z.array(UploadRecordSchema).default([]),
  steps: z.record(z.string(), StepStateSchema).default({}),
});

export type ProjectPipelineOptions = z.infer<typeof ProjectPipelineOptionsSchema>;
export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;
export type BuildArgs = z.infer<typeof BuildArgsSchema>;
export type BuildProfile = z.infer<typeof BuildProfileSchema>;
export type BuildRequest = z.infer<typeof BuildRequestSchema>;
export type ResolvedRunConfig = z.infer<typeof ResolvedRunConfigSchema>;
export type StepStatus = z.infer<typeof StepStatusSchema>;
export type StepError = z.infer<typeof StepErrorSchema>;
export type Artifact = z.infer<typeof ArtifactSchema>;
export type UploadRecord = z.infer<typeof UploadRecordSchema>;
export type StepResult = z.infer<typeof StepResultSchema>;
export type StepState = z.infer<typeof StepStateSchema>;
export type RunState = z.infer<typeof RunStateSchema>;

export type StepDefinition = {
  stepId: StepId;
  displayName: string;
  retryable: boolean;
  checkpointable: boolean;
  dependsOn: StepId[];
};

export const RunLifecycleStatusSchema = z.enum([
  "queued",
  "running",
  "resume_requested",
  "retry_requested",
  "failed",
  "success",
]);

export const RequestedActionSchema = z.enum(["start", "resume", "retry"]);

export const TriggerSourceSchema = z.enum(["cli", "web", "worker"]);

export const PipelineListItemSchema = z.object({
  pipelineId: z.string(),
  projectId: z.string(),
  profileId: z.string(),
  displayName: z.string(),
  packageAlias: z.string(),
  platform: z.enum(platforms),
  env: z.enum(envs),
  branch: z.string(),
  steps: z.array(z.enum(stepIds)),
});

export const PipelineDefinitionSchema = z.object({
  pipelineId: z.string(),
  projectId: z.string(),
  profileId: z.string(),
  displayName: z.string(),
  pipeline: PipelineSelectionSchema,
  steps: z.array(z.enum(stepIds)),
});

export const PipelineCheckpointSchema = z.object({
  currentStepId: z.enum(stepIds).optional(),
  lastSuccessfulStepId: z.enum(stepIds).optional(),
});

export const PipelineRunContextSchema = z.object({
  runId: z.string(),
  pipelineId: z.string(),
  request: BuildRequestSchema,
  resolvedConfig: ResolvedRunConfigSchema,
  stepResults: z.record(z.string(), StepStateSchema).default({}),
  artifacts: z.array(ArtifactSchema).default([]),
  uploads: z.array(UploadRecordSchema).default([]),
  checkpoint: PipelineCheckpointSchema.default({}),
  logFile: z.string(),
  workspace: z.string(),
  outputDir: z.string(),
});

export const BuildStartRequestSchema = z.preprocess(
  normalizeRequestLikeInput,
  z.object({
    projectId: z.string(),
    profileId: z.string(),
    runId: z.string().optional(),
    args: BuildArgsSchema.default({}),
    triggerSource: TriggerSourceSchema.default("cli"),
  })
);

export const BuildResumeRequestSchema = z.object({
  runId: z.string(),
  fromStep: z.enum(stepIds),
  triggerSource: TriggerSourceSchema.default("cli"),
});

export const BuildRetryRequestSchema = z.object({
  runId: z.string(),
  stepId: z.enum(stepIds),
  triggerSource: TriggerSourceSchema.default("cli"),
});

export const PipelineRunRecordSchema = z.object({
  runId: z.string(),
  pipelineId: z.string(),
  projectId: z.string(),
  profileId: z.string(),
  status: RunLifecycleStatusSchema,
  triggerSource: TriggerSourceSchema,
  requestedAction: RequestedActionSchema,
  requestedStepId: z.enum(stepIds).optional(),
  currentStepId: z.enum(stepIds).optional(),
  errorStepId: z.enum(stepIds).optional(),
  errorCategory: z.string().optional(),
  errorMessage: z.string().optional(),
  createdAt: z.string(),
  startedAt: z.string().optional(),
  endedAt: z.string().optional(),
  updatedAt: z.string(),
});

export const PipelineRunDetailSchema = z.object({
  run: PipelineRunRecordSchema,
  context: PipelineRunContextSchema,
  definition: PipelineDefinitionSchema,
  steps: z.array(StepStateSchema),
  artifacts: z.array(ArtifactSchema),
  uploads: z.array(UploadRecordSchema),
});

export const PipelineDashboardStatsSchema = z.object({
  queued: z.number(),
  running: z.number(),
  failed: z.number(),
  success: z.number(),
});

export type RunLifecycleStatus = z.infer<typeof RunLifecycleStatusSchema>;
export type RequestedAction = z.infer<typeof RequestedActionSchema>;
export type TriggerSource = z.infer<typeof TriggerSourceSchema>;
export type PipelineListItem = z.infer<typeof PipelineListItemSchema>;
export type PipelineDefinition = z.infer<typeof PipelineDefinitionSchema>;
export type PipelineCheckpoint = z.infer<typeof PipelineCheckpointSchema>;
export type PipelineRunContext = z.infer<typeof PipelineRunContextSchema>;
export type BuildStartRequest = z.infer<typeof BuildStartRequestSchema>;
export type BuildResumeRequest = z.infer<typeof BuildResumeRequestSchema>;
export type BuildRetryRequest = z.infer<typeof BuildRetryRequestSchema>;
export type PipelineRunRecord = z.infer<typeof PipelineRunRecordSchema>;
export type PipelineRunDetail = z.infer<typeof PipelineRunDetailSchema>;
export type PipelineDashboardStats = z.infer<typeof PipelineDashboardStatsSchema>;
