import { resolve } from "node:path";
import { cwd } from "node:process";
import {
  createHugoAivPipelines,
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

export async function handleRetry(params: {
  buildId: string;
  task: string;
  dryRun?: boolean;
}) {
  const db = await createConnect();
  try {
    const summary = await resolveSummary(db, params.buildId);
    if (!summary) {
      return { error: `未找到构建记录: ${params.buildId}` };
    }

    if (summary.projectName !== "hugo-aiv-app") {
      return {
        buildId: summary.buildId,
        error: `当前只支持重试 hugo-aiv-app，这条记录属于 ${summary.projectName}。`,
      };
    }

    const history = await getBuildHistoryByBuildId(db, summary.buildId);
    const taskRow = history.find(
      (item: Record<string, any>) => item.task_name === params.task,
    );

    if (!taskRow) {
      return {
        buildId: summary.buildId,
        error: `该构建中没有任务: ${params.task}`,
      };
    }

    if (taskRow.status !== "success") {
      return {
        buildId: summary.buildId,
        task: params.task,
        error: "这个任务还没成功完成，不能用 retry，请改用 resume。",
      };
    }

    if (typeof taskRow.task_index !== "number") {
      return {
        buildId: summary.buildId,
        task: params.task,
        error: "没找到这个任务的执行顺序。",
      };
    }

    const taskIndex = taskRow.task_index;

    if (params.dryRun) {
      return {
        dryRun: true,
        status: "ok",
        buildId: summary.buildId,
        pipeId: summary.pipeId,
        task: params.task,
        taskIndex,
        message: "可以从该任务重试，未实际执行。",
      };
    }

    const buildOptions = (summary.buildOptions ?? {}) as Record<
      string,
      unknown
    >;
    const retryContext = restoreContextFromHistory(history, taskIndex);

    // close db before long-running pipeline
    await db.close();

    const config = await loadConfig();
    const pipelines = createHugoAivPipelines({
      config,
      pipelines: [summary.pipeId],
      args: createPipelineArgsFromBuildOptions(buildOptions),
      workspace: summary.workspace ?? undefined,
      clean: false,
    });

    const pipeline = pipelines[0];
    pipeline.setResumeState({
      startTaskIndex: taskIndex,
      context: retryContext,
    });

    try {
      const success = await pipeline.run();
      return {
        sourceBuildId: summary.buildId,
        retryBuildId: pipeline.lastRunBuildId || null,
        fromTask: params.task,
        status: success ? "success" : "failed",
        message: success ? "重试执行完成" : "重试执行失败",
        ...((!success && pipeline.lastFailedTaskName)
          ? { failedTask: pipeline.lastFailedTaskName }
          : {}),
        ...((!success && pipeline.lastFailureReason)
          ? { reason: pipeline.lastFailureReason }
          : {}),
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
    try { await db.close(); } catch {}
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
  taskIndex: number,
) {
  const context: Record<string, unknown> = {};
  history
    .filter(
      (item) =>
        item.status === "success" &&
        typeof item.task_index === "number" &&
        item.task_index < taskIndex &&
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
