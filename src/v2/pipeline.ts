import { log } from "@clack/prompts";
import chalk from "chalk";
import { ensureDirSync } from "fs-extra";
import { nanoid } from "nanoid";
import { basename, resolve } from "node:path";
import { cwd } from "node:process";
import { rimraf } from "rimraf";
import { Context, Options, Task } from "./types";
import { createLogger, formatRunningTime } from "./utils/common";
type HookFn<T extends unknown[]> = (...args: T) => Promise<void>;
export default class Pipeline {
  context: Context;
  tasks: Task[] = [];
  beforeTask?: HookFn<unknown[]>;
  afterTask?: HookFn<unknown[]>;
  beforeRun?: HookFn<unknown[]>;
  afterRun?: HookFn<unknown[]>;

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
      pipeId: projectName,
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

  async run() {
    // default task
    const startTime = Date.now();
    const context = { ...this.context };
    delete context["logger"];
    this.beforeRun?.(context);
    let taskLength = this.tasks.length;
    async function next(
      index: number,
      context: any,
      tasks: Task[]
    ): Promise<boolean> {
      if (index <= taskLength - 1) {
        try {
          const task = tasks[index];
          console.log(chalk.cyan(`[${task.name}]`));
          const result = await task(context);
          if (result && task.name) {
            // task返回 object, 则保存到 context ,供后续步骤调用
            if (typeof result === "object") {
              context[task.name] = result;
            }
            return await next(index + 1, context, tasks);
          }
          return true;
        } catch (error) {
          const endTime = Date.now();
          log.info(
            chalk.red(
              `[pipeId:${context.pipeId}] build failed, and took ` +
                formatRunningTime(endTime - startTime)
            )
          );
          return false;
        }
      } else {
        const endTime = Date.now();
        log.info(
          chalk.cyan(
            `[pipeId:${context.pipeId}] build success, and took ` +
              formatRunningTime(endTime - startTime)
          )
        );
        return true;
      }
    }
    try {
      return await next(0, this.context, this.tasks);
    } catch (error) {
      return false;
    }
  }
}
