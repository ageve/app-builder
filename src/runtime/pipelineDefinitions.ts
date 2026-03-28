import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { nanoid } from "nanoid";
import { resolveRunConfigFromRequest } from "./config";
import { getOrderedStepsForPlatform } from "./definitions";
import { BuildRequest, BuildStartRequest, PipelineDefinition, PipelineListItem } from "./types";
import { loadBuildProfile } from "./config";

function profilesDir(cwd: string) {
  return resolve(cwd, "configs", "profiles");
}

export function createPipelineId(projectId: string, profileId: string) {
  return `${projectId}:${profileId}`;
}

export function createRunId() {
  return `run_${nanoid(12)}`;
}

export function listPipelines(cwd: string, projectId?: string): PipelineListItem[] {
  const dir = profilesDir(cwd);
  const files = readdirSync(dir).filter((file) => file.endsWith(".json")).sort();

  return files
    .map((file) => loadBuildProfile(cwd, file.replace(/\.json$/, "")))
    .filter((profile) => !projectId || profile.projectId === projectId)
    .map((profile) => ({
      pipelineId: createPipelineId(profile.projectId, profile.id),
      projectId: profile.projectId,
      profileId: profile.id,
      displayName: `${profile.packageAlias} / ${profile.platform} / ${profile.env}`,
      packageAlias: profile.packageAlias,
      platform: profile.platform,
      env: profile.env,
      branch: profile.branch,
      steps: getOrderedStepsForPlatform(profile.platform),
    }));
}

export function inspectConfig(cwd: string, request: Omit<BuildStartRequest, "triggerSource">) {
  const runId = request.runId ?? createRunId();
  return resolveRunConfigFromRequest(cwd, {
    runId,
    projectId: request.projectId,
    profileId: request.profileId,
    args: request.args ?? {},
  });
}

export function createPipelineDefinition(
  cwd: string,
  request: BuildRequest
): PipelineDefinition {
  const resolvedConfig = resolveRunConfigFromRequest(cwd, request);
  return {
    pipelineId: createPipelineId(request.projectId, request.profileId),
    projectId: request.projectId,
    profileId: request.profileId,
    displayName: `${resolvedConfig.pipeline.packageAlias} / ${resolvedConfig.pipeline.platform} / ${resolvedConfig.pipeline.env}`,
    pipeline: resolvedConfig.pipeline,
    steps: getOrderedStepsForPlatform(resolvedConfig.pipeline.platform),
  };
}
