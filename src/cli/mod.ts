import { log } from "@clack/prompts";
import { resolve } from "node:path";
import { cwd } from "node:process";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import {
  createHugoAivPipelines,
  getHugoAivPipelineOptions,
} from "./hugo-aiv/buildHugoAivApp";
import {
  configSchema,
  createConnect,
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
        { key: "buildId", title: "BuildId", maxWidth: 24 },
        { key: "status", title: "Status", maxWidth: 10 },
        { key: "pipeId", title: "PipeId", maxWidth: 34 },
        { key: "env", title: "Env", maxWidth: 12 },
        { key: "branch", title: "Branch", maxWidth: 12 },
        { key: "platform", title: "Platform", maxWidth: 10 },
        { key: "startedAt", title: "StartedAt", maxWidth: 24 },
        { key: "failedTaskName", title: "FailedTask", maxWidth: 18 },
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
        { key: "pipe_id", title: "PipeId", maxWidth: 34 },
        { key: "project_name", title: "Project", maxWidth: 14 },
        { key: "env", title: "Env", maxWidth: 12 },
        { key: "branch", title: "Branch", maxWidth: 12 },
        { key: "platform", title: "Platform", maxWidth: 10 },
        { key: "workspace", title: "Workspace", maxWidth: 28 },
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
    const summary = await getBuildSummaryByBuildId(db, buildId);

    if (!summary) {
      renderKeyValueCard("Resume", [
        ["BuildId", buildId],
        ["Result", "未找到这条构建记录"],
      ]);
      return;
    }

    renderKeyValueCard("Resume", [
      ["BuildId", summary.buildId],
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
      `resume buildId=${buildId}, from taskIndex=${summary.failedTaskIndex}, taskName=${summary.failedTaskName}`,
    );
    const success = await pipeline.run();
    renderKeyValueCard("Resume Result", [
      ["BuildId", buildId],
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
  columns: Array<{ key: string; title: string; maxWidth?: number }>;
  rows: Array<Record<string, unknown>>;
}) {
  const normalizedRows = rows.map((row) =>
    columns.map((column) => formatCell(row[column.key], column.maxWidth)),
  );
  const widths = columns.map((column, index) => {
    const contentWidth = Math.max(
      stringWidth(column.title),
      ...normalizedRows.map((row) => stringWidth(row[index])),
    );
    return column.maxWidth ? Math.min(contentWidth, column.maxWidth) : contentWidth;
  });

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
  return [...text].reduce((total, char) => total + (char.charCodeAt(0) > 255 ? 2 : 1), 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
