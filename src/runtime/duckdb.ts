import { ensureDirSync } from "fs-extra";
import { dirname, resolve } from "node:path";

type DuckConnection = {
  run: (
    sql: string,
    values?: Record<string, unknown> | unknown[]
  ) => Promise<{
    getRowObjectsJson: () => Promise<Record<string, unknown>[]>;
  }>;
};

let cachedConnection: DuckConnection | null = null;
let cachedPath: string | null = null;
let cachedConnectionPromise: Promise<DuckConnection> | null = null;

export function getDatabasePath(cwd: string) {
  return resolve(cwd, ".data", "app-builder.duckdb");
}

async function createConnection(dbPath: string): Promise<DuckConnection> {
  const duckdb = await import("@duckdb/node-api");
  const instance = await duckdb.DuckDBInstance.create(dbPath);
  return instance.connect() as unknown as Promise<DuckConnection>;
}

export async function getConnection(cwd: string) {
  const dbPath = getDatabasePath(cwd);
  if (cachedConnection && cachedPath === dbPath) {
    return cachedConnection;
  }

  if (cachedConnectionPromise && cachedPath === dbPath) {
    return cachedConnectionPromise;
  }

  ensureDirSync(dirname(dbPath));
  cachedPath = dbPath;
  cachedConnectionPromise = (async () => {
    const connection = await createConnection(dbPath);
    await ensureSchema(connection);
    cachedConnection = connection;
    return connection;
  })();

  try {
    return await cachedConnectionPromise;
  } catch (error) {
    if (cachedPath === dbPath) {
      cachedConnection = null;
      cachedConnectionPromise = null;
      cachedPath = null;
    }
    throw error;
  }
}

export async function execSql(
  cwd: string,
  sql: string,
  values?: Record<string, unknown> | unknown[]
) {
  const connection = await getConnection(cwd);
  await connection.run(sql, values);
}

export async function queryRows<T extends Record<string, unknown>>(
  cwd: string,
  sql: string,
  values?: Record<string, unknown> | unknown[]
) {
  const connection = await getConnection(cwd);
  const result = await connection.run(sql, values);
  return (await result.getRowObjectsJson()) as T[];
}

export function stringifyJson(value: unknown) {
  return JSON.stringify(value ?? null);
}

export function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || value.length === 0) {
    return fallback;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

async function ensureSchema(connection: DuckConnection) {
  await connection.run(`
    CREATE TABLE IF NOT EXISTS pipeline_definitions (
      pipeline_id VARCHAR PRIMARY KEY,
      project_id VARCHAR NOT NULL,
      profile_id VARCHAR NOT NULL,
      display_name VARCHAR NOT NULL,
      platform VARCHAR NOT NULL,
      env VARCHAR NOT NULL,
      branch VARCHAR NOT NULL,
      step_order_json VARCHAR NOT NULL,
      definition_json VARCHAR NOT NULL,
      updated_at VARCHAR NOT NULL
    );
  `);

  await connection.run(`
    CREATE TABLE IF NOT EXISTS pipeline_runs (
      run_id VARCHAR PRIMARY KEY,
      pipeline_id VARCHAR NOT NULL,
      project_id VARCHAR NOT NULL,
      profile_id VARCHAR NOT NULL,
      status VARCHAR NOT NULL,
      trigger_source VARCHAR NOT NULL,
      requested_action VARCHAR NOT NULL,
      requested_step_id VARCHAR,
      current_step_id VARCHAR,
      error_step_id VARCHAR,
      error_category VARCHAR,
      error_message VARCHAR,
      created_at VARCHAR NOT NULL,
      started_at VARCHAR,
      ended_at VARCHAR,
      updated_at VARCHAR NOT NULL
    );
  `);

  await connection.run(`
    CREATE TABLE IF NOT EXISTS pipeline_run_context (
      run_id VARCHAR PRIMARY KEY,
      pipeline_id VARCHAR NOT NULL,
      request_json VARCHAR NOT NULL,
      resolved_config_json VARCHAR NOT NULL,
      context_json VARCHAR NOT NULL,
      log_file VARCHAR NOT NULL,
      workspace VARCHAR NOT NULL,
      output_dir VARCHAR NOT NULL,
      updated_at VARCHAR NOT NULL
    );
  `);

  await connection.run(`
    CREATE TABLE IF NOT EXISTS pipeline_step_runs (
      run_id VARCHAR NOT NULL,
      step_id VARCHAR NOT NULL,
      display_name VARCHAR NOT NULL,
      step_order INTEGER NOT NULL,
      status VARCHAR NOT NULL,
      retryable BOOLEAN NOT NULL,
      checkpointable BOOLEAN NOT NULL,
      depends_on_json VARCHAR NOT NULL,
      outputs_json VARCHAR NOT NULL,
      artifacts_json VARCHAR NOT NULL,
      warnings_json VARCHAR NOT NULL,
      error_category VARCHAR,
      error_message VARCHAR,
      started_at VARCHAR,
      ended_at VARCHAR,
      PRIMARY KEY (run_id, step_id)
    );
  `);

  await connection.run(`
    CREATE TABLE IF NOT EXISTS pipeline_artifacts (
      run_id VARCHAR NOT NULL,
      step_id VARCHAR NOT NULL,
      path VARCHAR NOT NULL,
      kind VARCHAR NOT NULL,
      label VARCHAR NOT NULL,
      sha256 VARCHAR,
      metadata_json VARCHAR,
      created_at VARCHAR NOT NULL
    );
  `);

  await connection.run(`
    CREATE TABLE IF NOT EXISTS pipeline_upload_records (
      run_id VARCHAR NOT NULL,
      step_id VARCHAR NOT NULL,
      channel VARCHAR NOT NULL,
      idempotency_key VARCHAR NOT NULL,
      artifact_path VARCHAR NOT NULL,
      artifact_sha256 VARCHAR NOT NULL,
      result_json VARCHAR,
      created_at VARCHAR NOT NULL
    );
  `);
}
