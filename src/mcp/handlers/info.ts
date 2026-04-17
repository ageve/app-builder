import {
  createReadonlyConnect,
  getBuildHistoryByBuildId,
  getBuildSummaryByBuildId,
  findBuildSummariesByBuildIdPrefix,
} from "../../utils";
import type { BuildSummary } from "../../utils/sqliteUtil";

export async function handleInfo(params: {
  buildId: string;
  task?: string;
}) {
  const db = await createReadonlyConnect();
  try {
    const summary = await resolveSummary(db, params.buildId);
    if (!summary) {
      return { error: `未找到构建记录: ${params.buildId}` };
    }

    const history = await getBuildHistoryByBuildId(db, summary.buildId);

    const tasks = history.map((item: Record<string, any>) => ({
      taskName: item.task_name,
      taskIndex: item.task_index,
      status: item.status,
      startedAt: item.started_at ?? null,
      durationMs: item.duration_ms ?? null,
      errorMessage: item.error_message ?? null,
    }));

    const result: Record<string, unknown> = {
      buildId: summary.buildId,
      status: summary.status,
      pipeId: summary.pipeId,
      projectName: summary.projectName,
      env: summary.env ?? null,
      branch: summary.branch ?? null,
      platform: summary.platform ?? null,
      versionCode: summary.versionCode ?? null,
      versionName: summary.versionName ?? null,
      startedAt: summary.startedAt,
      finishedAt: summary.finishedAt ?? null,
      durationMs: summary.durationMs ?? null,
      failedTaskName: summary.failedTaskName ?? null,
      tasks,
    };

    if (params.task) {
      const taskRow = history.find(
        (item: Record<string, any>) => item.task_name === params.task,
      );
      if (!taskRow) {
        result.taskDetail = { error: `该构建中没有任务: ${params.task}` };
      } else {
        result.taskDetail = {
          taskName: taskRow.task_name,
          status: taskRow.status,
          taskInput: safeParseJson(taskRow.task_input),
          taskOutput: safeParseJson(taskRow.task_output),
          errorMessage: taskRow.error_message ?? null,
          errorStack: taskRow.error_stack ?? null,
          logFile: taskRow.log_file ?? null,
          durationMs: taskRow.duration_ms ?? null,
        };
      }
    }

    return result;
  } finally {
    await db.close();
  }
}

async function resolveSummary(
  db: Awaited<ReturnType<typeof createReadonlyConnect>>,
  buildIdOrPrefix: string,
): Promise<BuildSummary | null> {
  const exact = await getBuildSummaryByBuildId(db, buildIdOrPrefix);
  if (exact) return exact;

  const matched = await findBuildSummariesByBuildIdPrefix(db, buildIdOrPrefix);
  if (matched.length === 1) return matched[0];

  if (matched.length > 1) {
    return null;
  }

  return null;
}

function safeParseJson(value: unknown) {
  if (typeof value !== "string" || value === "") return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
