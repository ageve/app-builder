import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, resolve } from "node:path";
import {
  BuildProfile,
  BuildProfileSchema,
  BuildRequest,
  BuildRequestSchema,
  PipelineRunContext,
  PipelineRunContextSchema,
  ProjectConfig,
  ProjectConfigSchema,
  ProjectPipelineOptions,
  ResolvedRunConfig,
  ResolvedRunConfigSchema,
  StepState,
} from "./types";

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

function profileFile(cwd: string, profileId: string) {
  return resolve(configRoot(cwd), "profiles", `${profileId}.json`);
}

function profilesDir(cwd: string) {
  return resolve(configRoot(cwd), "profiles");
}

function envRoot(cwd: string, projectId: string) {
  return resolve(cwd, "envs", projectId);
}

function resolveProjectPipelineOptions(
  project: ProjectConfig
): Required<ProjectPipelineOptions> {
  return {
    gitUri: project.pipelineOptions.gitUri ?? project.gitUri,
    workspaceRoot:
      project.pipelineOptions.workspaceRoot ??
      project.defaults.workspaceRoot ??
      "../app-builder-cache/projects",
    outputRoot:
      project.pipelineOptions.outputRoot ?? project.defaults.outputRoot ?? "build",
    runRoot: project.pipelineOptions.runRoot ?? project.defaults.runRoot ?? ".runs",
    cleanWorkspace:
      project.pipelineOptions.cleanWorkspace ??
      project.defaults.cleanWorkspace ??
      true,
  };
}

function deriveFiles(cwd: string, profile: BuildProfile, projectId: string) {
  const root = envRoot(cwd, projectId);
  const envFile = resolve(root, `.env.${profile.packageAlias}.${profile.env}`);

  if (profile.platform === "android") {
    return {
      envFile,
      envPropertiesFile: resolve(root, `.env.${profile.packageAlias}.properties`),
      envConfigFile: undefined,
      exportOptionsAdHoc: undefined,
      exportOptionsAppStore: undefined,
      agconnectFile: resolve(root, `${profile.packageAlias}-agconnect-services.json`),
    };
  }

  return {
    envFile,
    envPropertiesFile: undefined,
    envConfigFile: resolve(root, `.env.${profile.packageAlias}.xcconfig`),
    exportOptionsAdHoc: resolve(
      root,
      `${profile.packageAlias}.ExportOptions.adHoc.plist`
    ),
    exportOptionsAppStore:
      profile.env === "production"
        ? resolve(root, `${profile.packageAlias}.ExportOptions.appstore.plist`)
        : undefined,
    agconnectFile: undefined,
  };
}

function assertFileExists(filePath: string, kind: string) {
  if (!existsSync(filePath)) {
    throw new Error(`${kind} does not exist: ${filePath}`);
  }
}

export function loadProjectConfig(cwd: string, projectId: string): ProjectConfig {
  return readJsonFile(projectFile(cwd, projectId), ProjectConfigSchema);
}

export function loadBuildProfile(cwd: string, profileId: string): BuildProfile {
  return readJsonFile(profileFile(cwd, profileId), BuildProfileSchema);
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

export function createWorkspaceConfig(cwd: string, input: ProjectConfig) {
  const parsed = ProjectConfigSchema.parse(input);
  const filePath = projectFile(cwd, parsed.id);
  if (existsSync(filePath)) {
    throw new Error(`workspace already exists: ${parsed.id}`);
  }
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(parsed, null, 2)}\n`, "utf-8");
  return parsed;
}

export function deleteWorkspaceConfig(cwd: string, workspaceId: string) {
  const filePath = projectFile(cwd, workspaceId);
  if (!existsSync(filePath)) {
    throw new Error(`workspace not found: ${workspaceId}`);
  }

  const pipelineIds = readdirSync(profilesDir(cwd))
    .filter((file) => file.endsWith(".json"))
    .map((file) => file.replace(/\.json$/, ""))
    .map((profileId) => loadBuildProfile(cwd, profileId))
    .filter((profile) => profile.projectId === workspaceId)
    .map((profile) => profile.id);

  unlinkSync(filePath);
  for (const pipelineId of pipelineIds) {
    const pipelineFile = profileFile(cwd, pipelineId);
    if (existsSync(pipelineFile)) {
      unlinkSync(pipelineFile);
    }
  }

  return { workspaceId, deletedPipelineIds: pipelineIds };
}

export function readPipelineConfigText(cwd: string, profileId: string) {
  return readJsonText(profileFile(cwd, profileId));
}

export function createPipelineConfig(cwd: string, input: BuildProfile) {
  const parsed = BuildProfileSchema.parse(input);
  const workspaceFile = projectFile(cwd, parsed.projectId);
  if (!existsSync(workspaceFile)) {
    throw new Error(`workspace not found: ${parsed.projectId}`);
  }
  const filePath = profileFile(cwd, parsed.id);
  if (existsSync(filePath)) {
    throw new Error(`pipeline already exists: ${parsed.id}`);
  }
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(parsed, null, 2)}\n`, "utf-8");
  return parsed;
}

export function deletePipelineConfig(cwd: string, profileId: string) {
  const filePath = profileFile(cwd, profileId);
  if (!existsSync(filePath)) {
    throw new Error(`pipeline not found: ${profileId}`);
  }
  unlinkSync(filePath);
  return { pipelineId: profileId };
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

  const pipelineOptions = resolveProjectPipelineOptions(project);
  const gitProjectName = basename(pipelineOptions.gitUri).replace(/\.git$/, "");
  const runRoot = resolve(cwd, pipelineOptions.runRoot, request.runId);
  const workspace = resolve(
    cwd,
    pipelineOptions.workspaceRoot,
    `${gitProjectName}-${profile.id}`
  );
  const outputDir = resolve(cwd, pipelineOptions.outputRoot, request.runId);
  const files = deriveFiles(cwd, profile, project.id);
  const autoVersionCode =
    profile.env === "production" || Boolean(request.args.autoVersionCode);
  const legacyVersioning = Boolean(request.args.legacyVersioning);

  const resolved: ResolvedRunConfig = {
    runId: request.runId,
    projectId: project.id,
    projectName: gitProjectName,
    profileId: profile.id,
    pipeline: {
      packageAlias: profile.packageAlias,
      platform: profile.platform,
      env: profile.env,
      branch: profile.branch,
    },
    args: request.args,
    gitUri: pipelineOptions.gitUri,
    defaults: {
      rootCwd: cwd,
      workspace,
      outputDir,
      runDir: runRoot,
      logFile: resolve(runRoot, "pipeline.log"),
    },
    files,
    flags: {
      autoVersionCode,
      legacyVersioning,
      cleanWorkspace: pipelineOptions.cleanWorkspace,
    },
    features: {
      codemodAndroid: profile.platform === "android",
      copyToFileBrowser: profile.platform === "android",
      syncArchive: profile.platform === "iOS" && profile.env === "production",
    },
    build: {
      iosProjectName: "aiv",
      iosScheme: "aiv",
      iosBuildType: "Release",
      ipaName: "aiv",
      distributions: profile.env === "production" ? ["adHoc", "appStore"] : ["adHoc"],
    },
    uploads: {
      fir: {
        enabled: profile.env === "alpha" && Boolean(project.fir?.apiKey),
        apiKey: project.fir?.apiKey,
      },
      pgyer: {
        enabled: profile.env === "production" && Boolean(project.pgyer?.apiKey),
        apiKey: project.pgyer?.apiKey,
        buildType: project.pgyer?.buildType,
      },
      qiniu: {
        enabled:
          profile.platform === "android" &&
          profile.env === "production" &&
          Boolean(project.uploadApi?.prod),
        url:
          profile.env === "alpha"
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
      workspaceId: project.id,
      profileId: profile.id,
    },
  };

  assertFileExists(resolved.files.envFile, "envFile");
  if (resolved.pipeline.platform === "android") {
    if (!resolved.files.envPropertiesFile) {
      throw new Error("envPropertiesFile is required for android pipelines");
    }
    if (!resolved.files.agconnectFile) {
      throw new Error("agconnectFile is required for android pipelines");
    }
    assertFileExists(resolved.files.envPropertiesFile, "envPropertiesFile");
    assertFileExists(resolved.files.agconnectFile, "agconnectFile");
  }
  if (resolved.pipeline.platform === "iOS") {
    if (!resolved.files.envConfigFile) {
      throw new Error("envConfigFile is required for iOS pipelines");
    }
    if (!resolved.files.exportOptionsAdHoc) {
      throw new Error("exportOptionsAdHoc is required for iOS pipelines");
    }
    assertFileExists(resolved.files.envConfigFile, "envConfigFile");
    assertFileExists(resolved.files.exportOptionsAdHoc, "exportOptionsAdHoc");
    if (resolved.pipeline.env === "production") {
      if (!resolved.files.exportOptionsAppStore) {
        throw new Error(
          "exportOptionsAppStore is required for iOS production pipelines"
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
