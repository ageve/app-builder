import { log } from "@clack/prompts";
import chalk from "chalk";
import onDeath from "death";
import { ensureDirSync } from "fs-extra";
import { nanoid } from "nanoid";
import { basename, resolve } from "node:path";
import { cwd } from "node:process";
import { rimraf } from "rimraf";
import {
  acquireBuildRunLock,
  initBuildHistoryDb,
  releaseBuildRunLock,
  stringifyDbValue,
  upsertBuildHistory,
} from "../utils/sqliteUtil";
import { Context, Options, Task } from "./types";
import { createLogger, formatRunningTime } from "./utils/common";
type HookFn<T extends unknown[]> = (...args: T) => Promise<void>;

type ResumeState = {
  buildId?: string;
  startTaskIndex: number;
  context: Record<string, unknown>;
};

export class BuildAlreadyRunningError extends Error {
  buildId: string;

  constructor(buildId: string) {
    super(`buildId=${buildId} 已经有别的进程在运行。`);
    this.name = "BuildAlreadyRunningError";
    this.buildId = buildId;
  }
}

export default class Pipeline {
  context: Context;
  tasks: Task[] = [];
  beforeTask?: HookFn<unknown[]>;
  afterTask?: HookFn<unknown[]>;
  beforeRun?: HookFn<unknown[]>;
  afterRun?: HookFn<unknown[]>;
  resumeState?: ResumeState;

  constructor(options: Options, tasks: Task[]) {
    const projectName = basename(options.gitUri).replace(".git", "");
    const workspace =
      options?.workspace ??
      resolve(cwd(), `../app-builder-cache/projects/${projectName}`);
    const output = resolve(cwd(), `./build/${projectName}`);
    if (options.clean) {
      rimraf(output);
    }
    ensureDirSync(workspace);
    ensureDirSync(output);
    const logId = nanoid();
    const logFile = resolve(cwd(), `./build/${projectName}/${logId}.log`);
    this.context = {
      ...options,
      workspace,
      projectName,
      pipeId: options.pipeId ?? projectName,
      output,
      logFile,
      cwd: cwd(),
    };

    this.context.logger = createLogger({
      filename: logFile,
    });
    this.tasks = tasks;
  }

  registerBeforeTask(fn: HookFn<[Context]>) {
    // @ts-ignore
    this.beforeTask = fn;
  }

  registerAfterTask(fn: HookFn<[Context]>) {
    // @ts-ignore
    this.afterTask = fn;
  }

  registerBeforeRun(fn: HookFn<[Context]>) {
    // @ts-ignore
    this.beforeRun = fn;
  }
  registerAfterRun(fn: HookFn<[Context]>) {
    // @ts-ignore
    this.afterRun = fn;
  }

  setResumeState(resumeState: ResumeState) {
    this.resumeState = resumeState;
  }

  async run() {
    const startTime = Date.now();
    const context: Context = {
      ...this.context,
      ...(this.resumeState?.context ?? {}),
    };
    let dbInfo: Awaited<ReturnType<typeof initBuildHistoryDb>> | undefined;
    let buildId = "";
    let buildRunLockAcquired = false;
    let currentTask:
      | {
          name: string;
          index: number;
          startedAt: string;
        }
      | undefined;
    let removeSignalHandlers: (() => void) | undefined;

    try {
      buildId = this.resumeState?.buildId ?? nanoid(12);
      context.buildId = buildId;
      this.context.buildId = buildId;

      dbInfo = await initBuildHistoryDb({
        pipeId: String(context.pipeId),
        projectName: String(context.projectName),
        gitUri: String(context.gitUri),
        branch: typeof context.branch === "string" ? context.branch : undefined,
        env: typeof context.env === "string" ? context.env : undefined,
        platform:
          typeof context.platform === "string" ? context.platform : undefined,
        workspace:
          typeof context.workspace === "string" ? context.workspace : undefined,
        buildOptions:
          typeof context.buildOptions === "object" ? context.buildOptions : {},
      });
      context.pipelineId = dbInfo.pipelineId;
      this.context.pipelineId = dbInfo.pipelineId;
      buildRunLockAcquired = await acquireBuildRunLock(dbInfo.db, {
        buildId,
        pipeId: String(context.pipeId),
      });
      if (!buildRunLockAcquired) {
        throw new BuildAlreadyRunningError(buildId);
      }
      removeSignalHandlers = onDeath({
        uncaughtException: false,
      })(async (signal) => {
          if (!dbInfo || !currentTask) {
            process.exit(1);
            return;
          }

          const interruptedAt = new Date().toISOString();
          await upsertBuildHistory(dbInfo.db, {
            pipelineId: dbInfo.pipelineId,
            buildId,
            taskName: currentTask.name,
            taskIndex: currentTask.index,
            status: "interrupted",
            output:
              typeof context.output === "string" ? context.output : undefined,
            logFile:
              typeof context.logFile === "string" ? context.logFile : undefined,
            cwd: typeof context.cwd === "string" ? context.cwd : undefined,
            taskInput: stringifyDbValue(removeLogger(context)) ?? undefined,
            errorMessage: signal ? `Interrupted by ${signal}` : "Interrupted",
            startedAt: currentTask.startedAt,
            finishedAt: interruptedAt,
            durationMs:
              new Date(interruptedAt).getTime() -
              new Date(currentTask.startedAt).getTime(),
          });
          await releaseBuildRunLock(dbInfo.db, buildId);
          await dbInfo.db.close();
          console.log(chalk.yellow("\n构建已中断，状态已记录到历史。"));
          process.exit(signal === "SIGINT" ? 130 : 143);
        });

      const beforeRunContext = { ...context };
      delete beforeRunContext.logger;
      await this.beforeRun?.(beforeRunContext);

      const startTaskIndex = this.resumeState?.startTaskIndex ?? 0;
      for (let index = startTaskIndex; index < this.tasks.length; index += 1) {
        const taskStartTime = Date.now();
        try {
          const task = this.tasks[index];
          const taskName = task.name || `task_${index}`;
          currentTask = {
            name: taskName,
            index,
            startedAt: new Date(taskStartTime).toISOString(),
          };
          console.log(chalk.cyan(`[${task.name}]`));
          await upsertBuildHistory(dbInfo.db, {
            pipelineId: dbInfo.pipelineId,
            buildId,
            taskName,
            taskIndex: index,
            status: "running",
            output:
              typeof context.output === "string" ? context.output : undefined,
            logFile:
              typeof context.logFile === "string" ? context.logFile : undefined,
            cwd: typeof context.cwd === "string" ? context.cwd : undefined,
            taskInput: stringifyDbValue(removeLogger(context)) ?? undefined,
            startedAt: currentTask.startedAt,
          });

          await this.beforeTask?.(context);
          const result = await task(context);
          if (result === false) {
            throw new Error(`[${taskName}] returned false`);
          }

          let contextOutputKey: string | undefined;
          let taskOutput: string | null = null;
          if (result && typeof result === "object" && task.name) {
            context[task.name] = result;
            contextOutputKey = task.name;
            taskOutput = stringifyDbValue(result);
          }

          const taskEndTime = Date.now();
          await upsertBuildHistory(dbInfo.db, {
            pipelineId: dbInfo.pipelineId,
            buildId,
            taskName,
            taskIndex: index,
            status: "success",
            output:
              typeof context.output === "string" ? context.output : undefined,
            logFile:
              typeof context.logFile === "string" ? context.logFile : undefined,
            cwd: typeof context.cwd === "string" ? context.cwd : undefined,
            taskInput: stringifyDbValue(removeLogger(context)) ?? undefined,
            taskOutput: taskOutput ?? undefined,
            contextOutputKey,
            startedAt: currentTask.startedAt,
            finishedAt: new Date(taskEndTime).toISOString(),
            durationMs: taskEndTime - taskStartTime,
          });
          currentTask = undefined;
          await this.afterTask?.(context);
        } catch (error) {
          const taskEndTime = Date.now();
          const task = this.tasks[index];
          const taskName = task?.name || `task_${index}`;
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          const errorStack =
            error instanceof Error ? (error.stack ?? null) : null;
          await upsertBuildHistory(dbInfo.db, {
            pipelineId: dbInfo.pipelineId,
            buildId,
            taskName,
            taskIndex: index,
            status: "failed",
            output:
              typeof context.output === "string" ? context.output : undefined,
            logFile:
              typeof context.logFile === "string" ? context.logFile : undefined,
            cwd: typeof context.cwd === "string" ? context.cwd : undefined,
            taskInput: stringifyDbValue(removeLogger(context)) ?? undefined,
            errorMessage: errorMessage ?? undefined,
            errorStack: errorStack ?? undefined,
            startedAt:
              currentTask?.startedAt ?? new Date(taskStartTime).toISOString(),
            finishedAt: new Date(taskEndTime).toISOString(),
            durationMs: taskEndTime - taskStartTime,
          });
          currentTask = undefined;

          const endTime = taskEndTime;
          log.info(
            chalk.red(
              `[pipeId:${context.pipeId}] build failed, and took ` +
                formatRunningTime(endTime - startTime),
            ),
          );
          return false;
        }
      }

      const endTime = Date.now();
      log.info(
        chalk.cyan(
          `[pipeId:${context.pipeId}] build success, and took ` +
            formatRunningTime(endTime - startTime),
        ),
      );
      await this.afterRun?.(context);
      return true;
    } catch (error) {
      if (error instanceof BuildAlreadyRunningError) {
        throw error;
      }
      return false;
    } finally {
      removeSignalHandlers?.();
      if (dbInfo && buildRunLockAcquired && buildId) {
        await releaseBuildRunLock(dbInfo.db, buildId);
      }
      await dbInfo?.db.close();
    }
  }
}

function removeLogger(context: Record<string, unknown>) {
  const nextContext = { ...context };
  delete nextContext.logger;
  return nextContext;
}
