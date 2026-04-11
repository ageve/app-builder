import { log } from "@clack/prompts";
import dayjs from "dayjs";
import {
  accessSync,
  constants,
  existsSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { colorize } from "json-colorizer";
import { resolve } from "node:path";
import { cwd } from "node:process";
import { spawn } from "node:child_process";
import picocolors from "picocolors";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { $ } from "zx";
import {
  createHugoAivPipelines,
  type HugoAivPipelineArgs,
  getHugoAivPipelineOptions,
} from "./hugo-aiv/buildHugoAivApp";
import { runMainCli } from "./main";
import {
  createBuildPipelineIds,
  createPipelineArgsFromBuildOptions,
  extractTaskOptionsFromArgv,
  parseBuildPlatforms,
  type SupportedBuildPlatform,
  SUPPORTED_BUILD_APPS,
  SUPPORTED_BUILD_BRANCHES,
  SUPPORTED_BUILD_ENVS,
} from "./modHelpers";
import { BuildAlreadyRunningError } from "../v2/pipeline";
import { pipelineRun } from "../v2/pipelineRun";
import {
  clearBuildHistory,
  clearBuildHistoryByBuildIds,
  configSchema,
  createConnect,
  createReadonlyConnect,
  findBuildSummariesByBuildIdPrefix,
  getBuildHistoryByBuildId,
  getBuildSummaryByBuildId,
  initBuildHistoryDb,
  importIfExistsAndValidate,
  listBuildIdsBefore,
  listBuildHistoryLogFiles,
  listBuildHistoryLogFilesByBuildIds,
  listBuildSummariesByDate,
  listPipelines,
  type Config,
} from "../utils";
import type { BuildSummary } from "../utils/sqliteUtil";

type CliArgs = {
  _: Array<string | number>;
  buildId?: string;
  all?: boolean;
  log?: boolean;
  limit?: number;
  filter?: string[] | string;
  task?: string;
  app?: string;
  env?: string;
  branch?: string;
  platform?: string[] | string;
  autoVersionCode?: boolean;
  legacyVersioning?: boolean;
  "android:buildAndroid.clear"?: boolean;
  "ios:buildIOS.podInstall"?: boolean;
  "ios:buildIOS.provisioningAuto"?: boolean;
};

async function main() {
  const rawArgs = hideBin(process.argv);
  if (rawArgs.length === 0) {
    await runMainCli();
    return;
  }

  const cli = createCli();
  const argv = (await cli.parse()) as CliArgs;
  const command = typeof argv._[0] === "string" ? argv._[0] : "";

  if (command === "history") {
    await listBuilds(argv.limit, parseHistoryFilters(argv.filter));
    return;
  }

  if (command === "clear") {
    await clearBuildData({
      clearAll: Boolean(argv.all),
      clearLogs: Boolean(argv.log),
    });
    return;
  }

  if (command === "pipeline") {
    await listAllPipelines();
    return;
  }

  if (command === "info") {
    await showBuildTaskInfo(String(argv.buildId ?? ""), argv.task);
    return;
  }

  if (command === "log") {
    await showBuildLog(String(argv.buildId ?? ""));
    return;
  }

  if (command === "retry") {
    await retryBuildFromTask(String(argv.buildId ?? ""), argv.task);
    return;
  }

  if (command === "init") {
    await initHugoAivPipelines();
    return;
  }

  if (command === "resume") {
    await resumeBuild(String(argv.buildId ?? ""));
    return;
  }

  if (command === "build") {
    await buildHugoAivFromCommand(argv);
    return;
  }

  if (command === "asc") {
    const ascAction = typeof argv._[1] === "string" ? argv._[1] : "";
    if (ascAction === "upload") {
      await uploadBuildToAppStore(String(argv.buildId ?? ""));
      return;
    }
    exitWithCliError(`不支持的 asc 子命令: ${ascAction || "-"}`);
  }

  cli.showHelp();
}

async function listBuilds(
  limit = 10,
  filters: Record<string, string> = {},
) {
  const db = await createReadonlyConnect();
  try {
    const safeLimit = Number.isFinite(limit)
      ? Math.max(1, Math.floor(limit))
      : 10;
    const today = dayjs().format("YYYY-MM-DD");
    const builds = filterBuildSummaries(
      hideSupersededBuilds(await listBuildSummariesByDate(db, today)),
      filters,
    ).slice(0, safeLimit);

    if (builds.length === 0) {
      console.log("还没有构建记录。");
      return;
    }

    renderTable({
      columns: [
        {
          key: "buildId",
          title: "BuildId",
          maxWidth: 16,
          minWidth: 12,
          hardMinWidth: 12,
          render: (row, width) => formatCell(toResumeId(row.buildId), width),
        },
        {
          key: "status",
          title: "Status",
          maxWidth: 11,
          minWidth: 11,
          hardMinWidth: 11,
        },
        {
          key: "pipeId",
          title: "PipeId",
          maxWidth: 24,
          minWidth: 10,
          hardMinWidth: 10,
        },
        {
          key: "versionCode",
          title: "VersionCode",
          maxWidth: 12,
          minWidth: 10,
        },
        {
          key: "versionName",
          title: "VersionName",
          maxWidth: 18,
          minWidth: 12,
        },
        {
          key: "startTaskName",
          title: "StartTask",
          maxWidth: 16,
          minWidth: 10,
        },
        { key: "env", title: "Env", maxWidth: 12, minWidth: 7 },
        { key: "branch", title: "Branch", maxWidth: 12, minWidth: 8 },
        { key: "platform", title: "Platform", maxWidth: 10, minWidth: 8 },
        {
          key: "startedAt",
          title: "StartedAt",
          maxWidth: 11,
          minWidth: 11,
          hardMinWidth: 11,
          render: (row, width) =>
            formatCell(formatStartedAt(row.startedAt), width),
        },
        {
          key: "durationMs",
          title: "Duration",
          maxWidth: 8,
          minWidth: 8,
          hardMinWidth: 8,
          render: (row, width) =>
            formatCell(formatDuration(row.durationMs), width),
        },
        {
          key: "failedTaskName",
          title: "FailedTask",
          maxWidth: 18,
          minWidth: 10,
          render: (row, width) => {
            const text = formatCell(row.failedTaskName, width);
            return text === "-" ? text : picocolors.red(text);
          },
        },
      ],
      rows: builds,
    });
  } finally {
    await db.close();
  }
}

async function clearBuildData(options: {
  clearAll?: boolean;
  clearLogs?: boolean;
}) {
  const db = await createConnect();
  try {
    const clearAll = Boolean(options.clearAll);
    const clearLogs = Boolean(options.clearLogs);
    const cutoff = dayjs().startOf("day").toISOString();
    let targetBuildIds: string[] = [];
    let removedLogs = 0;

    if (clearAll) {
      if (clearLogs) {
        const files = await listBuildHistoryLogFiles(db);
        removedLogs = clearManagedLogFiles(files);
      }
      await clearBuildHistory(db);
      renderKeyValueCard("Clear", [
        ["Scope", "全部历史"],
        ["Result", "已清理全部构建历史"],
        clearLogs
          ? ["Log", `已清理 ${removedLogs} 个日志文件`]
          : ["Log", "未清理日志（可加 --log）"],
      ]);
      return;
    }

    targetBuildIds = await listBuildIdsBefore(db, cutoff);

    if (clearLogs) {
      const files = await listBuildHistoryLogFilesByBuildIds(
        db,
        targetBuildIds,
      );
      removedLogs = clearManagedLogFiles(files);
    }

    await clearBuildHistoryByBuildIds(db, targetBuildIds);

    renderKeyValueCard("Clear", [
      ["Scope", "今天以前"],
      ["Result", "已清理今天以前构建历史"],
      ["BuildCount", String(targetBuildIds.length)],
      clearLogs
        ? ["Log", `已清理 ${removedLogs} 个日志文件`]
        : ["Log", "未清理日志（可加 --log）"],
    ]);
  } finally {
    await db.close();
  }
}

function clearManagedLogFiles(files: string[]) {
  const buildDir = resolve(cwd(), "./build");
  const logsDir = resolve(cwd(), "./logs");
  let removed = 0;

  for (const filePath of files) {
    if (
      typeof filePath !== "string" ||
      (!filePath.startsWith(buildDir) && !filePath.startsWith(logsDir))
    ) {
      continue;
    }
    if (!existsSync(filePath)) {
      continue;
    }

    try {
      rmSync(filePath, { force: true });
      removed += 1;
    } catch (_error) {
      // 忽略单个文件删除失败，不影响整体清理
    }
  }

  return removed;
}

function parseHistoryFilters(input?: string[] | string) {
  const entries = Array.isArray(input) ? input : input ? [input] : [];
  const filters: Record<string, string> = {};
  const supportedKeys = [
    "platform",
    "env",
    "branch",
    "status",
    "pipeId",
    "project",
    "projectName",
    "buildId",
  ];

  for (const entry of entries) {
    const clauses = String(entry)
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    for (const text of clauses) {
      const separatorIndex = text.indexOf("=");
      if (separatorIndex <= 0 || separatorIndex === text.length - 1) {
        exitWithCliError(
          `--filter 格式错误: ${text}，请使用 key=value，例如 --filter platform=ios,env=alpha`,
        );
      }

      const key = text.slice(0, separatorIndex).trim();
      const value = text.slice(separatorIndex + 1).trim();
      if (!key || !value) {
        exitWithCliError(
          `--filter 格式错误: ${text}，请使用 key=value，例如 --filter platform=ios,env=alpha`,
        );
      }

      if (!supportedKeys.includes(key)) {
        exitWithCliError(
          `--filter 暂不支持字段: ${key}。当前支持: ${supportedKeys.join(", ")}`,
        );
      }

      filters[key] = value;
    }
  }

  return filters;
}

function filterBuildSummaries(
  builds: BuildSummary[],
  filters: Record<string, string>,
) {
  const entries = Object.entries(filters);
  if (entries.length === 0) {
    return builds;
  }

  return builds.filter((build) =>
    entries.every(([key, expected]) => {
      const actual = readBuildFilterValue(build, key);
      if (!actual) {
        return false;
      }
      return actual.toLowerCase() === expected.toLowerCase();
    }),
  );
}

function readBuildFilterValue(build: BuildSummary, key: string) {
  switch (key) {
    case "platform":
      return build.platform ?? null;
    case "env":
      return build.env ?? null;
    case "branch":
      return build.branch ?? null;
    case "status":
      return build.status ?? null;
    case "pipeId":
      return build.pipeId ?? null;
    case "project":
    case "projectName":
      return build.projectName ?? null;
    case "buildId":
      return build.buildId ?? null;
    default:
      return null;
  }
}

function hideSupersededBuilds(builds: BuildSummary[]) {
  const succeededKeys = new Set<string>();

  return builds.filter((build) => {
    const key = [
      build.projectName,
      build.pipeId,
      build.env ?? "",
      build.branch ?? "",
      build.platform ?? "",
      build.workspace ?? "",
    ].join("|");

    if (build.status === "success") {
      succeededKeys.add(key);
      return true;
    }

    if (
      succeededKeys.has(key) &&
      (build.status === "failed" || build.status === "interrupted")
    ) {
      return false;
    }

    return true;
  });
}

async function listAllPipelines() {
  const db = await createReadonlyConnect();
  try {
    const pipelines = await listPipelines(db);
    if (pipelines.length === 0) {
      console.log("还没有 pipeline 记录。");
      return;
    }

    renderTable({
      columns: [
        { key: "pipe_id", title: "PipeId", maxWidth: 34, minWidth: 16 },
        { key: "project_name", title: "Project", maxWidth: 14, minWidth: 10 },
        { key: "env", title: "Env", maxWidth: 12, minWidth: 7 },
        { key: "branch", title: "Branch", maxWidth: 12, minWidth: 8 },
        { key: "platform", title: "Platform", maxWidth: 10, minWidth: 8 },
        { key: "workspace", title: "Workspace", maxWidth: 28, minWidth: 12 },
      ],
      rows: pipelines,
    });
  } finally {
    await db.close();
  }
}

async function initHugoAivPipelines() {
  const config = await loadHugoAivConfig();
  const pipelineIds = getHugoAivPipelineOptions();
  let createdOrUpdated = 0;

  for (const pipeId of pipelineIds) {
    const [, platform, env, branch] = pipeId.split("-");
    const dbInfo = await initBuildHistoryDb({
      pipeId,
      projectName: "hugo-aiv-app",
      gitUri: config.gitUri,
      branch,
      env,
      platform,
      buildOptions: {
        source: "src/cli/hugo-aiv/buildHugoAivApp.ts",
      },
    });
    createdOrUpdated += 1;
    await dbInfo.db.close();
  }

  console.log(
    `已初始化 ${createdOrUpdated} 条 pipeline 记录。重复的不会新增。`,
  );
}

async function resumeBuild(buildId: string) {
  const db = await createConnect();
  try {
    const summary = await resolveBuildSummary(db, buildId);

    if (!summary) {
      renderKeyValueCard("Resume", [
        ["BuildId", buildId],
        ["Result", "未找到这条构建记录"],
      ]);
      return;
    }

    renderKeyValueCard("Resume", [
      ["BuildId", toResumeId(summary.buildId)],
      ["Status", summary.status],
      ["PipeId", summary.pipeId],
      ["Project", summary.projectName],
      ["Env", summary.env ?? "-"],
      ["Branch", summary.branch ?? "-"],
      ["Platform", summary.platform ?? "-"],
      ["FailedTask", summary.failedTaskName ?? "-"],
    ]);

    if (summary.status === "success") {
      console.log("这条构建已经成功完成，不需要恢复。");
      return;
    }

    if (!summary.failedTaskIndex && summary.failedTaskIndex !== 0) {
      console.log("这条构建没有可恢复的失败任务。");
      return;
    }

    if (summary.projectName !== "hugo-aiv-app") {
      console.log(
        `当前只支持恢复 hugo-aiv-app，这条记录属于 ${summary.projectName}。`,
      );
      return;
    }

    const config = await loadHugoAivConfig();
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
    const history = await getBuildHistoryByBuildId(db, buildId);
    const resumeContext = restoreContextFromHistory(
      history,
      summary.failedTaskIndex,
    );

    pipeline.setResumeState({
      buildId,
      startTaskIndex: summary.failedTaskIndex,
      context: resumeContext,
    });

    log.info(
      `resume buildId=${summary.buildId}, from taskIndex=${summary.failedTaskIndex}, taskName=${summary.failedTaskName}`,
    );
    try {
      const success = await pipeline.run();
      renderKeyValueCard("Resume Result", [
        ["BuildId", toResumeId(summary.buildId)],
        ["Result", success ? "恢复执行完成" : "恢复执行失败"],
        ["FromTask", summary.failedTaskName ?? "-"],
      ]);
    } catch (error) {
      if (error instanceof BuildAlreadyRunningError) {
        renderKeyValueCard("Resume Result", [
          ["BuildId", toResumeId(summary.buildId)],
          ["Result", "这条构建当前正在执行，请稍后再试"],
          ["FromTask", summary.failedTaskName ?? "-"],
        ]);
        return;
      }
      throw error;
    }
  } finally {
    await db.close();
  }
}

async function showBuildTaskInfo(buildId: string, taskName?: string) {
  const db = await createReadonlyConnect();
  try {
    const summary = await resolveBuildSummary(db, buildId);
    if (!summary) {
      renderKeyValueCard("构建详情", [
        ["BuildId", buildId],
        ["Result", "未找到这条构建记录"],
      ]);
      return;
    }

    const history = await getBuildHistoryByBuildId(db, summary.buildId);
    const failedTaskRow =
      history.find((item) => item.status === "failed") ??
      history.find((item) => item.status === "interrupted");
    const taskRow = taskName
      ? history.find((item) => item.task_name === taskName)
      : (failedTaskRow ?? history[history.length - 1]);

    if (taskName && !taskRow) {
      renderKeyValueCard("构建详情", [
        ["BuildId", toResumeId(summary.buildId)],
        ["Task", taskName],
        ["Result", "这次构建里没有这个任务"],
      ]);
      return;
    }

    renderKeyValueCard("构建详情", [
      ["BuildId", toResumeId(summary.buildId)],
      ["Status", summary.status],
      ["PipeId", summary.pipeId],
      ["Project", summary.projectName],
      ["Env", summary.env ?? "-"],
      ["Branch", summary.branch ?? "-"],
      ["Platform", summary.platform ?? "-"],
      ["StartedAt", formatStartedAt(summary.startedAt)],
      ["FinishedAt", formatStartedAt(summary.finishedAt)],
    ]);

    if (summary.status === "failed" || summary.status === "interrupted") {
      renderKeyValueCard("失败信息", [
        ["Task", failedTaskRow?.task_name ?? summary.failedTaskName ?? "-"],
        [
          "Reason",
          formatPlainBlock(
            failedTaskRow?.error_message ??
              (summary.status === "interrupted" ? "Interrupted" : "-"),
          ),
        ],
      ]);

      renderTextCard(
        taskName
          ? `任务上下文 · ${taskRow?.task_name ?? taskName}`
          : "Build Context",
        formatTaskDetails([
          ["task", formatPlainBlock(taskRow?.task_name)],
          ["taskInput", formatJsonBlock(taskRow?.task_input)],
          ["logFile", formatPlainBlock(taskRow?.log_file)],
          ["errorStack", formatPlainBlock(taskRow?.error_stack)],
        ]),
      );
      return;
    }

    renderTextCard(
      taskName
        ? `任务上下文 · ${taskRow?.task_name ?? taskName}`
        : "Build Context",
      formatTaskDetails([
        ["task", formatPlainBlock(taskRow?.task_name)],
        ["taskInput", formatJsonBlock(taskRow?.task_input)],
        ["logFile", formatPlainBlock(taskRow?.log_file)],
        ...(taskName
          ? [
              ["taskOutput", formatJsonBlock(taskRow?.task_output)] as [
                string,
                string,
              ],
            ]
          : []),
      ]),
    );
  } finally {
    await db.close();
  }
}

async function showBuildLog(buildId: string) {
  const db = await createReadonlyConnect();
  try {
    const summary = await resolveBuildSummary(db, buildId);
    if (!summary) {
      renderKeyValueCard("查看日志", [
        ["BuildId", buildId],
        ["Result", "未找到这条构建记录"],
      ]);
      return;
    }

    const history = await getBuildHistoryByBuildId(db, summary.buildId);
    const logFile = resolveLogFileFromHistory(summary, history);
    if (!logFile) {
      renderKeyValueCard("查看日志", [
        ["BuildId", toResumeId(summary.buildId)],
        ["Result", "没有找到对应日志文件"],
      ]);
      return;
    }

    renderKeyValueCard("查看日志", [
      ["BuildId", toResumeId(summary.buildId)],
      ["LogFile", logFile],
    ]);

    await runTailspin(logFile);
  } finally {
    await db.close();
  }
}

function resolveLogFileFromHistory(
  summary: BuildSummary,
  history: Array<Record<string, any>>,
) {
  const logsDir = resolve(cwd(), `./logs/${summary.projectName}`);

  const renameTask = [...history]
    .reverse()
    .find((item) => item.task_name === "renameLog");
  const renameOutput = parseJsonValue(renameTask?.task_output) as Record<
    string,
    unknown
  > | null;
  const renamePath =
    typeof renameOutput?.archivedLogFile === "string"
      ? renameOutput.archivedLogFile
      : null;
  if (renamePath && existsSync(renamePath)) {
    return renamePath;
  }

  if (existsSync(logsDir)) {
    const prefixA = `${summary.buildId}.`;
    const prefixB = `${summary.buildId}_`;
    const candidates = readdirSync(logsDir)
      .filter((filename) => filename.endsWith(".log"))
      .filter(
        (filename) =>
          filename.startsWith(prefixA) || filename.startsWith(prefixB),
      )
      .map((filename) => resolve(logsDir, filename))
      .filter((filePath) => existsSync(filePath));

    if (candidates.length > 0) {
      candidates.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
      return candidates[0];
    }
  }

  const historyLogCandidates = [...history]
    .reverse()
    .map((item) => item.log_file)
    .filter(
      (value): value is string => typeof value === "string" && value !== "",
    )
    .filter((filePath) => filePath.includes("/logs/") && existsSync(filePath));

  if (historyLogCandidates.length > 0) {
    return historyLogCandidates[0];
  }

  return null;
}

function runTailspin(logFile: string) {
  return new Promise<void>((resolvePromise, rejectPromise) => {
    const viewer = resolveTailspinViewer();
    const child = spawn(viewer.command, viewer.args(logFile), {
      stdio: "inherit",
    });

    child.on("error", (error) => {
      rejectPromise(
        new Error(
          `无法启动日志查看器，请先安装 tailspin（命令 tspin）后重试。原始错误: ${error.message}`,
        ),
      );
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      rejectPromise(new Error(`tspin 退出码异常: ${code ?? "null"}`));
    });
  });
}

function resolveTailspinViewer() {
  const preferredPaths = ["/opt/homebrew/bin/tspin", "/usr/local/bin/tspin"];
  for (const path of preferredPaths) {
    if (isExecutable(path)) {
      return {
        command: path,
        args: (logFile: string) => ["-p", logFile],
      };
    }
  }

  return {
    command: "tspin",
    args: (logFile: string) => ["-p", logFile],
  };
}

function isExecutable(path: string) {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch (_error) {
    return false;
  }
}

async function retryBuildFromTask(buildId: string, taskName?: string) {
  if (!taskName) {
    exitWithCliError("缺少必要参数: --task");
  }

  const db = await createConnect();
  let summary: Awaited<ReturnType<typeof resolveBuildSummary>> | null = null;
  let taskIndex: number | null = null;
  let pipeId = "";
  let workspace: string | undefined;
  let buildOptions: Record<string, unknown> = {};
  let retryContext: Record<string, unknown> = {};
  try {
    summary = await resolveBuildSummary(db, buildId);
    if (!summary) {
      renderKeyValueCard("Retry", [
        ["BuildId", buildId],
        ["Result", "未找到这条构建记录"],
      ]);
      return;
    }

    if (summary.projectName !== "hugo-aiv-app") {
      renderKeyValueCard("Retry", [
        ["BuildId", toResumeId(summary.buildId)],
        ["Project", summary.projectName],
        ["Result", "当前只支持重试 hugo-aiv-app"],
      ]);
      return;
    }

    const history = await getBuildHistoryByBuildId(db, summary.buildId);
    const taskRow = history.find((item) => item.task_name === taskName);

    if (!taskRow) {
      renderKeyValueCard("Retry", [
        ["BuildId", toResumeId(summary.buildId)],
        ["Task", taskName],
        ["Result", "这次构建里没有这个任务"],
      ]);
      return;
    }

    if (taskRow.status !== "success") {
      renderKeyValueCard("Retry", [
        ["BuildId", toResumeId(summary.buildId)],
        ["Task", taskName],
        ["Status", taskRow.status ?? "-"],
        ["Result", "这个任务还没成功完成，不能用 retry，请改用 resume"],
      ]);
      return;
    }

    if (typeof taskRow.task_index !== "number") {
      renderKeyValueCard("Retry", [
        ["BuildId", toResumeId(summary.buildId)],
        ["Task", taskName],
        ["Result", "没找到这个任务的执行顺序"],
      ]);
      return;
    }

    taskIndex = taskRow.task_index;
    pipeId = summary.pipeId;
    workspace = summary.workspace ?? undefined;
    buildOptions = (summary.buildOptions ?? {}) as Record<string, unknown>;
    retryContext = restoreContextFromHistory(history, taskRow.task_index);

    renderKeyValueCard("Retry", [
      ["SourceBuildId", toResumeId(summary.buildId)],
      ["Task", taskName],
      ["PipeId", summary.pipeId],
      ["Status", summary.status],
      ["Result", "将从这个任务开始重新执行后续步骤"],
    ]);
  } finally {
    await db.close();
  }

  if (!summary || taskIndex === null) {
    return;
  }

  const config = await loadHugoAivConfig();
  const pipelines = createHugoAivPipelines({
    config,
    pipelines: [pipeId],
    args: createPipelineArgsFromBuildOptions(buildOptions),
    workspace,
    clean: false,
  });

  const pipeline = pipelines[0];

  log.info(
    `retry sourceBuildId=${summary.buildId}, from taskIndex=${taskIndex}, taskName=${taskName}`,
  );

  try {
    const success = await runPipelineFromTask(
      pipeline,
      taskIndex,
      retryContext,
    );
    const resultRows: Array<[string, string]> = [
      ["SourceBuildId", toResumeId(summary.buildId)],
      ["RetryBuildId", toResumeId(pipeline.lastRunBuildId)],
      ["FromTask", taskName],
      ["Result", success ? "重试执行完成" : "重试执行失败"],
    ];

    if (!success && pipeline.lastFailedTaskName) {
      resultRows.push(["FailedTask", pipeline.lastFailedTaskName]);
    }

    if (!success && pipeline.lastFailureReason) {
      resultRows.push(["Reason", pipeline.lastFailureReason]);
    }

    renderKeyValueCard("Retry Result", resultRows);
  } catch (error) {
    if (error instanceof BuildAlreadyRunningError) {
      renderKeyValueCard("Retry Result", [
        ["SourceBuildId", toResumeId(summary.buildId)],
        ["FromTask", taskName],
        ["Result", "这条构建当前正在执行，请稍后再试"],
      ]);
      return;
    }
    throw error;
  }
}

async function uploadBuildToAppStore(buildId: string) {
  const db = await createReadonlyConnect();
  try {
    const summary = await resolveBuildSummary(db, buildId);
    if (!summary) {
      renderKeyValueCard("上传到 App Store Connect", [
        ["BuildId", buildId],
        ["Result", "未找到这条构建记录"],
      ]);
      return;
    }

    if (summary.platform !== "iOS") {
      renderKeyValueCard("上传到 App Store Connect", [
        ["BuildId", toResumeId(summary.buildId)],
        ["Platform", summary.platform ?? "-"],
        ["Result", "只支持 iOS 构建记录"],
      ]);
      return;
    }

    const history = await getBuildHistoryByBuildId(db, summary.buildId);
    const buildIosTask = history.find((item) => item.task_name === "buildIOS");
    const buildIosOutput = parseJsonValue(buildIosTask?.task_output);
    const ipaPath =
      buildIosOutput &&
      typeof buildIosOutput === "object" &&
      "ipaFiles" in buildIosOutput &&
      buildIosOutput.ipaFiles &&
      typeof buildIosOutput.ipaFiles === "object" &&
      "appStore" in buildIosOutput.ipaFiles
        ? String(buildIosOutput.ipaFiles.appStore || "")
        : "";

    if (!buildIosTask || !ipaPath) {
      renderKeyValueCard("上传到 App Store Connect", [
        ["BuildId", toResumeId(summary.buildId)],
        ["Task", "buildIOS"],
        ["Result", "这次构建没有可上传的 App Store IPA"],
      ]);
      return;
    }

    if (!existsSync(ipaPath)) {
      renderKeyValueCard("上传到 App Store Connect", [
        ["BuildId", toResumeId(summary.buildId)],
        ["IPA", ipaPath],
        ["Result", "找到了构建记录，但本机上没有这个 IPA 文件"],
      ]);
      return;
    }

    const config = await loadHugoAivConfig();
    const appId =
      config.appStore?.appId ??
      process.env.APP_STORE_CONNECT_APP_ID ??
      process.env.ASC_APP_ID;
    const profile =
      config.appStore?.profile ??
      process.env.APP_STORE_CONNECT_PROFILE ??
      process.env.ASC_PROFILE;

    if (!appId) {
      renderKeyValueCard("上传到 App Store Connect", [
        ["BuildId", toResumeId(summary.buildId)],
        ["IPA", ipaPath],
        ["Result", "缺少 appId，请在 config.appStore.appId 或环境变量里提供"],
      ]);
      return;
    }

    renderKeyValueCard("上传到 App Store Connect", [
      ["BuildId", toResumeId(summary.buildId)],
      ["PipeId", summary.pipeId],
      ["Platform", summary.platform ?? "-"],
      ["IPA", ipaPath],
      ["AppId", appId],
      ["Profile", profile ?? "default"],
    ]);

    try {
      const profileArgs = profile ? ["--profile", profile] : [];
      await $`asc ${profileArgs} builds upload --app ${appId} --ipa ${ipaPath}`;
      renderKeyValueCard("上传结果", [
        ["BuildId", toResumeId(summary.buildId)],
        ["Result", "已提交到 App Store Connect"],
      ]);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error ?? "上传失败");
      renderKeyValueCard("上传结果", [
        ["BuildId", toResumeId(summary.buildId)],
        ["Result", "上传失败"],
        ["Reason", message],
      ]);
    }
  } finally {
    await db.close();
  }
}

async function loadHugoAivConfig() {
  const configPath = resolve(cwd(), "./src/cli/hugo-aiv/config.ts");
  const result = await importIfExistsAndValidate(configPath, configSchema);
  if (result.isOk()) {
    return result.value as Config;
  }

  const fallbackModule = await import("../config.example");
  return fallbackModule.default as Config;
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
      } catch (error) {
        context[item.context_output_key] = item.task_output;
      }
    });

  return context;
}

function normalizeCliArgs(args: string[]) {
  const normalized = [...args];

  if (normalized[0] === "-l") {
    normalized[0] = "history";
  } else if (normalized[0] === "-p") {
    normalized[0] = "pipeline";
  } else if (normalized[0] === "-i") {
    normalized[0] = "info";
  } else if (normalized[0] === "-init") {
    normalized[0] = "init";
  } else if (normalized[0] === "-resume") {
    normalized[0] = "resume";
  } else if (normalized[0] === "-retry") {
    normalized[0] = "retry";
  }

  return normalized;
}

function createCli() {
  return yargs(normalizeCliArgs(hideBin(process.argv)))
    .parserConfiguration({
      "dot-notation": false,
    })
    .scriptName("bun cli")
    .usage("用法: $0 <command> [options]")
    .updateStrings({
      "Commands:": "命令:",
      "Options:": "选项:",
      "Show version number": "显示版本号",
      "Show help": "显示帮助",
      "Missing required argument: %s": "缺少必要参数: %s",
      "Missing required arguments: %s": "缺少必要参数: %s",
    })
    .command("init", "初始化数据库文件、表和 hugo-aiv 的 pipeline")
    .command("resume <buildId>", "按 buildId 恢复失败构建", (command) =>
      command.positional("buildId", {
        type: "string",
        describe: "构建 ID，可传完整值或前缀",
      }),
    )
    .command(
      "retry <buildId>",
      "从某次构建里指定任务开始重新执行后续步骤",
      (command) =>
        command
          .positional("buildId", {
            type: "string",
            describe: "构建 ID，可传完整值或前缀",
          })
          .option("task", {
            type: "string",
            description: "指定要重试的任务名",
          }),
    )
    .command(
      "build",
      "按 app/env/branch/platform 构建一个或多个 pipeline",
      (command) =>
        command
          .option("app", {
            type: "string",
            choices: [...SUPPORTED_BUILD_APPS],
            description: "要构建的应用；当前支持 hookAi",
          })
          .option("env", {
            type: "string",
            choices: [...SUPPORTED_BUILD_ENVS],
            description: "环境配置；可选 alpha、production",
          })
          .option("branch", {
            type: "string",
            choices: [...SUPPORTED_BUILD_BRANCHES],
            description: "代码分支；可选 alpha、main",
          })
          .option("platform", {
            type: "string",
            coerce: parseBuildPlatforms,
            description:
              "构建平台；支持 android、ios。多个值用逗号分隔，例如 ios,android",
          })
          .option("autoVersionCode", {
            type: "boolean",
            description:
              "全局参数；是否自动递增 versionCode。不传时沿用当前项目原有逻辑",
          })
          .option("legacyVersioning", {
            type: "boolean",
            description:
              "全局参数；是否启用兼容旧逻辑的版本号策略。不传时沿用当前项目原有逻辑",
          })
          .option("android:buildAndroid.clear", {
            type: "boolean",
            description:
              "Android 专属；传给 buildAndroid 任务。true 先清理再构建，false 跳过清理直接构建",
          })
          .option("ios:buildIOS.podInstall", {
            type: "boolean",
            description:
              "iOS 专属；传给 buildIOS 任务。true 强制执行 pod install；false 或不传时按需执行",
          })
          .option("ios:buildIOS.provisioningAuto", {
            type: "boolean",
            description:
              "iOS 专属；传给 buildIOS 任务。控制导出阶段自动签名更新和设备注册；不传时默认关闭",
          }),
    )
    .command(
      "info <buildId>",
      "查看某次构建详情；可选配合 --task 查看指定任务上下文",
      (command) =>
        command
          .positional("buildId", {
            type: "string",
            describe: "构建 ID，可传完整值或前缀",
          })
          .option("task", {
            type: "string",
            description: "查看指定任务的上下文",
          }),
    )
    .command("log <buildId>", "查看某次构建日志（tspin -p）", (command) =>
      command.positional("buildId", {
        type: "string",
        describe: "构建 ID，可传完整值或前缀",
      }),
    )
    .command("history", "查看今天的构建历史", (command) =>
      command.option("limit", {
        type: "number",
        description: "限制显示条数，默认 10",
        default: 10,
      }).option("filter", {
        type: "array",
        string: true,
        description:
          "过滤条件，支持 key=value,key2=value2；也支持重复传入 --filter。示例：--filter platform=ios,env=alpha",
      }),
    )
    .command("clear", "清理历史（默认只清理今天以前）", (command) =>
      command
        .option("all", {
          type: "boolean",
          description: "清理全部构建历史",
        })
        .option("log", {
          type: "boolean",
          description: "同时删除对应日志文件",
        }),
    )
    .command("pipeline", "查看所有 pipeline", (command) => command)
    .command(
      "asc upload <buildId>",
      "上传某次 iOS 构建产出的 IPA 到 App Store Connect",
      (command) =>
        command.positional("buildId", {
          type: "string",
          describe: "构建 ID，可传完整值或前缀",
        }),
    )
    .demandCommand(1, "请先指定命令，例如 build、history、clear、info、log。")
    .strict()
    .recommendCommands()
    .fail((message, error, instance) => {
      if (message) {
        if (
          message.includes("Not enough non-option arguments") ||
          message.includes("Missing required arguments")
        ) {
          log.error(`缺少必要参数: ${message}`);
        } else {
          log.error(message);
        }
      }
      if (error && !message) {
        log.error(error.message);
      }
      instance.showHelp();
      process.exit(1);
    })
    .epilog(
      [
        "示例:",
        "  $0 init",
        "  $0 resume petdwVMJkImB",
        "  $0 retry petdwVMJkImB --task uploadQiniu",
        "  $0 build --app hookAi --env production --branch main --platform ios,android",
        "  $0 build --app hookAi --env production --branch main --platform android",
        "  $0 info petdwVMJkImB --task uploadQiniu",
        "  $0 log petdwVMJkImB",
        "  $0 history --limit 10",
        "  $0 history --filter platform=ios,env=alpha",
        "  $0 clear --log",
        "  $0 clear --all --log",
        "  $0 pipeline",
        "  $0 asc upload petdwVMJkImB",
        "",
        "通用规则:",
        "  build 必填: --app --env --branch --platform",
        "  --platform 支持多个值，逗号分隔，例如 ios,android",
        "  平台专属参数格式: --平台:任务名.参数名 值",
        "  平台专属参数只作用于对应平台，其他平台会忽略",
        "  缺少必填参数时会直接报错，不走选择框",
        "",
        "build 参数说明:",
        "  --app hookAi                           应用，当前只支持 hookAi",
        "  --env alpha|production                 环境",
        "  --branch alpha|main                    分支",
        "  --platform ios,android                 平台；支持单个或多个值",
        "  --autoVersionCode                      全局版本参数；控制 versionCode 递增",
        "  --legacyVersioning                     全局版本参数；启用旧版本号兼容逻辑",
        "  --android:buildAndroid.clear false     Android 专属；跳过 gradlew clean 直接构建",
        "  --ios:buildIOS.podInstall true         iOS 专属；强制执行 pod install（不传则按需）",
        "  --ios:buildIOS.provisioningAuto true   iOS 专属；按需开启导出时自动签名更新/设备注册（用于开发包、AdHoc）",
      ].join("\n"),
    )
    .alias("h", "help")
    .help("help")
    .wrap(Math.min(100, process.stdout.columns || 100));
}

async function buildHugoAivFromCommand(argv: CliArgs) {
  const app = requireCliString(argv.app, "--app");
  const env = requireCliString(argv.env, "--env");
  const branch = requireCliString(argv.branch, "--branch");
  const rawPlatform = argv.platform;
  if (rawPlatform === undefined) {
    exitWithCliError("缺少必要参数: --platform");
  }
  const platformsInput = Array.isArray(rawPlatform)
    ? rawPlatform.join(",")
    : rawPlatform;
  const platforms: SupportedBuildPlatform[] =
    parseBuildPlatforms(platformsInput);
  const taskOptions = extractTaskOptionsFromArgv(
    argv as unknown as Record<string, unknown>,
  );
  const pipelines = createBuildPipelineIds({
    app: app as (typeof SUPPORTED_BUILD_APPS)[number],
    env: env as (typeof SUPPORTED_BUILD_ENVS)[number],
    branch: branch as (typeof SUPPORTED_BUILD_BRANCHES)[number],
    platforms,
  });
  const config = await loadHugoAivConfig();
  const pipelineArgs: HugoAivPipelineArgs = {
    autoVersionCode: argv.autoVersionCode,
    legacyVersioning: argv.legacyVersioning,
    dryRun: false,
    ...(taskOptions ? { taskOptions } : {}),
  };

  renderKeyValueCard("Build", [
    ["App", app],
    ["Env", env],
    ["Branch", branch],
    ["Platform", platforms.join(",")],
    ["Pipelines", pipelines.join("\n")],
    ["autoVersionCode", String(argv.autoVersionCode ?? "-")],
    ["legacyVersioning", String(argv.legacyVersioning ?? "-")],
    [
      "android:buildAndroid.clear",
      typeof argv["android:buildAndroid.clear"] === "boolean"
        ? String(argv["android:buildAndroid.clear"])
        : "-",
    ],
    [
      "ios:buildIOS.podInstall",
      typeof argv["ios:buildIOS.podInstall"] === "boolean"
        ? String(argv["ios:buildIOS.podInstall"])
        : "-",
    ],
    [
      "ios:buildIOS.provisioningAuto",
      typeof argv["ios:buildIOS.provisioningAuto"] === "boolean"
        ? String(argv["ios:buildIOS.provisioningAuto"])
        : "-",
    ],
  ]);

  await pipelineRun(
    createHugoAivPipelines({
      config,
      pipelines,
      args: pipelineArgs,
    }),
  );
}

function renderTable({
  columns,
  rows,
}: {
  columns: Array<{
    key: string;
    title: string;
    maxWidth?: number;
    minWidth?: number;
    hardMinWidth?: number;
    render?: (row: Record<string, unknown>, width: number) => string;
  }>;
  rows: Array<Record<string, unknown>>;
}) {
  const measuredWidths = columns.map((column, index) => {
    const formattedValues = rows.map((row) =>
      stripAnsi(
        column.render
          ? column.render(row, column.maxWidth ?? 1000)
          : formatCell(row[column.key]),
      ),
    );
    const contentWidth = Math.max(
      stringWidth(column.title),
      ...formattedValues.map((value) => stringWidth(value)),
    );
    return column.maxWidth
      ? Math.min(contentWidth, column.maxWidth)
      : contentWidth;
  });
  const widths = fitTableWidths(columns, measuredWidths);
  const normalizedRows = rows.map((row) =>
    columns.map((column, index) =>
      column.render
        ? column.render(row, widths[index])
        : formatCell(row[column.key], widths[index]),
    ),
  );

  const border = `┌${widths.map((width) => "─".repeat(width + 2)).join("┬")}┐`;
  const divider = `├${widths.map((width) => "─".repeat(width + 2)).join("┼")}┤`;
  const footer = `└${widths.map((width) => "─".repeat(width + 2)).join("┴")}┘`;

  console.log(border);
  console.log(
    renderRow(
      columns.map((column) => column.title),
      widths,
    ),
  );
  console.log(divider);
  normalizedRows.forEach((row) => {
    console.log(renderRow(row, widths));
  });
  console.log(footer);
}

function renderKeyValueCard(title: string, rows: Array<[string, string]>) {
  const terminalWidth = Math.max(80, process.stdout.columns || 120);
  const labelWidth = Math.max(
    ...rows.map(([label]) => stringWidth(label)),
    stringWidth(title),
  );
  const maxValueWidth = Math.max(terminalWidth - labelWidth - 7, 20);
  const wrappedRows = rows.map(
    ([label, value]) => [label, toWrappedLines(value, maxValueWidth)] as const,
  );
  const valueWidth = Math.min(
    maxValueWidth,
    Math.max(
      ...wrappedRows.flatMap(([, lines]) =>
        lines.map((line) => stringWidth(line)),
      ),
      0,
    ),
  );
  const totalWidth = labelWidth + valueWidth + 7;

  console.log(`┌${"─".repeat(totalWidth - 2)}┐`);
  console.log(`│ ${padCell(title, totalWidth - 4)} │`);
  console.log(`├${"─".repeat(labelWidth + 2)}┬${"─".repeat(valueWidth + 2)}┤`);
  wrappedRows.forEach(([label, lines]) => {
    lines.forEach((line, index) => {
      console.log(
        `│ ${padCell(index === 0 ? label : "", labelWidth)} │ ${padCell(line, valueWidth)} │`,
      );
    });
  });
  console.log(`└${"─".repeat(labelWidth + 2)}┴${"─".repeat(valueWidth + 2)}┘`);
}

function renderTextCard(title: string, content: string) {
  const terminalWidth = Math.max(80, process.stdout.columns || 120);
  const innerWidth = Math.max(Math.min(terminalWidth - 4, 120), 40);
  const lines = toWrappedLines(content || "-", innerWidth);

  console.log(`┌${"─".repeat(innerWidth + 2)}┐`);
  console.log(`│ ${padCell(title, innerWidth)} │`);
  console.log(`├${"─".repeat(innerWidth + 2)}┤`);
  lines.forEach((line) => {
    console.log(`│ ${padCell(line, innerWidth)} │`);
  });
  console.log(`└${"─".repeat(innerWidth + 2)}┘`);
}

function renderRow(values: string[], widths: number[]) {
  const cells = values.map((value, index) => padCell(value, widths[index]));
  return `│ ${cells.join(" │ ")} │`;
}

function padCell(value: string, width: number) {
  const diff = width - stringWidth(value);
  return `${value}${" ".repeat(Math.max(diff, 0))}`;
}

function formatCell(value: unknown, maxWidth?: number) {
  const text =
    value === undefined || value === null || value === "" ? "-" : String(value);
  if (!maxWidth || stringWidth(text) <= maxWidth) {
    return text;
  }
  const truncated = truncateText(text, Math.max(maxWidth - 1, 1));
  return `${truncated}…`;
}

function fitTableWidths(
  columns: Array<{ title: string; minWidth?: number; hardMinWidth?: number }>,
  widths: number[],
) {
  const nextWidths = [...widths];
  const terminalWidth = Math.max(80, process.stdout.columns || 120);
  const preferredMinWidths = columns.map((column) =>
    Math.max(column.minWidth ?? 6, Math.min(stringWidth(column.title), 12)),
  );
  const hardMinWidths = columns.map((column) =>
    Math.max(
      column.hardMinWidth ?? 0,
      Math.max(Math.min(stringWidth(column.title), 8), 4),
    ),
  );

  shrinkWidths(nextWidths, preferredMinWidths, terminalWidth);
  shrinkWidths(nextWidths, hardMinWidths, terminalWidth);

  return nextWidths;
}

function shrinkWidths(
  widths: number[],
  minWidths: number[],
  terminalWidth: number,
) {
  while (getTableWidth(widths) > terminalWidth) {
    let targetIndex = -1;
    let largestWidth = -1;

    widths.forEach((width, index) => {
      if (width > minWidths[index] && width > largestWidth) {
        largestWidth = width;
        targetIndex = index;
      }
    });

    if (targetIndex === -1) {
      break;
    }

    widths[targetIndex] -= 1;
  }
}

function getTableWidth(widths: number[]) {
  return (
    widths.reduce((total, width) => total + width, 0) + widths.length * 3 + 1
  );
}

function truncateText(text: string, maxWidth: number) {
  let current = "";
  for (const char of text) {
    if (stringWidth(current + char) > maxWidth) {
      break;
    }
    current += char;
  }
  return current;
}

function stringWidth(text: string) {
  return [...stripAnsi(text)].reduce(
    (total, char) => total + (char.charCodeAt(0) > 255 ? 2 : 1),
    0,
  );
}

function stripAnsi(text: string) {
  return text.replace(/\u001B\[[0-9;]*m/g, "");
}

function toWrappedLines(text: string, width: number) {
  const sourceLines = text.split("\n");
  const wrapped: string[] = [];

  sourceLines.forEach((line) => {
    if (line === "") {
      wrapped.push("");
      return;
    }

    let rest = line;
    while (stringWidth(rest) > width) {
      const [chunk, remaining] = splitTextByWidth(rest, width);
      wrapped.push(chunk);
      rest = remaining;
    }
    wrapped.push(rest);
  });

  return wrapped;
}

function formatStartedAt(value: unknown) {
  if (!value || typeof value !== "string") {
    return "-";
  }
  const parsed = dayjs(value);
  if (!parsed.isValid()) {
    return value;
  }
  return parsed.format("MM-DD HH:mm");
}

function formatDuration(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return "-";
  }

  const totalSeconds = Math.floor(value / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h${String(minutes).padStart(2, "0")}m`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatPlainBlock(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return "-";
  }
  return String(value);
}

function formatJsonBlock(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return "-";
  }

  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return colorize(parsed, {
      indent: 2,
      colors: {
        Whitespace: picocolors.white,
        Brace: picocolors.dim,
        Bracket: picocolors.dim,
        Colon: picocolors.dim,
        Comma: picocolors.dim,
        StringKey: picocolors.cyan,
        StringLiteral: picocolors.green,
        NumberLiteral: picocolors.yellow,
        BooleanLiteral: picocolors.magenta,
        NullLiteral: picocolors.dim,
      },
    });
  } catch (_error) {
    return String(value);
  }
}

function formatTaskDetails(sections: Array<[string, string]>) {
  return sections
    .filter(([, value]) => value !== "-")
    .map(([label, value]) => `${label}:\n${value}`)
    .join("\n\n");
}

function parseJsonValue(value: unknown) {
  if (typeof value !== "string" || value === "") {
    return null;
  }

  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch (_error) {
    return null;
  }
}

async function runPipelineFromTask(
  pipeline: ReturnType<typeof createHugoAivPipelines>[number],
  startTaskIndex: number,
  context: Record<string, unknown>,
) {
  pipeline.setResumeState({
    startTaskIndex,
    context,
  });
  return pipeline.run();
}

function splitTextByWidth(text: string, maxWidth: number): [string, string] {
  let visibleWidth = 0;
  let index = 0;

  while (index < text.length) {
    const char = text[index];
    if (char === "\u001B") {
      const end = text.indexOf("m", index);
      if (end === -1) {
        break;
      }
      index = end + 1;
      continue;
    }

    const charWidth = char.charCodeAt(0) > 255 ? 2 : 1;
    if (visibleWidth + charWidth > maxWidth) {
      break;
    }
    visibleWidth += charWidth;
    index += 1;
  }

  return [text.slice(0, index), text.slice(index)];
}

async function resolveBuildSummary(
  db: Awaited<ReturnType<typeof createConnect>>,
  buildIdOrPrefix: string,
) {
  const exact = await getBuildSummaryByBuildId(db, buildIdOrPrefix);
  if (exact) {
    return exact;
  }

  const matched = await findBuildSummariesByBuildIdPrefix(db, buildIdOrPrefix);
  if (matched.length === 1) {
    return matched[0];
  }

  if (matched.length > 1) {
    renderTable({
      columns: [
        {
          key: "buildId",
          title: "BuildId",
          maxWidth: 16,
          minWidth: 12,
          render: (row, width) => formatCell(toResumeId(row.buildId), width),
        },
        { key: "status", title: "Status", maxWidth: 10, minWidth: 7 },
        { key: "pipeId", title: "PipeId", maxWidth: 24, minWidth: 12 },
        {
          key: "startedAt",
          title: "StartedAt",
          maxWidth: 14,
          minWidth: 11,
          render: (row, width) =>
            formatCell(formatStartedAt(row.startedAt), width),
        },
      ],
      rows: matched,
    });
    console.log("匹配到多条构建记录，请多输几位 BuildId。");
  }

  return null;
}

function toResumeId(value: unknown) {
  const text = typeof value === "string" ? value : "";
  return text || "-";
}

function requireCliString(value: unknown, optionName: string) {
  if (typeof value === "string" && value.trim() !== "") {
    return value;
  }

  exitWithCliError(`缺少必要参数: ${optionName}`);
}

function exitWithCliError(message: string): never {
  log.error(message);
  process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
