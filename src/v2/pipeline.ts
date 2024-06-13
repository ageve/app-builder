import chalk from "chalk";
import { ensureDirSync } from "fs-extra";
import { nanoid } from "nanoid";
import { basename, resolve } from "node:path";
import { cwd } from "node:process";
import { Context, Options, Task } from "./types";
import { createLogger, formatRunningTime } from "./utils/common";

export default class Pipeline {
  context: Context;
  tasks: Task[] = [];

  constructor(options: Options, tasks: Task[]) {
    const projectName = basename(options.gitUri).replace(".git", "");
    const workspace =
      options?.workspace ?? resolve(cwd(), `../.orden/projects/${projectName}`);
    const output = resolve(cwd(), `./build/${projectName}`);
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
    // this.tasks.unshift(prepareVar);
  }

  async run() {
    // default task
    const startTime = Date.now();

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
            // TODO: task 必须返回 object
            if (typeof result === "object") {
              context[task.name] = result;
            }
            return await next(index + 1, context, tasks);
          }
          return true;
        } catch (error) {
          const endTime = Date.now();
          console.log(
            chalk.red(
              `[pipeId:${context.pipeId}]  Some thing wrong,and took ` +
                formatRunningTime(endTime - startTime)
            )
          );
          return false;
        }
      } else {
        const endTime = Date.now();
        console.log(
          chalk.cyan(
            `[pipeId:${context.pipeId}] Success, and took ` +
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
