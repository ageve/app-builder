import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import {
  BuildProfile,
  BuildProfileSchema,
  BuildRequest,
  BuildRequestSchema,
  ConfigTemplate,
  ConfigTemplateSchema,
  PipelineRunContext,
  PipelineRunContextSchema,
  ProjectConfig,
  ProjectConfigSchema,
  ResolvedRunConfig,
  ResolvedRunConfigSchema,
  StepState,
} from "./types";

type JsonRecord = Record<string, unknown>;

function readJsonFile<T>(filePath: string, parser: { parse: (v: unknown) => T }) {
  const content = readFileSync(filePath, "utf-8");
  return parser.parse(JSON.parse(content));
}

function readJsonText(filePath: string) {
  return readFileSync(filePath, "utf-8");
}

function parseJsonContent<T>(
  content: string,
  parser: { parse: (v: unknown) => T }
) {
  return parser.parse(JSON.parse(content));
}

function mergeObjects(base: JsonRecord, next: JsonRecord): JsonRecord {
  const result: JsonRecord = { ...base };
  for (const [key, value] of Object.entries(next)) {
    const current = result[key];
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      current &&
      typeof current === "object" &&
      !Array.isArray(current)
    ) {
      result[key] = mergeObjects(current as JsonRecord, value as JsonRecord);
      continue;
    }
    result[key] = value;
  }
  return result;
}

function applyTemplates(profile: BuildProfile, templates: ConfigTemplate[]) {
  return templates.reduce<JsonRecord>(
    (acc, template) => mergeObjects(acc, template as unknown as JsonRecord),
    mergeObjects({}, profile as unknown as JsonRecord)
  );
}

function configRoot(cwd: string) {
  return resolve(cwd, "configs");
}

function rebasePath(filePath: string, fromRoot: string, toRoot: string) {
  if (filePath === fromRoot || filePath.startsWith(`${fromRoot}/`)) {
    const suffix = filePath.slice(fromRoot.length).replace(/^\/+/, "");
    return resolve(toRoot, suffix);
  }
  const fromParent = dirname(fromRoot);
  const toParent = dirname(toRoot);
  if (filePath === fromParent || filePath.startsWith(`${fromParent}/`)) {
    const suffix = filePath.slice(fromParent.length).replace(/^\/+/, "");
    return resolve(toParent, suffix);
  }
  return filePath;
}

function projectFile(cwd: string, projectId: string) {
  return resolve(configRoot(cwd), "projects", `${projectId}.json`);
}

function templateFile(cwd: string, templateId: string) {
  return resolve(configRoot(cwd), "templates", `${templateId}.json`);
}

function profileFile(cwd: string, profileId: string) {
  return resolve(configRoot(cwd), "profiles", `${profileId}.json`);
}

export function loadProjectConfig(cwd: string, projectId: string): ProjectConfig {
  return readJsonFile(projectFile(cwd, projectId), ProjectConfigSchema);
}

export function loadBuildProfile(cwd: string, profileId: string): BuildProfile {
  return readJsonFile(profileFile(cwd, profileId), BuildProfileSchema);
}

export function loadTemplate(cwd: string, templateId: string): ConfigTemplate {
  return readJsonFile(templateFile(cwd, templateId), ConfigTemplateSchema);
}

export function listWorkspaceConfigs(cwd: string) {
  const dir = resolve(configRoot(cwd), "projects");
  return readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .sort()
    .map((file) => {
      const workspaceId = file.replace(/\.json$/, "");
      const config = loadProjectConfig(cwd, workspaceId);
      return {
        workspaceId: config.id,
        name: config.name,
      };
    });
}

export function readWorkspaceConfigText(cwd: string, workspaceId: string) {
  return readJsonText(projectFile(cwd, workspaceId));
}

export function saveWorkspaceConfigText(
  cwd: string,
  workspaceId: string,
  content: string
) {
  const parsed = parseJsonContent(content, ProjectConfigSchema);
  if (parsed.id !== workspaceId) {
    throw new Error(`workspace id mismatch: expected ${workspaceId}, got ${parsed.id}`);
  }
  writeFileSync(projectFile(cwd, workspaceId), `${JSON.stringify(parsed, null, 2)}\n`, "utf-8");
  return parsed;
}

export function readPipelineConfigText(cwd: string, profileId: string) {
  return readJsonText(profileFile(cwd, profileId));
}

export function savePipelineConfigText(
  cwd: string,
  profileId: string,
  content: string
) {
  const parsed = parseJsonContent(content, BuildProfileSchema);
  if (parsed.id !== profileId) {
    throw new Error(`pipeline id mismatch: expected ${profileId}, got ${parsed.id}`);
  }
  writeFileSync(profileFile(cwd, profileId), `${JSON.stringify(parsed, null, 2)}\n`, "utf-8");
  return parsed;
}

function resolveTemplates(cwd: string, profile: BuildProfile) {
  return profile.extends.map((templateId) => loadTemplate(cwd, templateId));
}

function assertFileExists(filePath: string, kind: string) {
  if (!existsSync(filePath)) {
    throw new Error(`${kind} does not exist: ${filePath}`);
  }
}

export function resolveRunConfigFromRequest(
  cwd: string,
  requestInput: BuildRequest | unknown
): ResolvedRunConfig {
  const request = BuildRequestSchema.parse(requestInput);
  const project = loadProjectConfig(cwd, request.projectId);
  const profile = loadBuildProfile(cwd, request.profileId);
  if (profile.projectId !== project.id) {
    throw new Error(
      `profile ${profile.id} does not belong to project ${project.id}`
    );
  }

  const templates = resolveTemplates(cwd, profile);
  const merged = applyTemplates(profile, templates) as JsonRecord;
  const runtimeConfig =
    request.overrides.runtimeConfig &&
    typeof request.overrides.runtimeConfig === "object" &&
    !Array.isArray(request.overrides.runtimeConfig)
      ? (request.overrides.runtimeConfig as JsonRecord)
      : {};
  const mergedWithRuntime = mergeObjects(merged, runtimeConfig);
  const mergedPipeline = (mergedWithRuntime.pipeline ?? {}) as JsonRecord;
  const mergedFlags = (mergedWithRuntime.flags ?? {}) as JsonRecord;
  const mergedFeatures = (mergedWithRuntime.features ?? {}) as JsonRecord;
  const mergedFiles = (mergedWithRuntime.files ?? {}) as JsonRecord;
  const mergedBuild = (mergedWithRuntime.build ?? {}) as JsonRecord;
  const mergedUploads = (mergedWithRuntime.uploads ?? {}) as JsonRecord;

  const gitProjectName = basename(project.gitUri).replace(/\.git$/, "");
  const runRoot = resolve(
    cwd,
    project.defaults.runRoot ?? ".runs",
    request.runId
  );
  const workspace = resolve(
    cwd,
    project.defaults.workspaceRoot ?? "../app-builder-cache/projects",
    `${gitProjectName}-${profile.id}`
  );
  const outputDir = resolve(
    cwd,
    project.defaults.outputRoot ?? "build",
    request.runId
  );

  const resolved: ResolvedRunConfig = {
    runId: request.runId,
    projectId: project.id,
    projectName: gitProjectName,
    profileId: profile.id,
    pipeline: {
      packageAlias: String(mergedPipeline.packageAlias),
      platform: mergedPipeline.platform as ResolvedRunConfig["pipeline"]["platform"],
      env: mergedPipeline.env as ResolvedRunConfig["pipeline"]["env"],
      branch: request.overrides.branch ?? String(mergedPipeline.branch),
    },
    gitUri: project.gitUri,
    defaults: {
      rootCwd: cwd,
      workspace,
      outputDir,
      runDir: runRoot,
      logFile: resolve(runRoot, "pipeline.log"),
    },
    files: {
      envFile: resolve(cwd, String(mergedFiles.envFile)),
      envPropertiesFile: mergedFiles.envPropertiesFile
        ? resolve(cwd, String(mergedFiles.envPropertiesFile))
        : undefined,
      envConfigFile: mergedFiles.envConfigFile
        ? resolve(cwd, String(mergedFiles.envConfigFile))
        : undefined,
      exportOptionsAdHoc: mergedFiles.exportOptionsAdHoc
        ? resolve(cwd, String(mergedFiles.exportOptionsAdHoc))
        : undefined,
      exportOptionsAppStore: mergedFiles.exportOptionsAppStore
        ? resolve(cwd, String(mergedFiles.exportOptionsAppStore))
        : undefined,
      agconnectFile: mergedFiles.agconnectFile
        ? resolve(cwd, String(mergedFiles.agconnectFile))
        : undefined,
    },
    flags: {
      autoVersionCode:
        request.overrides.autoVersionCode ?? Boolean(mergedFlags.autoVersionCode),
      legacyVersioning:
        request.overrides.legacyVersioning ?? Boolean(mergedFlags.legacyVersioning),
      cleanWorkspace:
        mergedFlags.cleanWorkspace === undefined
          ? project.defaults.cleanWorkspace ?? true
          : Boolean(mergedFlags.cleanWorkspace),
    },
    features: {
      codemodAndroid: Boolean(mergedFeatures.codemodAndroid),
      copyToFileBrowser: Boolean(mergedFeatures.copyToFileBrowser),
      syncArchive: Boolean(mergedFeatures.syncArchive),
    },
    build: {
      iosProjectName: String(mergedBuild.iosProjectName ?? "aiv"),
      iosScheme: String(mergedBuild.iosScheme ?? "aiv"),
      iosBuildType: String(mergedBuild.iosBuildType ?? "Release"),
      ipaName: String(mergedBuild.ipaName ?? "aiv"),
      distributions:
        mergedPipeline.env === "production" ? ["adHoc", "appStore"] : ["adHoc"],
    },
    uploads: {
      fir: {
        enabled:
          request.overrides.uploads?.fir ?? Boolean(mergedUploads.fir ?? false),
        apiKey: project.fir?.apiKey,
      },
      pgyer: {
        enabled:
          request.overrides.uploads?.pgyer ??
          Boolean(mergedUploads.pgyer ?? false),
        apiKey: project.pgyer?.apiKey,
        buildType: project.pgyer?.buildType,
      },
      qiniu: {
        enabled:
          request.overrides.uploads?.qiniu ??
          Boolean(mergedUploads.qiniu ?? false),
        url:
          mergedPipeline.env === "alpha"
            ? project.uploadApi?.alpha
            : project.uploadApi?.prod,
        key: project.appInfo
          ? `res/apk/{versionName}/${project.appInfo.name}-${project.appInfo.slogan}.apk`
          : undefined,
      },
    },
    appInfo: project.appInfo,
    appStore: project.appStore,
    source: {
      templates: profile.extends,
    },
  };

  assertFileExists(resolved.files.envFile, "envFile");
  if (resolved.pipeline.platform === "android") {
    if (!resolved.files.envPropertiesFile) {
      throw new Error("envPropertiesFile is required for android profiles");
    }
    assertFileExists(resolved.files.envPropertiesFile, "envPropertiesFile");
    if (resolved.files.agconnectFile) {
      assertFileExists(resolved.files.agconnectFile, "agconnectFile");
    }
  }
  if (resolved.pipeline.platform === "iOS") {
    if (!resolved.files.envConfigFile) {
      throw new Error("envConfigFile is required for iOS profiles");
    }
    if (!resolved.files.exportOptionsAdHoc) {
      throw new Error("exportOptionsAdHoc is required for iOS profiles");
    }
    assertFileExists(resolved.files.envConfigFile, "envConfigFile");
    assertFileExists(resolved.files.exportOptionsAdHoc, "exportOptionsAdHoc");
    if (resolved.pipeline.env === "production") {
      if (!resolved.files.exportOptionsAppStore) {
        throw new Error(
          "exportOptionsAppStore is required for iOS production profiles"
        );
      }
      assertFileExists(
        resolved.files.exportOptionsAppStore,
        "exportOptionsAppStore"
      );
    }
  }

  return ResolvedRunConfigSchema.parse(resolved);
}

export function adaptResolvedRunConfigToCwd(
  cwd: string,
  resolvedConfigInput: ResolvedRunConfig | unknown
): ResolvedRunConfig {
  const resolvedConfig = ResolvedRunConfigSchema.parse(resolvedConfigInput);
  if (resolvedConfig.defaults.rootCwd === cwd) {
    return resolvedConfig;
  }

  const fromRoot = resolvedConfig.defaults.rootCwd;
  const next: ResolvedRunConfig = {
    ...resolvedConfig,
    defaults: {
      ...resolvedConfig.defaults,
      rootCwd: cwd,
      workspace: rebasePath(resolvedConfig.defaults.workspace, fromRoot, cwd),
      outputDir: rebasePath(resolvedConfig.defaults.outputDir, fromRoot, cwd),
      runDir: rebasePath(resolvedConfig.defaults.runDir, fromRoot, cwd),
      logFile: rebasePath(resolvedConfig.defaults.logFile, fromRoot, cwd),
    },
    files: {
      ...resolvedConfig.files,
      envFile: rebasePath(resolvedConfig.files.envFile, fromRoot, cwd),
      envPropertiesFile: resolvedConfig.files.envPropertiesFile
        ? rebasePath(resolvedConfig.files.envPropertiesFile, fromRoot, cwd)
        : undefined,
      envConfigFile: resolvedConfig.files.envConfigFile
        ? rebasePath(resolvedConfig.files.envConfigFile, fromRoot, cwd)
        : undefined,
      exportOptionsAdHoc: resolvedConfig.files.exportOptionsAdHoc
        ? rebasePath(resolvedConfig.files.exportOptionsAdHoc, fromRoot, cwd)
        : undefined,
      exportOptionsAppStore: resolvedConfig.files.exportOptionsAppStore
        ? rebasePath(resolvedConfig.files.exportOptionsAppStore, fromRoot, cwd)
        : undefined,
      agconnectFile: resolvedConfig.files.agconnectFile
        ? rebasePath(resolvedConfig.files.agconnectFile, fromRoot, cwd)
        : undefined,
    },
  };

  return ResolvedRunConfigSchema.parse(next);
}

export function adaptPipelineRunContextToCwd(
  cwd: string,
  contextInput: PipelineRunContext | unknown
): PipelineRunContext {
  const context = PipelineRunContextSchema.parse(contextInput);
  if (context.resolvedConfig.defaults.rootCwd === cwd) {
    return context;
  }

  const adaptedResolvedConfig = adaptResolvedRunConfigToCwd(cwd, context.resolvedConfig);
  const fromRoot = context.resolvedConfig.defaults.rootCwd;

  function adaptStepState(step: StepState): StepState {
    return {
      ...step,
      artifacts: step.artifacts.map((artifact) => ({
        ...artifact,
        path: rebasePath(artifact.path, fromRoot, cwd),
      })),
    };
  }

  return PipelineRunContextSchema.parse({
    ...context,
    resolvedConfig: adaptedResolvedConfig,
    logFile: rebasePath(context.logFile, fromRoot, cwd),
    workspace: rebasePath(context.workspace, fromRoot, cwd),
    outputDir: rebasePath(context.outputDir, fromRoot, cwd),
    artifacts: context.artifacts.map((artifact) => ({
      ...artifact,
      path: rebasePath(artifact.path, fromRoot, cwd),
    })),
    uploads: context.uploads.map((upload) => ({
      ...upload,
      artifactPath: rebasePath(upload.artifactPath, fromRoot, cwd),
    })),
    stepResults: Object.fromEntries(
      Object.entries(context.stepResults).map(([stepId, step]) => [
        stepId,
        adaptStepState(step),
      ])
    ),
  });
}
