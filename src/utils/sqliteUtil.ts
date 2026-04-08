import { connect, Database } from "@tursodatabase/database";
import dayjs from "dayjs";
import { ensureDirSync } from "fs-extra";
import { dirname, resolve } from "node:path";
import { cwd } from "node:process";

const DEFAULT_DB_PATH = resolve(cwd(), "data/build_sqlite.db");
const PIPELINE_TABLE_NAME = "pipeline";
const BUILD_HISTORY_TABLE_NAME = "build_history";

type PipelineRecordInput = {
  pipeId: string;
  projectName: string;
  gitUri: string;
  branch?: string;
  env?: string;
  platform?: string;
  workspace?: string;
  buildOptions?: unknown;
};

type BuildHistoryInput = {
  pipelineId: number;
  buildId: string;
  taskName: string;
  taskIndex: number;
  status: string;
  output?: string;
  logFile?: string;
  cwd?: string;
  taskInput?: string;
  taskOutput?: string;
  contextOutputKey?: string;
  errorMessage?: string;
  errorStack?: string;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
};

export type BuildSummary = {
  buildId: string;
  pipeId: string;
  projectName: string;
  gitUri: string;
  branch?: string | null;
  env?: string | null;
  platform?: string | null;
  workspace?: string | null;
  buildOptions: Record<string, unknown> | null;
  startedAt: string;
  finishedAt?: string | null;
  status: "failed" | "success" | "running" | "interrupted";
  failedTaskName?: string | null;
  failedTaskIndex?: number | null;
  taskCount: number;
};

function normalizePipeId(pipeId: string) {
  const normalized = pipeId
    .trim()
    .replace(/[^a-zA-Z0-9_]+/g, "_")
    .toLowerCase();
  return normalized.replace(/^_+|_+$/g, "") || "default";
}

export function getPipelineKey(pipeId: string) {
  return normalizePipeId(pipeId);
}

export function stringifyDbValue(value: unknown) {
  if (value === undefined) {
    return null;
  }
  if (value === null) {
    return "null";
  }
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch (error) {
    return JSON.stringify({
      message: "Failed to stringify value",
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// 初始化链接
export async function createConnect(dbPath = DEFAULT_DB_PATH) {
  ensureDirSync(dirname(dbPath));
  const db = await connect(dbPath);
  await ensureTables(db);
  return db;
}

async function getTableColumns(db: Database, tableName: string) {
  const statement = db.prepare(`PRAGMA table_info("${tableName}")`);
  const rows = await statement.all();
  return rows as Array<{ name: string }>;
}

async function checkTableExists(db: Database, tableName: string) {
  const statement = db.prepare(
    "SELECT name FROM sqlite_master WHERE type = ? AND name = ? LIMIT 1",
  );
  const result = await statement.get("table", tableName);
  return Boolean(result);
}

async function ensureColumns(
  db: Database,
  tableName: string,
  columns: Array<{ name: string; definition: string }>,
) {
  const existingColumns = await getTableColumns(db, tableName);
  const existingColumnNames = new Set(existingColumns.map((item) => item.name));

  for (const column of columns) {
    if (!existingColumnNames.has(column.name)) {
      await db.exec(
        `ALTER TABLE "${tableName}" ADD COLUMN ${column.definition}`,
      );
    }
  }
}

async function createPipelineTable(db: Database) {
  const existed = await checkTableExists(db, PIPELINE_TABLE_NAME);
  if (!existed) {
    await db.exec(`
      CREATE TABLE "${PIPELINE_TABLE_NAME}" (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pipe_id TEXT NOT NULL UNIQUE,
        project_name TEXT NOT NULL,
        git_uri TEXT NOT NULL,
        branch TEXT,
        env TEXT,
        platform TEXT,
        workspace TEXT,
        build_options TEXT,
        pipe_key TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  await ensureColumns(db, PIPELINE_TABLE_NAME, [
    { name: "project_name", definition: "project_name TEXT" },
    { name: "git_uri", definition: "git_uri TEXT" },
    { name: "branch", definition: "branch TEXT" },
    { name: "env", definition: "env TEXT" },
    { name: "platform", definition: "platform TEXT" },
    { name: "workspace", definition: "workspace TEXT" },
    { name: "build_options", definition: "build_options TEXT" },
    { name: "pipe_key", definition: "pipe_key TEXT" },
    { name: "created_at", definition: "created_at TEXT" },
    { name: "updated_at", definition: "updated_at TEXT" },
  ]);

  await db.exec(
    `CREATE UNIQUE INDEX IF NOT EXISTS "idx_${PIPELINE_TABLE_NAME}_pipe_key" ON "${PIPELINE_TABLE_NAME}" (pipe_key)`,
  );

  return PIPELINE_TABLE_NAME;
}

export async function createBuildHistoryTable(db: Database) {
  const existed = await checkTableExists(db, BUILD_HISTORY_TABLE_NAME);
  if (!existed) {
    await db.exec(`
      CREATE TABLE "${BUILD_HISTORY_TABLE_NAME}" (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pipeline_id INTEGER NOT NULL,
        build_id TEXT NOT NULL,
        task_name TEXT NOT NULL,
        task_index INTEGER NOT NULL,
        status TEXT NOT NULL,
        output TEXT,
        log_file TEXT,
        cwd TEXT,
        task_input TEXT,
        task_output TEXT,
        context_output_key TEXT,
        error_message TEXT,
        error_stack TEXT,
        started_at TEXT NOT NULL,
        finished_at TEXT,
        duration_ms INTEGER,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (pipeline_id) REFERENCES "${PIPELINE_TABLE_NAME}" (id),
        UNIQUE (build_id, task_index)
      )
    `);
  }

  await ensureColumns(db, BUILD_HISTORY_TABLE_NAME, [
    { name: "build_id", definition: "build_id TEXT" },
    { name: "output", definition: "output TEXT" },
    { name: "log_file", definition: "log_file TEXT" },
    { name: "cwd", definition: "cwd TEXT" },
    { name: "task_input", definition: "task_input TEXT" },
    { name: "task_output", definition: "task_output TEXT" },
    { name: "context_output_key", definition: "context_output_key TEXT" },
    { name: "error_message", definition: "error_message TEXT" },
    { name: "error_stack", definition: "error_stack TEXT" },
    { name: "started_at", definition: "started_at TEXT" },
    { name: "finished_at", definition: "finished_at TEXT" },
    { name: "duration_ms", definition: "duration_ms INTEGER" },
    { name: "created_at", definition: "created_at TEXT" },
    { name: "updated_at", definition: "updated_at TEXT" },
  ]);

  await db.exec(
    `CREATE UNIQUE INDEX IF NOT EXISTS "idx_${BUILD_HISTORY_TABLE_NAME}_build_task" ON "${BUILD_HISTORY_TABLE_NAME}" (build_id, task_index)`,
  );
  await db.exec(
    `CREATE INDEX IF NOT EXISTS "idx_${BUILD_HISTORY_TABLE_NAME}_pipeline_id" ON "${BUILD_HISTORY_TABLE_NAME}" (pipeline_id)`,
  );
  await db.exec(
    `CREATE INDEX IF NOT EXISTS "idx_${BUILD_HISTORY_TABLE_NAME}_build_id" ON "${BUILD_HISTORY_TABLE_NAME}" (build_id)`,
  );
  await db.exec(
    `CREATE INDEX IF NOT EXISTS "idx_${BUILD_HISTORY_TABLE_NAME}_status_started_at" ON "${BUILD_HISTORY_TABLE_NAME}" (status, started_at DESC)`,
  );

  return BUILD_HISTORY_TABLE_NAME;
}

async function ensureTables(db: Database) {
  await createPipelineTable(db);
  await createBuildHistoryTable(db);
}

async function findPipeline(db: Database, pipeId: string) {
  const statement = db.prepare(
    `SELECT * FROM "${PIPELINE_TABLE_NAME}" WHERE pipe_id = ? LIMIT 1`,
  );
  return (await statement.get(pipeId)) as
    | (PipelineRecordInput & { id: number; build_options?: string })
    | undefined;
}

export async function ensurePipeline(
  db: Database,
  params: PipelineRecordInput,
) {
  const existed = await findPipeline(db, params.pipeId);
  const pipeKey = getPipelineKey(params.pipeId);
  const buildOptions = stringifyDbValue(params.buildOptions);

  if (existed?.id) {
    const updateStatement = db.prepare(`
      UPDATE "${PIPELINE_TABLE_NAME}"
      SET project_name = ?, git_uri = ?, branch = ?, env = ?, platform = ?, workspace = ?, build_options = ?, pipe_key = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    await updateStatement.run(
      params.projectName,
      params.gitUri,
      params.branch ?? null,
      params.env ?? null,
      params.platform ?? null,
      params.workspace ?? null,
      buildOptions,
      pipeKey,
      existed.id,
    );
    return existed.id;
  }

  const insertStatement = db.prepare(`
    INSERT INTO "${PIPELINE_TABLE_NAME}" (
      pipe_id,
      project_name,
      git_uri,
      branch,
      env,
      platform,
      workspace,
      build_options,
      pipe_key
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  await insertStatement.run(
    params.pipeId,
    params.projectName,
    params.gitUri,
    params.branch ?? null,
    params.env ?? null,
    params.platform ?? null,
    params.workspace ?? null,
    buildOptions,
    pipeKey,
  );

  const created = await findPipeline(db, params.pipeId);
  if (!created?.id) {
    throw new Error(`Failed to initialize pipeline record for pipeId: ${params.pipeId}`);
  }

  return created.id;
}

export async function upsertBuildHistory(db: Database, input: BuildHistoryInput) {
  const statement = db.prepare(`
    INSERT INTO "${BUILD_HISTORY_TABLE_NAME}" (
      pipeline_id,
      build_id,
      task_name,
      task_index,
      status,
      output,
      log_file,
      cwd,
      task_input,
      task_output,
      context_output_key,
      error_message,
      error_stack,
      started_at,
      finished_at,
      duration_ms
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(build_id, task_index) DO UPDATE SET
      pipeline_id = excluded.pipeline_id,
      task_name = excluded.task_name,
      status = excluded.status,
      output = excluded.output,
      log_file = excluded.log_file,
      cwd = excluded.cwd,
      task_input = excluded.task_input,
      task_output = excluded.task_output,
      context_output_key = excluded.context_output_key,
      error_message = excluded.error_message,
      error_stack = excluded.error_stack,
      started_at = excluded.started_at,
      finished_at = excluded.finished_at,
      duration_ms = excluded.duration_ms,
      updated_at = CURRENT_TIMESTAMP
  `);

  await statement.run(
    input.pipelineId,
    input.buildId,
    input.taskName,
    input.taskIndex,
    input.status,
    input.output ?? null,
    input.logFile ?? null,
    input.cwd ?? null,
    input.taskInput ?? null,
    input.taskOutput ?? null,
    input.contextOutputKey ?? null,
    input.errorMessage ?? null,
    input.errorStack ?? null,
    input.startedAt,
    input.finishedAt ?? null,
    input.durationMs ?? null,
  );
}

export async function initBuildHistoryDb(
  options: PipelineRecordInput,
  dbPath = DEFAULT_DB_PATH,
) {
  const db = await createConnect(dbPath);
  const pipelineId = await ensurePipeline(db, options);

  return {
    db,
    dbPath,
    ...options,
    pipelineId,
    pipelineTableName: PIPELINE_TABLE_NAME,
    buildHistoryTableName: BUILD_HISTORY_TABLE_NAME,
  };
}

export async function getBuildHistoryByBuildId(
  db: Database,
  buildId: string,
) {
  const statement = db.prepare(`
    SELECT bh.*, p.pipe_id, p.project_name, p.git_uri, p.branch, p.env, p.platform, p.workspace, p.build_options
    FROM "${BUILD_HISTORY_TABLE_NAME}" bh
    INNER JOIN "${PIPELINE_TABLE_NAME}" p ON p.id = bh.pipeline_id
    WHERE bh.build_id = ?
    ORDER BY bh.task_index ASC
  `);
  return (await statement.all(buildId)) as Array<Record<string, any>>;
}

export async function getBuildSummaryByBuildId(
  db: Database,
  buildId: string,
): Promise<BuildSummary | null> {
  const history = await getBuildHistoryByBuildId(db, buildId);
  if (history.length === 0) {
    return null;
  }

  const first = history[0];
  const failedTask = history.find((item) => item.status === "failed");
  const interruptedTask = history.find((item) => item.status === "interrupted");
  const last = history[history.length - 1];

  return {
    buildId,
    pipeId: first.pipe_id,
    projectName: first.project_name,
    gitUri: first.git_uri,
    branch: first.branch,
    env: first.env,
    platform: first.platform,
    workspace: first.workspace,
    buildOptions: first.build_options ? JSON.parse(first.build_options) : null,
    startedAt: first.started_at,
    finishedAt: last.finished_at ?? null,
    status: failedTask
      ? "failed"
      : interruptedTask
        ? "interrupted"
        : history.every((item) => item.status === "success")
          ? "success"
          : "running",
    failedTaskName: failedTask?.task_name ?? interruptedTask?.task_name ?? null,
    failedTaskIndex:
      typeof failedTask?.task_index === "number"
        ? failedTask.task_index
        : typeof interruptedTask?.task_index === "number"
          ? interruptedTask.task_index
          : null,
    taskCount: history.length,
  };
}

export async function findBuildSummariesByBuildIdPrefix(
  db: Database,
  buildIdPrefix: string,
): Promise<BuildSummary[]> {
  const statement = db.prepare(`
    SELECT DISTINCT build_id
    FROM "${BUILD_HISTORY_TABLE_NAME}"
    WHERE build_id LIKE ?
    ORDER BY started_at DESC
  `);
  const buildIds = (await statement.all(`${buildIdPrefix}%`)) as Array<{
    build_id: string;
  }>;
  const summaries = await Promise.all(
    buildIds.map((item) => getBuildSummaryByBuildId(db, item.build_id)),
  );
  return summaries.filter((item): item is BuildSummary => item !== null);
}

export async function listBuildSummariesByDate(
  db: Database,
  date = dayjs().format("YYYY-MM-DD"),
): Promise<BuildSummary[]> {
  const dayStart = dayjs(date).startOf("day");
  const nextDayStart = dayStart.add(1, "day");
  const statement = db.prepare(`
    SELECT
      build_id,
      MAX(started_at) AS latest_started_at
    FROM "${BUILD_HISTORY_TABLE_NAME}"
    WHERE started_at >= ?
      AND started_at < ?
    GROUP BY build_id
    ORDER BY latest_started_at DESC, build_id DESC
  `);
  const buildIds = (await statement.all(
    dayStart.toISOString(),
    nextDayStart.toISOString(),
  )) as Array<{ build_id: string }>;
  const summaries = await Promise.all(
    buildIds.map((item) => getBuildSummaryByBuildId(db, item.build_id)),
  );
  return summaries.filter((item): item is BuildSummary => item !== null);
}

export async function listPipelines(db: Database) {
  const statement = db.prepare(`
    SELECT
      id,
      pipe_id,
      project_name,
      git_uri,
      branch,
      env,
      platform,
      workspace,
      build_options,
      pipe_key,
      created_at,
      updated_at
    FROM "${PIPELINE_TABLE_NAME}"
    ORDER BY pipe_id ASC
  `);
  return (await statement.all()) as Array<Record<string, any>>;
}
