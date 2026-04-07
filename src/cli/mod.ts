import { log } from "@clack/prompts";
import dayjs from "dayjs";
import { resolve } from "node:path";
import { cwd } from "node:process";
import picocolors from "picocolors";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import {
  createHugoAivPipelines,
  getHugoAivPipelineOptions,
} from "./hugo-aiv/buildHugoAivApp";
import {
  configSchema,
  createConnect,
  findBuildSummariesByBuildIdPrefix,
  getBuildHistoryByBuildId,
  getBuildSummaryByBuildId,
  initBuildHistoryDb,
  importIfExistsAndValidate,
  listBuildSummariesByDate,
  listPipelines,
  type Config,
} from "../utils";

type CliArgs = {
  pipeline?: boolean;
  init?: boolean;
  history?: boolean;
  resume?: string;
};

async function main() {
  const cli = createCli();
  const argv = (await cli.parse()) as CliArgs;

  if (argv.history) {
    await listTodayBuilds();
  } else if (argv.pipeline) {
    await listAllPipelines();
  } else if (argv.init) {
    await initHugoAivPipelines();
  } else if (argv.resume) {
    await resumeBuild(argv.resume);
  } else {
    cli.showHelp();
  }
}

async function listTodayBuilds() {
  const db = await createConnect();
  try {
    const builds = await listBuildSummariesByDate(db);

    if (builds.length === 0) {
      console.log("今天还没有构建记录。");
      return;
    }

    renderTable({
      columns: [
        {
          key: "buildId",
          title: "BuildId",
          maxWidth: 12,
          minWidth: 10,
          hardMinWidth: 10,
          render: (row, width) => formatCell(toResumeId(row.buildId), width),
        },
        { key: "status", title: "Status", maxWidth: 11, minWidth: 11, hardMinWidth: 11 },
        { key: "pipeId", title: "PipeId", maxWidth: 34, minWidth: 12, hardMinWidth: 10 },
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

async function listAllPipelines() {
  const db = await createConnect();
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
    const success = await pipeline.run();
    renderKeyValueCard("Resume Result", [
      ["BuildId", toResumeId(summary.buildId)],
      ["Result", success ? "恢复执行完成" : "恢复执行失败"],
      ["FromTask", summary.failedTaskName ?? "-"],
    ]);
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
    return arg;
  });
}

function createCli() {
  return yargs(normalizeCliArgs(hideBin(process.argv)))
    .scriptName("bun run src/cli/mod.ts")
    .usage("用法:\n  $0 -l\n  $0 -p\n  $0 -init\n  $0 --resume <buildId>")
    .option("history", {
      type: "boolean",
      description: "查看今天的构建历史",
    })
    .alias("history", "l")
    .option("pipeline", {
      type: "boolean",
      description: "查看所有 pipeline",
    })
    .alias("pipeline", "p")
    .option("init", {
      type: "boolean",
      description: "初始化数据库文件、表和 hugo-aiv 的 pipeline",
    })
    .option("resume", {
      type: "string",
      description: "按 buildId 恢复失败构建",
    })
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
  const labelWidth = Math.max(...rows.map(([label]) => stringWidth(label)), stringWidth(title));
  const valueWidth = Math.max(...rows.map(([, value]) => stringWidth(value)));
  const totalWidth = labelWidth + valueWidth + 7;

  console.log(`┌${"─".repeat(totalWidth - 2)}┐`);
  console.log(`│ ${padCell(title, totalWidth - 4)} │`);
  console.log(`├${"─".repeat(labelWidth + 2)}┬${"─".repeat(valueWidth + 2)}┤`);
  rows.forEach(([label, value]) => {
    console.log(`│ ${padCell(label, labelWidth)} │ ${padCell(value, valueWidth)} │`);
  });
  console.log(`└${"─".repeat(labelWidth + 2)}┴${"─".repeat(valueWidth + 2)}┘`);
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
          maxWidth: 12,
          minWidth: 10,
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
  return text.slice(0, 10) || "-";
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
