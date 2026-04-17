import { resolve } from "node:path";
import { cwd } from "node:process";
import {
  createHugoAivPipelines,
  type HugoAivPipelineArgs,
} from "../../cli/hugo-aiv/buildHugoAivApp";
import { createPipelineArgsFromBuildOptions } from "../../cli/modHelpers";
import {
  configSchema,
  createConnect,
  getBuildHistoryByBuildId,
  getBuildSummaryByBuildId,
  findBuildSummariesByBuildIdPrefix,
  importIfExistsAndValidate,
  type Config,
} from "../../utils";
import type { BuildSummary } from "../../utils/sqliteUtil";
import { BuildAlreadyRunningError } from "../../v2/pipeline";

export async function handleResume(params: { buildId: string; dryRun?: boolean }) {
  const db = await createConnect();
  try {
    const summary = await resolveSummary(db, params.buildId);
    if (!summary) {
      return { error: `未找到构建记录: ${params.buildId}` };
    }

    if (summary.status === "success") {
      return {
        buildId: summary.buildId,
        status: "success",
        message: "这条构建已经成功完成，不需要恢复。",
      };
    }

    if (!summary.failedTaskIndex && summary.failedTaskIndex !== 0) {
      return {
        buildId: summary.buildId,
        status: summary.status,
        message: "这条构建没有可恢复的失败任务。",
      };
    }

    if (summary.projectName !== "hugo-aiv-app") {
      return {
        buildId: summary.buildId,
        error: `当前只支持恢复 hugo-aiv-app，这条记录属于 ${summary.projectName}。`,
      };
    }

    if (params.dryRun) {
      return {
        dryRun: true,
        status: "ok",
        buildId: summary.buildId,
        pipeId: summary.pipeId,
        failedTask: summary.failedTaskName ?? null,
        failedTaskIndex: summary.failedTaskIndex,
        message: "可以恢复，未实际执行。",
      };
    }

    const config = await loadConfig();
    const buildOptions = (summary.buildOptions ?? {}) as Record<
      string,
      unknown
    >;
    const pipelines = createHugoAivPipelines({
      config,
      pipelines: [summary.pipeId],
      args: createPipelineArgsFromBuildOptions(buildOptions),
      workspace: summary.workspace ?? undefined,
      clean: false,
    });

    const pipeline = pipelines[0];
    const history = await getBuildHistoryByBuildId(db, summary.buildId);
    const resumeContext = restoreContextFromHistory(
      history,
      summary.failedTaskIndex,
    );

    pipeline.setResumeState({
      buildId: summary.buildId,
      startTaskIndex: summary.failedTaskIndex,
      context: resumeContext,
    });

    try {
      const success = await pipeline.run();
      return {
        buildId: summary.buildId,
        status: success ? "success" : "failed",
        fromTask: summary.failedTaskName ?? null,
        message: success ? "恢复执行完成" : "恢复执行失败",
      };
    } catch (error) {
      if (error instanceof BuildAlreadyRunningError) {
        return {
          buildId: summary.buildId,
          status: "running",
          message: "这条构建当前正在执行，请稍后再试。",
        };
      }
      throw error;
    }
  } finally {
    await db.close();
  }
}

async function resolveSummary(
  db: Awaited<ReturnType<typeof createConnect>>,
  buildIdOrPrefix: string,
): Promise<BuildSummary | null> {
  const exact = await getBuildSummaryByBuildId(db, buildIdOrPrefix);
  if (exact) return exact;
  const matched = await findBuildSummariesByBuildIdPrefix(db, buildIdOrPrefix);
  if (matched.length === 1) return matched[0];
  return null;
}

function restoreContextFromHistory(
  history: Array<Record<string, any>>,
  failedTaskIndex: number,
) {
  const context: Record<string, unknown> = {};
  history
    .filter(
      (item) =>
        item.status === "success" &&
        typeof item.task_index === "number" &&
        item.task_index < failedTaskIndex &&
        item.context_output_key &&
        item.task_output,
    )
    .forEach((item) => {
      try {
        context[item.context_output_key] = JSON.parse(item.task_output);
      } catch {
        context[item.context_output_key] = item.task_output;
      }
    });
  return context;
}

async function loadConfig(): Promise<Config> {
  const configPath = resolve(cwd(), "./src/cli/hugo-aiv/config.ts");
  const result = await importIfExistsAndValidate(configPath, configSchema);
  if (result.isOk()) return result.value as Config;
  const fallbackModule = await import("../../config.example");
  return fallbackModule.default as Config;
}
