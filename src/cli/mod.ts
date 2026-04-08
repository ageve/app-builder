import { log } from "@clack/prompts";
import dayjs from "dayjs";
import { existsSync } from "node:fs";
import { colorize } from "json-colorizer";
import { resolve } from "node:path";
import { cwd } from "node:process";
import picocolors from "picocolors";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { $ } from "zx";
import {
  createHugoAivPipelines,
  getHugoAivPipelineOptions,
} from "./hugo-aiv/buildHugoAivApp";
import { BuildAlreadyRunningError } from "../v2/pipeline";
import {
  clearBuildHistory,
  configSchema,
  createConnect,
  createReadonlyConnect,
  findBuildSummariesByBuildIdPrefix,
  getBuildHistoryByBuildId,
  getBuildSummaryByBuildId,
  initBuildHistoryDb,
  importIfExistsAndValidate,
  listBuildSummaries,
  listPipelines,
  type Config,
} from "../utils";
import type { BuildSummary } from "../utils/sqliteUtil";

type CliArgs = {
  clear?: boolean;
  pipeline?: boolean;
  init?: boolean;
  history?: boolean;
  limit?: number;
  resume?: string;
  retry?: string;
  info?: string;
  task?: string;
  upload?: string;
};

async function main() {
  const cli = createCli();
  const argv = (await cli.parse()) as CliArgs;

  if (argv.clear) {
    await clearAllBuildHistory();
  } else if (argv.history) {
    await listBuilds(argv.limit);
  } else if (argv.pipeline) {
    await listAllPipelines();
  } else if (argv.info) {
    await showBuildTaskInfo(argv.info, argv.task);
  } else if (argv.upload) {
    await uploadBuildToAppStore(argv.upload);
  } else if (argv.retry) {
    await retryBuildFromTask(argv.retry, argv.task);
  } else if (argv.init) {
    await initHugoAivPipelines();
  } else if (argv.resume) {
    await resumeBuild(argv.resume);
  } else {
    cli.showHelp();
  }
}

async function listBuilds(limit = 10) {
  const db = await createReadonlyConnect();
  try {
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.floor(limit)) : 10;
    const candidateLimit = Math.max(safeLimit * 5, safeLimit + 20);
    const builds = hideSupersededBuilds(
      await listBuildSummaries(db, candidateLimit),
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
        { key: "status", title: "Status", maxWidth: 11, minWidth: 11, hardMinWidth: 11 },
        { key: "pipeId", title: "PipeId", maxWidth: 34, minWidth: 12, hardMinWidth: 10 },
        { key: "versionCode", title: "VersionCode", maxWidth: 12, minWidth: 10 },
        { key: "versionName", title: "VersionName", maxWidth: 18, minWidth: 12 },
        { key: "startTaskName", title: "StartTask", maxWidth: 16, minWidth: 10 },
        { key: "env", title: "Env", maxWidth: 12, minWidth: 7 },
        { key: "branch", title: "Branch", maxWidth: 12, minWidth: 8 },
        { key: "platform", title: "Platform", maxWidth: 10, minWidth: 8 },
        {
          key: "startedAt",
          title: "StartedAt",
          maxWidth: 14,
          minWidth: 11,
          hardMinWidth: 11,
          render: (row, width) =>
            formatCell(formatStartedAt(row.startedAt), width),
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

async function clearAllBuildHistory() {
  const db = await createConnect();
  try {
    await clearBuildHistory(db);
    renderKeyValueCard("Clear Build History", [
      ["Result", "已清空所有 build history"],
      ["Note", "只清理数据库历史，不删除 log 和 output"],
    ]);
  } finally {
    await db.close();
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

  console.log(`已初始化 ${createdOrUpdated} 条 pipeline 记录。重复的不会新增。`);
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
      console.log(`当前只支持恢复 hugo-aiv-app，这条记录属于 ${summary.projectName}。`);
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
      args: {
        autoVersionCode:
          typeof buildOptions.autoVersionCode === "boolean"
            ? buildOptions.autoVersionCode
            : undefined,
        legacyVersioning:
          typeof buildOptions.legacyVersioning === "boolean"
            ? buildOptions.legacyVersioning
            : undefined,
        dryRun: false,
      },
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
      : failedTaskRow ?? history[history.length - 1];

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
      taskName ? `任务上下文 · ${taskRow?.task_name ?? taskName}` : "Build Context",
      formatTaskDetails([
        ["task", formatPlainBlock(taskRow?.task_name)],
        ["taskInput", formatJsonBlock(taskRow?.task_input)],
        ["logFile", formatPlainBlock(taskRow?.log_file)],
        ...(taskName
          ? [["taskOutput", formatJsonBlock(taskRow?.task_output)] as [string, string]]
          : []),
      ]),
    );
  } finally {
    await db.close();
  }
}

async function retryBuildFromTask(buildId: string, taskName?: string) {
  if (!taskName) {
    console.log("请同时传入 --task <taskName>。");
    return;
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
    args: {
      autoVersionCode:
        typeof buildOptions.autoVersionCode === "boolean"
          ? buildOptions.autoVersionCode
          : undefined,
      legacyVersioning:
        typeof buildOptions.legacyVersioning === "boolean"
          ? buildOptions.legacyVersioning
          : undefined,
      dryRun: false,
    },
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
  return args.map((arg) => {
    if (arg === "-init") {
      return "--init";
    }
    if (arg === "-resume") {
      return "--resume";
    }
    if (arg === "-retry") {
      return "--retry";
    }
    return arg;
  });
}

function createCli() {
  return yargs(normalizeCliArgs(hideBin(process.argv)))
    .scriptName("bun run src/cli/mod.ts")
    .usage("用法:\n  $0 -l [--limit 10]\n  $0 --clear\n  $0 -p\n  $0 -i <buildId> --task <taskName>\n  $0 --retry <buildId> --task <taskName>\n  $0 --upload <buildId>\n  $0 -init\n  $0 --resume <buildId>")
    .updateStrings({
      "Options:": "选项:",
      "Show version number": "显示版本号",
      "Show help": "显示帮助",
      "Missing required argument: %s": "缺少必要参数: %s",
    })
    .option("history", {
      type: "boolean",
      description: "查看最近的构建历史",
    })
    .alias("history", "l")
    .option("limit", {
      type: "number",
      description: "配合 -l 使用，限制显示条数，默认 10",
      default: 10,
    })
    .option("clear", {
      type: "boolean",
      description: "清空所有 build history，仅清理数据库，不删除 log 和 output",
    })
    .option("pipeline", {
      type: "boolean",
      description: "查看所有 pipeline",
    })
    .alias("pipeline", "p")
    .option("info", {
      type: "string",
      description: "查看某次构建详情；可选配合 --task 查看指定任务上下文",
    })
    .alias("info", "i")
    .option("task", {
      type: "string",
      description: "配合 --info 或 --retry 使用，指定任务名",
    })
    .option("retry", {
      type: "string",
      description: "从某次构建里指定任务开始重新执行后续步骤",
    })
    .option("upload", {
      type: "string",
      description: "将某次 iOS 构建产出的 IPA 上传到 App Store Connect",
    })
    .option("init", {
      type: "boolean",
      description: "初始化数据库文件、表和 hugo-aiv 的 pipeline",
    })
    .option("resume", {
      type: "string",
      description: "按 buildId 恢复失败构建",
    })
    .implies("retry", "task")
    .alias("h", "help")
    .help("help")
    .wrap(Math.min(100, process.stdout.columns || 100));
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
      stripAnsi(column.render ? column.render(row, column.maxWidth ?? 1000) : formatCell(row[column.key])),
    );
    const contentWidth = Math.max(
      stringWidth(column.title),
      ...formattedValues.map((value) => stringWidth(value)),
    );
    return column.maxWidth ? Math.min(contentWidth, column.maxWidth) : contentWidth;
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
  console.log(renderRow(columns.map((column) => column.title), widths));
  console.log(divider);
  normalizedRows.forEach((row) => {
    console.log(renderRow(row, widths));
  });
  console.log(footer);
}

function renderKeyValueCard(title: string, rows: Array<[string, string]>) {
  const terminalWidth = Math.max(80, process.stdout.columns || 120);
  const labelWidth = Math.max(...rows.map(([label]) => stringWidth(label)), stringWidth(title));
  const maxValueWidth = Math.max(terminalWidth - labelWidth - 7, 20);
  const wrappedRows = rows.map(([label, value]) => [
    label,
    toWrappedLines(value, maxValueWidth),
  ] as const);
  const valueWidth = Math.min(
    maxValueWidth,
    Math.max(...wrappedRows.flatMap(([, lines]) => lines.map((line) => stringWidth(line))), 0),
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
  return widths.reduce((total, width) => total + width, 0) + widths.length * 3 + 1;
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
  return parsed.format("MM-DD HH:mm:ss");
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
        { key: "pipeId", title: "PipeId", maxWidth: 30, minWidth: 16 },
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

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
