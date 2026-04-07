import { log } from "@clack/prompts";
import chalk from "chalk";
import { ensureDirSync } from "fs-extra";
import { nanoid } from "nanoid";
import { basename, resolve } from "node:path";
import { cwd } from "node:process";
import { rimraf } from "rimraf";
import {
  initBuildHistoryDb,
  stringifyDbValue,
  upsertBuildHistory,
} from "../utils/sqliteUtil";
import { Context, Options, Task } from "./types";
import { createLogger, formatRunningTime } from "./utils/common";
type HookFn<T extends unknown[]> = (...args: T) => Promise<void>;

type ResumeState = {
  buildId: string;
  startTaskIndex: number;
  context: Record<string, unknown>;
};

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

    try {
      const buildId = this.resumeState?.buildId ?? nanoid();
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

      const beforeRunContext = { ...context };
      delete beforeRunContext.logger;
      await this.beforeRun?.(beforeRunContext);

      const startTaskIndex = this.resumeState?.startTaskIndex ?? 0;
      for (let index = startTaskIndex; index < this.tasks.length; index += 1) {
        const taskStartTime = Date.now();
        try {
          const task = this.tasks[index];
          const taskName = task.name || `task_${index}`;
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
            startedAt: new Date(taskStartTime).toISOString(),
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
            startedAt: new Date(taskStartTime).toISOString(),
            finishedAt: new Date(taskEndTime).toISOString(),
            durationMs: taskEndTime - taskStartTime,
          });
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
            startedAt: new Date(taskStartTime).toISOString(),
            finishedAt: new Date(taskEndTime).toISOString(),
            durationMs: taskEndTime - taskStartTime,
          });

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
      return false;
    } finally {
      await dbInfo?.db.close();
    }
  }
}

function removeLogger(context: Record<string, unknown>) {
  const nextContext = { ...context };
  delete nextContext.logger;
  return nextContext;
}
